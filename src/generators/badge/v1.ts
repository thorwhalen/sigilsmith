/**
 * `badge@1`: what kind of item this is, and one fact about it (geometric × metadata), in-house.
 *
 * An icon for the item's kind (a film frame, a note, a page...) over a tile coloured from
 * the key, with an optional caption under it from an input named `caption` (a year, a file
 * extension, a version): the placeholder apps draw by hand for items with no picture.
 * Choose the icon per item type with rules; map the caption with
 * `inputs: ["$key", { "field": "year", "as": "caption" }]`.
 *
 * Frozen: this module's output for a given seed and params never changes.
 */
import { hash32 } from '../../hash.js';
import { paletteFromHash } from '../../palette.js';
import { escapeXml, svgDoc, svgImage, tile } from '../../svg.js';
import type { GeneratorModule } from '../../types.js';
import { meta, type BadgeIcon, type BadgeParams } from './meta.js';

export type { BadgeParams, BadgeIcon };

/** Line drawings on a 24-unit grid (stroke only, round caps). */
const ICONS: Record<BadgeIcon, string> = {
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 8h4M3 12h4M3 16h4M17 8h4M17 12h4M17 16h4"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 17l-5-5-9 8"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21a2 2 0 0 1 2-2h13v2H6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  game: '<rect x="2" y="7" width="20" height="11" rx="5"/><path d="M7 11v4M5 13h4"/><circle cx="16" cy="12" r="1"/><circle cx="18" cy="14.5" r="1"/>',
  none: '',
};

/** The caption as shown: trimmed, at most `max` characters (an ellipsis replaces the rest). */
export function captionOf(text: string | undefined, max: number): string {
  const chars = Array.from((text ?? '').trim());
  const n = Math.max(1, Math.round(max));
  return chars.length > n ? `${chars.slice(0, n - 1).join('')}…` : chars.join('');
}

const badge: GeneratorModule<BadgeParams> = {
  ...meta,
  render({ fields, seed, params }) {
    const pal = paletteFromHash(hash32(fields.key ?? seed), params.tone === 'solid' ? { lightness: 0.55, chroma: 0.13 } : {});
    const bg = params.tone === 'solid' ? pal.primary : pal.background;
    const fg = params.tone === 'solid' ? '#ffffff' : pal.ink;
    const caption = captionOf(fields.caption, params.maxCaption);
    const icon = ICONS[params.icon] ?? ICONS.doc;
    // The icon sits higher when a caption shares the tile.
    const iconSvg = icon ? `<g transform="translate(${caption ? '29 14' : '26 26'}) scale(${caption ? 1.75 : 2})" fill="none" stroke="${fg}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${icon}</g>` : '';
    const size = Array.from(caption).length > 4 ? 15 : 18;
    const text = caption ? `<text x="50" y="${icon ? 80 : 50}" dy="0.35em" text-anchor="middle" font-family="${escapeXml(params.fontFamily)}" font-weight="600" font-size="${icon ? size : 30}" fill="${fg}">${escapeXml(caption)}</text>` : '';
    return svgImage(svgDoc(tile(bg, params.shape) + iconSvg + text));
  },
};

export default badge;
