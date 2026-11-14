// Key -> seeded PRNG -> 2D simplex noise field -> 16x16 grid of HSL cells (the PRNG/hash is in-house, counted in the size).
import { createNoise2D } from 'simplex-noise';
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mul = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export default (key) => {
  const r = mul(fnv(key)), n = createNoise2D(r), hue = r() * 360, ox = r() * 50, oy = r() * 50;
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">';
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const v = n(ox + x / 6, oy + y / 6);
    s += `<rect x="${x}" y="${y}" width="1" height="1" fill="hsl(${Math.round(hue + v * 40)},65%,${Math.round(50 + v * 25)}%)"/>`;
  }
  return s + '</svg>';
};
