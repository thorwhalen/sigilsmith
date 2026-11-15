/**
 * Feature-driven sigils: an item's characteristics, mapped to visual channels.
 *
 * Hash generators make every item look *different*. A feature set makes items look
 * *meaningfully* different: similar items look related, different ones look distinct.
 * It has three parts, all plain data a maintainer edits without touching code:
 *
 * - a **schema** naming the dimensions of the feature vector, each `numeric`
 *   (`min`/`max`), `ordinal` (ordered `levels`), `categorical` (`values`) or `binary`;
 * - the **vectors**, one per item: on the item itself (`field`, default `features`) or
 *   in a data file keyed by item key;
 * - a **mapping**: which generator draws these items (`use`) and, per generator ref,
 *   how each param is computed from one dimension (`range` interpolates a numeric,
 *   ordinal or binary value; `map` looks a value up; `value` is a constant).
 *
 * The encoded params enter the plan as the `features` layer (after rules, before the
 * end user's own params), so `explain` shows which dimension set each param. Because
 * the mapping is keyed by generator ref, the same features can drive a computed
 * generator (`glyph@1`, the default) or a remote one (a DiceBear style's options)
 * without any code change: the generator is the seam.
 *
 * Browser code (no zod, no Node APIs), shipped as its own subpath, `sigilsmith/features`:
 * the wiring module passes `planFeatures` to `createSigil` only when the config has
 * feature sets, so apps without them never download it. The zod schemas that validate
 * the same shapes are in `src/node/schema.ts`.
 */
import { stableStringify } from './ids.js';
import { getPath } from './key.js';
import { matches } from './policy.js';
import type { Item, Matcher, Plan, ResolvedConfig } from './types.js';

interface DimBase {
  description?: string;
}

/** One dimension of a feature vector. */
export type FeatureDim =
  | (DimBase & { kind: 'numeric'; min: number; max: number; default?: number })
  | (DimBase & { kind: 'ordinal'; levels: string[]; default?: string })
  | (DimBase & { kind: 'categorical'; values: string[]; default?: string })
  | (DimBase & { kind: 'binary'; default?: boolean });

export interface FeatureSchema {
  dims: Record<string, FeatureDim>;
}

export type FeatureValue = number | string | boolean;
export type FeatureVector = Record<string, FeatureValue | null | undefined>;

/** How one generator param is computed. */
export type Encoding =
  | { value: unknown }
  | { from: string; range: [number, number]; round?: boolean }
  | { from: string; map: Record<string, unknown>; default?: unknown };

export interface FeatureMapping {
  /** The generator that draws items of this feature set (unless a rule or the user picks another). */
  use: string;
  /** Generator ref → param path (dotted) → encoding. */
  encodings: Record<string, Record<string, Encoding>>;
}

/** A feature set as the runtime receives it: files already inlined by `sigilsmith build`. */
export interface FeatureSet {
  /** Which items this set covers (same matcher as policy rules); omitted means every item. */
  when?: Record<string, Matcher>;
  /** Item field holding the vector; checked before `vectors`. */
  field: string;
  schema: FeatureSchema;
  mapping: FeatureMapping;
  /** Vectors keyed by item key, for items that do not carry their own. */
  vectors?: Record<string, FeatureVector>;
}

/** A dimension's value, normalised: `t` in [0, 1] for `range`, `level` for `map`. */
export interface NormalizedFeature {
  t: number;
  level: string;
}

/** Normalise one raw value against its dimension; `undefined` when absent or invalid (see `problem`). */
export function normalizeFeature(dim: FeatureDim, raw: unknown): { value?: NormalizedFeature; problem?: string } {
  const v = raw === undefined || raw === null ? dim.default : raw;
  if (v === undefined || v === null) return { problem: 'missing' };
  switch (dim.kind) {
    case 'numeric': {
      if (typeof v !== 'number' || !Number.isFinite(v)) return { problem: `expected a number, got ${JSON.stringify(v)}` };
      const span = dim.max - dim.min;
      const t = span > 0 ? Math.min(1, Math.max(0, (v - dim.min) / span)) : 0;
      return { value: { t, level: String(v) }, ...(v < dim.min || v > dim.max ? { problem: `${v} is outside [${dim.min}, ${dim.max}] (clamped)` } : {}) };
    }
    case 'binary': {
      if (typeof v !== 'boolean') return { problem: `expected true or false, got ${JSON.stringify(v)}` };
      return { value: { t: v ? 1 : 0, level: String(v) } };
    }
    case 'ordinal':
    case 'categorical': {
      const list = dim.kind === 'ordinal' ? dim.levels : dim.values;
      const i = list.indexOf(String(v));
      if (i < 0) return { problem: `${JSON.stringify(v)} is not one of ${list.join(', ')}` };
      return { value: { t: list.length > 1 ? i / (list.length - 1) : 0, level: list[i]! } };
    }
  }
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = target;
  for (const p of parts.slice(0, -1)) {
    const next = cur[p];
    cur = (cur[p] = next !== null && typeof next === 'object' && !Array.isArray(next) ? next : {}) as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

/** Number rounding that is identical in every engine for the values params use. */
const round4 = (x: number): number => Math.round(x * 10000) / 10000;

export interface EncodedFeatures {
  /** Params for the generator, as a nested object (dotted paths expanded). */
  params: Record<string, unknown>;
  /** Param path → the dimension that set it (`=` for constants). */
  sources: Record<string, string>;
  /** Human-readable problems: missing dimensions, unknown values, unmapped levels. */
  problems: string[];
}

/** Compute a generator's params from a feature vector through one ref's encodings. */
export function encodeFeatures(schema: FeatureSchema, encodings: Record<string, Encoding>, vector: FeatureVector): EncodedFeatures {
  const params: Record<string, unknown> = {};
  const sources: Record<string, string> = {};
  const problems: string[] = [];
  for (const [path, enc] of Object.entries(encodings)) {
    if ('value' in enc) {
      setPath(params, path, enc.value);
      sources[path] = '=';
      continue;
    }
    const dim = schema.dims[enc.from];
    if (!dim) {
      problems.push(`\`${path}\` reads unknown dimension \`${enc.from}\``);
      continue;
    }
    const { value: norm, problem } = normalizeFeature(dim, vector[enc.from]);
    if (problem) problems.push(`\`${enc.from}\`: ${problem}`);
    if ('range' in enc) {
      if (!norm) continue;
      const [a, b] = enc.range;
      const x = a + (b - a) * norm.t;
      setPath(params, path, enc.round ? Math.round(x) : round4(x));
    } else {
      const hit = norm && Object.prototype.hasOwnProperty.call(enc.map, norm.level) ? enc.map[norm.level] : undefined;
      if (hit !== undefined) setPath(params, path, hit);
      else if (enc.default !== undefined) setPath(params, path, enc.default);
      else {
        if (norm) problems.push(`\`${path}\`: no mapping for ${enc.from} = ${JSON.stringify(norm.level)}`);
        continue;
      }
    }
    sources[path] = enc.from;
  }
  return { params, sources, problems: [...new Set(problems)] };
}

/** Index of the first feature set covering the item, or -1. */
export function featureSetIndex(item: Item, sets: readonly FeatureSet[] | undefined): number {
  if (!sets) return -1;
  return sets.findIndex((s) => !s.when || matches(item, s.when));
}

/** The item's vector: from its own field, else from the set's vector table by key, else empty. */
export function featureVectorOf(item: Item, key: string, set: FeatureSet): { vector: FeatureVector; via: 'field' | 'table' | 'none' } {
  const own = getPath(item, set.field);
  if (own !== null && typeof own === 'object' && !Array.isArray(own)) return { vector: own as FeatureVector, via: 'field' };
  const row = set.vectors?.[key];
  if (row) return { vector: row, via: 'table' };
  return { vector: {}, via: 'none' };
}

/** What the kernel needs from a feature set for one item and the selected generator. */
export interface FeaturePlan {
  /** Params for the `features` layer; absent when the mapping has no encodings for this ref. */
  params?: Record<string, unknown>;
  /** Folded into the seed so content ids and the inputs digest follow the encoded params. */
  seedTag?: string;
  info: NonNullable<Plan['features']>;
}

/** The planner `createSigil` takes as `features`: the seam that keeps this module out of apps without feature sets. */
export type FeaturePlanner = (item: Item, key: string, ref: string, config: ResolvedConfig) => FeaturePlan | undefined;

export const planFeatures: FeaturePlanner = (item, key, ref, config) => {
  const set = featureSetIndex(item, config.features);
  if (set < 0) return undefined;
  const fs = config.features![set]!;
  const { vector, via } = featureVectorOf(item, key, fs);
  const enc = fs.mapping.encodings[ref];
  const encoded = enc ? encodeFeatures(fs.schema, enc, vector) : { params: undefined, sources: {}, problems: [] as string[] };
  if (via === 'none') encoded.problems.unshift(`no feature vector (item field \`${fs.field}\` or the vector table)`);
  return {
    ...(encoded.params ? { params: encoded.params, seedTag: stableStringify(encoded.params) } : {}),
    info: { set, via, vector, sources: encoded.sources, problems: encoded.problems },
  };
};
