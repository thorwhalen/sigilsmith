/**
 * The render context a generator receives for a seed: the hash, the seeded PRNG and the
 * palette, all decorrelated per generator ref. One home for it, used by the kernel
 * (`createSigil`), the CLI's fingerprints and golden vectors, and extras that draw
 * another generator (the screenshot extra's fallback), so all three stay identical.
 */
import { cyrb128, seededRng } from './hash.js';
import { paletteFromHash } from './palette.js';
import type { RenderContext } from './types.js';

export function renderContext<P extends object>(ref: string, seed: string, fields: Record<string, string>, params: P, size: number): RenderContext<P> {
  const salted = `${seed}\u0000${ref}`;
  const [hash] = cyrb128(salted);
  return { seed, hash, rng: seededRng(salted), palette: paletteFromHash(hash, ((params as { palette?: object }).palette) ?? {}), fields, params, size };
}
