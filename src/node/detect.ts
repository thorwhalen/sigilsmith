/**
 * Key detection (B4.1): which field, or combination of fields, identifies an item.
 *
 * Runs at setup time on sample data, never silently at runtime. The CLI reports the
 * candidates with completeness, uniqueness and stability flags, and `--write` records
 * the choice in the config.
 *
 * Priority list, and why: explicit identifiers first (`id`, `_id`, `uuid`, `guid`,
 * `key`, `slug`); then natural keys that are unique by an external standard (ISRC for
 * recordings, ISBN for books, DOI for papers); then locators (`url`, `path`), which are
 * unique but move when the thing moves, so they rank last and carry a warning; then any
 * field named like `*Id`/`*_id`; then the same names one level down (`meta.uuid`).
 */
import { getPath, normalizePart } from '../key.js';
import type { Item } from '../types.js';

export const KEY_PRIORITY = ['id', '_id', 'uuid', 'uid', 'guid', 'key', 'slug', 'isrc', 'isbn', 'doi', 'url', 'href', 'path', 'filepath', 'file'];

const DISPLAY_RE = /^(title|name|label|display_?name|caption|heading|subject|summary)$/i;
const TIME_RE = /(^|_)(date|time|created|updated|modified|timestamp)|At$|_at$|Date$|Time$/;
const LOCATOR_RE = /^(url|href|path|filepath|file|uri|link)$/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2})?/;

export interface KeyCandidate {
  key: { field: string } | { fields: string[] };
  completeness: number;
  uniqueness: number;
  present: number;
  duplicates: string[][];
  suspects: Array<{ reason: 'display-text' | 'timestamp' | 'locator' | 'low-cardinality'; detail: string }>;
  rank: number;
  why: string;
}

export interface KeyReport {
  total: number;
  candidates: KeyCandidate[];
  chosen: KeyCandidate | null;
  warnings: string[];
}

function flatFields(items: Item[]): string[] {
  const seen = new Set<string>();
  for (const it of items.slice(0, 200)) {
    for (const [k, v] of Object.entries(it)) {
      seen.add(k);
      if (v && typeof v === 'object' && !Array.isArray(v)) for (const k2 of Object.keys(v as object)) seen.add(`${k}.${k2}`);
    }
  }
  return [...seen];
}

function score(items: Item[], fields: string[], rank: number, why: string): KeyCandidate {
  const values = items.map((it) => {
    const parts = fields.map((f) => normalizePart(getPath(it, f)));
    return parts.some((p) => p === undefined) ? undefined : JSON.stringify(parts);
  });
  const present = values.filter((v): v is string => v !== undefined);
  const groups = new Map<string, number[]>();
  values.forEach((v, i) => v !== undefined && groups.set(v, [...(groups.get(v) ?? []), i]));
  const duplicates = [...groups.values()].filter((g) => g.length > 1).map((g) => g.map(String)).slice(0, 5);
  const suspects: KeyCandidate['suspects'] = [];
  for (const f of fields) {
    const leaf = f.split('.').pop()!;
    const vals = items.map((it) => normalizePart(getPath(it, f))).filter((v): v is string => v !== undefined);
    if (DISPLAY_RE.test(leaf) || (vals.length > 0 && vals.filter((v) => /\s/.test(v)).length / vals.length > 0.5)) suspects.push({ reason: 'display-text', detail: `\`${f}\` looks like display text; renaming an item would change its image` });
    if (TIME_RE.test(leaf) || (vals.length > 0 && vals.every((v) => ISO_DATE_RE.test(v)))) suspects.push({ reason: 'timestamp', detail: `\`${f}\` looks like a timestamp` });
    if (LOCATOR_RE.test(leaf)) suspects.push({ reason: 'locator', detail: `\`${f}\` is a locator; it changes when the item moves` });
  }
  const distinct = groups.size;
  if (fields.length === 1 && present.length > 3 && distinct <= Math.max(2, present.length / 10)) suspects.push({ reason: 'low-cardinality', detail: `only ${distinct} distinct values` });
  return {
    key: fields.length === 1 ? { field: fields[0]! } : { fields },
    completeness: items.length ? present.length / items.length : 0,
    uniqueness: present.length ? distinct / present.length : 0,
    present: present.length,
    duplicates,
    suspects,
    rank,
    why,
  };
}

const acceptable = (c: KeyCandidate) => c.completeness === 1 && c.uniqueness === 1;

export function detectKey(items: Item[], opts: { priority?: string[] } = {}): KeyReport {
  const priority = opts.priority ?? KEY_PRIORITY;
  const fields = flatFields(items);
  const warnings: string[] = [];
  const candidates: KeyCandidate[] = [];
  const add = (f: string, rank: number, why: string) => {
    if (!candidates.some((c) => 'field' in c.key && c.key.field === f)) candidates.push(score(items, [f], rank, why));
  };
  priority.forEach((p, i) => fields.includes(p) && add(p, i, `priority list position ${i + 1}`));
  fields.filter((f) => !f.includes('.') && /(Id|ID|_id)$|^[a-z]{1,2}id$/.test(f)).forEach((f) => add(f, 100, 'name ends in Id/_id'));
  fields.filter((f) => f.includes('.') && priority.includes(f.split('.').pop()!)).forEach((f) => add(f, 200 + priority.indexOf(f.split('.').pop()!), 'nested id-like field'));

  const stable = (c: KeyCandidate) => acceptable(c) && !c.suspects.some((s) => s.reason !== 'locator');
  let chosen = candidates.filter(stable).sort((a, b) => a.rank - b.rank)[0] ?? null;

  if (!chosen) {
    // Smallest composite of complete, non-timestamp fields that is unique across the samples.
    const complete = fields
      .filter((f) => !f.includes('.'))
      .map((f) => score(items, [f], 0, ''))
      .filter((c) => c.completeness === 1 && !c.suspects.some((s) => s.reason === 'timestamp'))
      .sort((a, b) => b.uniqueness - a.uniqueness)
      .map((c) => ('field' in c.key ? c.key.field : ''));
    outer: for (let size = 2; size <= Math.min(4, complete.length); size++) {
      const combos = (start: number, acc: string[]): string[][] =>
        acc.length === size ? [acc] : complete.slice(start).flatMap((f, i) => combos(start + i + 1, [...acc, f]));
      for (const combo of combos(0, []).slice(0, 500)) {
        const c = score(items, combo, 300 + size, `smallest unique composite (${size} fields)`);
        if (acceptable(c)) {
          candidates.push(c);
          chosen = c;
          break outer;
        }
      }
    }
  }
  if (!chosen) {
    // Last resort: any single complete and unique field, flagged by its suspects.
    fields.filter((f) => !f.includes('.')).forEach((f) => add(f, 400, 'complete and unique, but not an identifier by name'));
    chosen = candidates.filter(acceptable).sort((a, b) => a.rank - b.rank)[0] ?? null;
    if (chosen) warnings.push('only unstable keys are unique and complete; the chosen key may change over time');
  }
  if (!chosen) warnings.push('no field or small composite is complete and unique across the samples');
  if (chosen) for (const s of chosen.suspects) warnings.push(s.detail);
  return { total: items.length, candidates: candidates.sort((a, b) => a.rank - b.rank), chosen, warnings };
}

/** Names that usually hold an item's category, best first. */
export const ITEM_TYPE_NAMES = ['type', 'kind', 'category', 'mediaType', 'media_type', 'itemType', 'item_type', 'source', 'format', 'class', 'genre'];

export interface ItemTypeReport {
  /** The proposed field, or null when no field looks like a category. */
  field: string | null;
  /** Distinct values of the proposed field in the samples. */
  values: string[];
  why: string;
}

/**
 * Propose the field that names an item's type (what presets and `when` rules match on):
 * a top-level string field present in nearly every sample, with few distinct values.
 * A conventional name (`type`, `kind`, `category`, …) wins over an unnamed one; with no
 * samples there is nothing to look at, and `null` says so instead of guessing.
 */
export function detectItemType(items: Item[], opts: { names?: string[]; maxDistinct?: number; minPresence?: number } = {}): ItemTypeReport {
  const { names = ITEM_TYPE_NAMES, maxDistinct = 12, minPresence = 0.9 } = opts;
  if (!items.length) return { field: null, values: [], why: 'no samples to look at' };
  const fields = [...new Set(items.slice(0, 200).flatMap((it) => Object.keys(it)))];
  const candidates = fields
    .map((f) => {
      const vals = items.map((it) => getPath(it, f)).filter((v): v is string => typeof v === 'string').map((v) => normalizePart(v)).filter((v): v is string => v !== undefined);
      const distinct = [...new Set(vals)];
      const presence = vals.length / items.length;
      const named = names.findIndex((n) => n.toLowerCase() === f.toLowerCase());
      const textual = vals.length > 0 && vals.every((v) => v.length <= 40 && !ISO_DATE_RE.test(v) && !/^-?\d+(\.\d+)?$/.test(v));
      const categorical = distinct.length >= 1 && distinct.length <= Math.min(maxDistinct, Math.max(1, Math.floor(items.length / 2)));
      return { f, distinct, presence, named, ok: textual && categorical && presence >= minPresence && !KEY_PRIORITY.includes(f) && !DISPLAY_RE.test(f) };
    })
    .filter((c) => c.ok && (c.named >= 0 || c.distinct.length >= 2))
    .sort((a, b) => (a.named < 0 ? 1e3 : a.named) - (b.named < 0 ? 1e3 : b.named) || a.distinct.length - b.distinct.length);
  const best = candidates[0];
  if (!best) return { field: null, values: [], why: `no field in the samples has a few repeated values in at least ${minPresence * 100}% of items` };
  return {
    field: best.f,
    values: best.distinct.slice(0, maxDistinct),
    why: best.named >= 0 ? `\`${best.f}\` is a conventional type field with ${best.distinct.length} value(s)` : `\`${best.f}\` has ${best.distinct.length} repeated values across the samples`,
  };
}
