/** Catalog manifest and params schema for the `screenshot@1` extra (Node side). */
import { z } from 'zod';
import { defineGeneratorManifest } from '../../node/define.js';
import { FALLBACK_IDS, meta as mod } from './meta.js';

/** A 12×8 PNG (blue sky, red block top right, green ground): the fingerprint renders its crop path. Frozen with `screenshot@1`. */
const FIXTURE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAwAAAAICAIAAABChommAAAAIElEQVR42mPQqLiDFZ3Q0IAjhkGiCBkRqWiBDUFElCIAh419AXBG8hsAAAAASUVORK5CYII=';

export default defineGeneratorManifest(
  mod,
  // The CLI has no web server: it reads the app's static files from the project's disk.
  async (ctx) => {
    const [m, a] = await Promise.all([import('./v1.js'), import('../../node/assets.js')]);
    return { default: m.createScreenshot({ fetch: a.assetFetch(ctx?.dir ? { root: ctx.dir } : {}) }) };
  },
  {
    name: 'Screenshot (extra)',
    description: "A key screenshot as the thumbnail, cropped to the region that identifies the item (a game's signature moment), with a generated sigil when there is none.",
    category: 'content', role: 'generator',
    upstream: { name: 'sigilsmith', url: null, npm: null, lastRelease: null, maintenance: 'active' },
    license: { spdx: 'MIT', mitCompatible: true, restrictions: [], notes: 'The screenshots are the app\'s own files.' },
    runtime: { browser: true, node: true, edge: true, webgpu: false, network: true },
    cost: { model: 'free', notes: 'Fetches the app\'s own screenshot files.' }, requiresSecret: false,
    style: 'illustrative', semanticLevel: 'metadata',
    sizeRange: { minPx: 32, maxPx: 512, basis: 'estimate' }, outputFormat: ['svg'],
    latency: { typicalMs: 20, basis: 'estimate' },
    usage: 'Items carry `screenshot` (a URL of a small key frame) and optionally `screenshotFocus` ("x,y", "x,y,zoom" or "x,y,w,h"; fractions ≤ 1, else pixels). Guard the rule so items without one keep the app\'s own sigil: {"when": {"screenshot": {"exists": true}}, "use": "screenshot@1"}. Unguarded, it draws its `fallback` generator.',
    verdictReason: 'Extra: outside the kernel, shipped only when the config selects it.',
  },
  z.object({
    focus: z.string().default(mod.defaults.focus).describe('Focus when the item has none: "x,y" (point), "x,y,zoom" or "x,y,w,h" (rectangle); fractions when every coordinate is ≤ 1, else pixels.'),
    zoom: z.number().min(1).max(16).default(mod.defaults.zoom).describe('Magnification around a focus point (1: the largest square that fits).'),
    shape: z.enum(['square', 'rounded', 'circle']).default(mod.defaults.shape).describe('Tile shape.'),
    ring: z.number().min(0).max(20).default(mod.defaults.ring).describe('Ring in the item\'s identity colour (viewBox units; 0 for none).'),
    pixelated: z.boolean().default(mod.defaults.pixelated).describe('Keep hard pixel edges when zoomed (pixel-art games).'),
    fallback: z.enum(FALLBACK_IDS).default(mod.defaults.fallback).describe('Generator drawn, at its defaults, for an item with no screenshot.'),
    maxBytes: z.number().int().positive().default(mod.defaults.maxBytes).describe('Refuse screenshot files larger than this.'),
  }).strict(),
  {
    tier: 'extra',
    fixtures: [
      { fields: { src: FIXTURE, key: 'pong', label: 'Pong' } },
      { fields: { src: FIXTURE, focus: '0.83,0.25,2', key: 'pong', label: 'Pong' }, params: { shape: 'circle', ring: 4, pixelated: true } },
      { fields: { src: FIXTURE, focus: '0,4,12,4', key: 'tetris', label: 'Tetris' }, params: { shape: 'square' } },
    ],
    implies: (params) => [`${String(params.fallback)}@1`],
  },
);
