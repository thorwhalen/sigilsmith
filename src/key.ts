/**
 * Item key resolution (B4.1): field paths, composite keys, canonical serialization.
 *
 * The runtime only ever applies the key spec written in the config. Detection (which
 * field *should* be the key) runs at setup time in `src/node/detect.ts` and writes
 * its answer into the config, so the key cannot shift silently at runtime.
 *
 * Shaped to be upstreamed to `@zodal/core` as `resolveKey`/`canonicalKey`
 * (docs/research/zodal-fit.md, gap G1).
 */
import type { Item, KeySpec } from './types.js';

/** Split `a.b`, `a["b.c"]`, `a[0]` into path segments. */
export function parsePath(path: string): string[] {
  const out: string[] = [];
  const re = /([^.[\]]+)|\["((?:[^"\\]|\\.)*)"\]|\[(\d+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(path))) out.push(m[1] ?? (m[2] !== undefined ? m[2].replace(/\\(.)/g, '$1') : m[3]!));
  return out;
}

/** Read a (possibly nested) field. */
export function getPath(item: unknown, path: string): unknown {
  let cur: unknown = item;
  for (const seg of parsePath(path)) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

/** Normalize one key part to a string, or `undefined` when missing. */
export function normalizePart(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') {
    const s = value.normalize('NFC').trim();
    return s === '' ? undefined : s;
  }
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined;
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  return JSON.stringify(value);
}

/**
 * Canonical string for an ordered list of parts.
 *
 * One part: the normalized value itself (readable ids stay readable). Several parts:
 * a JSON array of normalized strings. JSON escaping makes the encoding unambiguous,
 * so no separator can collide with content (`["a","b c"]` ≠ `["a b","c"]`).
 */
export function canonicalKey(parts: readonly unknown[]): string {
  const norm = parts.map((p) => normalizePart(p) ?? '');
  return norm.length === 1 ? norm[0]! : JSON.stringify(norm);
}

export class SigilKeyError extends Error {
  readonly code = 'SGS0203';
  constructor(message: string) {
    super(message);
    this.name = 'SigilKeyError';
  }
}

export interface KeyResult {
  key: string;
  via: 'key' | 'fallback';
  /** Key fields that were absent (the reason a fallback was used). */
  missing: string[];
}

export interface KeyOptions {
  fallback?: string[];
  onMissing?: 'fallback' | 'throw';
  keyFn?: (item: Item) => string;
}

function keyFields(spec: KeySpec): string[] {
  return spec.kind === 'field' ? [spec.field] : spec.kind === 'fields' ? spec.fields : [];
}

/** Resolve an item's key from the configured spec, falling back (with a reason) if needed. */
export function keyOf(item: Item, spec: KeySpec, opts: KeyOptions = {}): KeyResult {
  const { fallback = [], onMissing = 'fallback', keyFn } = opts;
  if (spec.kind === 'custom') {
    if (!keyFn) throw new SigilKeyError(`key spec is custom (\`${spec.ref}\`) but no keyFn was provided; run \`sigilsmith build\` so the wiring module imports it`);
    const k = normalizePart(keyFn(item));
    if (k !== undefined) return { key: k, via: 'key', missing: [] };
    return fallbackKey(item, [spec.ref], fallback, onMissing);
  }
  const fields = keyFields(spec);
  const values = fields.map((f) => normalizePart(getPath(item, f)));
  const missing = fields.filter((_, i) => values[i] === undefined);
  if (missing.length === 0) return { key: canonicalKey(values), via: 'key', missing: [] };
  return fallbackKey(item, missing, fallback, onMissing);
}

function fallbackKey(item: Item, missing: string[], fallback: string[], onMissing: 'fallback' | 'throw'): KeyResult {
  const where = missing.map((m) => `\`${m}\``).join(', ');
  if (onMissing === 'throw' || fallback.length === 0) {
    throw new SigilKeyError(`item has no value for key field ${where}${fallback.length ? '' : ' and no fallback is configured'}; set \`key.fallback\` in the config or fix the data`);
  }
  const values = fallback.map((f) => normalizePart(getPath(item, f)));
  if (values.every((v) => v === undefined)) {
    throw new SigilKeyError(`item has no value for key field ${where} nor for any fallback field (${fallback.join(', ')})`);
  }
  return { key: canonicalKey(['~fallback', ...values]), via: 'fallback', missing };
}

/** First present label field (`name`, `title`, …), used by `$label` inputs. */
export function labelOf(item: Item, fields: readonly string[]): string | undefined {
  for (const f of fields) {
    const v = normalizePart(getPath(item, f));
    if (v !== undefined) return v;
  }
  return undefined;
}
