/** Feature-driven sigils: schema, encodings, the kernel's `features` layer, config files, check. */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSigil } from '../src/index.js';
import { encodeFeatures, normalizeFeature, planFeatures, type FeatureSchema, type FeatureSet } from '../src/features.js';
import { dicebearTransport } from '../src/remote.js';
import { idsOf } from '../src/ids.js';
import { build, check, explainItems, loadConfig } from '../src/node/index.js';
import type { ResolvedConfig } from '../src/types.js';
import { baseConfig, loaders } from './fixtures.js';
import { makeProject } from './project.js';

const schema: FeatureSchema = {
  dims: {
    family: { kind: 'categorical', values: ['wind', 'string', 'drum'] },
    register: { kind: 'ordinal', levels: ['low', 'mid', 'high'], default: 'mid' },
    voices: { kind: 'numeric', min: 1, max: 4 },
    percussive: { kind: 'binary', default: false },
  },
};
const mapping = {
  use: 'glyph@1',
  encodings: {
    'glyph@1': {
      hue: { from: 'family', map: { wind: 200, string: 30, drum: 340 } },
      tone: { from: 'register', map: { low: 'dark', mid: 'dark', high: 'light' } },
      orbit: { from: 'voices', range: [0, 6] as [number, number], round: true },
      mark: { from: 'percussive', map: { true: 'pulse', false: 'sine' } },
      size: { from: 'register', range: [0.7, 0.4] as [number, number] },
      tile: { value: 'circle' },
    },
  },
};
const flute = { id: 'flute', type: 'instrument', name: 'Flute', features: { family: 'wind', register: 'high', voices: 1, percussive: false } };
const drum = { id: 'drum', type: 'instrument', name: 'Drum', features: { family: 'drum', register: 'low', voices: 1, percussive: true } };

describe('feature normalisation and encoding', () => {
  it('normalises each kind to t in [0, 1] and a level', () => {
    expect(normalizeFeature({ kind: 'numeric', min: 0, max: 10 }, 5).value).toEqual({ t: 0.5, level: '5' });
    expect(normalizeFeature({ kind: 'numeric', min: 0, max: 10 }, 15)).toMatchObject({ value: { t: 1 }, problem: expect.stringMatching(/clamped/) });
    expect(normalizeFeature({ kind: 'ordinal', levels: ['a', 'b', 'c'] }, 'c').value).toEqual({ t: 1, level: 'c' });
    expect(normalizeFeature({ kind: 'binary' }, true).value).toEqual({ t: 1, level: 'true' });
    expect(normalizeFeature({ kind: 'categorical', values: ['x'] }, 'y').problem).toMatch(/not one of/);
    expect(normalizeFeature({ kind: 'binary', default: false }, undefined).value).toEqual({ t: 0, level: 'false' });
  });
  it('maps, interpolates, rounds, nests dotted paths and reports what it could not encode', () => {
    const r = encodeFeatures(schema, { ...mapping.encodings['glyph@1'], 'options.x': { from: 'family', map: { wind: 1 } } }, flute.features);
    expect(r.params).toEqual({ hue: 200, tone: 'light', orbit: 0, mark: 'sine', size: 0.4, tile: 'circle', options: { x: 1 } });
    expect(r.sources).toMatchObject({ hue: 'family', tile: '=' });
    const missing = encodeFeatures(schema, mapping.encodings['glyph@1'], { family: 'drum' });
    expect(missing.params).toMatchObject({ hue: 340, tone: 'dark', mark: 'sine' });
    expect(missing.problems.join()).toMatch(/voices.*missing/);
  });
});

describe('the features layer in the kernel', () => {
  const set: FeatureSet = { when: { type: 'instrument' }, field: 'features', schema, mapping, vectors: { tabled: { family: 'string', register: 'mid', voices: 4, percussive: false } } };
  const config: ResolvedConfig = { ...baseConfig, features: [set] };
  const all = { ...loaders, 'glyph@1': () => import('../src/generators/glyph/v1.js') };
  const sigil = createSigil({ config, generators: all, features: planFeatures, onWarn: () => {} });

  it('selects the mapping generator, layers the params and explains their sources', async () => {
    const p = await sigil.plan(flute);
    expect(p.selection).toEqual({ ref: 'glyph@1', via: 'features:0' });
    expect(p.params).toMatchObject({ hue: 200, tone: 'light', shape: 'circle', tile: 'circle' });
    expect(p.provenance.find((x) => x.path === 'params.hue')).toMatchObject({ layer: 'features' });
    expect(p.features).toMatchObject({ set: 0, via: 'field', sources: { hue: 'family' } });
  });
  it('reads vectors from the table by key, and leaves other items alone', async () => {
    const p = await sigil.plan({ id: 'tabled', type: 'instrument', name: 'Cello' });
    expect(p.features?.via).toBe('table');
    expect(p.params).toMatchObject({ hue: 30, orbit: 6 });
    const song = await sigil.plan({ id: 's', type: 'audio', title: 'x' });
    expect(song.features).toBeUndefined();
    expect(song.selection.via).toBe('rule:1');
  });
  it('draws different features differently; a feature change moves the inputs digest, never the render seed', async () => {
    const [a, b] = await Promise.all([sigil.render(flute), sigil.render(drum)]);
    expect(a).not.toEqual(b);
    const before = await sigil.plan(flute);
    const moved = await sigil.plan({ ...flute, features: { ...flute.features, family: 'string' } });
    expect(moved.seed).toBe(before.seed); // unmapped randomness (rotation, blob) stays put
    expect((await idsOf(moved)).inputsDigest).not.toBe((await idsOf(before)).inputsDigest);
    expect((await idsOf(moved)).contentId).not.toBe((await idsOf(before)).contentId);
  });
  it('a rule still overrides one item\'s feature params', async () => {
    const ruled = createSigil({ config: { ...config, policy: { ...config.policy, rules: [{ when: { id: 'flute' }, use: 'glyph@1', params: { 'glyph@1': { tone: 'dark' } } }] } }, generators: all, features: planFeatures, onWarn: () => {} });
    const p = await ruled.plan(flute);
    expect(p.params.tone).toBe('dark');
    expect(p.provenance.find((x) => x.path === 'params.tone')).toMatchObject({ layer: 'rule:0', shadowed: [{ layer: 'features' }, { layer: 'generator' }] });
  });
  it('tries encoding lists in order, accepts id-keyed encodings, and never writes through __proto__', () => {
    const r = encodeFeatures(schema, { hue: [{ from: 'family', map: { drum: 10 } }, { from: 'register', map: { low: 1, mid: 2, high: 3 } }], ['__proto__.x' as string]: { value: 1 } }, flute.features);
    expect(r.params).toEqual({ hue: 3 });
    expect(r.sources.hue).toBe('register');
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    const byId = planFeatures(flute, 'flute', 'glyph@1', { ...config, features: [{ ...set, mapping: { use: 'glyph@1', encodings: { glyph: { hue: { value: 7 } } } } }] });
    expect(byId?.params).toEqual({ hue: 7 });
  });
  it('without a planner the mapping is ignored, with a warning', async () => {
    const warns: string[] = [];
    const bare = createSigil({ config, generators: all, onWarn: (m) => warns.push(m) });
    expect((await bare.plan(flute)).params.hue).toBe(-1);
    expect(warns.join()).toMatch(/feature planner/);
  });
  it('a config without features plans exactly as before', async () => {
    const before = createSigil({ config: baseConfig, generators: loaders });
    const p = await before.plan({ id: 'x', type: 'audio', title: 'T' });
    expect(p.features).toBeUndefined();
    expect('features' in baseConfig).toBe(false);
  });
});

describe('remote generators take feature options (the light-API seam)', () => {
  it('forwards params.options to DiceBear as query options, sorted', async () => {
    const urls: string[] = [];
    const t = dicebearTransport({ style: 'shapes', fetch: (async (u: string) => { urls.push(u); return new Response('<svg/>', { status: 200 }); }) as unknown as typeof fetch });
    await t({ ref: 'db@1', seed: 's', fields: {}, params: { options: { shape1: ['ellipse', 'polygon'], backgroundColor: '0a5b83', seed: 'raw-key', nested: { a: 1 } } }, size: 64 });
    expect(urls[0]).toMatch(/\/shapes\/svg\?seed=[0-9a-f]{24}&backgroundColor=0a5b83&shape1=ellipse%2Cpolygon$/);
  });
});

describe('feature sets in the config (files, validation, check, build)', () => {
  const items = [flute, drum, { id: 'oboe', type: 'instrument', name: 'Oboe', features: { family: 'wind', register: 'high', voices: 1, percussive: false } }, { id: 'kazoo', type: 'instrument', name: 'Kazoo' }];
  function project(extra: Record<string, unknown> = {}, m: unknown = mapping) {
    const dir = makeProject({ key: { field: 'id' }, policy: { default: 'grid@1' }, features: [{ when: { type: 'instrument' }, schema: 'features.schema.json', mapping: 'features.mapping.json' }], ...extra }, items);
    writeFileSync(join(dir, 'features.schema.json'), JSON.stringify(schema));
    writeFileSync(join(dir, 'features.mapping.json'), JSON.stringify(m));
    return dir;
  }
  it('inlines the files into the resolved config, and hashes their content', async () => {
    const dir = project();
    const l = await loadConfig(undefined, dir);
    expect(l.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(l.resolved!.features![0]!.mapping.use).toBe('glyph@1');
    writeFileSync(join(dir, 'features.mapping.json'), JSON.stringify({ ...mapping, encodings: { 'glyph@1': { hue: { value: 10 } } } }));
    expect((await loadConfig(undefined, dir)).hash).not.toBe(l.hash);
  });
  it('reports stray map keys, numeric maps, non-integer ranges and bad dimensions', async () => {
    const bad = { use: 'glyph@1', encodings: { 'glyph@1': { shape: { from: 'family', map: { wnid: 'star' }, default: 'circle' }, size: { from: 'voices', map: { '1.5': 0.5 } }, orbit: { from: 'voices', range: [0, 3] } } } };
    const msgs = (await loadConfig(undefined, project({}, bad))).diagnostics.map((d) => `${d.code} ${d.message}`).join('\n');
    expect(msgs).toMatch(/SGS0801.*"wnid", which is not a level/);
    expect(msgs).toMatch(/SGS0801.*maps numeric `voices`/);
    expect(msgs).toMatch(/SGS0302.*orbit.*0\.75/);
    const dir = project();
    writeFileSync(join(dir, 'features.schema.json'), JSON.stringify({ dims: { a: { kind: 'numeric', min: 3, max: 1 }, b: { kind: 'categorical', values: ['x'], default: 'y' } } }));
    const dims = (await loadConfig(undefined, dir)).diagnostics.map((d) => d.message).join('\n');
    expect(dims).toMatch(/min \(3\) must be below max/);
    expect(dims).toMatch(/default "y" is not one of x/);
  });
  it('reports unknown dimensions, unmapped levels, impossible params and missing files', async () => {
    const bad = { use: 'glyph@1', encodings: { 'glyph@1': { hue: { from: 'colour', range: [0, 1] }, tone: { from: 'family', map: { wind: 'dark' } }, orbit: { from: 'voices', range: [0, 99] } } } };
    const l = await loadConfig(undefined, project({}, bad));
    const msgs = l.diagnostics.map((d) => `${d.code} ${d.message}`).join('\n');
    expect(msgs).toMatch(/SGS0801.*unknown dimension `colour`/);
    expect(msgs).toMatch(/SGS0801.*no mapping.*string, drum/);
    expect(msgs).toMatch(/SGS0302.*orbit/);
    const gone = await loadConfig(undefined, project({ features: [{ schema: 'nope.json', mapping: 'features.mapping.json' }] }));
    expect(gone.diagnostics.map((d) => d.code)).toContain('SGS0801');
  });
  it('check flags items without vectors and features the mapping cannot tell apart', async () => {
    const dir = project();
    await build(await loadConfig(undefined, dir));
    const env = await check(await loadConfig(undefined, dir), { only: ['data'] });
    const msgs = env.diagnostics.map((d) => `${d.code} ${d.message}`).join('\n');
    expect(msgs).toMatch(/SGS0802.*kazoo.*no feature vector/);
    expect(env.diagnostics.filter((d) => d.code === 'SGS0803' && d.severity === 'warning')).toEqual([]); // flute and oboe share features: same params is right
    expect(msgs).toMatch(/SGS0803 2 items share the same features/);
    const coarse = project({}, { use: 'glyph@1', encodings: { 'glyph@1': { hue: { from: 'register', map: { low: 1, mid: 1, high: 1 } } } } });
    const env2 = await check(await loadConfig(undefined, coarse), { only: ['data'] });
    expect(env2.diagnostics.map((d) => `${d.code} ${d.message}`).join('\n')).toMatch(/SGS0803.*different features get the same params/);
  });
  it('the wiring module passes the planner only when the config has feature sets, and explain shows the vector', async () => {
    const dir = project();
    const loaded = await loadConfig(undefined, dir);
    await build(loaded);
    const gen = readFileSync(join(dir, 'src/sigilsmith.gen.ts'), 'utf8');
    expect(gen).toMatch(/import \{ planFeatures \} from 'sigilsmith\/features';/);
    expect(gen).toMatch(/createSigil\(\{ config, generators, features: planFeatures \}\)/);
    const ex = await explainItems(loaded, [flute]);
    expect(ex.data.explanations[0]!.features).toMatchObject({ sources: { hue: 'family' } });
    const plain = makeProject({ key: { field: 'id' }, policy: { default: 'grid@1' } });
    await build(await loadConfig(undefined, plain));
    expect(readFileSync(join(plain, 'src/sigilsmith.gen.ts'), 'utf8')).not.toMatch(/features/);
  });
});
