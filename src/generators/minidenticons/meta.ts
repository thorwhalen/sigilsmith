/**
 * `minidenticons@1` identity and defaults: plain data, no drawing code and no dependencies, so
 * catalogs, manifests and the CLI can read it without loading the generator (or its
 * upstream library). Part of the frozen output contract of `minidenticons@1`.
 */
import type { GeneratorMeta } from '../../types.js';

export interface MinidenticonsParams {
  saturation: number;
  lightness: number;
  /** Light tile behind the figure, so it stays visible on dark pages. `none` for transparent. */
  background: string;
}

export const meta: GeneratorMeta<MinidenticonsParams> = {
  id: 'minidenticons',
  major: 1,
  kind: 'hash',
  determinism: 'pure',
  defaults: { saturation: 70, lightness: 45, background: '#f4f4f5' },
  defaultInputs: ['$key'],
};
