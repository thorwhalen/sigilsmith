/**
 * `emoji@1` identity and defaults: plain data, no drawing code and no dependencies, so
 * catalogs, manifests and the CLI can read it without loading the generator (or its
 * upstream library). Part of the frozen output contract of `emoji@1`.
 */
import type { GeneratorMeta } from '../../types.js';

export interface EmojiParams {
  shape: 'square' | 'rounded' | 'circle';
  /** Match label words and tags against the keyword table before falling back to a hash pick. */
  keywords: boolean;
}

export const meta: GeneratorMeta<EmojiParams> = {
  id: 'emoji',
  major: 1,
  kind: 'semantic',
  determinism: 'pure',
  defaults: { shape: 'rounded', keywords: true },
  defaultInputs: ['$label', 'tags', '$key'],
};
