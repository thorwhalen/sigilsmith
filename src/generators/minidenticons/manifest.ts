/** Catalog manifest and params schema for `minidenticons@1` (Node side). */
import { z } from 'zod';
import { defineGeneratorManifest } from '../../node/define.js';
import mod from './v1.js';

export default defineGeneratorManifest(
  mod,
  {
    name: 'Minidenticons (adapter)', description: 'Adapter over the MIT minidenticons library: 5x5 mirrored identicon, 9 hues.',
    category: 'identicon', role: 'generator',
    upstream: { name: 'minidenticons', url: 'https://github.com/laurentpayot/minidenticons', npm: 'minidenticons', lastRelease: '2024-03-01', maintenance: 'stale' },
    license: { spdx: 'MIT', mitCompatible: true, restrictions: [], notes: 'Optional peer dependency, installed by the host.' },
    runtime: { browser: true, node: true, edge: true, webgpu: false, network: false },
    cost: { model: 'free', notes: '' }, requiresSecret: false,
    style: 'geometric', semanticLevel: 'hash',
    sizeRange: { minPx: 16, maxPx: 128, basis: 'estimate' }, outputFormat: ['svg'],
    latency: { typicalMs: 0.05, basis: 'estimate' },
    peer: { name: 'minidenticons', version: '4.2.1' },
  },
  z.object({
    saturation: z.number().min(0).max(100).default(mod.defaults.saturation).describe('HSL saturation %.'),
    lightness: z.number().min(0).max(100).default(mod.defaults.lightness).describe('HSL lightness %.'),
    background: z.string().regex(/^(none|#[0-9a-fA-F]{3,8})$/).default(mod.defaults.background).describe('Tile colour, or `none`.'),
  }).strict(),
);
