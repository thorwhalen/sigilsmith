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
import { encodeFeatures, featureSetIndex, featureVectorOf, normalizeFeature, type FeatureSet, type FeatureVector, type SingleEncoding } from '../features.js';
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

/**
 * Read and validate every feature set. `aligned[i]` is set `i` of the config, `undefined`
 * when it has an error (reported); `sets` holds the valid ones, in order, for the runtime.
 */
export function inlineFeatureSets(sets: readonly SetConfig[], dir: string): { sets: FeatureSet[]; aligned: Array<FeatureSet | undefined>; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const aligned: Array<FeatureSet | undefined> = [];
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
    if (diagnostics.length > before || !schema || !mapping) {
      aligned.push(undefined);
      return;
    }
    const { $schema: _a, $comment: _b, ...schemaData } = schema;
    aligned.push({ ...(s.when ? { when: s.when } : {}), field: s.field, schema: schemaData, mapping: { use: mapping.use, encodings: mapping.encodings }, ...(vectors ? { vectors } : {}) });
  });
  return { sets: aligned.filter((x): x is FeatureSet => x !== undefined), aligned, diagnostics };
}

/** Values an encoding can produce: map values (and default), or points across a range (so an integer param without `round` fails). */
function producible(enc: SingleEncoding): unknown[] {
  if ('value' in enc) return [enc.value];
  if ('range' in enc) {
    const [a, b] = enc.range;
    return [0, 0.25, 0.5, 0.75, 1].map((t) => a + (b - a) * t).map((x) => (enc.round ? Math.round(x) : x));
  }
  return [...Object.values(enc.map), ...(enc.default !== undefined ? [enc.default] : [])];
}

/** The levels a `map` can be keyed by for a dimension. */
function levelsOf(dim: FeatureSet['schema']['dims'][string]): string[] | null {
  return dim.kind === 'binary' ? ['true', 'false'] : dim.kind === 'ordinal' ? dim.levels : dim.kind === 'categorical' ? dim.values : null;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split('.');
  let cur = target;
  for (const p of parts.slice(0, -1)) cur = (cur[p] ??= {}) as Record<string, unknown>;
  cur[parts.at(-1)!] = value;
}

/** Mapping vs schema vs generator params. */
export function validateFeatureSets(sets: ReadonlyArray<FeatureSet | undefined>, isKnownRef: (ref: string) => boolean): Diagnostic[] {
  const out: Diagnostic[] = [];
  const knownId = (k: string) => !k.includes('@') && Object.keys(BUILTIN_BY_REF).some((r) => r.startsWith(`${k}@`));
  sets.forEach((set, i) => {
    if (!set) return;
    const at = `features.${i}.mapping`;
    if (!isKnownRef(set.mapping.use)) out.push(diag('SGS0104', 'error', `${at}.use: unknown generator ref \`${set.mapping.use}\``, { where: { path: `${at}.use` } }));
    if (!set.mapping.encodings[set.mapping.use] && !set.mapping.encodings[set.mapping.use.split('@')[0]!]) out.push(diag('SGS0801', 'warning', `${at}: no encodings for \`${set.mapping.use}\`, the generator it uses; its images ignore the features`, { where: { path: `${at}.encodings` } }));
    const used = new Set<string>();
    for (const [ref, encs] of Object.entries(set.mapping.encodings)) {
      if (!isKnownRef(ref) && !knownId(ref)) out.push(diag('SGS0104', 'error', `${at}.encodings: unknown generator ref \`${ref}\``, { where: { path: `${at}.encodings.${ref}` } }));
      const paramsSchema = (BUILTIN_BY_REF[ref] ?? Object.values(BUILTIN_BY_REF).filter((b) => b.meta.id === ref).sort((a, b) => b.meta.major - a.meta.major)[0])?.paramsSchema;
      for (const [path, encOrList] of Object.entries(encs)) {
        const where = { path: `${at}.encodings.${ref}.${path}` };
        const list = Array.isArray(encOrList) ? encOrList : [encOrList];
        list.forEach((enc, li) => {
          // In a list, only the last entry has to cover every level: earlier ones fall through.
          const last = li === list.length - 1;
          if (!('value' in enc)) {
            const dim = set.schema.dims[enc.from];
            used.add(enc.from);
            if (!dim) out.push(diag('SGS0801', 'error', `\`${path}\` reads unknown dimension \`${enc.from}\``, { where }));
            else if ('range' in enc && dim.kind === 'categorical') out.push(diag('SGS0801', 'warning', `\`${path}\` interpolates categorical \`${enc.from}\`, whose order means nothing; use \`map\``, { where }));
            else if ('map' in enc) {
              const levels = levelsOf(dim);
              if (!levels) {
                // A numeric map matches exact values only: fine for integer keys inside [min, max].
                const ok = dim.kind === 'numeric' && Object.keys(enc.map).every((k) => /^-?\d+$/.test(k) && Number(k) >= dim.min && Number(k) <= dim.max);
                if (!ok) out.push(diag('SGS0801', 'warning', `\`${path}\` maps numeric \`${enc.from}\` by keys that are not integers in [${dim.kind === 'numeric' ? `${dim.min}, ${dim.max}` : ''}]; use \`range\``, { where }));
              } else {
                const strays = Object.keys(enc.map).filter((k) => !levels.includes(k));
                if (strays.length) out.push(diag('SGS0801', 'warning', `\`${path}\` maps ${strays.map((k) => JSON.stringify(k)).join(', ')}, which ${strays.length > 1 ? 'are not levels' : 'is not a level'} of \`${enc.from}\` (${levels.join(', ')})`, { where }));
                const missing = levels.filter((l) => !Object.prototype.hasOwnProperty.call(enc.map, l));
                if (last && missing.length && enc.default === undefined) out.push(diag('SGS0801', 'warning', `\`${path}\` has no mapping (and no default) for ${enc.from} = ${missing.join(', ')}`, { where }));
              }
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
        });
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
    const ref = plan.selection.ref;
    const enc = set.mapping.encodings[ref] ?? set.mapping.encodings[ref.split('@')[0]!];
    if (!enc) return;
    const { params, problems } = encodeFeatures(set.schema, enc, vector);
    for (const p of problems) out.push(diag('SGS0802', 'warning', `item \`${plan.key}\`: ${p}`, { where: { item: plan.key, set: si } }));
    const sig = `${si}\u0000${ref}\u0000${stableStringify(params)}`;
    // Only the dimensions this ref's encodings read, after defaults: those are the differences the image could show.
    const read = [...new Set(Object.values(enc).flatMap((e) => (Array.isArray(e) ? e : [e])).flatMap((e) => ('from' in e ? [e.from] : [])))].filter((d) => set.schema.dims[d]).sort();
    const vec = stableStringify(read.map((d) => normalizeFeature(set.schema.dims[d]!, vector[d]).value?.level ?? null));
    const group = byParams.get(sig) ?? [];
    group.push({ key: plan.key, vector: vec });
    byParams.set(sig, group);
  });
  for (const group of byParams.values()) {
    if (new Set(group.map((g) => g.vector)).size > 1) {
      out.push(diag('SGS0803', 'warning', `${group.length} items with different features get the same params (only the hash jitter tells them apart): ${group.map((g) => g.key).slice(0, 8).join(', ')}`, { where: { items: group.map((g) => g.key) } }));
    } else if (group.length > 1) {
      // Same features, same picture: right if they really are alike, else a dimension is missing.
      out.push(diag('SGS0803', 'info', `${group.length} items share the same features, so their images differ only by the hash jitter: ${group.map((g) => g.key).slice(0, 8).join(', ')}; if a player should tell them apart, add the dimension that differs`, { where: { items: group.map((g) => g.key) } }));
    }
  }
  return out;
}
