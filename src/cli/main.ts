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
import { formatDiagnostic, SECTIONS, type Envelope } from '../node/index.js';
import { runOperation } from '../node/operations.js';

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
  mcp [--cwd dir]                   the same operations as an MCP server over stdio

Global: --config <path> (default ./${CONFIG_FILE}), --json, --help`;


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
      accept: { type: 'boolean' }, emit: { type: 'boolean' }, ids: { type: 'string' }, only: { type: 'string' }, 'include-legacy': { type: 'boolean' }, cwd: { type: 'string' },
    },
  });
  const json = Boolean(v.json);
  const [cmd, arg] = positionals;
  if (!cmd || v.help) {
    process.stdout.write(`${HELP}\n`);
    return cmd || v.help ? 0 : 2;
  }
  const config = v.config as string | undefined;
  const opt = <T,>(k: string, f: (x: any) => T = (x) => x): T | undefined => (v[k] === undefined ? undefined : f(v[k]));
  const human: Record<string, (d: any) => string> = {
    init: (d) => `wrote: ${d.wrote.join(', ') || 'nothing'}${d.skipped.length ? `; kept existing: ${d.skipped.join(', ')}` : ''}`,
    catalog: (d) => d.presets ? d.presets.map((p: any) => `${p.name}: ${p.description}`).join('\n') : [`${d.matched} of ${d.total} match`, ...d.results.map((r: any) => `${r.implemented ? '●' : '○'} ${(r.ref ?? r.id).padEnd(26)} ${r.style.padEnd(14)} ${r.semanticLevel.padEnd(10)} ${r.gzipBytes ?? '?'} B gz  ${r.license ?? '?'}  ${r.description}${r.terms ? `\n    terms: ${r.terms.join('; ')}` : ''}${r.usage ? `\n    wire: ${r.usage}` : ''}`)].join('\n'),
    detect_key: (d) => `chosen: ${d.chosen ? JSON.stringify(d.chosen.key) : 'none'} over ${d.total} items${d.written ? ' (written to config)' : ''}\n${d.candidates.map((c: any) => `  ${JSON.stringify(c.key)} complete ${(c.completeness * 100).toFixed(0)}% unique ${(c.uniqueness * 100).toFixed(0)}% ${c.suspects.map((x: any) => x.reason).join(',')}`).join('\n')}`,
    explain: (d) => d.explanations.map((e: any) => [`key ${JSON.stringify(e.key.value)} (${e.key.via})`, `generator ${e.generator.ref} via ${e.generator.via}${e.generator.weights ? ` weights ${JSON.stringify(e.generator.weights)} bucket ${e.generator.bucket.toFixed(3)}` : ''}`, `inputs ${JSON.stringify(e.inputs.values)}${e.inputs.missing.length ? ` missing ${e.inputs.missing.join(',')}` : ''}`, ...e.params.map((p: any) => `  ${p.path} = ${JSON.stringify(p.value)}  [${p.layer}${p.shadowed.length ? `, over ${p.shadowed.map((x: any) => x.layer).join(',')}` : ''}]`), `delivery: ${e.delivery.note}`, `regeneration: ${e.regeneration.note}`].join('\n')).join('\n\n'),
    build: (d) => `wrote ${d.wrote.join(', ')}; generators: ${d.refs.join(', ')}`,
    preview: (d) => `${Object.values(d.files).join('\n')}\n${Object.entries(d.metrics).map(([r, m]: any) => `${r}: min distance ${m.minDistance}, median ${m.medianDistance}, near-duplicates ${m.nearDuplicates}/${m.items}${m.caveat ? ` (${m.caveat})` : ''}`).join('\n')}`,
    targets: (d) => d.targets ? d.targets.map((t: any) => `${t.id.padEnd(24)} ${t.status.padEnd(8)} ${t.scope.padEnd(5)} ${t.requiresStoredUrl ? 'stored URL' : 'client-side'}  ${t.files.join(', ')}`).join('\n') : `${d.files.map((f: any) => `wrote ${f.path} (${f.bytes} B)`).join('\n')}\n\n${Object.entries(d.snippets).map(([k, x]) => `<!-- ${k} -->\n${x}`).join('\n\n')}`,
    check: (d) => Object.entries(d.sections).map(([x, r]) => `${r === 'pass' ? '✓' : r === 'fail' ? '✗' : r === 'warn' ? '!' : '-'} ${x}`).join('\n') + (d.budget?.totalGzip != null ? `\nbudget: ${d.budget.totalGzip} B gzip${d.budget.maxGzipBytes ? ` of ${d.budget.maxGzipBytes}` : ''}` : ''),
    explain_code: (d) => (d ? `${d.code}: ${d.title}\ncause: ${d.cause}\nfix: ${d.fix}` : ''),
  };
  const inputs: Record<string, () => Record<string, unknown> | null> = {
    init: () => ({ samples: opt('samples', String), force: opt('force', Boolean) }),
    catalog: () => ({ style: list(v.style), semantic: list(v.semantic), maxGzip: opt('max-gzip', Number), noNetwork: opt('no-network', Boolean), minPx: opt('min-px', Number), implemented: opt('implemented', Boolean), mitOnly: opt('mit-only', Boolean), ref: opt('ref', String), presets: opt('presets', Boolean) }),
    'detect-key': () => (arg ?? v.samples ? { samples: String(arg ?? v.samples), write: opt('write', Boolean), config } : null),
    explain: () => ({ config, item: opt('item', (x) => JSON.parse(String(x))), index: opt('index', Number), all: opt('all', Boolean), samples: opt('samples', String) }),
    build: () => ({ config, out: opt('out', String), accept: opt('accept', Boolean) }),
    preview: () => ({ config, generators: list(v.generators), samples: opt('samples', String), out: opt('out', String) }),
    targets: () => ({ config, emit: opt('emit', Boolean), ids: list(v.ids), item: opt('item', (x) => JSON.parse(String(x))), out: opt('out', String), includeLegacy: opt('include-legacy', Boolean) }),
    check: () => ({ config, only: list(v.only) }),
    'explain-code': () => (arg ? { code: arg } : null),
  };
  if (cmd === 'mcp') {
    const { startMcpServer } = await import('../mcp/server.js');
    await startMcpServer({ ...(v.cwd ? { cwd: String(v.cwd) } : {}) });
    return -1; // keep running: the server owns the process
  }
  if (cmd === 'version') {
    process.stdout.write(`${(JSON.parse(readFileSync(resolve(new URL('../../package.json', import.meta.url).pathname), 'utf8')) as { version: string }).version}\n`);
    return 0;
  }
  const make = inputs[cmd];
  if (!make) {
    process.stderr.write(`unknown command \`${cmd}\`\n\n${HELP}\n`);
    return 2;
  }
  const input = make();
  if (!input) {
    process.stderr.write(`usage: ${PKG_NAME} ${cmd} <${cmd === 'explain-code' ? 'SGSxxxx' : 'samples.json'}>\n`);
    return 2;
  }
  const clean = Object.fromEntries(Object.entries(input).filter(([, x]) => x !== undefined));
  const env = await runOperation(cmd, clean);
  return print(env, json, human[cmd.replace(/-/g, '_')]);
}

main(process.argv.slice(2)).then(
  (code) => {
    // exitCode, not exit(): exit() can cut off piped stdout (a long --json envelope) mid-write.
    if (code >= 0) process.exitCode = code;
  },
  (e) => {
    process.stderr.write(`internal error: ${(e as Error).stack ?? e}\n`);
    process.exit(4);
  },
);
