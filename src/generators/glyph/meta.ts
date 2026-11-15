/**
 * `glyph@1` identity and defaults: plain data, no drawing code, so catalogs, manifests
 * and the CLI can read it without loading the generator. Part of the frozen output
 * contract of `glyph@1`.
 */
import type { GeneratorMeta } from '../../types.js';

export const GLYPH_SHAPES = ['circle', 'triangle', 'square', 'diamond', 'pentagon', 'hexagon', 'star', 'flower', 'blob'] as const;
export const GLYPH_FILLS = ['solid', 'outline', 'stripes', 'dots', 'half'] as const;
export const GLYPH_MARKS = ['none', 'sine', 'zigzag', 'steps', 'pulse', 'noise'] as const;

export interface GlyphParams {
  /** Main hue in degrees; -1 takes the hue from the item's hash. */
  hue: number;
  /** Colourfulness of the main colours (OKLCH chroma). */
  chroma: number;
  /** Hue offset, in degrees, of the second colour (rings, satellites, the lower half of `half`). */
  accentShift: number;
  /** Light or dark tile. */
  tone: 'light' | 'dark';
  /** The silhouette at the centre. */
  shape: (typeof GLYPH_SHAPES)[number];
  /** Silhouette radius as a fraction of the tile's half-width. */
  size: number;
  /** Surface of the silhouette. */
  fill: (typeof GLYPH_FILLS)[number];
  /** Concentric rings around the silhouette (0–3). */
  rings: number;
  /** Satellite dots around the silhouette (0–8). */
  orbit: number;
  /** A line drawn across the silhouette. */
  mark: (typeof GLYPH_MARKS)[number];
  /** Rotation of the silhouette in degrees. */
  rotation: number;
  /** How much the item's own hash perturbs rotation and orbit phase (0 = none). */
  jitter: number;
  /** Tile shape. */
  tile: 'square' | 'rounded' | 'circle';
}

export const meta: GeneratorMeta<GlyphParams> = {
  id: 'glyph',
  major: 1,
  kind: 'hash',
  determinism: 'pure',
  regeneration: 'always',
  defaults: { hue: -1, chroma: 0.14, accentShift: 150, tone: 'light', shape: 'circle', size: 0.55, fill: 'solid', rings: 0, orbit: 0, mark: 'none', rotation: 0, jitter: 0.15, tile: 'rounded' },
  defaultInputs: ['$key'],
};
