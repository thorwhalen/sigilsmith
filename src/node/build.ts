/**
 * `build`: config in, wiring module and lock out (the Generation Gap split).
 *
 * The wiring module (`src/sigilsmith.gen.ts` by default) holds the resolved config as
 * a frozen literal and a static table of lazy loaders for only the generators the
 * config can select, so bundlers emit one small chunk per generator and nothing else.
 * It is committed and never edited by hand; `check` compares its header hash with the
 * config. The lock (`sigilsmith.lock.json`) records each pinned generator's
 * fingerprint and each sample item's image hash, so `check identity` catches any
 * change in what users would see.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { sha256Hex } from '../hash.js';
import { GEN_FILE, LOCK_FILE, PKG_NAME } from '../meta.js';
import { seededRng, cyrb128 } from '../hash.js';
import { paletteFromHash } from '../palette.js';
import type { GeneratorModule, Item, SigilImage } from '../types.js';
import { BUILTIN_BY_REF } from './builtins.js';
import { PACKAGE_ROOT } from './catalog.js';
import { loadSamples, referencedRefs, type LoadedConfig } from './config.js';
import { diag, envelope, type Diagnostic, type Envelope } from './diagnostics.js';
import { nodeSigil } from './runtime.js';

export function packageVersion(): string {
  return (JSON.parse(readFileSync(`${PACKAGE_ROOT}package.json`, 'utf8')) as { version: string }).version;
}

/** Fixed inputs for fingerprints: changing them would invalidate every lock, so they are frozen too. */
export const GOLDEN_SEEDS = ['a', 'sigil', 'Blue Monday', 'ada@example.com', '0', 'Ωμέγα', '🎵 song', 'f47ac10b-58cc-4372-a567-0e02b2c3d479'];

export async function renderModule(mod: GeneratorModule<any>, seed: string, params?: Record<string, unknown>): Promise<SigilImage> {
  const ref = `${mod.id}@${mod.major}`;
  const [h] = cyrb128(`${seed}\u0000${ref}`);
  const p = { ...(mod.defaults as Record<string, unknown>), ...(params ?? {}) };
  return mod.render({ seed, hash: h, rng: seededRng(`${seed}\u0000${ref}`), palette: paletteFromHash(h), fields: { key: seed, label: seed, title: seed }, params: p, size: 64 });
}

export async function fingerprint(mod: GeneratorModule<any>): Promise<string> {
  const parts: string[] = [];
  for (const s of GOLDEN_SEEDS) {
    const img = await renderModule(mod, s);
    parts.push(img.type === 'svg' ? img.svg : img.type);
  }
  return (await sha256Hex(parts.join('\n'))).slice(0, 32);
}

export async function imageHash(img: SigilImage): Promise<string> {
  if (img.type === 'svg') return (await sha256Hex(img.svg)).slice(0, 32);
  if (img.type === 'url') return `url:${img.url}`;
  return (await sha256Hex(new Uint8Array(await img.blob.arrayBuffer()))).slice(0, 32);
}

export interface Lock {
  version: 1;
  package: string;
  config: string;
  generators: Record<string, { fingerprint: string; peer?: { name: string; version: string | null } }>;
  samples: Record<string, { ref: string; image: string }>;
}

export function installedVersion(dir: string, name: string): string | null {
  let d = dir;
  for (;;) {
    const f = resolve(d, 'node_modules', name, 'package.json');
    if (existsSync(f)) return (JSON.parse(readFileSync(f, 'utf8')) as { version: string }).version;
    const up = dirname(d);
    if (up === d) return null;
    d = up;
  }
}

export async function computeLock(loaded: LoadedConfig): Promise<{ lock: Lock; diagnostics: Diagnostic[] }> {
  const cfg = loaded.config!;
  const diagnostics: Diagnostic[] = [];
  const generators: Lock['generators'] = {};
  for (const ref of referencedRefs(cfg)) {
    const b = BUILTIN_BY_REF[ref];
    if (!b) continue; // remote generators are cached-nondeterministic: nothing to fingerprint
    const peer = b.manifest.peer;
    generators[ref] = { fingerprint: await fingerprint(b.module), ...(peer ? { peer: { name: peer.name, version: installedVersion(loaded.dir, peer.name) } } : {}) };
  }
  const samples: Lock['samples'] = {};
  const { items, error } = loadSamples(loaded.dir, cfg.samples);
  if (error) diagnostics.push(diag('SGS0702', 'warning', error, { where: { path: 'samples' } }));
  if (items.length) {
    const sigil = await nodeSigil(loaded, { remote: false });
    for (const item of items.slice(0, 500)) {
      try {
        const plan = await sigil.plan(item);
        if (!BUILTIN_BY_REF[plan.selection.ref]) continue;
        samples[plan.key] = { ref: plan.selection.ref, image: await imageHash(await sigil.render(item)) };
      } catch (e) {
        diagnostics.push(diag('SGS0203', 'warning', (e as Error).message, { where: { item } }));
      }
    }
  }
  return { lock: { version: 1, package: packageVersion(), config: loaded.hash, generators, samples }, diagnostics };
}

function importSpecifier(fromFile: string, dir: string, modulePath: string): string {
  let rel = relative(dirname(fromFile), resolve(dir, modulePath)).replace(/\\/g, '/');
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel.replace(/\.tsx?$/, '');
}

export function renderWiringModule(loaded: LoadedConfig, outFile: string): string {
  const cfg = loaded.config!;
  const refs = referencedRefs(cfg);
  const imports: string[] = [`import { createSigil, type ResolvedConfig, type GeneratorLoader } from '${PKG_NAME}';`];
  const extras: string[] = [];
  const loaders: string[] = [];
  let n = 0;
  for (const ref of refs) {
    const b = BUILTIN_BY_REF[ref];
    if (b) {
      loaders.push(`  '${ref}': () => import('${b.manifest.importPath}'),`);
      continue;
    }
    const spec = cfg.remote[ref];
    if (!spec) continue;
    const [id, major] = ref.split('@');
    if (spec.transport === 'module') {
      const [p, name] = spec.module.split('#');
      const alias = `transport${n++}`;
      imports.push(`import { ${name} as ${alias} } from '${importSpecifier(outFile, loaded.dir, p!)}';`);
      loaders.push(`  '${ref}': () => import('${PKG_NAME}/remote').then((m) => m.remoteFromSpec('${id}', ${major}, ${JSON.stringify(spec)}, { transport: ${alias} })),`);
    } else {
      loaders.push(`  '${ref}': () => import('${PKG_NAME}/remote').then((m) => m.remoteFromSpec('${id}', ${major}, ${JSON.stringify(spec)})),`);
    }
  }
  let keyFn = '';
  if ('custom' in cfg.key) {
    const [p, name] = cfg.key.custom.split('#');
    imports.push(`import { ${name} as keyFn } from '${importSpecifier(outFile, loaded.dir, p!)}';`);
    keyFn = ', keyFn';
  }
  const configFile = relative(dirname(outFile), loaded.path).replace(/\\/g, '/');
  return [
    `// GENERATED by \`${PKG_NAME} build\` from ${configFile}. Do not edit.`,
    `// Change the config, then run \`npx ${PKG_NAME} build\`; \`npx ${PKG_NAME} check\` verifies this file is fresh.`,
    `// ${PKG_NAME}@${packageVersion()} · config ${loaded.hash}`,
    ...imports,
    ...extras,
    '',
    `export const config: ResolvedConfig = Object.freeze(${JSON.stringify(loaded.resolved, null, 2)}) as ResolvedConfig;`,
    '',
    '/** Lazy loaders for exactly the generators the config can select: one chunk each. */',
    'export const generators: Record<string, GeneratorLoader> = {',
    ...loaders,
    '};',
    '',
    `export const sigil = createSigil({ config, generators${keyFn} });`,
    '',
  ].join('\n');
}

export const HEADER_HASH_RE = /^\/\/ \S+@\S+ · config ([0-9a-f]{16})$/m;

export async function build(loaded: LoadedConfig, opts: { out?: string; accept?: boolean; dryRun?: boolean } = {}): Promise<Envelope<{ wiring: string; lock: string; refs: string[]; wrote: string[] }>> {
  const cfg = loaded.config!;
  const outFile = resolve(loaded.dir, opts.out ?? cfg.output.gen ?? `src/${GEN_FILE}`);
  const lockFile = resolve(loaded.dir, LOCK_FILE);
  const diagnostics: Diagnostic[] = [];
  const wrote: string[] = [];
  const source = renderWiringModule(loaded, outFile);
  const { lock, diagnostics: ld } = await computeLock(loaded);
  diagnostics.push(...ld);
  if (existsSync(lockFile) && !opts.accept) {
    const old = JSON.parse(readFileSync(lockFile, 'utf8')) as Lock;
    const changed = Object.entries(lock.generators).filter(([r, g]) => old.generators[r] && old.generators[r]!.fingerprint !== g.fingerprint);
    const moved = Object.entries(lock.samples).filter(([k, s]) => old.samples[k] && (old.samples[k]!.image !== s.image || old.samples[k]!.ref !== s.ref));
    if (changed.length || moved.length) {
      diagnostics.push(diag('SGS0504', 'error', `this build would change identities: ${changed.length} generator(s), ${moved.length} sample item(s); lock not updated`, { where: { generators: changed.map(([r]) => r), items: moved.map(([k]) => k).slice(0, 20) }, fix: { summary: 'review, then accept', applicability: 'maybe-incorrect', commands: [`npx ${PKG_NAME} build --accept`] } }));
    }
  }
  const blocked = diagnostics.some((d) => d.code === 'SGS0504');
  if (!opts.dryRun) {
    mkdirSync(dirname(outFile), { recursive: true });
    writeFileSync(outFile, source);
    wrote.push(relative(loaded.dir, outFile));
    if (!blocked) {
      writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`);
      wrote.push(relative(loaded.dir, lockFile));
    }
  }
  return envelope('build', { wiring: relative(loaded.dir, outFile), lock: relative(loaded.dir, lockFile), refs: referencedRefs(cfg), wrote }, diagnostics, [{ command: `npx ${PKG_NAME} check`, why: 'verify budget, identity, drift and targets' }]);
}
