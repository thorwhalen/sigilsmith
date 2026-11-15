/**
 * The implemented generators known to the catalog and the CLI.
 *
 * Adding a generator: write `src/generators/<id>/v<N>.ts` and its `manifest.ts`, then
 * add one line here. Nothing else in the core changes.
 */
import grid from '../generators/grid/manifest.js';
import rings from '../generators/rings/manifest.js';
import shapes from '../generators/shapes/manifest.js';
import initials from '../generators/initials/manifest.js';
import emoji from '../generators/emoji/manifest.js';
import minidenticons from '../generators/minidenticons/manifest.js';
import glyph from '../generators/glyph/manifest.js';
import type { BuiltinManifest } from './define.js';

export const BUILTINS: BuiltinManifest[] = [grid, rings, shapes, initials, emoji, minidenticons, glyph];

export const BUILTIN_BY_REF: Record<string, BuiltinManifest> = Object.fromEntries(BUILTINS.map((b) => [b.manifest.ref!, b]));

/** Node-side loaders for every built-in generator (explain, preview, check, build). */
export const NODE_LOADERS: Record<string, BuiltinManifest['load']> = Object.fromEntries(BUILTINS.map((b) => [b.manifest.ref!, b.load]));
