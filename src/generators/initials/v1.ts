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

export interface InitialsParams {
  maxLetters: number;
  shape: 'square' | 'rounded' | 'circle';
  fontFamily: string;
  fontWeight: number;
  /** `solid`: white letters on a saturated tile; `soft`: dark letters on a light tile. */
  tone: 'solid' | 'soft';
}

/** First letters of the first and last words; non-letters skipped; handles any script. */
export function initialsOf(label: string, max: number): string {
  const words = label.split(/[\s\-_.,/]+/u).filter((w) => /[\p{L}\p{N}]/u.test(w));
  if (words.length === 0) return '?';
  const first = (w: string) => Array.from(w).find((c) => /[\p{L}\p{N}]/u.test(c)) ?? '';
  const picked = words.length === 1 || max === 1 ? [words[0]!] : [words[0]!, words[words.length - 1]!];
  return picked
    .map(first)
    .join('')
    .slice(0, Math.max(1, max) * 2)
    .toLocaleUpperCase('en-US');
}

const initials: GeneratorModule<InitialsParams> = {
  id: 'initials',
  major: 1,
  kind: 'semantic',
  determinism: 'pure',
  defaults: { maxLetters: 2, shape: 'circle', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', fontWeight: 600, tone: 'solid' },
  defaultInputs: ['$label', '$key'],
  render({ fields, seed, params }) {
    const label = fields.label ?? fields.name ?? fields.title ?? Object.values(fields)[0] ?? '';
    const letters = initialsOf(label, params.maxLetters);
    const pal = paletteFromHash(hash32(fields.key ?? seed), params.tone === 'solid' ? { lightness: 0.55, chroma: 0.13 } : {});
    const bg = params.tone === 'solid' ? pal.primary : pal.background;
    const fg = params.tone === 'solid' ? '#ffffff' : pal.ink;
    const size = Array.from(letters).length > 1 ? 40 : 48;
    const text = `<text x="50" y="50" dy="0.35em" text-anchor="middle" font-family="${escapeXml(params.fontFamily)}" font-weight="${params.fontWeight}" font-size="${size}" fill="${fg}">${escapeXml(letters)}</text>`;
    return svgImage(svgDoc(tile(bg, params.shape) + text));
  },
};

export default initials;
