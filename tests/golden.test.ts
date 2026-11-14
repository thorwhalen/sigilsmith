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
  if (process.env.UPDATE_GOLDEN && !existsSync(file)) writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
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
};

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
      matchGolden(ref.replace('@', '-v'), { ref, fingerprint: await fingerprint(module), hashes, altParams: ALT_PARAMS[ref], alt });
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
