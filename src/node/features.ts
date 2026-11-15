/**
 * Feature sets at build time: read the schema, mapping and vector files a config
 * names, validate them, and check sample items against them.
 *
 * `inlineFeatureSets` turns each config entry into the plain `FeatureSet` the runtime
 * receives (files read relative to the config, `$`-prefixed vector keys dropped).
 * `validateFeatureSets` checks the mapping against the schema and the generator's own
 * params schema. `checkFeatureSamples` (the `data` section of `check`) reports vectors
 * that do not fit the schema and items the mapping cannot tell apart.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeFeatures, featureSetIndex, featureVectorOf, type FeatureSet, type FeatureVector } from '../features.js';
import { stableStringify } from '../ids.js';
import type { Item, Plan } from '../types.js';
import { BUILTIN_BY_REF } from './builtins.js';
import { diag, type Diagnostic } from './diagnostics.js';
import { FeatureMappingSchema, FeatureSchemaSchema, FeatureVectorsSchema, type Config } from './schema.js';

type SetConfig = Config['features'][number];

function readPart<T>(dir: string, value: unknown, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false; error: { issues: Array<{ message: string; path: PropertyKey[] }> } } }, where: string, out: Diagnostic[]): T | undefined {
  let raw = value;
  let src = where;
  if (typeof value === 'string') {
    const f = resolve(dir, value);
    src = value;
    if (!existsSync(f)) {
      out.push(diag('SGS0801', 'error', `${where}: file \`${value}\` not found`, { where: { path: where } }));
      return undefined;
    }
    try {
      raw = JSON.parse(readFileSync(f, 'utf8'));
    } catch (e) {
      out.push(diag('SGS0801', 'error', `${where}: \`${value}\` is not valid JSON: ${(e as Error).message}`, { where: { path: where } }));
      return undefined;
    }
  }
  const r = schema.safeParse(raw);
  if (!r.success) {
    for (const i of r.error.issues) out.push(diag('SGS0801', 'error', `${where}: ${i.message}`, { where: { file: src, path: i.path.map(String).join('.') || '(root)' } }));
    return undefined;
  }
  return r.data;
}

/** Read and validate every feature set; a set with an error is left out (and reported). */
export function inlineFeatureSets(sets: readonly SetConfig[], dir: string): { sets: FeatureSet[]; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const out: FeatureSet[] = [];
  sets.forEach((s, i) => {
    const before = diagnostics.length;
    const schema = readPart(dir, s.schema, FeatureSchemaSchema, `features.${i}.schema`, diagnostics);
    const mapping = readPart(dir, s.mapping, FeatureMappingSchema, `features.${i}.mapping`, diagnostics);
    let vectors: Record<string, FeatureVector> | undefined;
    if (s.vectors !== undefined) {
      const raw = typeof s.vectors === 'string' ? readPart(dir, s.vectors, { safeParse: (v: unknown) => ({ success: true as const, data: v }) }, `features.${i}.vectors`, diagnostics) : s.vectors;
      if (raw && typeof raw === 'object') {
        const rows = Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('$')));
        vectors = readPart(dir, rows, FeatureVectorsSchema, `features.${i}.vectors`, diagnostics);
      }
    }
    if (diagnostics.length > before || !schema || !mapping) return;
    const { $schema: _a, $comment: _b, ...schemaData } = schema;
    out.push({ ...(s.when ? { when: s.when } : {}), field: s.field, schema: schemaData, mapping: { use: mapping.use, encodings: mapping.encodings }, ...(vectors ? { vectors } : {}) });
  });
  return { sets: out, diagnostics };
}

/** Values an encoding can produce: map values (and default), or both ends of a range. */
function producible(enc: FeatureSet['mapping']['encodings'][string][string]): unknown[] {
  if ('value' in enc) return [enc.value];
  if ('range' in enc) return enc.round ? enc.range.map(Math.round) : [...enc.range];
  return [...Object.values(enc.map), ...(enc.default !== undefined ? [enc.default] : [])];
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = target;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
  cur[parts.at(-1)!] = value;
}

/** Mapping vs schema vs generator params. */
export function validateFeatureSets(sets: readonly FeatureSet[], isKnownRef: (ref: string) => boolean): Diagnostic[] {
  const out: Diagnostic[] = [];
  sets.forEach((set, i) => {
    const at = `features.${i}.mapping`;
    if (!isKnownRef(set.mapping.use)) out.push(diag('SGS0104', 'error', `${at}.use: unknown generator ref \`${set.mapping.use}\``, { where: { path: `${at}.use` } }));
    if (!set.mapping.encodings[set.mapping.use]) out.push(diag('SGS0801', 'warning', `${at}: no encodings for \`${set.mapping.use}\`, the generator it uses; its images ignore the features`, { where: { path: `${at}.encodings` } }));
    const used = new Set<string>();
    for (const [ref, encs] of Object.entries(set.mapping.encodings)) {
      if (!isKnownRef(ref)) out.push(diag('SGS0104', 'error', `${at}.encodings: unknown generator ref \`${ref}\``, { where: { path: `${at}.encodings.${ref}` } }));
      const paramsSchema = BUILTIN_BY_REF[ref]?.paramsSchema;
      for (const [path, enc] of Object.entries(encs)) {
        const where = { path: `${at}.encodings.${ref}.${path}` };
        if ('value' in enc) {
          /* constants need no dimension */
        } else {
          const dim = set.schema.dims[enc.from];
          used.add(enc.from);
          if (!dim) out.push(diag('SGS0801', 'error', `\`${path}\` reads unknown dimension \`${enc.from}\``, { where }));
          else if ('range' in enc && dim.kind === 'categorical') out.push(diag('SGS0801', 'warning', `\`${path}\` interpolates categorical \`${enc.from}\`, whose order means nothing; use \`map\``, { where }));
          else if ('map' in enc && enc.default === undefined && dim.kind !== 'numeric') {
            const levels = dim.kind === 'binary' ? ['true', 'false'] : dim.kind === 'ordinal' ? dim.levels : dim.values;
            const missing = levels.filter((l) => !(l in enc.map));
            if (missing.length) out.push(diag('SGS0801', 'warning', `\`${path}\` has no mapping (and no default) for ${enc.from} = ${missing.join(', ')}`, { where }));
          }
        }
        if (paramsSchema) {
          for (const v of producible(enc)) {
            const probe: Record<string, unknown> = {};
            setPath(probe, path, v);
            const r = paramsSchema.partial().safeParse(probe);
            if (!r.success) {
              out.push(diag('SGS0302', 'error', `\`${ref}\` param \`${path}\` cannot take ${JSON.stringify(v)}: ${r.error.issues[0]!.message}`, { where }));
              break;
            }
          }
        }
      }
    }
    const unused = Object.keys(set.schema.dims).filter((d) => !used.has(d));
    if (unused.length) out.push(diag('SGS0803', 'info', `features.${i}: dimension(s) ${unused.join(', ')} drive no param`, { where: { path: `features.${i}` } }));
  });
  return out;
}

/** Sample vectors against the schema, and items the mapping draws alike although their features differ. */
export function checkFeatureSamples(sets: readonly FeatureSet[], items: readonly Item[], plans: ReadonlyArray<Plan | undefined>): Diagnostic[] {
  const out: Diagnostic[] = [];
  const byParams = new Map<string, Array<{ key: string; vector: string }>>();
  items.forEach((item, idx) => {
    const plan = plans[idx];
    const si = featureSetIndex(item, sets);
    if (si < 0 || !plan) return;
    const set = sets[si]!;
    const { vector, via } = featureVectorOf(item, plan.key, set);
    if (via === 'none') {
      out.push(diag('SGS0802', 'warning', `item \`${plan.key}\` has no feature vector (field \`${set.field}\` or the vector table)`, { where: { item: plan.key, set: si } }));
      return;
    }
    for (const dim of Object.keys(vector)) if (!(dim in set.schema.dims)) out.push(diag('SGS0802', 'warning', `item \`${plan.key}\`: dimension \`${dim}\` is not in the schema`, { where: { item: plan.key, set: si } }));
    const enc = set.mapping.encodings[plan.selection.ref];
    if (!enc) return;
    const { params, problems } = encodeFeatures(set.schema, enc, vector);
    for (const p of problems) out.push(diag('SGS0802', 'warning', `item \`${plan.key}\`: ${p}`, { where: { item: plan.key, set: si } }));
    const sig = `${si}\u0000${plan.selection.ref}\u0000${stableStringify(params)}`;
    const vec = stableStringify(Object.fromEntries(Object.keys(set.schema.dims).map((d) => [d, vector[d] ?? null])));
    const group = byParams.get(sig) ?? [];
    group.push({ key: plan.key, vector: vec });
    byParams.set(sig, group);
  });
  for (const group of byParams.values()) {
    if (new Set(group.map((g) => g.vector)).size > 1) {
      out.push(diag('SGS0803', 'warning', `${group.length} items with different features get the same params (only the hash jitter tells them apart): ${group.map((g) => g.key).slice(0, 8).join(', ')}`, { where: { items: group.map((g) => g.key) } }));
    }
  }
  return out;
}
