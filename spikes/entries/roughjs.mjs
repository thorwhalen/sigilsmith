// Key -> seeded PRNG -> a sketchy hue-coloured circle + 2 rects via rough's generator (no DOM). Hash/PRNG counted in size.
import rough from 'roughjs/bundled/rough.esm.js';
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mul = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gen = rough.generator();
export default (key) => {
  const h = fnv(key), r = mul(h), hue = (r() * 360) | 0;
  const shapes = [
    gen.circle(32, 32, 40 + r() * 16, { seed: h, fill: `hsl(${hue},65%,60%)`, stroke: '#333', roughness: 1.5 }),
    gen.rectangle(8 + r() * 16, 8 + r() * 16, 20 + r() * 20, 20 + r() * 20, { seed: h + 1, fill: `hsl(${(hue + 120) % 360},65%,50%)`, stroke: '#333' }),
    gen.rectangle(24 + r() * 16, 24 + r() * 16, 14 + r() * 16, 14 + r() * 16, { seed: h + 2, fill: `hsl(${(hue + 240) % 360},65%,50%)`, stroke: '#333' }),
  ];
  let s = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">';
  for (const d of shapes) for (const p of gen.toPaths(d)) s += `<path d="${p.d}" stroke="${p.stroke}" stroke-width="${p.strokeWidth}" fill="${p.fill || 'none'}"/>`;
  return s + '</svg>';
};
