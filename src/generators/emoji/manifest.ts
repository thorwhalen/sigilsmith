/** Catalog manifest and params schema for `emoji@1` (Node side). */
import { z } from 'zod';
import { defineGeneratorManifest } from '../../node/define.js';
import mod from './v1.js';

export default defineGeneratorManifest(
  mod,
  {
    name: 'Emoji tile', description: 'An emoji chosen by keyword (label words, tags) or by hash, on a tinted tile (Notion/Slack style).',
    category: 'emoji', role: 'generator',
    upstream: { name: 'sigilsmith', url: null, npm: null, lastRelease: null, maintenance: 'active' },
    license: { spdx: 'MIT', mitCompatible: true, restrictions: [], notes: 'Glyphs are drawn by the viewer\'s emoji font; no emoji artwork is shipped.' },
    runtime: { browser: true, node: true, edge: true, webgpu: false, network: false },
    cost: { model: 'free', notes: 'Choice is deterministic, pixels are not (system emoji fonts differ).' }, requiresSecret: false,
    style: 'illustrative', semanticLevel: 'metadata',
    sizeRange: { minPx: 20, maxPx: 128, basis: 'estimate' }, outputFormat: ['svg'],
    latency: { typicalMs: 0.05, basis: 'estimate' },
  },
  z.object({
    shape: z.enum(['square', 'rounded', 'circle']).default(mod.defaults.shape).describe('Tile shape.'),
    keywords: z.boolean().default(mod.defaults.keywords).describe('Match label words and tags before the hash pick.'),
  }).strict(),
);
