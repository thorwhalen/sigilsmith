/**
 * Golden vectors (B3): every released generator major must keep drawing exactly the
 * same bytes, and the kernel must keep choosing the same key, generator, inputs and
 * params for the same item. Two layers:
 *
 * - per generator (`tests/golden/<id>-v<N>.json`): the module alone, default and
 *   non-default params;
 * - end to end (`tests/golden/kernel-v1.json`): items through `createSigil` with
 *   composite keys, inputs, presets, weighted rules and params, so a change to key
 *   canonicalization, input selection, layering, selection or palette fails here.
 *
 * A missing golden file fails. Write it deliberately with `UPDATE_GOLDEN=1 npx vitest
 * run tests/golden.test.ts`, and never for a released major: ship a new major instead.
 * `UPDATE_GOLDEN=<name>` (e.g. `screenshot-v1`) rewrites that one existing file, for a
 * major that has not been released yet.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/hash.js';
import { BUILTINS } from '../src/node/builtins.js';
import { fingerprint, GOLDEN_SEEDS, renderModule } from '../src/node/build.js';
import { createSigil } from '../src/index.js';
import type { ResolvedConfig } from '../src/types.js';
import { baseConfig, loaders } from './fixtures.js';

function matchGolden(name: string, value: unknown) {
  const file = new URL(`./golden/${name}.json`, import.meta.url);
  const update = process.env.UPDATE_GOLDEN;
  if ((update && !existsSync(file)) || update === name) writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
  if (!existsSync(file)) throw new Error(`missing golden file tests/golden/${name}.json; write it deliberately with UPDATE_GOLDEN=1`);
  expect(value).toEqual(JSON.parse(readFileSync(file, 'utf8')));
}

/** Non-default params per generator, so golden vectors cover more than the defaults. */
const ALT_PARAMS: Record<string, Record<string, unknown>> = {
  'grid@1': { cells: 7, density: 0.35, shape: 'circle' },
  'rings@1': { rings: 6, shape: 'square', stroke: 4 },
  'shapes@1': { count: 5, shape: 'circle' },
  'initials@1': { maxLetters: 3, tone: 'soft' },
  'emoji@1': { keywords: false, shape: 'circle' },
  'minidenticons@1': { saturation: 30, lightness: 60, background: 'none' },
  // No `screenshot` field in the golden harness: this freezes the fallback path (the crop path is frozen in screenshot.test.ts).
  'screenshot@1': { fallback: 'rings', shape: 'circle', ring: 3 },
  'aura@1': { hues: [200, 20], spots: 5, saturation: 70, lightness: 50, opacity: 0.8, baseSaturation: 20, baseLightness: 30, blur: 0, blurPx: 6, saturate: 1, highlight: 0, shape: 'circle' },
  'badge@1': { icon: 'film', shape: 'circle', tone: 'soft', maxCaption: 3 },
  'glyph@1': { hue: 200, chroma: 0.2, tone: 'dark', shape: 'star', size: 0.7, fill: 'stripes', rings: 2, orbit: 5, mark: 'pulse', rotation: 15, jitter: 0.5, tile: 'circle', accentShift: 30 },
};

/**
 * `glyph@1` is the generator feature mappings drive, so every channel's output is frozen,
 * not only the defaults: every shape with every fill, every mark, and the extremes of
 * rings, orbit, size, tone, tile, hue and accent.
 */
const GLYPH_MATRIX: Array<Record<string, unknown>> = (() => {
  const shapes = ['circle', 'triangle', 'square', 'diamond', 'pentagon', 'hexagon', 'star', 'flower', 'blob'];
  const fills = ['solid', 'outline', 'stripes', 'dots', 'half'];
  const marks = ['none', 'sine', 'zigzag', 'steps', 'pulse', 'noise'];
  const out: Array<Record<string, unknown>> = [];
  shapes.forEach((shape, i) => fills.forEach((fill, j) => out.push({ shape, fill, mark: marks[(i + j) % marks.length], hue: (i * 40 + j * 7) % 360, rings: (i + j) % 4, orbit: (i * 3 + j) % 9, tone: (i + j) % 2 ? 'dark' : 'light', size: 0.2 + ((i * 5 + j) % 14) * 0.05, accentShift: (i * 30 + j * 11) % 360 })));
  for (const tile of ['square', 'rounded', 'circle']) out.push({ tile, shape: 'hexagon', size: 0.85, rings: 3, orbit: 8, mark: 'sine' });
  out.push({ hue: -1, chroma: 0, jitter: 0 }, { hue: 359, chroma: 0.3, jitter: 1, rotation: -360 }, { size: 0.24, rings: 0, orbit: 1, mark: 'noise', shape: 'blob' });
  return out;
})();

async function glyphMatrixHashes(): Promise<string[]> {
  const module = await BUILTINS.find((b) => b.manifest.ref === 'glyph@1')!.load();
  const out: string[] = [];
  for (const [i, params] of GLYPH_MATRIX.entries()) {
    const img = await renderModule(module, GOLDEN_SEEDS[i % GOLDEN_SEEDS.length]!, params);
    out.push(await sha256Hex(img.type === 'svg' ? img.svg : img.type));
  }
  return out;
}

describe('golden glyph@1 matrix (every channel)', () => {
  it('matches its golden vectors', async () => {
    matchGolden('glyph-v1-matrix', { params: GLYPH_MATRIX, hashes: await glyphMatrixHashes() });
  });
  it('does not depend on the last bit of Math.cos / Math.sin (engines differ there)', async () => {
    const base = await glyphMatrixHashes();
    const { cos, sin } = Math;
    for (const dir of [1, -1]) {
      const nudge = (f: (x: number) => number) => (x: number) => {
        const y = f(x);
        return y + dir * Math.abs(y) * Number.EPSILON;
      };
      Math.cos = nudge(cos);
      Math.sin = nudge(sin);
      try {
        expect(await glyphMatrixHashes()).toEqual(base);
      } finally {
        Math.cos = cos;
        Math.sin = sin;
      }
    }
  });
});

for (const b of BUILTINS) {
  const ref = b.manifest.ref!;
  describe(`golden ${ref}`, () => {
    it('renders the same bytes twice (determinism)', async () => {
      const module = await b.load();
      for (const s of GOLDEN_SEEDS) expect(await renderModule(module, s)).toEqual(await renderModule(module, s));
    });
    it('matches its golden vectors', async () => {
      const module = await b.load();
      const hashes: Record<string, string> = {};
      for (const s of GOLDEN_SEEDS) {
        const img = await renderModule(module, s);
        hashes[s] = await sha256Hex(img.type === 'svg' ? img.svg : img.type);
      }
      const alt: Record<string, string> = {};
      for (const s of GOLDEN_SEEDS) {
        const img = await renderModule(module, s, ALT_PARAMS[ref]);
        alt[s] = await sha256Hex(img.type === 'svg' ? img.svg : img.type);
      }
      matchGolden(ref.replace('@', '-v'), { ref, fingerprint: await fingerprint(module, b.fixtures), hashes, altParams: ALT_PARAMS[ref], alt });
    });
  });
}

describe('golden kernel (end to end through createSigil)', () => {
  it('keeps keys, selection, inputs, params and bytes stable', async () => {
    const cfg: ResolvedConfig = {
      ...baseConfig,
      key: { spec: { kind: 'fields', fields: ['artist', 'title'] }, fallback: ['id'], onMissing: 'fallback' },
      generators: { 'grid@1': { params: { cells: 7 } }, 'emoji@1': { inputs: ['title', 'tags'] } },
      policy: { ...baseConfig.policy, rules: [
        { when: { type: 'video' }, use: 'rings@1', params: { 'rings@1': { rings: 3 } } },
        { when: { type: 'song' }, use: { 'emoji@1': 1, 'shapes@1': 2, 'initials@1': 1 } },
        { when: { tags: { includes: 'live' } }, use: 'minidenticons@1' },
      ] },
    };
    const sigil = createSigil({ config: cfg, generators: loaders });
    const items = [
      { artist: 'New Order', title: 'Blue Monday', type: 'song', tags: ['dance'] },
      { artist: 'Lighthouse Family', title: 'Ocean Drive', type: 'song' },
      { artist: 'Beethoven', title: 'Moonlight Sonata', type: 'song', lyrics: 'none' },
      { artist: 'A', title: 'Keynote', type: 'video' },
      { artist: 'B', title: 'Gig', type: 'set', tags: ['live'] },
      { id: 'no-artist', title: 'Orphan', type: 'doc' },
      { artist: 'Ada Lovelace', title: 'Notes', type: 'user', name: 'Ada King Lovelace' },
      { artist: 'Ωμέγα', title: '🎵 Ünïcode', type: 'song' },
    ];
    const out = [];
    for (const item of items) {
      const p = await sigil.plan(item);
      const img = await sigil.renderPlan(p);
      out.push({ key: p.key, via: p.selection.via, ref: p.selection.ref, seed: p.seed, params: p.params, svg: await sha256Hex(img.type === 'svg' ? img.svg : '') });
    }
    matchGolden('kernel-v1', out);
  });
});

describe('golden features (end to end through createSigil with planFeatures)', () => {
  it('keeps encoded params, provenance, inputs digests and bytes stable', async () => {
    const { planFeatures } = await import('../src/features.js');
    const { idsOf } = await import('../src/ids.js');
    const cfg: ResolvedConfig = {
      ...baseConfig,
      itemTypeField: 'kind',
      policy: { ...baseConfig.policy, rules: [] },
      features: [{
        when: { kind: 'instrument' },
        field: 'features',
        schema: { dims: {
          family: { kind: 'categorical', values: ['wind', 'string', 'drum'] },
          register: { kind: 'ordinal', levels: ['low', 'mid', 'high'], default: 'mid' },
          voices: { kind: 'numeric', min: 0, max: 6, default: 0 },
          chords: { kind: 'binary', default: false },
        } },
        mapping: { use: 'glyph@1', encodings: {
          'glyph@1': {
            shape: { from: 'family', map: { wind: 'flower', string: 'star', drum: 'square' } },
            hue: [{ from: 'family', map: { drum: 20 } }, { from: 'register', map: { low: 250, mid: 200, high: 150 } }],
            size: { from: 'register', range: [0.7, 0.45] },
            orbit: { from: 'voices', range: [0, 6], round: true },
            fill: { from: 'chords', map: { true: 'stripes', false: 'solid' } },
            mark: { value: 'sine' },
            'palette.chroma': { value: 0.12 },
          },
        } },
        vectors: { tabled: { family: 'string', register: 'low', voices: 3, chords: true } },
      }],
    };
    const sigil = createSigil({ config: cfg, generators: { ...loaders, 'glyph@1': () => import('../src/generators/glyph/v1.js') }, features: planFeatures, onWarn: () => {} });
    const items = [
      { id: 'flute', kind: 'instrument', features: { family: 'wind', register: 'high', voices: 1 } },
      { id: 'cello', kind: 'instrument', features: { family: 'string', register: 'low', voices: 2, chords: true } },
      { id: 'kick', kind: 'instrument', features: { family: 'drum', voices: 0 } },
      { id: 'tabled', kind: 'instrument' },
      { id: 'bare', kind: 'instrument' },
      { id: 'song', kind: 'song', title: 'Not an instrument' },
    ];
    const out = [];
    for (const item of items) {
      const plan = await sigil.plan(item);
      const img = await sigil.renderPlan(plan, 64);
      out.push({
        id: item.id,
        ref: plan.selection.ref,
        via: plan.selection.via,
        params: plan.params,
        layers: Object.fromEntries(plan.provenance.map((p) => [p.path, p.layer])),
        features: plan.features ?? null,
        seed: plan.seed,
        ids: await idsOf(plan),
        svg: await sha256Hex(img.type === 'svg' ? img.svg : img.type),
      });
    }
    matchGolden('features-v1', out);
  });
});
