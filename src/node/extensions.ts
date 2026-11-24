/**
 * Extensions: generators that live outside this package (#12), named in the config's
 * `extensions` and seen by `catalog`, `build`, `explain`, `preview` and `check` like the
 * built-in ones.
 *
 * The first use is migration with exact continuity: an app wraps its own hand-rolled
 * thumbnail function as a generator module, so moving to sigilsmith changes no image; it
 * can switch to a catalog generator later, deliberately (`check identity` shows what moves).
 * The same seam takes an extra published as its own npm package.
 *
 * An extension is a module whose default export is a `GeneratorModule` (id, major, kind,
 * defaults, defaultInputs, determinism, render), the same contract as `src/generators/<id>/v1.ts`,
 * with an optional `catalog` object for the catalog row (`name`, `description`, `style`,
 * `semanticLevel`, `license`, `gzipBytes`). Its id contains a hyphen (`app-orb`): built-in
 * ids never do, so a later sigilsmith cannot take an app's ref. It must not import zod or
 * Node APIs: the wiring module imports it into the browser. Node loads it like the host's
 * bundler would (`host-module.ts`): TS, TSX and path aliases work when esbuild is installed.
 *
 * Loading an extension runs the project's code, as a custom key function or a module
 * transport already did: only the commands that render (build, check, explain, preview,
 * targets) load them; catalog, detect-key and adopt never do.
 *
 * Params are validated against a schema inferred from the module's `defaults` (each key's
 * type; no unknown keys), since an extension carries no zod.
 */
import { existsSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { z } from 'zod';
import type { GeneratorModule } from '../types.js';
import { defineGeneratorManifest, type BuiltinManifest } from './define.js';
import { diag, type Diagnostic } from './diagnostics.js';
import { importHostModule, importHostPackage } from './host-module.js';

/** Catalog details an extension may export beside its module (all optional). */
export interface ExtensionCatalog {
  name?: string;
  description?: string;
  style?: 'abstract' | 'geometric' | 'illustrative' | 'photorealistic';
  semanticLevel?: 'hash' | 'metadata' | 'embedding' | 'llm';
  /** SPDX id of its licence. */
  license?: string;
  /** Its size in the app's bundle (gzip bytes), for `check budget`; measured by its author. */
  gzipBytes?: number;
}

type ExtensionModule = GeneratorModule<any> & { catalog?: ExtensionCatalog };

/** A zod schema from a module's defaults: each key keeps its type, no unknown keys. */
export function schemaFromDefaults(defaults: Record<string, unknown>): z.ZodObject<any> {
  const typeOf = (v: unknown): z.ZodType =>
    typeof v === 'number' ? z.number() : typeof v === 'string' ? z.string() : typeof v === 'boolean' ? z.boolean() : Array.isArray(v) ? z.array(z.unknown())
      : v && typeof v === 'object' ? z.object(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeOf(x).optional()]))).strict()
      : z.unknown();
  const shape: Record<string, z.ZodType> = {};
  for (const [k, v] of Object.entries(defaults)) shape[k] = typeOf(v).default(v as never).describe(`(from the extension's defaults: ${JSON.stringify(v)})`);
  return z.object(shape).strict();
}

/** Whether a specifier names a file of the project (rather than a package). */
export const isPathSpecifier = (spec: string) => /^\.{1,2}[\\/]/.test(spec) || isAbsolute(spec);

/** Turn one extension module into a registry entry; `importPath` is how the wiring module imports it. */
export function extensionManifest(mod: ExtensionModule, importPath: string, load: () => Promise<GeneratorModule<any>>): BuiltinManifest {
  const c = mod.catalog ?? {};
  const meta = { id: mod.id, major: mod.major, kind: mod.kind, defaults: mod.defaults, defaultInputs: mod.defaultInputs, determinism: mod.determinism, ...(mod.regeneration ? { regeneration: mod.regeneration } : {}) };
  const b = defineGeneratorManifest(
    meta,
    async () => ({ default: await load() }),
    {
      name: c.name ?? mod.id, description: c.description ?? `Extension generator ${mod.id}@${mod.major} (${importPath}).`,
      category: 'extension', role: 'generator',
      upstream: { name: importPath, url: null, npm: isPathSpecifier(importPath) ? null : importPath, lastRelease: null, maintenance: 'unknown' },
      license: { spdx: c.license ?? null, mitCompatible: null, restrictions: [], notes: '' },
      runtime: { browser: true, node: true, edge: null, webgpu: false, network: false },
      cost: { model: 'free', notes: '' }, requiresSecret: false,
      style: c.style ?? 'abstract', semanticLevel: c.semanticLevel ?? (mod.kind === 'hash' ? 'hash' : 'metadata'),
      sizeRange: { minPx: null, maxPx: null, basis: 'estimate' }, outputFormat: ['svg'],
      latency: { typicalMs: null, basis: 'estimate' },
      verdictReason: 'An extension named in the config.',
    },
    schemaFromDefaults(mod.defaults as Record<string, unknown>),
  );
  b.manifest.importPath = importPath;
  b.manifest.tier = 'extension';
  if (c.gzipBytes !== undefined) b.manifest.bundleSize = { ...b.manifest.bundleSize, minGzipBytes: c.gzipBytes, source: 'declared by the extension' };
  return b;
}

const isGeneratorModule = (m: unknown): m is ExtensionModule => {
  const g = m as Partial<GeneratorModule>;
  return Boolean(g) && typeof g.id === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(g.id) && Number.isInteger(g.major) && typeof g.render === 'function' && typeof g.defaults === 'object' && Array.isArray(g.defaultInputs) && ['hash', 'semantic', 'content'].includes(g.kind as string) && ['pure', 'seeded', 'cached-nondeterministic'].includes(g.determinism as string);
};

/**
 * Load the extensions a config names, relative to the project `dir`. Each failure is an
 * SGS0112 error naming the specifier; a ref that clashes with a built-in or another
 * extension is SGS0113.
 */
export async function loadExtensions(specs: string[], dir: string, taken: Set<string>): Promise<{ manifests: BuiltinManifest[]; diagnostics: Diagnostic[] }> {
  const manifests: BuiltinManifest[] = [];
  const diagnostics: Diagnostic[] = [];
  const fail = (code: 'SGS0112' | 'SGS0113', message: string) => diagnostics.push(diag(code, 'error', message, { where: { path: 'extensions' } }));
  for (const spec of [...new Set(specs)]) {
    let mod: unknown;
    try {
      if (isPathSpecifier(spec)) {
        const file = resolve(dir, spec);
        if (!existsSync(file)) {
          fail('SGS0112', `extension \`${spec}\` not found (looked at ${file})`);
          continue;
        }
        mod = ((await importHostModule(file, dir)) as { default?: unknown }).default;
      } else mod = ((await importHostPackage(spec, dir)) as { default?: unknown }).default;
    } catch (e) {
      fail('SGS0112', `extension \`${spec}\` could not be loaded: ${(e as Error).message}`);
      continue;
    }
    // A CommonJS build seen through ESM interop: the generator is one level down.
    const inner = (mod as { __esModule?: boolean; default?: unknown } | undefined)?.default;
    if (!isGeneratorModule(mod) && isGeneratorModule(inner)) mod = inner;
    if (!isGeneratorModule(mod)) {
      fail('SGS0112', `extension \`${spec}\` does not default-export a generator module (id, major, kind, defaults, defaultInputs, determinism, render)`);
      continue;
    }
    const ref = `${mod.id}@${mod.major}`;
    if (!mod.id.includes('-')) {
      fail('SGS0113', `extension \`${spec}\` is \`${ref}\`: an extension id needs a hyphen (\`app-${mod.id}\`), so no sigilsmith generator can ever take it`);
      continue;
    }
    if (taken.has(ref)) {
      fail('SGS0113', `extension \`${spec}\` declares \`${ref}\`, which is already a generator`);
      continue;
    }
    taken.add(ref);
    const loaded = mod;
    manifests.push(extensionManifest(loaded, spec, async () => loaded));
  }
  return { manifests, diagnostics };
}
