// Key -> 25 pseudo-random bytes -> thumbhash decode -> PNG data URL (built-in encoder).
import { thumbHashToDataURL } from 'thumbhash';
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mul = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export default (key) => {
  const r = mul(fnv(key));
  const hash = Uint8Array.from({ length: 25 }, () => (r() * 256) | 0);
  hash[2] &= 0x7f; // header bit 23 = hasAlpha: clear it
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image width="1" height="1" preserveAspectRatio="none" href="${thumbHashToDataURL(hash)}"/></svg>`;
};
