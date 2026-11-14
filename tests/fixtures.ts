/** Shared test fixtures: a resolved config and loaders for every built-in generator. */
import { PRESETS } from '../src/index.js';
import type { ResolvedConfig } from '../src/types.js';

export const baseConfig: ResolvedConfig = {
  version: 1,
  itemTypeField: 'type',
  key: { spec: { kind: 'field', field: 'id' }, fallback: ['title', 'type'], onMissing: 'fallback' },
  label: { fields: ['name', 'title', 'label'] },
  presets: [PRESETS.media!, PRESETS.people!],
  generators: { 'grid@1': { params: { cells: 5 } } },
  policy: { default: 'grid@1', salt: 'sigilsmith', rules: [
    { when: { type: 'video' }, use: 'rings@1' },
    { when: { type: 'audio' }, use: { 'grid@1': 1, 'shapes@1': 1 } },
  ] },
  delivery: { strategy: 'materialized', format: 'svg' },
  regeneration: { policy: 'ask' },
  userSettings: { choices: ['grid@1', 'rings@1', 'shapes@1'], perType: true, params: { 'grid@1': ['cells'] } },
};

export const loaders = {
  'grid@1': () => import('../src/generators/grid/v1.js'),
  'rings@1': () => import('../src/generators/rings/v1.js'),
  'shapes@1': () => import('../src/generators/shapes/v1.js'),
  'initials@1': () => import('../src/generators/initials/v1.js'),
  'emoji@1': () => import('../src/generators/emoji/v1.js'),
  'minidenticons@1': () => import('../src/generators/minidenticons/v1.js'),
};

