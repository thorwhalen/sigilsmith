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
 * `semanticLevel`, `license`, `gzipBytes`). It must not import zod or Node APIs: the wiring
 * module imports it into the browser. Node loads it with a dynamic `import()`, so it is
 * JavaScript, or TypeScript with erasable syntax only on Node 23.6 or later.
 *
 * Params are validated against a schema inferred from the module's `defaults` (each key's
 * type; no unknown keys), since an extension carries no zod.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import type { GeneratorModule } from '../types.js';
import { defineGeneratorManifest, type BuiltinManifest } from './define.js';
import { diag, type Diagnostic } from './diagnostics.js';

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
  const shape: Record<string, z.ZodType> = {};
  for (const [k, v] of Object.entries(defaults)) {
    const base: z.ZodType = typeof v === 'number' ? z.number() : typeof v === 'string' ? z.string() : typeof v === 'boolean' ? z.boolean() : Array.isArray(v) ? z.array(z.unknown()) : z.unknown();
    shape[k] = base.default(v as never).describe(`(from the extension's defaults: ${JSON.stringify(v)})`);
  }
  return z.object(shape).strict();
}

/** Whether a specifier names a file of the project (rather than a package). */
export const isPathSpecifier = (spec: string) => /^\.{1,2}\//.test(spec) || spec.startsWith('/');

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
  for (const spec of specs) {
    let url: string;
    if (isPathSpecifier(spec)) {
      const file = resolve(dir, spec);
      if (!existsSync(file)) {
        diagnostics.push(diag('SGS0112', 'error', `extension \`${spec}\` not found (looked at ${file})`, { where: { path: 'extensions' } }));
        continue;
      }
      url = pathToFileURL(file).href;
    } else {
      // A package, resolved from the project (not from sigilsmith's own node_modules).
      try {
        url = createRequire(resolve(dir, 'package.json')).resolve(spec);
        url = pathToFileURL(url).href;
      } catch {
        url = spec;
      }
    }
    let mod: unknown;
    try {
      mod = ((await import(url)) as { default?: unknown }).default;
    } catch (e) {
      diagnostics.push(diag('SGS0112', 'error', `extension \`${spec}\` could not be loaded: ${(e as Error).message}`, { where: { path: 'extensions' } }));
      continue;
    }
    if (!isGeneratorModule(mod)) {
      diagnostics.push(diag('SGS0112', 'error', `extension \`${spec}\` does not default-export a generator module (id, major, kind, defaults, defaultInputs, determinism, render)`, { where: { path: 'extensions' } }));
      continue;
    }
    const ref = `${mod.id}@${mod.major}`;
    if (taken.has(ref)) {
      diagnostics.push(diag('SGS0113', 'error', `extension \`${spec}\` declares \`${ref}\`, which is already a generator`, { where: { path: 'extensions' } }));
      continue;
    }
    taken.add(ref);
    const loaded = mod;
    manifests.push(extensionManifest(loaded, spec, async () => loaded));
  }
  return { manifests, diagnostics };
}
