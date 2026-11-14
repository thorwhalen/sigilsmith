/**
 * Layered defaults with provenance (B4.3, B0.6).
 *
 * Folds an ordered stack of patches (lowest priority first) with JSON merge-patch
 * semantics (RFC 7386, the same rules as `@zodal/dials-core`: objects merge, arrays
 * and scalars replace, `null` deletes) and records, for every leaf of the result,
 * which layer supplied it and which layers it shadowed.
 *
 * SHIM: zodal-dials resolves one flat key space and has no per-item ladder
 * (docs/research/zodal-fit.md, gap G5). This small fold stands in for a future
 * `@zodal/dials-core` `defineLadder`; the provenance shape (`layer`, `shadowed`)
 * mirrors dials' `winningScope`/`shadowed` so the swap stays local to this file.
 */
import type { LayerName, LeafProvenance } from './types.js';

export interface Layer {
  name: LayerName;
  patch: Record<string, unknown> | undefined;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

/** RFC 7386 merge patch, returning a new value. */
export function mergePatch(target: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch)) return patch === undefined ? target : JSON.parse(JSON.stringify(patch));
  const out: Record<string, unknown> = isPlainObject(target) ? { ...target } : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete out[k];
    else out[k] = mergePatch(out[k], v);
  }
  return out;
}

function leafPaths(value: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(value).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return isPlainObject(v) && Object.keys(v).length > 0 ? leafPaths(v, path) : [path];
  });
}

function lookup(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((cur, seg) => (isPlainObject(cur) ? cur[seg] : undefined), obj);
}

/** Fold layers; returns the effective object and per-leaf provenance, sorted by path. */
export function foldLayers(layers: readonly Layer[]): { effective: Record<string, unknown>; provenance: LeafProvenance[] } {
  let effective: Record<string, unknown> = {};
  for (const { patch } of layers) if (patch) effective = mergePatch(effective, patch) as Record<string, unknown>;
  const provenance = leafPaths(effective)
    .sort()
    .map((path) => {
      const contributions = layers
        .filter((l) => l.patch && lookup(l.patch, path) !== undefined)
        .map((l) => ({ layer: l.name, value: lookup(l.patch, path) }));
      const winner = contributions[contributions.length - 1]!;
      return { path, value: lookup(effective, path), layer: winner.layer, shadowed: contributions.slice(0, -1).reverse() };
    });
  return { effective, provenance };
}
