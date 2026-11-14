/**
 * `shapes@1` identity and defaults: plain data, no drawing code and no dependencies, so
 * catalogs, manifests and the CLI can read it without loading the generator (or its
 * upstream library). Part of the frozen output contract of `shapes@1`.
 */
import type { GeneratorMeta } from '../../types.js';

export interface ShapesParams {
  count: number;
  shape: 'square' | 'rounded' | 'circle';
}

export const meta: GeneratorMeta<ShapesParams> = {
  id: 'shapes',
  major: 1,
  kind: 'hash',
  determinism: 'pure',
  defaults: { count: 3, shape: 'rounded' },
  defaultInputs: ['$key'],
};
