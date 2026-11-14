/**
 * `grid@1` identity and defaults: plain data, no drawing code and no dependencies, so
 * catalogs, manifests and the CLI can read it without loading the generator (or its
 * upstream library). Part of the frozen output contract of `grid@1`.
 */
import type { GeneratorMeta } from '../../types.js';

export interface GridParams {
  cells: number;
  density: number;
  shape: 'square' | 'rounded' | 'circle';
  padding: number;
}

export const meta: GeneratorMeta<GridParams> = {
  id: 'grid',
  major: 1,
  kind: 'hash',
  determinism: 'pure',
  defaults: { cells: 5, density: 0.5, shape: 'rounded', padding: 0.16 },
  defaultInputs: ['$key'],
};
