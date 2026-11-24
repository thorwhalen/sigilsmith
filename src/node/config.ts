/**
 * Loading, validating and resolving the SSOT config.
 *
 * `loadConfig` reads `sigilsmith.config.json`, validates it with zod and reports every
 * problem as a diagnostic with a fix. `resolveConfig` expands presets and fills
 * defaults into the plain `ResolvedConfig` the runtime receives through the wiring
 * module. Nothing downstream reads the raw file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { CONFIG_FILE } from '../meta.js';
import { PRESETS } from '../presets.js';
import type { Item, ResolvedConfig } from '../types.js';
import { BUILTINS, BUILTIN_BY_REF, registerExtensions } from './builtins.js';
import { loadExtensions } from './extensions.js';
import { diag, type Diagnostic } from './diagnostics.js';
import { ConfigSchema, type Config } from './schema.js';
import { sha256Hex } from '../hash.js';
import { stableStringify } from '../ids.js';
import type { FeatureSet } from '../features.js';
import { inlineFeatureSets, validateFeatureSets } from './features.js';

export interface LoadedConfig {
  path: string;
  dir: string;
  raw: unknown;
  config: Config | null;
  resolved: ResolvedConfig | null;
  diagnostics: Diagnostic[];
  hash: string;
  /** Feature sets with their files read and validated (empty when the config has none). */
  features: FeatureSet[];
}

const SECRET_RE = /^(sk-|sk_|rk_|pk_live|AIza|ghp_|xox[bp]-|r8_)[A-Za-z0-9_-]{8,}/;

function findSecrets(v: unknown, path = ''): string[] {
  if (typeof v === 'string') return SECRET_RE.test(v) ? [path] : [];
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => findSecrets(x, path ? `${path}.${k}` : k));
  return [];
}

/** Every generator ref the config can select (default, rules, presets in use, user choices, placeholder). */
export function referencedRefs(cfg: Config): string[] {
  const refs = new Set<string>([cfg.policy.default, ...cfg.userSettings.choices]);
  for (const r of cfg.policy.rules) for (const ref of typeof r.use === 'string' ? [r.use] : Object.keys(r.use)) refs.add(ref);
  for (const name of cfg.presets) for (const e of Object.values(PRESETS[name]?.byType ?? {})) if (e.use) refs.add(e.use);
  if (Object.keys(cfg.remote).some((r) => refs.has(r))) refs.add(cfg.policy.placeholder);
  if (cfg.targets.site?.ref) refs.add(cfg.targets.site.ref);
  for (const s of cfg.features) if (typeof s.mapping === 'object') refs.add(s.mapping.use);
  return [...refs].sort();
}

/**
 * `referencedRefs` plus the generators those modules can draw themselves (an extra's
 * fallback), under every params the config can give them: what the budget counts and
 * the lock fingerprints.
 */
export function shippedRefs(cfg: Config): string[] {
  const refs = new Set(referencedRefs(cfg));
  for (const ref of [...refs]) {
    const b = BUILTIN_BY_REF[ref];
    if (!b?.implies) continue;
    const base = { ...(b.meta.defaults as Record<string, unknown>), ...(cfg.generators[ref]?.params ?? {}) };
    const variants = [base, ...cfg.policy.rules.flatMap((r) => (r.params?.[ref] ? [{ ...base, ...r.params[ref] }] : []))];
    for (const v of variants) for (const r of b.implies(v)) refs.add(r);
  }
  return [...refs].sort();
}

export function validateSemantics(cfg: Config, file: string, opts: { unloadedExtensions?: boolean } = {}): Diagnostic[] {
  const out: Diagnostic[] = [];
  // Refs that no built-in or remote spec explains may be extensions this command did not load.
  const unknownRef = (ref: string) => !BUILTIN_BY_REF[ref] && !cfg.remote[ref] && !(opts.unloadedExtensions && ref.split('@')[0]!.includes('-'));
  for (const ref of Object.keys(cfg.userSettings.params)) {
    if (BUILTIN_BY_REF[ref]?.manifest.tier === 'extension') out.push(diag('SGS0114', 'error', `\`userSettings.params\` names the extension \`${ref}\`, whose params the browser settings cannot offer`, { where: { file, path: `userSettings.params.${ref}` } }));
  }
  for (const name of cfg.presets) {
    if (!PRESETS[name]) out.push(diag('SGS0103', 'error', `unknown preset \`${name}\``, { where: { file, path: 'presets' }, fix: { summary: `known presets: ${Object.keys(PRESETS).join(', ')}`, applicability: 'has-placeholders' } }));
  }
  for (const ref of referencedRefs(cfg)) {
    if (unknownRef(ref)) {
      out.push(diag('SGS0104', 'error', `unknown generator ref \`${ref}\``, { where: { file }, fix: { summary: `implemented: ${Object.keys(BUILTIN_BY_REF).join(', ')}; or declare it under \`remote\``, applicability: 'has-placeholders', commands: ['npx sigilsmith catalog --implemented'] } }));
    }
  }
  const known = new Set(referencedRefs(cfg));
  for (const ref of [...Object.keys(cfg.generators), ...Object.keys(cfg.userSettings.params)]) {
    if (unknownRef(ref)) out.push(diag('SGS0104', 'error', `unknown generator ref \`${ref}\` in the config`, { where: { file } }));
    else if (!known.has(ref)) out.push(diag('SGS0104', 'warning', `\`${ref}\` is configured but no rule, default or user choice can select it`, { where: { file } }));
  }
  const checkParams = (ref: string, params: Record<string, unknown> | undefined, path: string) => {
    const b = BUILTIN_BY_REF[ref];
    if (!b || !params) return;
    const r = b.paramsSchema.partial().safeParse(params);
    if (!r.success) for (const issue of r.error.issues) out.push(diag('SGS0302', 'error', `invalid param for \`${ref}\`: ${issue.message}`, { where: { file, path: `${path}.${issue.path.join('.')}` } }));
  };
  for (const [ref, g] of Object.entries(cfg.generators)) checkParams(ref, g.params, `generators.${ref}.params`);
  cfg.policy.rules.forEach((r, i) => Object.entries(r.params ?? {}).forEach(([ref, p]) => checkParams(ref, p, `policy.rules.${i}.params.${ref}`)));
  if (cfg.delivery.strategy === 'derived') {
    for (const ref of referencedRefs(cfg)) {
      const b = BUILTIN_BY_REF[ref];
      if (cfg.remote[ref] || (b && b.meta.determinism !== 'pure')) out.push(diag('SGS0303', 'error', `\`${ref}\` cannot be used with derived delivery`, { where: { file, path: 'delivery.strategy' }, fix: { summary: 'use "hybrid" or "materialized"', applicability: 'maybe-incorrect', edits: [{ file, path: 'delivery.strategy', set: 'hybrid' }] } }));
    }
  }
  for (const [ref, spec] of Object.entries(cfg.remote)) {
    if (spec.transport !== 'dicebear' || spec.baseUrl) continue;
    const ack = spec.use === 'non-commercial';
    out.push(
      diag('SGS0107', ack ? 'info' : 'warning', `\`${ref}\` uses the public DiceBear API, which is free for non-commercial use only${ack ? ' (acknowledged)' : ''}; style \`${spec.style}\` has its own licence`, {
        where: { file, path: `remote.${ref}` },
        fix: ack
          ? { summary: 'if the app becomes commercial, self-host DiceBear and set baseUrl', applicability: 'unspecified' }
          : { summary: 'commercial app: set baseUrl to a self-hosted DiceBear API; non-commercial app: acknowledge with "use": "non-commercial"', applicability: 'has-placeholders', edits: [{ file, path: `remote.${ref}.use`, set: 'non-commercial' }] },
      }),
    );
  }
  for (const path of findSecrets(cfg)) out.push(diag('SGS0105', 'error', `value at \`${path}\` looks like an API key`, { where: { file, path } }));
  return out;
}

export function resolveConfig(cfg: Config, features: FeatureSet[] = []): ResolvedConfig {
  const k = cfg.key;
  const spec: ResolvedConfig['key']['spec'] = 'field' in k ? { kind: 'field', field: k.field } : 'fields' in k ? { kind: 'fields', fields: k.fields } : { kind: 'custom', ref: k.custom };
  return {
    version: 1,
    itemTypeField: cfg.itemType?.field ?? null,
    key: { spec, fallback: k.fallback, onMissing: k.onMissing },
    label: cfg.label,
    presets: cfg.presets.map((p) => PRESETS[p]!).filter(Boolean),
    generators: cfg.generators,
    policy: { default: cfg.policy.default, salt: cfg.policy.salt, rules: cfg.policy.rules, placeholder: cfg.policy.placeholder },
    delivery: cfg.delivery,
    regeneration: cfg.regeneration,
    userSettings: cfg.userSettings,
    // Only present when used, so configs without features resolve (and hash) exactly as before.
    ...(features.length ? { features } : {}),
  };
}

export async function configHash(raw: unknown): Promise<string> {
  return (await sha256Hex(stableStringify(raw))).slice(0, 16);
}

/**
 * Read, validate and resolve the config. `extensions: false` does not load the extension
 * modules it names (loading runs the project's code): the read-only commands that do not
 * render (detect-key, adopt) pass it, and then do not report extension refs as unknown.
 */
export async function loadConfig(path?: string, cwd = process.cwd(), opts: { extensions?: boolean } = {}): Promise<LoadedConfig> {
  registerExtensions([]); // whatever happens below, no other project's extensions stay known
  const file = resolve(cwd, path ?? CONFIG_FILE);
  const base = { path: file, dir: dirname(file), raw: null, config: null, resolved: null, hash: '', features: [] as FeatureSet[] };
  if (!existsSync(file)) return { ...base, diagnostics: [diag('SGS0101', 'error', `no config at \`${file}\``, { fix: { summary: 'create one', applicability: 'machine-applicable', commands: ['npx sigilsmith init'] } })] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { ...base, diagnostics: [diag('SGS0102', 'error', `config is not valid JSON: ${(e as Error).message}`, { where: { file } })] };
  }
  const parsed = ConfigSchema.safeParse(raw);
  let hash = await configHash(raw);
  if (!parsed.success) {
    const diagnostics = parsed.error.issues.map((i) => diag('SGS0102', 'error', i.message, { where: { file: CONFIG_FILE, path: i.path.join('.') || '(root)' } }));
    return { ...base, raw, hash, diagnostics };
  }
  const cfg = parsed.data;
  // Extensions first: validation below must know their refs and params.
  const loadExt = opts.extensions !== false;
  const ext = loadExt ? await loadExtensions(cfg.extensions, dirname(file), new Set([...BUILTINS.map((b) => b.manifest.ref!), ...Object.keys(cfg.remote)])) : { manifests: [], diagnostics: [] };
  registerExtensions(ext.manifests);
  const inl = inlineFeatureSets(cfg.features, dirname(file));
  if (cfg.features.length || cfg.extensions.length) {
    // The feature files and the extension refs are part of what the wiring module embeds.
    hash = await configHash({ config: raw, ...(cfg.features.length ? { features: inl.sets } : {}), ...(cfg.extensions.length ? { extensions: ext.manifests.map((m) => m.manifest.ref) } : {}) });
    // Later steps (referencedRefs, validation) see the inlined mappings, not file paths.
    cfg.features = cfg.features.map((s, i) => ({ ...s, ...(inl.aligned[i] ? { schema: inl.aligned[i]!.schema, mapping: inl.aligned[i]!.mapping } : {}) }));
  }
  const diagnostics = [
    ...ext.diagnostics,
    ...validateSemantics(cfg, CONFIG_FILE, { unloadedExtensions: !loadExt && cfg.extensions.length > 0 }),
    ...inl.diagnostics,
    ...validateFeatureSets(inl.aligned, (ref) => Boolean(BUILTIN_BY_REF[ref] || cfg.remote[ref]), { remoteRefs: Object.keys(cfg.remote) }),
  ];
  return { ...base, raw, hash, config: cfg, resolved: resolveConfig(cfg, inl.sets), diagnostics, features: inl.sets };
}

export function loadSamples(dir: string, path: string | undefined): { items: Item[]; file?: string; error?: string } {
  if (!path) return { items: [] };
  const file = resolve(dir, path);
  if (!existsSync(file)) return { items: [], file, error: `samples file \`${path}\` not found` };
  const data = JSON.parse(readFileSync(file, 'utf8')) as unknown;
  const items = Array.isArray(data) ? data : Array.isArray((data as { items?: unknown }).items) ? (data as { items: unknown[] }).items : null;
  if (!items) return { items: [], file, error: 'samples file must hold a JSON array of items (or `{ "items": [...] }`)' };
  return { items: items as Item[], file };
}
