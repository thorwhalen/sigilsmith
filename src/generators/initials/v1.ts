/**
 * `initials@1`: letter avatar (geometric × metadata), in-house.
 *
 * Reads the item's label (`$label`: name, title…) for the letters and the key for
 * the colour, so two people both called "Sam Lee" still differ by colour, and a
 * rename changes the letters but not the colour. Uses SVG `<text>`: the markup is
 * deterministic, the pixels depend on the viewer's fonts.
 *
 * Frozen: this module's output for a given seed and params never changes.
 */
import { hash32 } from '../../hash.js';
import { paletteFromHash } from '../../palette.js';
import { escapeXml, svgDoc, svgImage, tile } from '../../svg.js';
import type { GeneratorModule } from '../../types.js';
import { meta, type InitialsParams } from './meta.js';

export type { InitialsParams };


/** First letters of the first and last words; non-letters skipped; handles any script. */
export function initialsOf(label: string, max: number): string {
  const words = label.split(/[\s\-_.,/]+/u).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return '?';
  const first = (w: string) => Array.from(w).find((c) => /[\p{L}\p{N}]/u.test(c)) ?? '';
  const n = Math.max(1, Math.min(max, words.length));
  // First words, with the last word always last: "Ada King Lovelace" → AL (2), AKL (3).
  const picked = n === 1 ? [words[0]!] : [...words.slice(0, n - 1), words[words.length - 1]!];
  return picked.map(first).join('').toLocaleUpperCase('en-US');
}

const initials: GeneratorModule<InitialsParams> = {
  ...meta,
  render({ fields, seed, params }) {
    const label = fields.label ?? fields.name ?? fields.title ?? Object.values(fields)[0] ?? '';
    const letters = initialsOf(label, params.maxLetters);
    const pal = paletteFromHash(hash32(fields.key ?? seed), params.tone === 'solid' ? { lightness: 0.55, chroma: 0.13 } : {});
    const bg = params.tone === 'solid' ? pal.primary : pal.background;
    const fg = params.tone === 'solid' ? '#ffffff' : pal.ink;
    const count = Array.from(letters).length;
    const size = count > 2 ? 32 : count > 1 ? 40 : 48;
    const text = `<text x="50" y="50" dy="0.35em" text-anchor="middle" font-family="${escapeXml(params.fontFamily)}" font-weight="${Number(params.fontWeight) || 600}" font-size="${size}" fill="${fg}">${escapeXml(letters)}</text>`;
    return svgImage(svgDoc(tile(bg, params.shape) + text));
  },
};

export default initials;
