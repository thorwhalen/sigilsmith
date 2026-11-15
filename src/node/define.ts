/**
 * `defineGeneratorManifest`: builds a catalog manifest for an implemented generator
 * from its runtime module (the SSOT for id, major, kind, defaults and default inputs)
 * plus catalog metadata and a zod params schema whose defaults come from the module.
 */
import type { z } from 'zod';
import type { GeneratorMeta, GeneratorModule } from '../types.js';
import { ManifestSchema, type Manifest } from './schema.js';
import { PKG_NAME } from '../meta.js';

export interface BuiltinManifest {
  manifest: Manifest;
  paramsSchema: z.ZodObject<any>;
  /** Identity and defaults (no drawing code). */
  meta: GeneratorMeta<any>;
  /**
   * Load the generator module itself (may need an optional peer, e.g. minidenticons).
   * `dir` is the host project's directory, for modules that read its files (extras).
   */
  load: (ctx?: LoadContext) => Promise<GeneratorModule<any>>;
  /** Extra inputs the fingerprint renders, for modules whose output the golden seeds alone never reach (the screenshot extra's crop). Frozen with the module. */
  fixtures?: Fixture[];
  /** Generator refs this module can draw itself (an extra's fallback), given its effective params: counted by the budget and fingerprinted by the lock. */
  implies?: (params: Record<string, unknown>) => string[];
}

export interface LoadContext {
  dir?: string;
}

export interface Fixture {
  fields: Record<string, string>;
  params?: Record<string, unknown>;
}

export interface ManifestOptions {
  tier?: 'core' | 'extra';
  fixtures?: Fixture[];
  implies?: BuiltinManifest['implies'];
}

type Meta = Omit<Manifest, 'id' | 'version' | 'params' | 'implemented' | 'major' | 'ref' | 'importPath' | 'tier' | 'kind' | 'defaultInputs' | 'bundleSize' | 'determinism' | 'examples' | 'verdict' | 'verdictReason' | 'lazyLoadable'> & {
  examples?: unknown[];
  verdictReason?: string;
  /** How to wire it, shown in the catalog row. */
  usage?: string;
};

function describeParams(schema: z.ZodObject<any>, defaults: Record<string, unknown>) {
  return Object.entries(schema.shape as Record<string, z.ZodType>).map(([name, s]) => ({
    name,
    type: (s as { def?: { type?: string; innerType?: { def?: { type?: string } } } }).def?.innerType?.def?.type ?? (s as { def?: { type?: string } }).def?.type ?? 'unknown',
    default: defaults[name],
    description: s.description ?? '',
  }));
}

/**
 * `tier: 'extra'` marks a module that lives outside the generator set (`src/extras/<id>`,
 * imported from `sigilsmith/extras/<id>/v<N>`): it is listed and wired like a generator,
 * but it is a different kind of thumbnail (content, not identity) and only ships when
 * selected.
 */
export function defineGeneratorManifest(module: GeneratorMeta<any>, loader: (ctx?: LoadContext) => Promise<{ default: GeneratorModule<any> }>, meta: Meta, paramsSchema: z.ZodObject<any>, opts: ManifestOptions = {}): BuiltinManifest {
  const tier = opts.tier ?? 'core';
  const ref = `${module.id}@${module.major}`;
  const manifest = ManifestSchema.parse({
    ...meta,
    id: module.id,
    version: `${module.major}.0.0`,
    major: module.major,
    ref,
    implemented: true,
    tier,
    importPath: `${PKG_NAME}/${tier === 'extra' ? 'extras' : 'generators'}/${module.id}/v${module.major}`,
    kind: module.kind,
    defaultInputs: module.defaultInputs,
    determinism: module.determinism,
    lazyLoadable: true,
    bundleSize: { minBytes: null, minGzipBytes: null, brotliBytes: null, measured: false, source: 'npm run measure' },
    params: describeParams(paramsSchema, module.defaults as Record<string, unknown>),
    examples: meta.examples ?? [],
    verdict: 'implemented',
    verdictReason: meta.verdictReason ?? 'Built in.',
  });
  return { manifest, paramsSchema, meta: module, load: async (ctx) => (await loader(ctx)).default, ...(opts.fixtures ? { fixtures: opts.fixtures } : {}), ...(opts.implies ? { implies: opts.implies } : {}) };
}
