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
import { isPathSpecifier } from './extensions.js';
import { measureHostModule } from './host-module.js';
import { readSizes } from './catalog.js';
import { CONFIG_FILE } from '../meta.js';
import { loadSamples, referencedRefs, shippedRefs, type LoadedConfig } from './config.js';
import { detectKey } from './detect.js';
import { diag, envelope, type Diagnostic, type Envelope } from './diagnostics.js';
import { nodeSigil } from './runtime.js';
import { checkTargets } from './targets.js';
import { checkFeatureSamples } from './features.js';
import type { Plan } from '../types.js';

export type Section = 'config' | 'fresh' | 'data' | 'identity' | 'determinism' | 'budget' | 'peers' | 'bypass' | 'targets';
export const SECTIONS: Section[] = ['config', 'fresh', 'data', 'identity', 'determinism', 'budget', 'peers', 'bypass', 'targets'];

const fieldOf = (s: InputSpec) => (typeof s === 'string' ? s : s.field);

function keyFields(loaded: LoadedConfig): string[] {
  const k = loaded.config!.key;
  return 'field' in k ? [k.field] : 'fields' in k ? k.fields : [];
}

function checkData(loaded: LoadedConfig, items: Item[], samplesFile: string, keys: Array<string | undefined>): Diagnostic[] {
  const cfg = loaded.config!;
  const out: Diagnostic[] = [];
  if (!items.length) return [noSamples()];
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
  // Uniqueness of the keys the runtime will actually compute (field, composite, custom or fallback).
  const seen = new Map<string, number[]>();
  keys.forEach((k, i) => k !== undefined && seen.set(k, [...(seen.get(k) ?? []), i]));
  const dups = [...seen.entries()].filter(([, idx]) => idx.length > 1);
  if (dups.length) out.push(diag('SGS0204', 'error', `key is not unique: ${dups.length} value(s) shared by several items, e.g. ${JSON.stringify(dups[0]![0])} (items ${dups[0]![1].join(', ')})`, { where: { config: 'key', data: samplesFile }, fix: { summary: 'use a unique or composite key', applicability: 'maybe-incorrect', commands: [`npx ${PKG_NAME} detect-key ${relative(loaded.dir, samplesFile)}`] } }));
  for (const f of cfg.key.fallback) if (present(f) === 0) out.push(diag('SGS0702', 'warning', `fallback key field \`${f}\` appears in no sample item`, { where: { config: 'key.fallback', data: samplesFile } }));
  const named = new Set<string>();
  // The item-type field only matters when a rule matches on it (rules are checked below)
  // or a preset maps types; otherwise a missing one is a stale default, not broken data.
  const typeField = cfg.itemType?.field;
  const typeInRules = typeField !== undefined && cfg.policy.rules.some((r) => typeField in r.when);
  if (typeField && !typeInRules && present(typeField) === 0) {
    out.push(
      diag('SGS0702', 'warning', `item-type field \`${typeField}\` appears in no sample item${cfg.presets.length ? `, so presets (${cfg.presets.join(', ')}) apply only their "*" entry` : ''}`, {
        where: { config: 'itemType', data: samplesFile },
        fix: { summary: 'point itemType.field at the field that names an item\'s type, or set "itemType": null if items have none', applicability: 'maybe-incorrect', edits: [{ file: CONFIG_FILE, path: 'itemType', set: null }] },
      }),
    );
  }
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

function noSamples(): Diagnostic {
  return diag('SGS0702', 'warning', 'no sample items: data drift and identity cannot be verified', { where: { path: 'samples' }, fix: { summary: 'point "samples" at 20-200 real items (JSON array)', applicability: 'has-placeholders', edits: [{ file: CONFIG_FILE, path: 'samples', set: 'sigilsmith.samples.json' }] } });
}

/** Source text with comments blanked out (line numbers preserved). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
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
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\@/]/g, '\\$&');
  const refRe = refs.length ? new RegExp(`['"\`](${refs.map(esc).join('|')})['"\`]`) : null;
  const peers = refs.map((r) => BUILTIN_BY_REF[r]?.manifest.peer?.name).filter((x): x is string => Boolean(x));
  const peerRe = peers.length ? new RegExp(`(from|import\\()\\s*['"\`](${peers.map(esc).join('|')})['"\`/]`) : null;
  const keyField = keyFields(loaded)[0];
  const genBase = genFile.split('/').pop()!.replace(/\.ts$/, '');
  let regenerationWired = false;
  for (const src of cfg.check.src) {
    for (const file of walk(resolve(loaded.dir, src), cfg.check.ignore)) {
      if (resolve(file) === resolve(genFile)) continue;
      const text = stripComments(readFileSync(file, 'utf8'));
      if (text.includes('onInputsChanged(')) regenerationWired = true;
      const usesPkg = text.includes(`'${PKG_NAME}`) || text.includes(`"${PKG_NAME}`) || text.includes(genBase);
      text.split('\n').forEach((line, i) => {
        const where = { file: relative(loaded.dir, file), line: i + 1 };
        if (/import|require/.test(line) && new RegExp(`${PKG_NAME}/generators/`).test(line)) out.push(diag('SGS0705', 'error', 'generator imported directly, bypassing the config', { where, fix: { summary: `import { sigil } from the wiring module (${relative(loaded.dir, genFile)})`, applicability: 'has-placeholders' } }));
        if (peerRe?.test(line)) out.push(diag('SGS0705', 'error', `generator library imported directly: ${line.trim().slice(0, 80)}`, { where, fix: { summary: 'draw through sigil (the config pins the adapter and its params)', applicability: 'has-placeholders' } }));
        if (refRe?.test(line)) out.push(diag('SGS0706', 'error', `generator ref hard-coded in app code: ${line.trim().slice(0, 80)}`, { where, fix: { summary: 'choose generators in the config (policy rules or user settings), not in code', applicability: 'has-placeholders' } }));
        if (!usesPkg) return;
        if (/Math\.random\(/.test(line)) out.push(diag('SGS0707', 'warning', 'Math.random in a file that uses sigilsmith: identity images must be deterministic', { where }));
        if (keyField && new RegExp(`(keyOf|render|plan|deliver)\\([^)]*['"\`]${esc(keyField)}['"\`]`).test(line)) out.push(diag('SGS0708', 'error', `key field \`${keyField}\` hard-coded next to a sigilsmith call`, { where, fix: { summary: 'the config owns the key; pass the whole item', applicability: 'has-placeholders' } }));
      });
    }
  }
  // Stored images whose inputs can change go stale silently unless the app calls onInputsChanged (B19).
  if (cfg.delivery.strategy !== 'derived' && !regenerationWired && cfg.regeneration.policy !== 'never') {
    const changing = refs.filter((r) => {
      const inputs = cfg.generators[r]?.inputs ?? BUILTIN_BY_REF[r]?.meta.defaultInputs ?? [];
      return inputs.some((x) => fieldOf(x) !== '$key') || cfg.policy.rules.some((rule) => rule.inputs?.some((x) => fieldOf(x) !== '$key'));
    });
    if (changing.length) out.push(diag('SGS0709', 'warning', `${changing.join(', ')} read inputs that can change (titles, names), but the app never calls onInputsChanged: stored images will go stale silently`, { fix: { summary: 'call onInputsChanged(sigil, item, record, { confirm }) after edits (sigilsmith/delivery), or set regeneration.policy to "never"', applicability: 'has-placeholders' } }));
  }
  return out;
}

function hostDeclared(dir: string, name: string): string | undefined {
  const f = resolve(dir, 'package.json');
  if (!existsSync(f)) return undefined;
  const pkg = JSON.parse(readFileSync(f, 'utf8')) as Record<string, Record<string, string> | undefined>;
  return pkg.dependencies?.[name] ?? pkg.devDependencies?.[name];
}

/** Whether the app's sources match `test` (the React adapter, the picker). */
function sourcesUse(loaded: LoadedConfig, test: (text: string) => boolean): boolean {
  const cfg = loaded.config!;
  for (const src of cfg.check.src) for (const file of walk(resolve(loaded.dir, src), cfg.check.ignore)) if (test(readFileSync(file, 'utf8'))) return true;
  return false;
}
const usesReact = (loaded: LoadedConfig) => sourcesUse(loaded, (t) => t.includes(`${PKG_NAME}/react`));
const usesTargets = (loaded: LoadedConfig) => sourcesUse(loaded, (t) => t.includes(`${PKG_NAME}/targets`));
const usesPicker = (loaded: LoadedConfig) => sourcesUse(loaded, (t) => t.includes(`${PKG_NAME}/react`) && /\b(useSigilPicker|SigilPicker)\b/.test(t));

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
  if (run('data')) {
    if (error) mark('data', [diag('SGS0702', 'error', error, { where: { path: 'samples' } })]);
    else {
      const ds: Diagnostic[] = [];
      const keys: Array<string | undefined> = [];
      const plans: Array<Plan | undefined> = [];
      try {
        const s = await nodeSigil(loaded, { remote: true });
        for (const it of items) {
          const p = await s.plan(it).catch(() => undefined);
          plans.push(p);
          keys.push(p?.key);
        }
      } catch (e) {
        ds.push(diag('SGS0203', 'error', `runtime check failed: ${(e as Error).message}`));
      }
      const feats = loaded.features.length ? checkFeatureSamples(loaded.features, items, plans) : [];
      mark('data', [...ds, ...checkData(loaded, items, samplesFile ?? '', keys), ...feats]);
    }
  }

  if (run('identity') || run('determinism')) {
    const lockFile = resolve(loaded.dir, LOCK_FILE);
    const { lock: now, diagnostics: renderFailures } = await computeLock(loaded);
    // Sample items that failed to render (a broken file, a bad param) are reported once, in
    // the first of the two sections that runs.
    if (run('identity')) {
      const ds: Diagnostic[] = [...renderFailures];
      if (!existsSync(lockFile)) ds.push(diag('SGS0503', 'error', `no ${LOCK_FILE}`, { fix: { summary: 'create it', applicability: 'machine-applicable', commands: [`npx ${PKG_NAME} build`] } }));
      else {
        const old = JSON.parse(readFileSync(lockFile, 'utf8')) as Lock;
        if (old.config !== loaded.hash) ds.push(diag('SGS0505', 'error', `the lock was written for another config (${old.config}, config is now ${loaded.hash}): identities of new rules and items are unchecked`, { fix: { summary: 'rebuild; review what changes', applicability: 'machine-applicable', commands: [`npx ${PKG_NAME} build`] } }));
        if (!items.length) ds.push(noSamples());
        const generatorsChanged = Object.entries(now.generators).filter(([r, g]) => old.generators[r] && old.generators[r]!.fingerprint !== g.fingerprint).map(([r]) => r);
        for (const r of generatorsChanged) ds.push(diag('SGS0502', 'error', `generator \`${r}\` draws differently than when the lock was written`, { where: { ref: r }, fix: { summary: 'revert the upgrade or accept after review', applicability: 'maybe-incorrect', commands: [`npx ${PKG_NAME} build --accept`] } }));
        const changed = Object.entries(now.samples).filter(([k, s]) => old.samples[k] && (old.samples[k]!.image !== s.image || old.samples[k]!.ref !== s.ref)).map(([k]) => k);
        if (changed.length) ds.push(diag('SGS0504', 'error', `${changed.length} sample item(s) would get a different image`, { where: { items: changed.slice(0, 20) }, fix: { summary: 'if intended, accept; stored images stay until regenerated', applicability: 'maybe-incorrect', commands: [`npx ${PKG_NAME} build --accept`] } }));
        data.identity = { samples: Object.keys(now.samples).length, changed, generatorsChanged };
      }
      mark('identity', ds);
    }
    if (run('determinism')) {
      const ds: Diagnostic[] = run('identity') ? [] : [...renderFailures];
      const again = await computeLock(loaded);
      for (const [r, g] of Object.entries(now.generators)) if (again.lock.generators[r]?.fingerprint !== g.fingerprint) ds.push(diag('SGS0501', 'error', `\`${r}\` rendered different bytes for the same inputs`));
      for (const [k, s] of Object.entries(now.samples)) if (again.lock.samples[k]?.image !== s.image) ds.push(diag('SGS0501', 'error', `item \`${k}\` rendered different bytes twice`));
      mark('determinism', ds);
    }
  }

  if (run('budget')) {
    const ds: Diagnostic[] = [];
    const sizes = readSizes();
    const refs = shippedRefs(cfg).filter((r) => BUILTIN_BY_REF[r]);
    // An extension is not in the package's measurements: its declared size, else measured now.
    const generators: Record<string, number | null> = {};
    for (const r of refs) {
      const b = BUILTIN_BY_REF[r]!;
      let size = sizes.generators[r]?.gzipBytes ?? b.manifest.bundleSize.minGzipBytes ?? null;
      if (size === null && b.manifest.tier === 'extension') {
        const spec = b.manifest.importPath!;
        size = await measureHostModule(isPathSpecifier(spec) ? { file: resolve(loaded.dir, spec) } : { spec }, loaded.dir).catch(() => null);
        if (size === null) ds.push(diag('SGS0401', 'error', `cannot size the extension \`${r}\`: install esbuild in the project, or declare \`catalog.gzipBytes\` in its module`, { fix: { summary: 'npm i -D esbuild', applicability: 'maybe-incorrect', commands: ['npm i -D esbuild'] } }));
      }
      generators[r] = size;
    }
    const kernelGzip = sizes.kernel?.gzipBytes ?? null;
    // Remote generators share one module (transports, cache, progressive placeholder).
    const remoteModule = (sizes as { modules?: { remote?: { gzipBytes: number } } }).modules?.remote?.gzipBytes ?? null;
    if (referencedRefs(cfg).some((r) => cfg.remote[r])) generators['(remote module)'] = remoteModule;
    const modules = (sizes as { modules?: Record<string, { gzipBytes: number }> }).modules ?? {};
    if (cfg.delivery.strategy !== 'derived') generators['(delivery module)'] = modules.delivery?.gzipBytes ?? null;
    if (usesReact(loaded)) generators['(react adapter)'] = modules.react?.gzipBytes ?? null;
    // The picker brings the upload and adopt code (most of the delivery module) with it.
    if (usesPicker(loaded)) generators['(picker)'] = modules.picker?.gzipBytes ?? null;
    if (usesTargets(loaded)) generators['(targets module)'] = modules.targets?.gzipBytes ?? null;
    if (loaded.features.length) generators['(features module)'] = modules.features?.gzipBytes ?? null;
    const known = [kernelGzip, ...Object.values(generators)];
    const totalGzip = known.every((x) => x !== null) ? (known as number[]).reduce((a, b) => a + b, 0) : null;
    const max = cfg.budget.maxGzipBytes ?? null;
    data.budget = { kernelGzip, generators, totalGzip, maxGzipBytes: max };
    if (max !== null && totalGzip === null) ds.push(diag('SGS0401', 'warning', 'sizes not measured for this package build; cannot check the budget', { fix: { summary: 'run `npm run measure` in the sigilsmith package', applicability: 'unspecified' } }));
    if (max !== null && totalGzip !== null && totalGzip > max) {
      // Room for one generator in place of the largest: the budget minus everything else.
      // When the kernel and modules alone exceed the budget, no generator fits and the
      // only fix is a larger budget, so no catalog command is offered.
      const gens = Object.entries(generators).filter(([r]) => !r.startsWith('('));
      const biggest = gens.sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0))[0];
      const fixed = totalGzip - gens.reduce((a, [, g]) => a + (g ?? 0), 0);
      const room = max - (totalGzip - (biggest?.[1] ?? 0));
      const fix =
        fixed >= max
          ? { summary: `the kernel and modules alone take ${fixed} B, over the ${max} B total; raise budget.maxGzipBytes to at least ${totalGzip}`, applicability: 'maybe-incorrect' as const, edits: [{ file: loaded.path, path: 'budget.maxGzipBytes', set: totalGzip }] }
          : room > 0 && biggest
            ? { summary: `replace the largest generator (${biggest[0]}: ${biggest[1]} B) with one of at most ${room} B, drop it, or raise budget.maxGzipBytes to ${totalGzip}`, applicability: 'maybe-incorrect' as const, commands: [`npx ${PKG_NAME} catalog --implemented --max-gzip ${room}`] }
            : { summary: `drop a generator${biggest ? ` (largest: ${biggest[0]}, ${biggest[1]} B)` : ''} or raise budget.maxGzipBytes to ${totalGzip}`, applicability: 'maybe-incorrect' as const, edits: [{ file: loaded.path, path: 'budget.maxGzipBytes', set: totalGzip }] };
      ds.push(diag('SGS0401', 'error', `kernel + modules + generators = ${totalGzip} B gzip, over the ${max} B total budget (budget.maxGzipBytes counts everything sigilsmith adds)`, { where: { kernelGzip, generators }, fix }));
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
      const declared = hostDeclared(loaded.dir, peer.name);
      if (declared && declared !== peer.version) ds.push(diag('SGS0304', 'warning', `package.json declares ${peer.name}@"${declared}"; an upgrade within that range could change every \`${r}\` image`, { fix: { summary: 'declare the exact version', applicability: 'machine-applicable', commands: [`npm i -E ${peer.name}@${peer.version}`] } }));
    }
    mark('peers', ds);
  }

  if (run('bypass')) mark('bypass', checkBypass(loaded, genFile));
  if (run('targets')) mark('targets', checkTargets(loaded));

  const failing = all.filter((d) => d.severity === 'error');
  return envelope('check', data, all, failing.length ? [{ command: failing[0]!.fix?.commands?.[0] ?? `npx ${PKG_NAME} explain-code ${failing[0]!.code}`, why: `fix the first error (${failing[0]!.code}), then re-run check` }] : []);
}
