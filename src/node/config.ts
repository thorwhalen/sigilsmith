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
import { BUILTIN_BY_REF } from './builtins.js';
import { diag, type Diagnostic } from './diagnostics.js';
import { ConfigSchema, type Config } from './schema.js';
import { sha256Hex } from '../hash.js';
import { stableStringify } from '../ids.js';

export interface LoadedConfig {
  path: string;
  dir: string;
  raw: unknown;
  config: Config | null;
  resolved: ResolvedConfig | null;
  diagnostics: Diagnostic[];
  hash: string;
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
  return [...refs].sort();
}

export function validateSemantics(cfg: Config, file: string): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const name of cfg.presets) {
    if (!PRESETS[name]) out.push(diag('SGS0103', 'error', `unknown preset \`${name}\``, { where: { file, path: 'presets' }, fix: { summary: `known presets: ${Object.keys(PRESETS).join(', ')}`, applicability: 'has-placeholders' } }));
  }
  for (const ref of referencedRefs(cfg)) {
    if (!BUILTIN_BY_REF[ref] && !cfg.remote[ref]) {
      out.push(diag('SGS0104', 'error', `unknown generator ref \`${ref}\``, { where: { file }, fix: { summary: `implemented: ${Object.keys(BUILTIN_BY_REF).join(', ')}; or declare it under \`remote\``, applicability: 'has-placeholders', commands: ['npx sigilsmith catalog --implemented'] } }));
    }
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
      if (cfg.remote[ref] || (b && b.module.determinism !== 'pure')) out.push(diag('SGS0303', 'error', `\`${ref}\` cannot be used with derived delivery`, { where: { file, path: 'delivery.strategy' }, fix: { summary: 'use "hybrid" or "materialized"', applicability: 'maybe-incorrect', edits: [{ file, path: 'delivery.strategy', set: 'hybrid' }] } }));
    }
  }
  for (const path of findSecrets(cfg)) out.push(diag('SGS0105', 'error', `value at \`${path}\` looks like an API key`, { where: { file, path } }));
  return out;
}

export function resolveConfig(cfg: Config): ResolvedConfig {
  const k = cfg.key;
  const spec: ResolvedConfig['key']['spec'] = 'field' in k ? { kind: 'field', field: k.field } : 'fields' in k ? { kind: 'fields', fields: k.fields } : { kind: 'custom', ref: k.custom };
  return {
    version: 1,
    itemTypeField: cfg.itemType?.field ?? null,
    key: { spec, fallback: k.fallback, onMissing: k.onMissing },
    label: cfg.label,
    presets: cfg.presets.map((p) => PRESETS[p]!).filter(Boolean),
    generators: cfg.generators,
    policy: { default: cfg.policy.default, salt: cfg.policy.salt, rules: cfg.policy.rules },
    delivery: cfg.delivery,
    regeneration: cfg.regeneration,
    userSettings: cfg.userSettings,
  };
}

export async function configHash(raw: unknown): Promise<string> {
  return (await sha256Hex(stableStringify(raw))).slice(0, 16);
}

export async function loadConfig(path?: string, cwd = process.cwd()): Promise<LoadedConfig> {
  const file = resolve(cwd, path ?? CONFIG_FILE);
  const base = { path: file, dir: dirname(file), raw: null, config: null, resolved: null, hash: '' };
  if (!existsSync(file)) return { ...base, diagnostics: [diag('SGS0101', 'error', `no config at \`${file}\``, { fix: { summary: 'create one', applicability: 'machine-applicable', commands: ['npx sigilsmith init'] } })] };
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { ...base, diagnostics: [diag('SGS0102', 'error', `config is not valid JSON: ${(e as Error).message}`, { where: { file } })] };
  }
  const parsed = ConfigSchema.safeParse(raw);
  const hash = await configHash(raw);
  if (!parsed.success) {
    const diagnostics = parsed.error.issues.map((i) => diag('SGS0102', 'error', i.message, { where: { file: CONFIG_FILE, path: i.path.join('.') || '(root)' } }));
    return { ...base, raw, hash, diagnostics };
  }
  const diagnostics = validateSemantics(parsed.data, CONFIG_FILE);
  return { ...base, raw, hash, config: parsed.data, resolved: resolveConfig(parsed.data), diagnostics };
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
