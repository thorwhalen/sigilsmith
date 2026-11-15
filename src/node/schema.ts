/**
 * zod schemas: the single source of truth for the config file, generator manifests
 * and integration targets (B0.2, B8, B10, B17).
 *
 * Node/build-time only. The browser runtime never imports this module (zod costs
 * ~92 kB gzip in a bundle); it receives a config already validated here and frozen
 * by `sigilsmith build`. The JSON Schema shipped in `schema/config.schema.json` is
 * generated from `ConfigSchema` (`npm run schema`), so editors validate the config too.
 */
import { z } from 'zod';

export const RefSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]*(\/[a-z0-9-]+)?@\d+$/, 'a generator ref is `<id>@<major>`, e.g. `grid@1`')
  .describe('Generator reference: `<id>@<major>`. The major pins the output contract.');

export const InputSpecSchema = z.union([
  z.string().min(1).describe('A field path (`title`, `meta.uuid`), `$key` or `$label`.'),
  z.object({ field: z.string().min(1), maxChars: z.number().int().positive().optional(), as: z.string().min(1).optional().describe('Name the generator sees (e.g. keep `title` when the data field becomes `name`).') }).strict(),
]);

const ParamsSchema = z.record(z.string(), z.unknown()).describe('Generator params; validated against the generator manifest by `check`.');

const MatcherSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number()])),
  z.object({ includes: z.string() }).strict(),
  z.object({ exists: z.boolean() }).strict(),
]);

export const RuleSchema = z
  .object({
    when: z.record(z.string(), MatcherSchema).describe('Item field → value, list of values, `{ includes }` or `{ exists }`. All must match.'),
    use: z.union([RefSchema, z.record(RefSchema, z.number().positive())]).describe('A ref, or a weight map for deterministic weighted selection.'),
    inputs: z.array(InputSpecSchema).optional(),
    params: z.record(RefSchema, ParamsSchema).optional(),
  })
  .strict();

const KeyBase = {
  fallback: z.array(z.string()).default([]).describe('Fields used (as a composite) when the key is missing; a warning is emitted.'),
  onMissing: z.enum(['fallback', 'throw']).default('fallback'),
};

export const KeyConfigSchema = z.union([
  z.object({ field: z.string().min(1), ...KeyBase }).strict(),
  z.object({ fields: z.array(z.string().min(1)).min(2), ...KeyBase }).strict(),
  z.object({ custom: z.string().regex(/#/, 'use `<module path>#<export name>`'), ...KeyBase }).strict(),
]);

export const RemoteSpecSchema = z.union([
  z.object({ transport: z.literal('proxy'), url: z.string().min(1) }).strict(),
  z
    .object({
      transport: z.literal('dicebear'),
      style: z.string().default('shapes'),
      baseUrl: z.string().url().optional().describe('A self-hosted DiceBear API: required for commercial use.'),
      use: z.enum(['non-commercial']).optional().describe('Acknowledge that the public api.dicebear.com is used for a non-commercial app (its terms).'),
    })
    .strict(),
  z.object({ transport: z.literal('mock'), latencyMs: z.number().int().nonnegative().default(300) }).strict(),
  z.object({ transport: z.literal('module'), module: z.string().regex(/#/) }).strict().describe('A custom transport exported by your code, e.g. BYOK.'),
]);

export const ConfigSchema = z
  .object({
    $schema: z.string().optional(),
    $comment: z.string().optional().describe('Free text; JSON has no comments.'),
    version: z.literal(1),
    itemType: z.object({ field: z.string().min(1) }).nullable().default({ field: 'type' }),
    key: KeyConfigSchema.describe('How to get an item\'s stable key. Write it with `sigilsmith detect-key --write`.'),
    label: z.object({ fields: z.array(z.string()).min(1) }).default({ fields: ['name', 'title', 'label', 'displayName', 'username'] }),
    presets: z.array(z.string()).default([]),
    generators: z.record(RefSchema, z.object({ inputs: z.array(InputSpecSchema).optional(), params: ParamsSchema.optional() }).strict()).default({}),
    remote: z.record(RefSchema, RemoteSpecSchema).default({}).describe('Remote/async generators and their transports. Keys never go here.'),
    policy: z
      .object({
        default: RefSchema,
        salt: z.string().default('sigilsmith'),
        rules: z.array(RuleSchema).default([]),
        placeholder: RefSchema.default('grid@1').describe('Pure generator shown while a remote generator works.'),
      })
      .strict(),
    delivery: z.object({ strategy: z.enum(['materialized', 'derived', 'hybrid']).default('materialized'), format: z.enum(['svg', 'png']).default('svg') }).strict().default({ strategy: 'materialized', format: 'svg' }),
    regeneration: z.object({ policy: z.enum(['auto', 'ask', 'always', 'never']).default('auto').describe('auto: each generator\'s own default (initials: always), else ask.') }).strict().default({ policy: 'auto' }),
    budget: z.object({ maxGzipBytes: z.number().int().positive().optional().describe('Total gzip bytes sigilsmith may add to the app: kernel + the delivery, React and remote modules in use + every generator the config can select. Not per generator (that is `catalog --max-gzip`).') }).strict().default({}),
    userSettings: z
      .object({ choices: z.array(RefSchema).default([]), perType: z.boolean().default(true), params: z.record(RefSchema, z.array(z.string())).default({}) })
      .strict()
      .default({ choices: [], perType: true, params: {} }),
    samples: z.string().optional().describe('Sample items (JSON array) used by detect-key, check and preview.'),
    output: z.object({ gen: z.string().default('src/sigilsmith.gen.ts') }).strict().default({ gen: 'src/sigilsmith.gen.ts' }),
    check: z.object({ src: z.array(z.string()).default(['src']), ignore: z.array(z.string()).default(['node_modules', 'dist']) }).strict().default({ src: ['src'], ignore: ['node_modules', 'dist'] }),
    targets: z
      .object({
        ids: z.array(z.string()).default([]),
        baseUrl: z.string().optional().describe('Absolute site URL; required for og:image.'),
        publicDir: z.string().default('public'),
        html: z.string().optional().describe('HTML file whose <head> `check targets` inspects.'),
        manifest: z.string().optional().describe('Web app manifest file `check targets` inspects.'),
        site: z.object({ seed: z.string(), ref: RefSchema.optional() }).strict().optional().describe('The site\'s own sigil (favicon and app icons).'),
        background: z.string().default('#ffffff').describe('Opaque background for icons that cannot be transparent.'),
      })
      .strict()
      .default({ ids: [], publicDir: 'public', background: '#ffffff' }),
  })
  .strict();

export type Config = z.output<typeof ConfigSchema>;
export type ConfigInput = z.input<typeof ConfigSchema>;

// ---------------------------------------------------------------------------
// Manifests (B10). Drafts from the survey and implemented generators share one schema.

export const ManifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    version: z.string(),
    name: z.string(),
    description: z.string(),
    category: z.string(),
    role: z.enum(['generator', 'helper', 'runtime', 'placeholder']),
    upstream: z.object({ name: z.string(), url: z.string().nullable(), npm: z.string().nullable(), lastRelease: z.string().nullable(), maintenance: z.enum(['active', 'maintained', 'stale', 'archived', 'unknown']) }),
    license: z.object({ spdx: z.string().nullable(), mitCompatible: z.boolean().nullable(), restrictions: z.array(z.string()), notes: z.string() }),
    bundleSize: z.object({ minBytes: z.number().nullable().optional(), minGzipBytes: z.number().nullable(), brotliBytes: z.number().nullable(), measured: z.boolean(), source: z.string() }),
    lazyLoadable: z.boolean().nullable(),
    runtime: z.object({ browser: z.boolean().nullable(), node: z.boolean().nullable(), edge: z.boolean().nullable(), webgpu: z.boolean().nullable(), network: z.boolean().nullable() }),
    cost: z.object({ model: z.enum(['free', 'free-tier', 'paid', 'byok']), notes: z.string() }),
    requiresSecret: z.boolean(),
    style: z.enum(['abstract', 'geometric', 'illustrative', 'photorealistic']),
    semanticLevel: z.enum(['hash', 'metadata', 'embedding', 'llm']),
    sizeRange: z.object({ minPx: z.number().nullable(), maxPx: z.number().nullable(), basis: z.enum(['estimate', 'measured']) }),
    outputFormat: z.array(z.string()),
    determinism: z.enum(['pure', 'seeded', 'cached-nondeterministic']),
    latency: z.object({ typicalMs: z.number().nullable(), basis: z.enum(['estimate', 'measured']) }),
    params: z.array(z.object({ name: z.string(), type: z.string(), default: z.unknown().optional(), description: z.string() }).passthrough()),
    examples: z.array(z.unknown()),
    verdict: z.enum(['mvp', 'later', 'optional-peer', 'study', 'avoid', 'implemented']),
    verdictReason: z.string(),
    // Present only on implemented generators:
    implemented: z.boolean().default(false),
    major: z.number().int().positive().optional(),
    ref: RefSchema.optional(),
    importPath: z.string().optional(),
    kind: z.enum(['hash', 'semantic']).optional(),
    defaultInputs: z.array(InputSpecSchema).optional(),
    peer: z.object({ name: z.string(), version: z.string() }).optional().describe('Upstream library the host must install, pinned exactly.'),
  })
  .passthrough();

export type Manifest = z.output<typeof ManifestSchema>;

// ---------------------------------------------------------------------------
// Targets (B17)

export const TargetSpecSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    status: z.enum(['current', 'optional', 'legacy']),
    scope: z.enum(['site', 'item']),
    requiresStoredUrl: z.boolean(),
    absoluteUrl: z.boolean(),
    maxBytes: z.number().optional(),
    files: z.array(z.object({ path: z.string(), width: z.number(), height: z.number(), format: z.enum(['svg', 'png', 'ico']), opaque: z.boolean().optional(), safeZone: z.number().optional(), purpose: z.enum(['any', 'maskable', 'monochrome']).optional() })),
    registration: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('html'), template: z.string() }),
      z.object({ kind: z.literal('manifest'), field: z.enum(['icons', 'shortcuts']) }),
      z.object({ kind: z.literal('js'), template: z.string() }),
    ]),
    notes: z.string(),
    sources: z.array(z.string()),
  })
  .strict();
