/**
 * Content ids and inputs digests: names for stored images and the regeneration trigger.
 *
 * Kept out of the kernel (`createSigil`), because only delivery, remote caching and the
 * CLI need them; an app that renders on the fly never loads SHA-256 code.
 */
import { sha256Hex } from './hash.js';
import type { Plan } from './types.js';

/** JSON with sorted object keys: stable regardless of property insertion order. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

/** `sg_` + 32 hex: a hash of generator ref, inputs and params. Same inputs, same name, anywhere. */
export async function contentIdOf(ref: string, seed: string, params: Record<string, unknown>): Promise<string> {
  return `sg_${(await sha256Hex(stableStringify([ref, seed, params]))).slice(0, 32)}`;
}

/** Digest of the resolved generator inputs; changes exactly when the image's inputs change. */
export async function inputsDigestOf(seed: string): Promise<string> {
  return (await sha256Hex(seed)).slice(0, 16);
}

export async function idsOf(plan: Plan): Promise<{ contentId: string; inputsDigest: string }> {
  return { contentId: await contentIdOf(plan.selection.ref, plan.seed, plan.params), inputsDigest: await inputsDigestOf(plan.seed) };
}
