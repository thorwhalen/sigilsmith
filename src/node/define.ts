/**
 * `defineGeneratorManifest`: builds a catalog manifest for an implemented generator
 * from its runtime module (the SSOT for id, major, kind, defaults and default inputs)
 * plus catalog metadata and a zod params schema whose defaults come from the module.
 */
import type { z } from 'zod';
import type { GeneratorModule } from '../types.js';
import { ManifestSchema, type Manifest } from './schema.js';
import { PKG_NAME } from '../meta.js';

export interface BuiltinManifest {
  manifest: Manifest;
  paramsSchema: z.ZodObject<any>;
  module: GeneratorModule<any>;
}

type Meta = Omit<Manifest, 'id' | 'version' | 'params' | 'implemented' | 'major' | 'ref' | 'importPath' | 'kind' | 'defaultInputs' | 'bundleSize' | 'determinism' | 'examples' | 'verdict' | 'verdictReason' | 'lazyLoadable'> & {
  examples?: unknown[];
  verdictReason?: string;
};

function describeParams(schema: z.ZodObject<any>, defaults: Record<string, unknown>) {
  return Object.entries(schema.shape as Record<string, z.ZodType>).map(([name, s]) => ({
    name,
    type: (s as { def?: { type?: string; innerType?: { def?: { type?: string } } } }).def?.innerType?.def?.type ?? (s as { def?: { type?: string } }).def?.type ?? 'unknown',
    default: defaults[name],
    description: s.description ?? '',
  }));
}

export function defineGeneratorManifest(module: GeneratorModule<any>, meta: Meta, paramsSchema: z.ZodObject<any>): BuiltinManifest {
  const ref = `${module.id}@${module.major}`;
  const manifest = ManifestSchema.parse({
    ...meta,
    id: module.id,
    version: `${module.major}.0.0`,
    major: module.major,
    ref,
    implemented: true,
    importPath: `${PKG_NAME}/generators/${module.id}/v${module.major}`,
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
  return { manifest, paramsSchema, module };
}
