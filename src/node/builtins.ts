/**
 * The implemented generators known to the catalog and the CLI.
 *
 * Adding a generator: write `src/generators/<id>/v<N>.ts` and its `manifest.ts`, then
 * add one line here. Nothing else in the core changes. An extra is the same under
 * `src/extras/<id>/`, with `{ tier: 'extra' }` in its manifest.
 */
import grid from '../generators/grid/manifest.js';
import rings from '../generators/rings/manifest.js';
import shapes from '../generators/shapes/manifest.js';
import initials from '../generators/initials/manifest.js';
import emoji from '../generators/emoji/manifest.js';
import minidenticons from '../generators/minidenticons/manifest.js';
import glyph from '../generators/glyph/manifest.js';
import screenshot from '../extras/screenshot/manifest.js';
import type { BuiltinManifest } from './define.js';

/** Generators, then extras (`tier: 'extra'`, under `src/extras/`). */
export const BUILTINS: BuiltinManifest[] = [grid, rings, shapes, initials, emoji, minidenticons, glyph, screenshot];

export const BUILTIN_BY_REF: Record<string, BuiltinManifest> = Object.fromEntries(BUILTINS.map((b) => [b.manifest.ref!, b]));

/** Node-side loaders for every built-in generator (explain, preview, check, build); `dir` is the host project, whose files extras read. */
export function nodeLoaders(dir: string): Record<string, () => ReturnType<BuiltinManifest['load']>> {
  return Object.fromEntries(BUILTINS.map((b) => [b.manifest.ref!, () => b.load({ dir })]));
}
