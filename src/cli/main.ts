#!/usr/bin/env node
/**
 * The `sigilsmith` CLI: a thin layer over `sigilsmith/node`. Every command prints one
 * JSON envelope with `--json` (logs go to stderr), or a human summary otherwise.
 *
 * Exit codes: 0 ok · 1 completed with errors (e.g. `check` failed) · 2 usage error ·
 * 3 config invalid · 4 internal error.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CONFIG_FILE, PKG_NAME } from '../meta.js';
import {
  build,
  catalog,
  check,
  detectKeyCmd,
  emitTargets,
  envelope,
  explainCode,
  explainItems,
  formatDiagnostic,
  init,
  listTargetsCmd,
  loadConfig,
  loadSamples,
  preview,
  SECTIONS,
  type Envelope,
  type Section,
} from '../node/index.js';
import { PRESETS } from '../presets.js';

const HELP = `${PKG_NAME}: deterministic identity images for list items.

Usage: ${PKG_NAME} <command> [options]   (add --json for one machine-readable envelope)

Commands
  init [--samples f.json]           write ${CONFIG_FILE} and the AGENTS.md block
  catalog [filters]                 list generators; filters: --style a,b --semantic a,b
                                    --max-gzip N --no-network --min-px N --implemented
                                    --mit-only --ref <ref> --presets
  preview [--generators a,b]        contact sheet (HTML, PNG with resvg) + metrics
          [--samples f] [--out dir]
  detect-key <samples.json> [--write]   find the item key; --write records it in the config
  explain [--item JSON | --index N | --all]   key, generator, inputs, params and their layers
  build [--accept] [--out f]        write the wiring module and the lock
  targets [--emit] [--ids a,b] [--item JSON] [--out dir]   list targets / emit files + snippets
  check [--only a,b]                verify: ${SECTIONS.join(', ')}
  explain-code <SGSxxxx>            what a diagnostic means and how to fix it

Global: --config <path> (default ./${CONFIG_FILE}), --json, --help`;

type Values = Record<string, string | boolean | undefined>;

const list = (v: unknown) => (typeof v === 'string' && v ? v.split(',').map((s) => s.trim()).filter(Boolean) : undefined);

function print(env: Envelope, json: boolean, human?: (data: any) => string): number {
  if (json) process.stdout.write(`${JSON.stringify(env, null, 2)}\n`);
  else {
    if (human) process.stdout.write(`${human(env.data)}\n`);
    for (const d of env.diagnostics) process.stderr.write(`${formatDiagnostic(d)}\n`);
    for (const n of env.next) process.stderr.write(`next: ${n.command}  # ${n.why}\n`);
  }
  if (env.diagnostics.some((d) => d.severity === 'error' && (d.code === 'SGS0101' || d.code === 'SGS0102'))) return 3;
  return env.ok ? 0 : 1;
}

async function needConfig(v: Values) {
  const loaded = await loadConfig(v.config as string | undefined);
  return loaded;
}

async function main(argv: string[]): Promise<number> {
  const { values: v, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      json: { type: 'boolean' }, help: { type: 'boolean', short: 'h' }, config: { type: 'string' },
      samples: { type: 'string' }, force: { type: 'boolean' }, write: { type: 'boolean' },
      style: { type: 'string' }, semantic: { type: 'string' }, 'max-gzip': { type: 'string' }, 'no-network': { type: 'boolean' },
      'min-px': { type: 'string' }, implemented: { type: 'boolean' }, 'mit-only': { type: 'boolean' }, ref: { type: 'string' }, presets: { type: 'boolean' },
      generators: { type: 'string' }, out: { type: 'string' }, item: { type: 'string' }, index: { type: 'string' }, all: { type: 'boolean' },
      accept: { type: 'boolean' }, emit: { type: 'boolean' }, ids: { type: 'string' }, only: { type: 'string' }, 'include-legacy': { type: 'boolean' },
    },
  });
  const json = Boolean(v.json);
  const [cmd, arg] = positionals;
  if (!cmd || v.help) {
    process.stdout.write(`${HELP}\n`);
    return cmd || v.help ? 0 : 2;
  }
  switch (cmd) {
    case 'init':
      return print(init(process.cwd(), { ...(v.samples ? { samples: String(v.samples) } : {}), force: Boolean(v.force) }), json, (d) => `wrote: ${d.wrote.join(', ') || 'nothing'}${d.skipped.length ? `; kept existing: ${d.skipped.join(', ')}` : ''}`);
    case 'catalog': {
      if (v.presets) return print(envelope('catalog', { presets: Object.values(PRESETS).map((p) => ({ name: p.name, description: p.description, types: Object.keys(p.byType) })) }), json, (d) => d.presets.map((p: any) => `${p.name}: ${p.description}`).join('\n'));
      const q = {
        ...(list(v.style) ? { style: list(v.style)! } : {}), ...(list(v.semantic) ? { semantic: list(v.semantic)! } : {}),
        ...(v['max-gzip'] ? { maxGzip: Number(v['max-gzip']) } : {}), ...(v['no-network'] ? { noNetwork: true } : {}),
        ...(v['min-px'] ? { minPx: Number(v['min-px']) } : {}), ...(v.implemented ? { implemented: true } : {}),
        ...(v['mit-only'] ? { mitOnly: true } : {}), ...(v.ref ? { ref: String(v.ref) } : {}),
      };
      return print(catalog(q), json, (d) => [`${d.matched} of ${d.total} match`, ...d.results.map((r: any) => `${r.implemented ? '●' : '○'} ${(r.ref ?? r.id).padEnd(26)} ${r.style.padEnd(14)} ${r.semanticLevel.padEnd(10)} ${r.gzipBytes ?? '?'} B gz  ${r.license ?? '?'}  ${r.description}`)].join('\n'));
    }
    case 'detect-key': {
      const samples = arg ?? (v.samples as string | undefined);
      if (!samples) {
        process.stderr.write('usage: detect-key <samples.json> [--write]\n');
        return 2;
      }
      const loaded = await loadConfig(v.config as string | undefined);
      return print(detectKeyCmd(loaded.raw ? loaded : null, samples, { write: Boolean(v.write) }), json, (d) => `chosen: ${d.chosen ? JSON.stringify(d.chosen.key) : 'none'} over ${d.total} items${d.written ? ' (written to config)' : ''}\n${d.candidates.map((c: any) => `  ${JSON.stringify(c.key)} complete ${(c.completeness * 100).toFixed(0)}% unique ${(c.uniqueness * 100).toFixed(0)}% ${c.suspects.map((s: any) => s.reason).join(',')}`).join('\n')}`);
    }
    case 'explain': {
      const loaded = await needConfig(v);
      if (!loaded.config) return print(envelope('explain', null, loaded.diagnostics), json);
      let items: unknown[];
      if (v.item) items = [JSON.parse(String(v.item))];
      else {
        const { items: s, error } = loadSamples(loaded.dir, (v.samples as string | undefined) ?? loaded.config.samples);
        if (error || !s.length) {
          process.stderr.write(`${error ?? 'no sample items'}: pass --item '<json>' or set "samples" in the config\n`);
          return 2;
        }
        items = v.all ? s : [s[Number(v.index ?? 0)]];
      }
      return print(await explainItems(loaded, items as Record<string, unknown>[]), json, (d) =>
        d.explanations.map((e: any) => [`key ${JSON.stringify(e.key.value)} (${e.key.via})`, `generator ${e.generator.ref} via ${e.generator.via}${e.generator.weights ? ` weights ${JSON.stringify(e.generator.weights)} bucket ${e.generator.bucket.toFixed(3)}` : ''}`, `inputs ${JSON.stringify(e.inputs.values)}${e.inputs.missing.length ? ` missing ${e.inputs.missing.join(',')}` : ''}`, ...e.params.map((p: any) => `  ${p.path} = ${JSON.stringify(p.value)}  [${p.layer}${p.shadowed.length ? `, over ${p.shadowed.map((s: any) => s.layer).join(',')}` : ''}]`), `delivery: ${e.delivery.note}`, `regeneration: ${e.regeneration.note}`].join('\n')).join('\n\n'));
    }
    case 'build': {
      const loaded = await needConfig(v);
      if (!loaded.config || loaded.diagnostics.some((d) => d.severity === 'error')) return print(envelope('build', null, loaded.diagnostics), json);
      return print(await build(loaded, { ...(v.out ? { out: String(v.out) } : {}), accept: Boolean(v.accept) }), json, (d) => `wrote ${d.wrote.join(', ')}; generators: ${d.refs.join(', ')}`);
    }
    case 'preview': {
      const loaded = await needConfig(v);
      if (!loaded.config) return print(envelope('preview', null, loaded.diagnostics), json);
      const { items } = loadSamples(loaded.dir, (v.samples as string | undefined) ?? loaded.config.samples);
      return print(await preview(loaded, { ...(list(v.generators) ? { generators: list(v.generators)! } : {}), items, ...(v.out ? { out: String(v.out) } : {}) }), json, (d) => `${Object.values(d.files).join('\n')}\n${Object.entries(d.metrics).map(([r, m]: any) => `${r}: min distance ${m.minDistance}, median ${m.medianDistance}, near-duplicates ${m.nearDuplicates}/${m.items}`).join('\n')}`);
    }
    case 'targets': {
      if (!v.emit) return print(listTargetsCmd({ includeLegacy: Boolean(v['include-legacy']) }), json, (d) => d.targets.map((t: any) => `${t.id.padEnd(24)} ${t.status.padEnd(8)} ${t.scope.padEnd(5)} ${t.requiresStoredUrl ? 'stored URL' : 'client-side'}  ${t.files.join(', ')}`).join('\n'));
      const loaded = await needConfig(v);
      if (!loaded.config) return print(envelope('targets', null, loaded.diagnostics), json);
      return print(await emitTargets(loaded, { ...(list(v.ids) ? { ids: list(v.ids)! } : {}), ...(v.item ? { item: JSON.parse(String(v.item)) } : {}), ...(v.out ? { outDir: String(v.out) } : {}) }), json, (d) => `${d.files.map((f: any) => `wrote ${f.path} (${f.bytes} B)`).join('\n')}\n\n${Object.entries(d.snippets).map(([k, s]) => `<!-- ${k} -->\n${s}`).join('\n\n')}`);
    }
    case 'check': {
      const loaded = await needConfig(v);
      const only = list(v.only) as Section[] | undefined;
      return print(await check(loaded, only ? { only } : {}), json, (d) => Object.entries(d.sections).map(([s, r]) => `${r === 'pass' ? '✓' : r === 'fail' ? '✗' : r === 'warn' ? '!' : '-'} ${s}`).join('\n') + (d.budget?.totalGzip != null ? `\nbudget: ${d.budget.totalGzip} B gzip${d.budget.maxGzipBytes ? ` of ${d.budget.maxGzipBytes}` : ''}` : ''));
    }
    case 'explain-code':
      if (!arg) {
        process.stderr.write('usage: explain-code <SGSxxxx>\n');
        return 2;
      }
      return print(explainCode(arg), json, (d) => (d ? `${d.code}: ${d.title}\ncause: ${d.cause}\nfix: ${d.fix}` : ''));
    case 'version':
      process.stdout.write(`${(JSON.parse(readFileSync(resolve(new URL('../../package.json', import.meta.url).pathname), 'utf8')) as { version: string }).version}\n`);
      return 0;
    default:
      process.stderr.write(`unknown command \`${cmd}\`\n\n${HELP}\n`);
      return 2;
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (e) => {
    process.stderr.write(`internal error: ${(e as Error).stack ?? e}\n`);
    process.exit(4);
  },
);
