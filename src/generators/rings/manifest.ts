/** Catalog manifest and params schema for `rings@1` (Node side). */
import { z } from 'zod';
import { defineGeneratorManifest } from '../../node/define.js';
import mod from './v1.js';

export default defineGeneratorManifest(
  mod,
  {
    name: 'Rings', description: 'Concentric arcs of seeded length, rotation and colour on a dark tile; abstract and calm.',
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
    rings: z.number().int().min(2).max(6).default(mod.defaults.rings).describe('Number of rings.'),
    shape: z.enum(['square', 'rounded', 'circle']).default(mod.defaults.shape).describe('Tile shape.'),
    stroke: z.number().min(2).max(14).default(mod.defaults.stroke).describe('Maximum ring stroke width (viewBox units).'),
  }).strict(),
);
