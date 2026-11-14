import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { canonicalKey, createSigil, foldLayers, getPath, keyOf, mergePatch, select, selectInputs, SigilKeyError, weightedPick } from '../src/index.js';
import type { ResolvedConfig } from '../src/types.js';
import { baseConfig, loaders } from './fixtures.js';

describe('key resolution (B4.1)', () => {
  it('reads nested paths, including bracketed names', () => {
    expect(getPath({ meta: { uuid: 'u1' } }, 'meta.uuid')).toBe('u1');
    expect(getPath({ meta: { 'a.b': 7 } }, 'meta["a.b"]')).toBe(7);
  });
  it('canonicalizes composite keys unambiguously', () => {
    expect(canonicalKey(['a', 'b c'])).not.toBe(canonicalKey(['a b', 'c']));
    expect(canonicalKey(['x'])).toBe('x');
    expect(canonicalKey([' Café '])).toBe('Café'); // trimmed, NFC
    expect(canonicalKey(['Radiohead', 'Creep', 1992])).toBe('["Radiohead","Creep","1992"]');
  });
  it('resolves field, composite and custom specs', () => {
    expect(keyOf({ id: 42 }, { kind: 'field', field: 'id' }).key).toBe('42');
    expect(keyOf({ artist: 'A', title: 'T' }, { kind: 'fields', fields: ['artist', 'title'] }).key).toBe('["A","T"]');
    expect(keyOf({ x: 1 }, { kind: 'custom', ref: 'k#k' }, { keyFn: (i) => `c-${i.x}` }).key).toBe('c-1');
  });
  it('falls back with a reason, or throws in strict mode', () => {
    const r = keyOf({ title: 'Song', type: 'song' }, { kind: 'field', field: 'id' }, { fallback: ['title', 'type'] });
    expect(r).toMatchObject({ via: 'fallback', missing: ['id'] });
    expect(() => keyOf({ title: 'x' }, { kind: 'field', field: 'id' }, { fallback: ['title'], onMissing: 'throw' })).toThrow(SigilKeyError);
    expect(() => keyOf({}, { kind: 'field', field: 'id' }, { fallback: ['title'] })).toThrow(/nor for any fallback/);
  });
});

describe('input selection (B4.2)', () => {
  it('selects, truncates and records missing fields', () => {
    const r = selectInputs({ title: 'T', lyrics: 'abcdef' }, ['title', { field: 'lyrics', maxChars: 3 }, 'artist'], { key: 'k' });
    expect(r.fields).toEqual({ title: 'T', lyrics: 'abc' });
    expect(r.missing).toEqual(['artist']);
  });
  it('falls back to the key when nothing is present, so the image stays stable', () => {
    expect(selectInputs({}, ['title'], { key: 'k1' }).fields).toEqual({ key: 'k1' });
  });
});

describe('layered defaults (B4.3)', () => {
  it('merges objects, replaces arrays and records provenance', () => {
    const { effective, provenance } = foldLayers([
      { name: 'generator', patch: { inputs: ['$key'], params: { cells: 5, shape: 'rounded' } } },
      { name: 'preset:media', patch: { inputs: ['title'] } },
      { name: 'project', patch: { params: { cells: 7 } } },
      { name: 'rule:0', patch: { params: { shape: 'circle' } } },
    ]);
    expect(effective).toEqual({ inputs: ['title'], params: { cells: 7, shape: 'circle' } });
    const cells = provenance.find((p) => p.path === 'params.cells')!;
    expect(cells).toMatchObject({ layer: 'project', shadowed: [{ layer: 'generator', value: 5 }] });
    expect(provenance.find((p) => p.path === 'inputs')!.layer).toBe('preset:media');
  });
  it('null deletes (RFC 7386)', () => {
    expect(mergePatch({ a: 1, b: 2 }, { a: null })).toEqual({ b: 2 });
  });
  it('end-to-end: the plan reports which layer supplied each param', async () => {
    const sigil = createSigil({ config: baseConfig, generators: loaders, user: { params: { 'grid@1': { cells: 7, density: 0.7 } } } });
    const plan = await sigil.plan({ id: 'p1', type: 'project' });
    expect(plan.params.cells).toBe(7);
    expect(plan.provenance.find((p) => p.path === 'params.cells')!.layer).toBe('user');
    // density is not in userSettings.params, so the user cannot set it
    expect(plan.params.density).toBe(0.5);
  });
  it('media preset makes semantic generators read lyrics for songs, but not hash generators', async () => {
    const cfg: ResolvedConfig = { ...baseConfig, policy: { ...baseConfig.policy, rules: [{ when: { type: 'song' }, use: 'emoji@1' }] } };
    const sigil = createSigil({ config: cfg, generators: loaders });
    const song = { id: 's1', type: 'song', title: 'Ocean Drive', lyrics: 'x'.repeat(5000) };
    const plan = await sigil.plan(song);
    expect(plan.fields.lyrics).toHaveLength(2000);
    expect(plan.provenance.find((p) => p.path === 'inputs')!.layer).toBe('preset:media');
    const grid = await sigil.plan(song, { ref: 'grid@1' });
    expect(grid.inputs).toEqual(['$key']);
  });
});

describe('policy (A6, B3)', () => {
  it('picks by rule, preset, then default', async () => {
    const sigil = createSigil({ config: baseConfig, generators: loaders });
    expect((await sigil.plan({ id: 'v', type: 'video' })).selection).toMatchObject({ ref: 'rings@1', via: 'rule:0' });
    expect((await sigil.plan({ id: 'u', type: 'user', name: 'A B' })).selection).toMatchObject({ ref: 'initials@1', via: 'preset:people' });
    expect((await sigil.plan({ id: 'x', type: 'other' })).selection).toMatchObject({ ref: 'grid@1', via: 'default' });
  });
  it('weighted choice is deterministic per item and proportional across items', () => {
    const w = { 'a@1': 3, 'b@1': 1 };
    expect(weightedPick(w, 'item-1', 's')).toEqual(weightedPick(w, 'item-1', 's'));
    const counts = { 'a@1': 0, 'b@1': 0 } as Record<string, number>;
    for (let i = 0; i < 4000; i++) counts[weightedPick(w, `k${i}`, 's').ref]!++;
    expect(counts['a@1']! / 4000).toBeGreaterThan(0.7);
    expect(counts['a@1']! / 4000).toBeLessThan(0.8);
  });
  it('end-user preference wins only within the allowed choices', () => {
    const allowed = select({ type: 'video' }, 'k', baseConfig, { style: { video: 'shapes@1' } });
    expect(allowed).toMatchObject({ ref: 'shapes@1', via: 'user' });
    const refused = select({ type: 'video' }, 'k', baseConfig, { style: { video: 'emoji@1' } });
    expect(refused.ref).toBe('rings@1');
  });
});

describe('no Math.random in the kernel or generators (B3)', () => {
  it('greps src/', () => {
    const offenders: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f) && /Math\.random\s*\(/.test(readFileSync(p, 'utf8').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''))) offenders.push(p);
      }
    };
    walk(new URL('../src', import.meta.url).pathname);
    expect(offenders).toEqual([]);
  });
});
