/** Catalog manifest and params schema for `shapes@1` (Node side). */
import { z } from 'zod';
import { defineGeneratorManifest } from '../../node/define.js';
import { meta as mod } from './meta.js';

export default defineGeneratorManifest(
  mod,
  () => import('./v1.js'),
  {
    name: 'Bauhaus shapes', description: 'Two to five overlapping circles, squares, triangles and half discs in palette colours.',
    category: 'pattern', role: 'generator',
    upstream: { name: 'sigilsmith', url: null, npm: null, lastRelease: null, maintenance: 'active' },
    license: { spdx: 'MIT', mitCompatible: true, restrictions: [], notes: '' },
    runtime: { browser: true, node: true, edge: true, webgpu: false, network: false },
    cost: { model: 'free', notes: '' }, requiresSecret: false,
    style: 'abstract', semanticLevel: 'hash',
    sizeRange: { minPx: 24, maxPx: 256, basis: 'estimate' }, outputFormat: ['svg'],
    latency: { typicalMs: 0.05, basis: 'estimate' },
  },
  z.object({
    count: z.number().int().min(2).max(5).default(mod.defaults.count).describe('Number of shapes.'),
    shape: z.enum(['square', 'rounded', 'circle']).default(mod.defaults.shape).describe('Tile shape.'),
  }).strict(),
);
