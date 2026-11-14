/** Catalog manifest and params schema for `grid@1` (Node side). */
import { z } from 'zod';
import { defineGeneratorManifest } from '../../node/define.js';
import mod from './v1.js';

export default defineGeneratorManifest(
  mod,
  {
    name: 'Grid identicon', description: 'Mirrored grid of cells in one hue on a tinted tile (GitHub-style), in-house and dependency-free.',
    category: 'identicon', role: 'generator',
    upstream: { name: 'sigilsmith', url: null, npm: null, lastRelease: null, maintenance: 'active' },
    license: { spdx: 'MIT', mitCompatible: true, restrictions: [], notes: '' },
    runtime: { browser: true, node: true, edge: true, webgpu: false, network: false },
    cost: { model: 'free', notes: '' }, requiresSecret: false,
    style: 'geometric', semanticLevel: 'hash',
    sizeRange: { minPx: 16, maxPx: 128, basis: 'estimate' }, outputFormat: ['svg'],
    latency: { typicalMs: 0.05, basis: 'estimate' },
  },
  z.object({
    cells: z.number().int().min(3).max(9).default(mod.defaults.cells).describe('Grid size (cells per side).'),
    density: z.number().min(0.2).max(0.8).default(mod.defaults.density).describe('Share of cells switched on.'),
    shape: z.enum(['square', 'rounded', 'circle']).default(mod.defaults.shape).describe('Tile shape.'),
    padding: z.number().min(0).max(0.3).default(mod.defaults.padding).describe('Margin as a fraction of the tile.'),
  }).strict(),
);
