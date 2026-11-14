/**
 * Hashing and seeded randomness: the deterministic heart of every sigil.
 *
 * `cyrb128` (public domain, by bryc) gives four 32-bit words from a string; `sfc32`
 * (Chris Doty-Humphrey's Small Fast Counter, public domain) turns them into a PRNG.
 * Both use only integer arithmetic (`Math.imul`, shifts, xor), so they produce the
 * same numbers in every JavaScript engine. Changing either would change every
 * generator's output: they are part of the identity contract, not a seam.
 *
 * `sha256Hex` (WebCrypto) is used only for content ids, where collision resistance
 * matters more than speed.
 */

export function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** Unsigned 32-bit hash of a string. */
export function hash32(str: string): number {
  return cyrb128(str)[0];
}

/** Seeded PRNG returning floats in [0, 1) (exact multiples of 2^-32). */
export function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

/** A PRNG seeded from a string, warmed up so short seeds still mix well. */
export function seededRng(seed: string): () => number {
  const [a, b, c, d] = cyrb128(seed);
  const rng = sfc32(a, b, c, d);
  for (let i = 0; i < 12; i++) rng();
  return rng;
}

/** Lowercase hex SHA-256 of a UTF-8 string or bytes, via WebCrypto (browser and Node 20+). */
export async function sha256Hex(data: string | Uint8Array): Promise<string> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
