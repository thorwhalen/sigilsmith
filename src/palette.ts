/**
 * Deterministic palettes: hash → OKLCH → sRGB hex.
 *
 * OKLCH is perceptually uniform, so equal hue steps look equally different and a
 * fixed lightness reads the same across hues (unlike HSL, where yellow at 50% is far
 * brighter than blue at 50%). Colours are emitted as `#rrggbb` because rasterisers
 * such as resvg and older browsers do not parse `oklch()`.
 *
 * Determinism note: `Math.cos`, `Math.sin` and `Math.cbrt`/`**` may differ in the last
 * bit between JavaScript engines. Hues are integer degrees and channels are rounded
 * to 0..255, so a difference can only show when a channel sits exactly on a rounding
 * boundary. Golden vectors run in Node; a cross-engine run is a listed follow-up.
 */
import type { Palette } from './types.js';

function toHexChannel(linear: number): string {
  const c = linear <= 0.0031308 ? 12.92 * linear : 1.055 * Math.pow(linear, 1 / 2.4) - 0.055;
  const v = Math.round(Math.min(1, Math.max(0, c)) * 255);
  return v.toString(16).padStart(2, '0');
}

/** Convert OKLCH (L 0..1, C ~0..0.37, h degrees) to `#rrggbb`, clamping out-of-gamut values. */
export function oklchToHex(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;
  const r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  const g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  const bl = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(bl)}`;
}

export interface PaletteOptions {
  /** Chroma of the main colours (0.05 muted … 0.2 vivid). */
  chroma?: number;
  /** Lightness of the main colours; ~0.62 reads on both white and near-black pages. */
  lightness?: number;
  /** Lightness of the tile background. */
  backgroundLightness?: number;
  /** Hue rotation, in degrees, between primary, secondary and accent. */
  spread?: number;
}

/** Build a palette from a 32-bit hash (normally `ctx.hash`). */
export function paletteFromHash(hash: number, opts: PaletteOptions = {}): Palette {
  const { chroma = 0.14, lightness = 0.62, backgroundLightness = 0.94, spread = 137 } = opts;
  const hue = hash % 360;
  const second = (hue + spread) % 360;
  const third = (hue + 2 * spread) % 360;
  return {
    hue,
    primary: oklchToHex(lightness, chroma, hue),
    secondary: oklchToHex(lightness + 0.08, chroma, second),
    accent: oklchToHex(lightness - 0.12, chroma, third),
    background: oklchToHex(backgroundLightness, chroma * 0.25, hue),
    ink: oklchToHex(0.32, chroma * 0.6, hue),
  };
}
