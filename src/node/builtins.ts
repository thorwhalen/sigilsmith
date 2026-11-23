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
import aura from '../generators/aura/manifest.js';
import badge from '../generators/badge/manifest.js';
import screenshot from '../extras/screenshot/manifest.js';
import type { BuiltinManifest } from './define.js';

/** Generators, then extras (`tier: 'extra'`, under `src/extras/`). */
export const BUILTINS: BuiltinManifest[] = [grid, rings, shapes, initials, emoji, minidenticons, glyph, aura, badge, screenshot];

/**
 * Every generator the tools know: the built-ins, plus the extensions the loaded config names
 * (`registerExtensions`, called by `loadConfig`). Mutable on purpose, so every call site that
 * reads it sees the project's extensions without a second registry to pass around.
 */
export const BUILTIN_BY_REF: Record<string, BuiltinManifest> = Object.fromEntries(BUILTINS.map((b) => [b.manifest.ref!, b]));

let extensions: BuiltinManifest[] = [];

/** Replace the registered extensions (one project at a time: the CLI and the MCP server each serve one). */
export function registerExtensions(list: BuiltinManifest[]): void {
  for (const e of extensions) delete BUILTIN_BY_REF[e.manifest.ref!];
  extensions = list;
  for (const e of list) BUILTIN_BY_REF[e.manifest.ref!] = e;
}

/** Built-ins, then the registered extensions. */
export function allGenerators(): BuiltinManifest[] {
  return [...BUILTINS, ...extensions];
}

/** Node-side loaders for every known generator (explain, preview, check, build); `dir` is the host project, whose files extras read. */
export function nodeLoaders(dir: string): Record<string, () => ReturnType<BuiltinManifest['load']>> {
  return Object.fromEntries(allGenerators().map((b) => [b.manifest.ref!, () => b.load({ dir })]));
}
