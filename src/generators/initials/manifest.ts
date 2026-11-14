/** Catalog manifest and params schema for `initials@1` (Node side). */
import { z } from 'zod';
import { defineGeneratorManifest } from '../../node/define.js';
import mod from './v1.js';

export default defineGeneratorManifest(
  mod,
  {
    name: 'Initials', description: 'Letter avatar: initials of the label, colour from the key (renames change letters, not colour).',
    category: 'initials', role: 'generator',
    upstream: { name: 'sigilsmith', url: null, npm: null, lastRelease: null, maintenance: 'active' },
    license: { spdx: 'MIT', mitCompatible: true, restrictions: [], notes: '' },
    runtime: { browser: true, node: true, edge: true, webgpu: false, network: false },
    cost: { model: 'free', notes: 'Uses SVG <text>: markup is deterministic, pixels depend on the viewer\'s fonts.' }, requiresSecret: false,
    style: 'geometric', semanticLevel: 'metadata',
    sizeRange: { minPx: 20, maxPx: 256, basis: 'estimate' }, outputFormat: ['svg'],
    latency: { typicalMs: 0.05, basis: 'estimate' },
  },
  z.object({
    maxLetters: z.number().int().min(1).max(3).default(mod.defaults.maxLetters).describe('1: first word only; 2+: first and last words.'),
    shape: z.enum(['square', 'rounded', 'circle']).default(mod.defaults.shape).describe('Tile shape.'),
    fontFamily: z.string().default(mod.defaults.fontFamily).describe('CSS font stack.'),
    fontWeight: z.number().int().min(100).max(900).default(mod.defaults.fontWeight).describe('Font weight.'),
    tone: z.enum(['solid', 'soft']).default(mod.defaults.tone).describe('solid: white on colour; soft: dark on tint.'),
  }).strict(),
);
