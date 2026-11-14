/**
 * `rings@1` identity and defaults: plain data, no drawing code and no dependencies, so
 * catalogs, manifests and the CLI can read it without loading the generator (or its
 * upstream library). Part of the frozen output contract of `rings@1`.
 */
import type { GeneratorMeta } from '../../types.js';

export interface RingsParams {
  rings: number;
  shape: 'square' | 'rounded' | 'circle';
  stroke: number;
}

export const meta: GeneratorMeta<RingsParams> = {
  id: 'rings',
  major: 1,
  kind: 'hash',
  determinism: 'pure',
  defaults: { rings: 4, shape: 'circle', stroke: 8 },
  defaultInputs: ['$key'],
};
