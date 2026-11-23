/** Catalog manifest and params schema for `badge@1` (Node side). */
import { z } from 'zod';
import { defineGeneratorManifest } from '../../node/define.js';
import { BADGE_ICONS, meta as mod } from './meta.js';

export default defineGeneratorManifest(
  mod,
  () => import('./v1.js'),
  {
    name: 'Badge', description: 'An icon for what kind of item it is (film, music, doc, person, folder, image, video, book, mic, game) and an optional caption (a year, an extension) on a tile coloured from the key: the typed placeholder apps hand-draw.',
    category: 'icon', role: 'generator',
    upstream: { name: 'sigilsmith', url: null, npm: null, lastRelease: null, maintenance: 'active' },
    license: { spdx: 'MIT', mitCompatible: true, restrictions: [], notes: '' },
    runtime: { browser: true, node: true, edge: true, webgpu: false, network: false },
    cost: { model: 'free', notes: 'The caption uses SVG <text>: markup is deterministic, pixels depend on the viewer\'s fonts.' }, requiresSecret: false,
    style: 'geometric', semanticLevel: 'metadata',
    sizeRange: { minPx: 24, maxPx: 256, basis: 'estimate' }, outputFormat: ['svg'],
    latency: { typicalMs: 0.05, basis: 'estimate' },
    usage: 'Pick `icon` per item type with rules; map a fact to the caption: `"inputs": ["$key", { "field": "year", "as": "caption" }]`.',
  },
  z.object({
    icon: z.enum(BADGE_ICONS).default(mod.defaults.icon).describe('What kind of item this is.'),
    shape: z.enum(['square', 'rounded', 'circle']).default(mod.defaults.shape).describe('Tile shape.'),
    tone: z.enum(['solid', 'soft']).default(mod.defaults.tone).describe('solid: white on colour; soft: dark on tint.'),
    maxCaption: z.number().int().min(1).max(12).default(mod.defaults.maxCaption).describe('Longest caption shown (characters).'),
    fontFamily: z.string().default(mod.defaults.fontFamily).describe('CSS font stack for the caption.'),
  }).strict(),
  // The golden seeds carry no caption: these freeze the caption path too.
  { fixtures: [{ fields: { key: 'tt0068646', caption: '1972' } }, { fields: { key: 'f1', caption: 'markdown' }, params: { icon: 'doc', maxCaption: 4 } }, { fields: { key: 'x', caption: 'v2' }, params: { icon: 'none' } }] },
);
