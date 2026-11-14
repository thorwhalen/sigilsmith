// ~15 lines: FNV-1a + mulberry32 + 5x5 mirrored grid (3 stored columns) + one HSL hue.
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry32 = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export default (key) => {
  const rnd = mulberry32(fnv(key)), hue = Math.floor(rnd() * 360);
  let d = '';
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if (rnd() < 0.5) {
    d += `M${x} ${y}h1v1h-1z`;
    if (x < 2) d += `M${4 - x} ${y}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-.5 -.5 6 6"><path fill="hsl(${hue},65%,50%)" d="${d}"/></svg>`;
};
