/** Catalog manifest and params schema for `aura@1` (Node side). */
import { z } from 'zod';
import { defineGeneratorManifest } from '../../node/define.js';
import { meta as mod } from './meta.js';

export default defineGeneratorManifest(
  mod,
  () => import('./v1.js'),
  {
    name: 'Aura', description: 'Blurred colour fields on a dark base with a soft sheen: the "gradient orb" cover art media apps hand-roll in CSS, seeded by cyrb53 of the key the way those usually are, so a migrated app keeps each item\'s colours.',
    category: 'pattern', role: 'generator',
    upstream: { name: 'sigilsmith', url: null, npm: null, lastRelease: null, maintenance: 'active' },
    license: { spdx: 'MIT', mitCompatible: true, restrictions: [], notes: '' },
    runtime: { browser: true, node: true, edge: true, webgpu: false, network: false },
    cost: { model: 'free', notes: '' }, requiresSecret: false,
    style: 'abstract', semanticLevel: 'hash',
    sizeRange: { minPx: 16, maxPx: 1024, basis: 'estimate' }, outputFormat: ['svg'],
    latency: { typicalMs: 0.05, basis: 'estimate' },
    usage: 'Migrating hand-rolled gradient art: pin `hues` to the old palette, in the old order; with a single key input each item keeps its colours.',
  },
  z.object({
    hues: z.array(z.number().min(0).max(360)).min(1).max(24).default(mod.defaults.hues).describe('Hues (degrees) the fields and the base are picked from, by index (order matters).'),
    spots: z.number().int().min(1).max(6).default(mod.defaults.spots).describe('Number of colour fields.'),
    opacity: z.number().min(0).max(1).default(mod.defaults.opacity).describe('Opacity at the centre of each field.'),
    saturation: z.number().min(0).max(100).default(mod.defaults.saturation).describe('Saturation (%) of the fields.'),
    lightness: z.number().min(0).max(100).default(mod.defaults.lightness).describe('Lightness (%) of the fields.'),
    baseSaturation: z.number().min(0).max(100).default(mod.defaults.baseSaturation).describe('Saturation (%) of the base.'),
    baseLightness: z.number().min(0).max(100).default(mod.defaults.baseLightness).describe('Lightness (%) of the base.'),
    blur: z.number().min(0).max(30).default(mod.defaults.blur).describe('Blur of the fields (viewBox units; 0 for crisp discs).'),
    blurPx: z.number().min(0).max(40).default(mod.defaults.blurPx).describe('Blur in display pixels (replaces `blur`, scaled by the render size; 0 to use `blur`).'),
    saturate: z.number().min(0).max(4).default(mod.defaults.saturate).describe('Saturation boost of the blurred fields (1 = none).'),
    highlight: z.number().min(0).max(1).default(mod.defaults.highlight).describe('Opacity of the top-left sheen (0 for none).'),
    shape: z.enum(['square', 'rounded', 'circle']).default(mod.defaults.shape).describe('Tile shape.'),
  }).strict(),
);
