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

/**
 * `sg_` + 32 hex: a hash of generator ref, inputs, params and the stored variant
 * (`svg`, or `png@256`): same inputs and format, same name, anywhere; an SVG and a PNG
 * of the same item never collide.
 */
export async function contentIdOf(ref: string, seed: string, params: Record<string, unknown>, variant = 'svg'): Promise<string> {
  return `sg_${(await sha256Hex(stableStringify([ref, seed, params, variant]))).slice(0, 32)}`;
}

/** Digest of the resolved generator inputs; changes exactly when the image's inputs change. */
export async function inputsDigestOf(seed: string): Promise<string> {
  return (await sha256Hex(seed)).slice(0, 16);
}

/** What the inputs digest covers: the seed, plus the encoded features when a feature set drew the item. */
export function digestInputOf(plan: Plan): string {
  return plan.features?.tag !== undefined ? JSON.stringify([plan.seed, plan.features.tag]) : plan.seed;
}

export async function idsOf(plan: Plan, variant = 'svg'): Promise<{ contentId: string; inputsDigest: string }> {
  return { contentId: await contentIdOf(plan.selection.ref, plan.seed, plan.params, variant), inputsDigest: await inputsDigestOf(digestInputOf(plan)) };
}
