/**
 * `aura@1`: blurred colour fields on a dark base (abstract × hash), in-house, no
 * dependencies.
 *
 * The "gradient orb" cover art media apps hand-roll in CSS, drawn the way the common
 * hand-rolled version draws it, so an app moving its orbs to sigilsmith keeps every
 * item's colours: the seed (the item's key, for the default single input) is hashed
 * with cyrb53, field `k` takes hue `hues[cyrb53(seed, k) % hues.length]` and its centre
 * and reach from bit shifts of `cyrb53(seed)`, the base takes `hues[cyrb53(seed, 9) % n]`.
 * Each field is a radial fade from its colour to transparent over `r`% of the distance to
 * the farthest corner of a layer 1.5× the tile (CSS `radial-gradient(circle at x% y%,
 * …)` on an `inset: -25%` layer), blurred and saturated together, under a top-left sheen.
 *
 * It deliberately does not use the kernel's per-generator `hash`/`rng`: the image is a
 * function of the seed alone, which is what keeps the old colours. A CSS `blur(6px)` is the
 * same in pixels at every size: `blurPx: 6` reproduces it (the SVG then depends on the
 * render size); `blur` is relative to the tile. Filters run in sRGB, as CSS filters do.
 *
 * Frozen: this module's output for a given seed and params never changes.
 */
import { n, svgDoc, svgImage, tile } from '../../svg.js';
import type { GeneratorModule } from '../../types.js';
import { meta, type AuraParams } from './meta.js';

export type { AuraParams };

/** cyrb53 (bryc): a small, well-mixed 53-bit string hash; the one hand-rolled identicons copy. */
export function cyrb53(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/** HSL (degrees, %, %) to `#rrggbb`. */
function hslHex(h: number, s: number, l: number): string {
  const sat = clamp(s, 0, 100) / 100;
  const lig = clamp(l, 0, 100) / 100;
  const a = sat * Math.min(lig, 1 - lig);
  const hh = (((h % 360) + 360) % 360) / 30;
  const f = (k: number) => {
    const t = (k + hh) % 12;
    return Math.round((lig - a * Math.max(-1, Math.min(t - 3, 9 - t, 1))) * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Field `k` (1-based) of a seed: hue index seed, centre and reach in % of the 1.5× layer.
 * Fields 1-3 take their geometry from bit shifts of `cyrb53(seed)`, as the hand-rolled orb
 * does; fields 4-6 from their own hash (the shifts run out of fresh bits past the third).
 */
export function auraField(seed: string, k: number): { hueSeed: number; x: number; y: number; r: number } {
  if (k > 3) {
    const g = cyrb53(seed, 10 + k);
    return { hueSeed: cyrb53(seed, k), x: 15 + (g % 70), y: 10 + ((g >>> 8) % 75), r: 45 + ((g >>> 16) % 35) };
  }
  const h = cyrb53(seed);
  return { hueSeed: cyrb53(seed, k), x: 15 + ((h >>> (k * 3)) % 70), y: 10 + ((h >>> (k * 5 + 1)) % 75), r: 45 + ((h >>> (k * 4 + 2)) % 35) };
}

/** Exact for the integer-ish operands aura produces; `Math.hypot` may differ by an ulp across engines. */
const dist = (a: number, b: number) => Math.sqrt(a * a + b * b);

const aura: GeneratorModule<AuraParams> = {
  ...meta,
  render({ seed, params, size }) {
    const hues = params.hues.length ? params.hues : meta.defaults.hues;
    const pick = (s: number) => hues[Math.floor(s % hues.length)]!;
    const count = Math.round(clamp(params.spots, 1, 6));
    // <defs> ids from the seed and every param, so two copies inline in one page never share one.
    const p = params;
    const u = cyrb53(`${seed}|${hues.join(',')}|${p.spots}|${p.saturation}|${p.lightness}|${p.opacity}|${p.baseSaturation}|${p.baseLightness}|${p.blur}|${p.blurPx}|${p.saturate}|${p.highlight}|${p.shape}|${size}`, 7).toString(36);
    const op = n(clamp(params.opacity, 0, 1));
    let defs = '';
    let fields = '';
    // CSS paints the first background on top: draw the last field first.
    for (let k = count; k >= 1; k--) {
      const f = auraField(seed, k);
      const c = hslHex(pick(f.hueSeed), params.saturation, params.lightness);
      // The layer spans -25..125 in viewBox units; the fade ends at r% of the farthest corner.
      const cx = -25 + f.x * 1.5;
      const cy = -25 + f.y * 1.5;
      const reach = dist(Math.max(cx + 25, 125 - cx), Math.max(cy + 25, 125 - cy)) * (f.r / 100);
      defs += `<radialGradient id="a${u}g${k}" gradientUnits="userSpaceOnUse" cx="${n(cx)}" cy="${n(cy)}" r="${n(reach)}"><stop offset="0" stop-color="${c}" stop-opacity="${op}"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>`;
      fields += `<rect x="-25" y="-25" width="150" height="150" fill="url(#a${u}g${k})"/>`;
    }
    const base = hslHex(pick(cyrb53(seed, 9)), params.baseSaturation, params.baseLightness);
    const blur = params.blurPx > 0 ? clamp((params.blurPx / Math.max(1, size)) * 100, 0, 60) : clamp(params.blur, 0, 30);
    const sat = clamp(params.saturate, 0, 4);
    const shine = clamp(params.highlight, 0, 1);
    defs += `<clipPath id="a${u}c">${tile('#000', params.shape)}</clipPath>`;
    const filtered = blur > 0 || sat !== 1;
    if (filtered) defs += `<filter id="a${u}f" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">${blur > 0 ? `<feGaussianBlur stdDeviation="${n(blur)}"/>` : ''}${sat !== 1 ? `<feColorMatrix type="saturate" values="${n(sat)}"/>` : ''}</filter>`;
    // The sheen: CSS radial-gradient(circle at 30% 20%, white a, transparent 45%) over the tile.
    if (shine > 0) defs += `<radialGradient id="a${u}h" gradientUnits="userSpaceOnUse" cx="30" cy="20" r="${n(dist(70, 80) * 0.45)}"><stop offset="0" stop-color="#fff" stop-opacity="${n(shine)}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`;
    const body =
      `<defs>${defs}</defs><g clip-path="url(#a${u}c)"><rect width="100" height="100" fill="${base}"/>` +
      `<g${filtered ? ` filter="url(#a${u}f)"` : ''}><rect x="-25" y="-25" width="150" height="150" fill="${base}"/>${fields}</g>` +
      (shine > 0 ? `<rect width="100" height="100" fill="url(#a${u}h)"/>` : '') +
      `</g>`;
    return svgImage(svgDoc(body));
  },
};

export default aura;
