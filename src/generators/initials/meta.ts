/**
 * `initials@1` identity and defaults: plain data, no drawing code and no dependencies, so
 * catalogs, manifests and the CLI can read it without loading the generator (or its
 * upstream library). Part of the frozen output contract of `initials@1`.
 */
import type { GeneratorMeta } from '../../types.js';

export interface InitialsParams {
  maxLetters: number;
  shape: 'square' | 'rounded' | 'circle';
  fontFamily: string;
  fontWeight: number;
  /** `solid`: white letters on a saturated tile; `soft`: dark letters on a light tile. */
  tone: 'solid' | 'soft';
}

export const meta: GeneratorMeta<InitialsParams> = {
  id: 'initials',
  major: 1,
  kind: 'semantic',
  determinism: 'pure',
  // The letters are the label: a stale image after a rename looks like a bug, so follow the label.
  regeneration: 'always',
  defaults: { maxLetters: 2, shape: 'circle', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif', fontWeight: 600, tone: 'solid' },
  defaultInputs: ['$label', '$key'],
};
