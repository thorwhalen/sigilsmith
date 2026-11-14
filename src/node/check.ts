/**
 * `check`: the definition of done for an integration (B0.5, B11).
 *
 * Sections: `config` (schema and semantics), `fresh` (wiring module matches the
 * config), `key` and `data` (the configured fields still exist in the sample data and
 * the key is unique), `identity` (pinned generators and sample images match the lock),
 * `determinism` (same inputs → same bytes), `budget` (kernel + selected generators
 * under the cap), `peers` (adapter libraries at their pinned versions), `bypass` (app
 * code goes through the config), and `targets` (registration). Every failure carries a
 * fix.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { getPath, normalizePart } from '../key.js';
import { LOCK_FILE, PKG_NAME } from '../meta.js';
import type { InputSpec, Item } from '../types.js';
import { computeLock, HEADER_HASH_RE, installedVersion, type Lock } from './build.js';
import { BUILTIN_BY_REF } from './builtins.js';
import { readSizes } from './catalog.js';
import { CONFIG_FILE } from '../meta.js';
import { loadSamples, referencedRefs, type LoadedConfig } from './config.js';
import { detectKey } from './detect.js';
import { diag, envelope, type Diagnostic, type Envelope } from './diagnostics.js';
import { nodeSigil } from './runtime.js';
import { checkTargets } from './targets.js';

export type Section = 'config' | 'fresh' | 'data' | 'identity' | 'determinism' | 'budget' | 'peers' | 'bypass' | 'targets';
export const SECTIONS: Section[] = ['config', 'fresh', 'data', 'identity', 'determinism', 'budget', 'peers', 'bypass', 'targets'];

const fieldOf = (s: InputSpec) => (typeof s === 'string' ? s : s.field);

function keyFields(loaded: LoadedConfig): string[] {
  const k = loaded.config!.key;
  return 'field' in k ? [k.field] : 'fields' in k ? k.fields : [];
}

function checkData(loaded: LoadedConfig, items: Item[], samplesFile: string): Diagnostic[] {
  const cfg = loaded.config!;
  const out: Diagnostic[] = [];
  if (!items.length) return out;
  const present = (f: string) => items.filter((it) => normalizePart(getPath(it, f)) !== undefined).length;
  for (const f of keyFields(loaded)) {
    const n = present(f);
    if (n === 0) {
      const report = detectKey(items);
      const suggestion = report.chosen?.key;
      out.push(
        diag('SGS0701', 'error', `key field \`${f}\` is missing from ${items.length} of ${items.length} sample items`, {
          where: { config: 'key', data: samplesFile },
          fix: suggestion
            ? { summary: `the data's key now looks like ${JSON.stringify(suggestion)} (complete and unique): change one line in ${CONFIG_FILE}`, applicability: 'maybe-incorrect', edits: [{ file: CONFIG_FILE, path: 'field' in suggestion ? 'key.field' : 'key.fields', set: 'field' in suggestion ? suggestion.field : suggestion.fields }], commands: [`npx ${PKG_NAME} detect-key ${relative(loaded.dir, samplesFile)} --write`] }
            : { summary: 'restore the field in the data or point key.field at its new name', applicability: 'has-placeholders' },
        }),
      );
    } else if (n < items.length) {
      out.push(diag('SGS0202', 'warning', `key field \`${f}\` is missing from ${items.length - n} of ${items.length} sample items (they will use the fallback key)`, { where: { config: 'key', data: samplesFile } }));
    }
  }
  const fields = keyFields(loaded);
  if (fields.length && fields.every((f) => present(f) === items.length)) {
    const seen = new Map<string, number>();
    for (const it of items) {
      const k = JSON.stringify(fields.map((f) => normalizePart(getPath(it, f))));
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    const dups = [...seen.entries()].filter(([, c]) => c > 1);
    if (dups.length) out.push(diag('SGS0204', 'error', `key is not unique: ${dups.length} value(s) shared by several items, e.g. ${dups[0]![0]}`, { where: { config: 'key', data: samplesFile }, fix: { summary: 'use a unique or composite key', applicability: 'maybe-incorrect', commands: [`npx ${PKG_NAME} detect-key ${relative(loaded.dir, samplesFile)}`] } }));
  }
  const named = new Set<string>();
  if (cfg.itemType) named.add(cfg.itemType.field);
  for (const g of Object.values(cfg.generators)) for (const i of g.inputs ?? []) named.add(fieldOf(i));
  cfg.policy.rules.forEach((r) => {
    Object.keys(r.when).forEach((f) => named.add(f));
    (r.inputs ?? []).forEach((i) => named.add(fieldOf(i)));
  });
  for (const f of named) {
    if (f.startsWith('$')) continue;
    if (present(f) === 0) out.push(diag('SGS0702', 'error', `field \`${f}\` named in the config appears in no sample item`, { where: { config: CONFIG_FILE, data: samplesFile }, fix: { summary: 'rename it in the config to match the data (one line), or fix the data', applicability: 'has-placeholders' } }));
  }
  return out;
}

function* walk(dir: string, ignore: string[]): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    if (ignore.includes(name) || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p, ignore);
    else if (/\.(m?[jt]sx?|vue|svelte)$/.test(name)) yield p;
  }
}

function checkBypass(loaded: LoadedConfig, genFile: string): Diagnostic[] {
  const cfg = loaded.config!;
  const out: Diagnostic[] = [];
  const refs = referencedRefs(cfg);
  const refRe = new RegExp(`['"\`](${refs.map((r) => r.replace(/[.*+?^${}()|[\]\\@]/g, '\\$&')).join('|')})['"\`]`);
  const keyField = keyFields(loaded)[0];
  for (const src of cfg.check.src) {
    for (const file of walk(resolve(loaded.dir, src), cfg.check.ignore)) {
      if (resolve(file) === resolve(genFile)) continue;
      const text = readFileSync(file, 'utf8');
      const usesPkg = text.includes(`'${PKG_NAME}`) || text.includes(`"${PKG_NAME}`) || text.includes(relative(resolve(file, '..'), genFile).replace(/\.ts$/, '').split('/').pop()!);
      text.split('\n').forEach((line, i) => {
        const where = { file: relative(loaded.dir, file), line: i + 1 };
        if (new RegExp(`${PKG_NAME}/generators/`).test(line) && /import/.test(line)) out.push(diag('SGS0705', 'error', 'generator imported directly, bypassing the config', { where, fix: { summary: `import { sigil } from the wiring module (${relative(loaded.dir, genFile)})`, applicability: 'has-placeholders' } }));
        if (!usesPkg) return;
        if (refs.length && refRe.test(line)) out.push(diag('SGS0706', 'error', `generator ref hard-coded in app code: ${line.trim().slice(0, 80)}`, { where, fix: { summary: 'choose generators in the config (policy rules or user settings), not in code', applicability: 'has-placeholders' } }));
        if (/Math\.random\(/.test(line)) out.push(diag('SGS0706', 'warning', 'Math.random in a file that uses sigilsmith: identity images must be deterministic', { where }));
        if (keyField && new RegExp(`(keyOf|render|plan|deliver)\\([^)]*['"\`]${keyField}['"\`]`).test(line)) out.push(diag('SGS0706', 'error', `key field \`${keyField}\` hard-coded next to a sigilsmith call`, { where, fix: { summary: 'the config owns the key; pass the whole item', applicability: 'has-placeholders' } }));
      });
    }
  }
  return out;
}

export interface CheckData {
  sections: Record<Section, 'pass' | 'fail' | 'warn' | 'skip'>;
  budget?: { kernelGzip: number | null; generators: Record<string, number | null>; totalGzip: number | null; maxGzipBytes: number | null };
  identity?: { samples: number; changed: string[]; generatorsChanged: string[] };
}

export async function check(loaded: LoadedConfig, opts: { only?: Section[] } = {}): Promise<Envelope<CheckData>> {
  const sections = Object.fromEntries(SECTIONS.map((s) => [s, 'skip'])) as CheckData['sections'];
  const run = (s: Section) => !opts.only?.length || opts.only.includes(s);
  const all: Diagnostic[] = [...loaded.diagnostics];
  const mark = (s: Section, ds: Diagnostic[]) => {
    all.push(...ds);
    sections[s] = ds.some((d) => d.severity === 'error') ? 'fail' : ds.some((d) => d.severity === 'warning') ? 'warn' : 'pass';
  };
  if (!loaded.config) {
    sections.config = 'fail';
    return envelope('check', { sections }, all, [{ command: `npx ${PKG_NAME} explain-code ${all[0]?.code ?? 'SGS0102'}`, why: 'read what the first error means' }]);
  }
  sections.config = loaded.diagnostics.some((d) => d.severity === 'error') ? 'fail' : 'pass';
  const cfg = loaded.config;
  const data: CheckData = { sections };
  const genFile = resolve(loaded.dir, cfg.output.gen);

  if (run('fresh')) {
    const ds: Diagnostic[] = [];
    if (!existsSync(genFile)) ds.push(diag('SGS0704', 'error', `wiring module \`${cfg.output.gen}\` does not exist`, { fix: { summary: 'generate it', applicability: 'machine-applicable', commands: [`npx ${PKG_NAME} build`] } }));
    else {
      const m = readFileSync(genFile, 'utf8').match(HEADER_HASH_RE);
      if (!m || m[1] !== loaded.hash) ds.push(diag('SGS0703', 'error', `wiring module is stale (built from config ${m?.[1] ?? 'unknown'}, config is now ${loaded.hash})`, { where: { file: cfg.output.gen }, fix: { summary: 'regenerate it', applicability: 'machine-applicable', commands: [`npx ${PKG_NAME} build`] } }));
    }
    mark('fresh', ds);
  }

  const { items, file: samplesFile, error } = loadSamples(loaded.dir, cfg.samples);
  if (run('data')) mark('data', error ? [diag('SGS0702', 'error', error, { where: { path: 'samples' } })] : checkData(loaded, items, samplesFile ?? ''));

  if (run('identity') || run('determinism')) {
    const lockFile = resolve(loaded.dir, LOCK_FILE);
    const { lock: now } = await computeLock(loaded);
    if (run('identity')) {
      const ds: Diagnostic[] = [];
      if (!existsSync(lockFile)) ds.push(diag('SGS0503', 'error', `no ${LOCK_FILE}`, { fix: { summary: 'create it', applicability: 'machine-applicable', commands: [`npx ${PKG_NAME} build`] } }));
      else {
        const old = JSON.parse(readFileSync(lockFile, 'utf8')) as Lock;
        const generatorsChanged = Object.entries(now.generators).filter(([r, g]) => old.generators[r] && old.generators[r]!.fingerprint !== g.fingerprint).map(([r]) => r);
        for (const r of generatorsChanged) ds.push(diag('SGS0502', 'error', `generator \`${r}\` draws differently than when the lock was written`, { where: { ref: r }, fix: { summary: 'revert the upgrade or accept after review', applicability: 'maybe-incorrect', commands: [`npx ${PKG_NAME} build --accept`] } }));
        const changed = Object.entries(now.samples).filter(([k, s]) => old.samples[k] && (old.samples[k]!.image !== s.image || old.samples[k]!.ref !== s.ref)).map(([k]) => k);
        if (changed.length) ds.push(diag('SGS0504', 'error', `${changed.length} sample item(s) would get a different image`, { where: { items: changed.slice(0, 20) }, fix: { summary: 'if intended, accept; stored images stay until regenerated', applicability: 'maybe-incorrect', commands: [`npx ${PKG_NAME} build --accept`] } }));
        data.identity = { samples: Object.keys(now.samples).length, changed, generatorsChanged };
      }
      mark('identity', ds);
    }
    if (run('determinism')) {
      const ds: Diagnostic[] = [];
      const again = await computeLock(loaded);
      for (const [r, g] of Object.entries(now.generators)) if (again.lock.generators[r]?.fingerprint !== g.fingerprint) ds.push(diag('SGS0501', 'error', `\`${r}\` rendered different bytes for the same inputs`));
      for (const [k, s] of Object.entries(now.samples)) if (again.lock.samples[k]?.image !== s.image) ds.push(diag('SGS0501', 'error', `item \`${k}\` rendered different bytes twice`));
      mark('determinism', ds);
    }
  }

  if (run('budget')) {
    const ds: Diagnostic[] = [];
    const sizes = readSizes();
    const refs = referencedRefs(cfg).filter((r) => BUILTIN_BY_REF[r]);
    const generators = Object.fromEntries(refs.map((r) => [r, sizes.generators[r]?.gzipBytes ?? null]));
    const kernelGzip = sizes.kernel?.gzipBytes ?? null;
    const known = [kernelGzip, ...Object.values(generators)];
    const totalGzip = known.every((x) => x !== null) ? (known as number[]).reduce((a, b) => a + b, 0) : null;
    const max = cfg.budget.maxGzipBytes ?? null;
    data.budget = { kernelGzip, generators, totalGzip, maxGzipBytes: max };
    if (max !== null && totalGzip === null) ds.push(diag('SGS0401', 'warning', 'sizes not measured for this package build; cannot check the budget', { fix: { summary: 'run `npm run measure` in the sigilsmith package', applicability: 'unspecified' } }));
    if (max !== null && totalGzip !== null && totalGzip > max) {
      const biggest = Object.entries(generators).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
      ds.push(diag('SGS0401', 'error', `kernel + generators = ${totalGzip} B gzip, over the ${max} B budget`, { where: { generators }, fix: { summary: `drop or replace the largest (${biggest?.[0]}: ${biggest?.[1]} B), or raise budget.maxGzipBytes`, applicability: 'maybe-incorrect', commands: [`npx ${PKG_NAME} catalog --implemented --max-gzip ${Math.max(0, max - (kernelGzip ?? 0))}`] } }));
    }
    mark('budget', ds);
  }

  if (run('peers')) {
    const ds: Diagnostic[] = [];
    for (const r of referencedRefs(cfg)) {
      const peer = BUILTIN_BY_REF[r]?.manifest.peer;
      if (!peer) continue;
      const v = installedVersion(loaded.dir, peer.name);
      if (v !== peer.version) ds.push(diag('SGS0304', 'error', `\`${r}\` needs ${peer.name}@${peer.version} (found ${v ?? 'none'})`, { fix: { summary: 'install the exact version: its output is part of identity', applicability: 'machine-applicable', commands: [`npm i -E ${peer.name}@${peer.version}`] } }));
    }
    mark('peers', ds);
  }

  if (run('bypass')) mark('bypass', checkBypass(loaded, genFile));
  if (run('targets')) mark('targets', checkTargets(loaded));

  // Exercise the runtime once, so a broken custom key module or transport surfaces here.
  if (run('data')) {
    try {
      const s = await nodeSigil(loaded, { remote: false });
      if (items[0]) await s.plan(items[0]);
    } catch (e) {
      all.push(diag('SGS0203', 'error', `runtime check failed: ${(e as Error).message}`));
    }
  }

  const failing = all.filter((d) => d.severity === 'error');
  return envelope('check', data, all, failing.length ? [{ command: failing[0]!.fix?.commands?.[0] ?? `npx ${PKG_NAME} explain-code ${failing[0]!.code}`, why: `fix the first error (${failing[0]!.code}), then re-run check` }] : []);
}
