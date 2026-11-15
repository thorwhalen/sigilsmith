/**
 * The operation registry: the single list of agent primitives, each with a stable
 * name, a description, a zod input schema, side-effect annotations and one function
 * returning a JSON envelope. The CLI (`src/cli/main.ts`) and the MCP server
 * (`src/mcp/server.ts`) are both thin layers over this list, so the two surfaces
 * cannot drift apart: there is no second list to keep in sync.
 */
import { z } from 'zod';
import { PRESETS } from '../presets.js';
import type { Item } from '../types.js';
import { build } from './build.js';
import { catalog } from './catalog.js';
import { check, SECTIONS, type Section } from './check.js';
import { init, detectKeyCmd } from './commands.js';
import { loadConfig, loadSamples, type LoadedConfig } from './config.js';
import { envelope, explainCode, type Envelope } from './diagnostics.js';
import { explainItems } from './explain.js';
import { preview } from './preview.js';
import { emitTargets, listTargetsCmd } from './targets.js';

export interface OperationContext {
  /** Directory the host project lives in (where the config is looked up). */
  cwd: string;
}

export interface Operation<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  title: string;
  description: string;
  input: S;
  /** MCP tool annotations: read-only, destructive (overwrites files), idempotent. */
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean };
  run(input: z.output<z.ZodObject<S>>, ctx: OperationContext): Promise<Envelope<any>>;
}

const config = z.string().optional().describe('Config path relative to the project (default sigilsmith.config.json).');
const READ = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const WRITE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false };

function define<S extends z.ZodRawShape>(op: Operation<S>): Operation<S> {
  return op;
}

async function withConfig<T>(ctx: OperationContext, path: string | undefined, command: string, fn: (l: LoadedConfig) => Promise<Envelope<T>>): Promise<Envelope<T | null>> {
  const loaded = await loadConfig(path, ctx.cwd);
  if (!loaded.config) return envelope(command, null, loaded.diagnostics);
  return fn(loaded);
}

export const OPERATIONS = [
  define({
    name: 'init',
    title: 'Initialise sigilsmith in a project',
    description: 'Write sigilsmith.config.json (key detected from the sample items when given) and the managed sigilsmith block in AGENTS.md. Keeps an existing config unless force is set.',
    input: { samples: z.string().optional().describe('Sample items JSON file (array of items).'), force: z.boolean().optional() },
    annotations: WRITE,
    run: async (i, ctx) => init(ctx.cwd, { ...(i.samples ? { samples: i.samples } : {}), force: Boolean(i.force) }),
  }),
  define({
    name: 'catalog',
    title: 'Query the generator catalog',
    description: 'List generators that match constraints (style, semantic level, gzip budget, no network, minimum legible size, MIT-compatible), with measured sizes, licences and terms of use, and the excluded ones with the reason. With presets=true, list the built-in presets instead.',
    input: {
      style: z.array(z.enum(['abstract', 'geometric', 'illustrative', 'photorealistic'])).optional(),
      semantic: z.array(z.enum(['hash', 'metadata', 'embedding', 'llm'])).optional(),
      maxGzip: z.number().int().nonnegative().optional().describe('Maximum gzip bytes per generator, over the kernel. Not the total: `budget.maxGzipBytes` in the config counts the kernel and modules too.'),
      noNetwork: z.boolean().optional(),
      minPx: z.number().int().positive().optional().describe('The size (px) the images must stay legible at.'),
      implemented: z.boolean().optional().describe('Only generators that can be wired today.'),
      mitOnly: z.boolean().optional(),
      ref: z.string().optional().describe('One generator by ref or id, with its params.'),
      presets: z.boolean().optional(),
    },
    annotations: READ,
    run: async (i) => {
      if (i.presets) return envelope('catalog', { presets: Object.values(PRESETS).map((p) => ({ name: p.name, description: p.description, types: Object.keys(p.byType) })) });
      const { presets: _p, ...q } = i;
      return catalog(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== undefined)));
    },
  }),
  define({
    name: 'preview',
    title: 'Render a contact sheet',
    description: 'Render generators on sample items at 16/32/64/128 px on light and dark backgrounds, as HTML and PNG (PNG needs @resvg/resvg-js), with near-duplicate metrics. Look at the PNG to judge.',
    input: { config, generators: z.array(z.string()).optional().describe('Refs, e.g. ["rings@1","shapes@1"]; default: all built-ins.'), samples: z.string().optional(), out: z.string().optional() },
    annotations: { ...WRITE, destructiveHint: false },
    run: (i, ctx) =>
      withConfig(ctx, i.config, 'preview', async (l) => {
        const { items } = loadSamples(l.dir, i.samples ?? l.config!.samples);
        return preview(l, { ...(i.generators?.length ? { generators: i.generators } : {}), items, ...(i.out ? { out: i.out } : {}) });
      }),
  }),
  define({
    name: 'detect_key',
    title: 'Detect the item key',
    description: 'Find the field (or smallest composite of fields) that identifies items in the sample data, with completeness, uniqueness and stability warnings. With write=true, record the choice in the config.',
    input: { samples: z.string().describe('Sample items JSON file.'), write: z.boolean().optional(), config },
    annotations: WRITE,
    run: async (i, ctx) => {
      const loaded = await loadConfig(i.config, ctx.cwd);
      return detectKeyCmd(loaded.raw ? loaded : null, i.samples, { write: Boolean(i.write), cwd: ctx.cwd });
    },
  }),
  define({
    name: 'explain',
    title: 'Explain what happens for an item',
    description: 'For an item (or sample items by index): the resolved key, the generator and the rule that chose it, the inputs, every param with the layer that supplied it, and what delivery and regeneration will do.',
    input: { config, item: z.record(z.string(), z.unknown()).optional(), index: z.number().int().nonnegative().optional(), all: z.boolean().optional(), samples: z.string().optional() },
    annotations: READ,
    run: (i, ctx) =>
      withConfig(ctx, i.config, 'explain', async (l) => {
        let items: Item[];
        if (i.item) items = [i.item];
        else {
          const { items: s, error } = loadSamples(l.dir, i.samples ?? l.config!.samples);
          if (error || !s.length) return envelope('explain', { explanations: [] }, [{ code: 'SGS0702', severity: 'error', message: error ?? 'no sample items: pass `item`, or set "samples" in the config' }]);
          items = i.all ? s : [s[i.index ?? 0]!].filter(Boolean);
        }
        return explainItems(l, items);
      }),
  }),
  define({
    name: 'build',
    title: 'Build the wiring module and lock',
    description: 'Write the generated wiring module (resolved config + lazy loaders for exactly the selectable generators) and sigilsmith.lock.json. Refuses to update the lock when identities would change, unless accept=true (ask the user first).',
    input: { config, out: z.string().optional(), accept: z.boolean().optional() },
    annotations: WRITE,
    run: (i, ctx) =>
      withConfig(ctx, i.config, 'build', async (l) => {
        if (l.diagnostics.some((d) => d.severity === 'error')) return envelope('build', null, l.diagnostics) as Envelope<any>;
        return build(l, { ...(i.out ? { out: i.out } : {}), accept: Boolean(i.accept) });
      }),
  }),
  define({
    name: 'targets',
    title: 'List or emit integration targets',
    description: 'Without emit: list the targets (favicon, Apple touch icon, manifest icons, og:image, Media Session art, ...) with sizes, formats and whether they need a stored URL. With emit: write their files to the public dir and return the registration snippets.',
    input: { config, emit: z.boolean().optional(), ids: z.array(z.string()).optional(), item: z.record(z.string(), z.unknown()).optional(), out: z.string().optional(), force: z.boolean().optional().describe('Replace existing files that sigilsmith did not write (hand-made icons with the same name).'), includeLegacy: z.boolean().optional() },
    annotations: WRITE,
    run: async (i, ctx) => {
      if (!i.emit) return listTargetsCmd({ includeLegacy: Boolean(i.includeLegacy) });
      return withConfig(ctx, i.config, 'targets', (l) => emitTargets(l, { ...(i.ids?.length ? { ids: i.ids } : {}), ...(i.item ? { item: i.item } : {}), ...(i.out ? { outDir: i.out } : {}), force: Boolean(i.force) }));
    },
  }),
  define({
    name: 'check',
    title: 'Check the integration',
    description: `The definition of done: verify ${SECTIONS.join(', ')}. Every failure carries a code and a fix (often a machine-applicable edit or command).`,
    input: { config, only: z.array(z.enum(SECTIONS as [Section, ...Section[]])).optional() },
    annotations: READ,
    run: async (i, ctx) => check(await loadConfig(i.config, ctx.cwd), i.only?.length ? { only: i.only } : {}),
  }),
  define({
    name: 'explain_code',
    title: 'Explain a diagnostic code',
    description: 'What an SGS diagnostic code means and how to fix it.',
    input: { code: z.string().describe('e.g. SGS0701') },
    annotations: READ,
    run: async (i) => explainCode(i.code),
  }),
] as const;

export type OperationName = (typeof OPERATIONS)[number]['name'];

export function getOperation(name: string): Operation<any> | undefined {
  return (OPERATIONS as readonly Operation<any>[]).find((o) => o.name === name || o.name === name.replace(/-/g, '_'));
}

/** Validate input with the operation's schema, then run it. */
export async function runOperation(name: string, input: unknown, ctx: OperationContext = { cwd: process.cwd() }): Promise<Envelope<any>> {
  const op = getOperation(name);
  if (!op) return envelope(name, null, [{ code: 'SGS0000', severity: 'error', message: `unknown operation \`${name}\``, fix: { summary: `operations: ${OPERATIONS.map((o) => o.name).join(', ')}`, applicability: 'unspecified' } }]);
  const parsed = z.object(op.input).strict().safeParse(input ?? {});
  if (!parsed.success) return envelope(op.name, null, parsed.error.issues.map((e) => ({ code: 'SGS0000', severity: 'error' as const, message: `${e.path.join('.') || 'input'}: ${e.message}` })));
  return op.run(parsed.data, ctx);
}
