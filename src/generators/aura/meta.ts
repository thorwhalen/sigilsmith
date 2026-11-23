/**
 * `aura@1` identity and defaults: plain data, no drawing code and no dependencies, so
 * catalogs, manifests and the CLI can read it without loading the generator. Part of
 * the frozen output contract of `aura@1`.
 */
import type { GeneratorMeta } from '../../types.js';

export interface AuraParams {
  /** Hues (degrees) the fields and the base are picked from, by index: the order matters. */
  hues: number[];
  /** Number of colour fields (1-6). */
  spots: number;
  /** Saturation (%), lightness (%) and opacity (0-1) at the centre of each field. */
  saturation: number;
  lightness: number;
  opacity: number;
  /** Saturation (%) and lightness (%) of the base under them. */
  baseSaturation: number;
  baseLightness: number;
  /** Gaussian blur of the fields (viewBox units; 0 for crisp edges). */
  blur: number;
  /** Saturation boost of the blurred fields (1 = none; CSS `saturate()`). */
  saturate: number;
  /** Opacity of a soft top-left sheen (0 for none). */
  highlight: number;
  shape: 'square' | 'rounded' | 'circle';
}

export const meta: GeneratorMeta<AuraParams> = {
  id: 'aura',
  major: 1,
  kind: 'hash',
  determinism: 'pure',
  defaults: {
    hues: [268, 285, 300, 318, 330, 250, 225, 205, 185, 160, 40, 12],
    spots: 3,
    saturation: 95,
    lightness: 62,
    opacity: 0.95,
    baseSaturation: 45,
    baseLightness: 12,
    blur: 8,
    saturate: 1.3,
    highlight: 0.22,
    shape: 'rounded',
  },
  defaultInputs: ['$key'],
};
