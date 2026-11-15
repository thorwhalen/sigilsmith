/** Catalog manifest and params schema for `glyph@1` (Node side). */
import { z } from 'zod';
import { defineGeneratorManifest } from '../../node/define.js';
import { GLYPH_FILLS, GLYPH_MARKS, GLYPH_SHAPES, meta as mod } from './meta.js';

export default defineGeneratorManifest(
  mod,
  () => import('./v1.js'),
  {
    name: 'Feature glyph',
    description: 'A silhouette with a colour, fill texture, rings, satellites and a line mark, every one a param: the generator a feature mapping drives, so similar items look related and different ones distinct.',
    category: 'glyph', role: 'generator',
    upstream: { name: 'sigilsmith', url: null, npm: null, lastRelease: null, maintenance: 'active' },
    license: { spdx: 'MIT', mitCompatible: true, restrictions: [], notes: '' },
    runtime: { browser: true, node: true, edge: true, webgpu: false, network: false },
    cost: { model: 'free', notes: '' }, requiresSecret: false,
    style: 'geometric', semanticLevel: 'metadata',
    sizeRange: { minPx: 24, maxPx: 512, basis: 'estimate' }, outputFormat: ['svg'],
    latency: { typicalMs: 0.05, basis: 'estimate' },
  },
  z.object({
    hue: z.number().int().min(-1).max(359).default(mod.defaults.hue).describe('Main hue in degrees; -1 takes it from the item hash.'),
    chroma: z.number().min(0).max(0.3).default(mod.defaults.chroma).describe('Colourfulness (OKLCH chroma).'),
    accentShift: z.number().int().min(0).max(359).default(mod.defaults.accentShift).describe('Hue offset of the second colour (rings, satellites, the lower half of `half`): 150 contrasts, 20-40 stays in the family.'),
    tone: z.enum(['light', 'dark']).default(mod.defaults.tone).describe('Light or dark tile.'),
    shape: z.enum(GLYPH_SHAPES).default(mod.defaults.shape).describe('Silhouette at the centre.'),
    size: z.number().min(0.2).max(0.85).default(mod.defaults.size).describe('Silhouette radius, fraction of the half-tile.'),
    fill: z.enum(GLYPH_FILLS).default(mod.defaults.fill).describe('Surface texture of the silhouette.'),
    rings: z.number().int().min(0).max(3).default(mod.defaults.rings).describe('Concentric rings around the silhouette.'),
    orbit: z.number().int().min(0).max(8).default(mod.defaults.orbit).describe('Satellite dots around the silhouette.'),
    mark: z.enum(GLYPH_MARKS).default(mod.defaults.mark).describe('Line drawn across the silhouette.'),
    rotation: z.number().min(-360).max(360).default(mod.defaults.rotation).describe('Silhouette rotation in degrees.'),
    jitter: z.number().min(0).max(1).default(mod.defaults.jitter).describe('How much the item hash perturbs rotation and orbit phase.'),
    tile: z.enum(['square', 'rounded', 'circle']).default(mod.defaults.tile).describe('Tile shape.'),
  }).strict(),
);
