/**
 * `screenshot@1` identity and defaults: plain data, no drawing code and no dependencies,
 * so catalogs, manifests and the CLI can read it without loading the extra. Part of the
 * frozen output contract of `screenshot@1`.
 */
import type { GeneratorMeta } from '../../types.js';

/** In-house generators the extra can draw when an item has no screenshot. */
export const FALLBACK_IDS = ['grid', 'rings', 'shapes', 'initials'] as const;
export type FallbackId = (typeof FALLBACK_IDS)[number];

export interface ScreenshotParams {
  /** Focus used when the item has none: `"x,y"` (a point), `"x,y,w,h"` (a rectangle) or `{x,y,zoom}`/`{x,y,w,h}` JSON. Fractions of the image when every coordinate is ≤ 1, pixels otherwise. */
  focus: string;
  /** Magnification around a focus point: 1 shows the largest square that fits, 4 a quarter of its side. */
  zoom: number;
  shape: 'square' | 'rounded' | 'circle';
  /** Width of a ring in the item's identity colour (viewBox units, 0 for none). */
  ring: number;
  /** Keep hard pixel edges when zoomed (pixel-art games). */
  pixelated: boolean;
  /** Drawn, exactly as that generator would at its defaults, when the item has no screenshot. */
  fallback: FallbackId;
  /** Refuse screenshots larger than this; ship a small key frame instead. */
  maxBytes: number;
}

export const meta: GeneratorMeta<ScreenshotParams> = {
  id: 'screenshot',
  major: 1,
  // Presets never replace a content module's inputs.
  kind: 'content',
  // A pure function of its inputs and the screenshot's bytes: render on read follows the
  // file, which is what a thumbnail should do (see the extra's module doc).
  determinism: 'pure',
  regeneration: 'always',
  defaults: { focus: '0.5,0.5', zoom: 1, shape: 'rounded', ring: 0, pixelated: false, fallback: 'grid', maxBytes: 1_500_000 },
  defaultInputs: [{ field: 'screenshot', as: 'src' }, { field: 'screenshotFocus', as: 'focus' }, '$label', '$key'],
};
