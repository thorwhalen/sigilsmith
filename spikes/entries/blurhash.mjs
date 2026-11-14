// Key -> synthetic 4x3 blurhash string -> decode to RGBA. Canvas putImageData / PNG encoding NOT included in the size.
import { decode } from 'blurhash';
const A = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mul = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export default (key) => {
  const r = mul(fnv(key));
  let hash = A[3 + 2 * 9] + A[(r() * 83) | 0];
  for (let i = 0; i < 4 + 2 * 11; i++) hash += A[(r() * 83) | 0];
  return decode(hash, 32, 32); // Uint8ClampedArray RGBA, 32x32
};
