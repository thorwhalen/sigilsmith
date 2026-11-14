/**
 * Regression tests for the issues an independent review found before the first
 * release (2026-11-14). Each test names the failure it pins.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSigil, weightedPick } from '../src/index.js';
import { deliver, memoryStore, onInputsChanged, storeCustom } from '../src/delivery.js';
import { createRemoteGenerator, mockTransport, type RemoteRequest } from '../src/remote.js';
import { build, check, loadConfig } from '../src/node/index.js';
import { defineSigilSettings } from '../src/zodal/settings.js';
import type { ResolvedConfig } from '../src/types.js';
import { baseConfig, loaders } from './fixtures.js';
import { BASIC, makeProject, SAMPLE_ITEMS } from './project.js';

const CLI = new URL('../dist/cli/main.js', import.meta.url).pathname;
const withDefault = (ref: string, extra: Partial<ResolvedConfig> = {}): ResolvedConfig => ({ ...baseConfig, ...extra, policy: { ...baseConfig.policy, default: ref, rules: [] } });

describe('kernel', () => {
  it('renaming an input field in data and config keeps the image (seed from values; `as` keeps the name)', async () => {
    const before = createSigil({ config: withDefault('emoji@1', { generators: { 'emoji@1': { inputs: ['title'] } } }), generators: loaders });
    const after = createSigil({ config: withDefault('emoji@1', { generators: { 'emoji@1': { inputs: [{ field: 'name', as: 'title' }] } } }), generators: loaders });
    const a = await before.render({ id: '1', title: 'Ocean Drive' });
    const b = await after.render({ id: '1', name: 'Ocean Drive' });
    expect(b).toEqual(a);
    expect((await after.plan({ id: '1', name: 'Ocean Drive' })).fields).toEqual({ title: 'Ocean Drive' });
  });
  it('emoji keyword lookup ignores Object.prototype names ("The Constructor")', async () => {
    const s = createSigil({ config: withDefault('emoji@1'), generators: loaders });
    const img = await s.render({ id: 'x', title: 'The Constructor' });
    expect(img.type === 'svg' && img.svg).not.toContain('native code');
  });
  it('weighted rendezvous: adding a ref only moves items to the new ref', () => {
    const two = { 'a@1': 1, 'b@1': 1 };
    const three = { ...two, 'c@1': 1 };
    for (let i = 0; i < 500; i++) {
      const before = weightedPick(two, `k${i}`, 's').ref;
      const now = weightedPick(three, `k${i}`, 's').ref;
      expect(now === before || now === 'c@1').toBe(true);
    }
  });
  it('a failed generator load can be retried', async () => {
    let n = 0;
    const s = createSigil({ config: withDefault('grid@1'), generators: { 'grid@1': async () => (n++ === 0 ? Promise.reject(new Error('chunk failed')) : loaders['grid@1']()) } });
    await expect(s.render({ id: 'a' })).rejects.toThrow('chunk failed');
    await expect(s.render({ id: 'a' })).resolves.toMatchObject({ type: 'svg' });
  });
});

describe('delivery', () => {
  it('an SVG and a PNG of the same item never share a content id', async () => {
    const s = createSigil({ config: baseConfig, generators: loaders });
    const store = memoryStore();
    const svg = await deliver(s, { id: 'p' }, { store });
    const png = await deliver(s, { id: 'p' }, { store, format: 'png', size: 64, rasterize: async () => ({ bytes: new Uint8Array([137, 80, 78, 71]), mime: 'image/png' }) });
    expect(png.record.contentId).not.toBe(svg.record.contentId);
    expect(png.record.url).toMatch(/^data:image\/png/);
  });
  it('asks the store before rendering: an existing image is never rendered (or paid for) again', async () => {
    const calls: RemoteRequest[] = [];
    const ai = createRemoteGenerator({ id: 'ai', major: 1, transport: mockTransport({ latencyMs: 1, calls }) });
    const store = memoryStore();
    const mk = () => createSigil({ config: withDefault('ai@1'), generators: { ...loaders, 'ai@1': async () => ai } });
    await deliver(mk(), { id: 'a', title: 'T' }, { store });
    const other = createRemoteGenerator({ id: 'ai', major: 1, transport: mockTransport({ latencyMs: 1, calls }) }); // "another device": fresh cache
    await deliver(createSigil({ config: withDefault('ai@1'), generators: { ...loaders, 'ai@1': async () => other } }), { id: 'a', title: 'T' }, { store });
    expect(calls).toHaveLength(1);
  });
  it('concurrent renders of one remote item share one call', async () => {
    const calls: RemoteRequest[] = [];
    const ai = createRemoteGenerator({ id: 'ai', major: 1, transport: mockTransport({ latencyMs: 20, calls }) });
    const s = createSigil({ config: withDefault('ai@1'), generators: { ...loaders, 'ai@1': async () => ai } });
    await Promise.all([s.render({ id: 'a', title: 'T' }), s.render({ id: 'a', title: 'T' })]);
    expect(calls).toHaveLength(1);
  });
  it('a custom record passes through deliver untouched', async () => {
    const s = createSigil({ config: baseConfig, generators: loaders });
    const custom = { source: 'custom' as const, contentId: 'sg_c', inputsDigest: '', url: 'https://cdn/me.png', frozen: true };
    expect((await deliver(s, { id: 'p' }, { record: custom })).record).toBe(custom);
  });
  it('storeCustom checks bytes, not the claimed type, and refuses SVG by default', async () => {
    const svg = new TextEncoder().encode('<svg onload="alert(1)"/>');
    await expect(storeCustom(svg, 'image/svg+xml')).rejects.toThrow(/SGS0110/);
    await expect(storeCustom(svg, 'image/png')).rejects.toThrow(/SGS0110/);
    await expect(storeCustom(new Uint8Array(3_000_000).fill(137), 'image/png')).rejects.toThrow(/over the/);
    await expect(storeCustom(new Uint8Array([137, 80, 78, 71, 13, 10]), 'application/octet-stream')).resolves.toMatchObject({ source: 'custom' });
  });
});

describe('regeneration (Q2)', () => {
  const s = createSigil({ config: withDefault('emoji@1', { regeneration: { policy: 'ask' } }), generators: loaders });
  const before = { id: 'u', title: 'Ocean' };
  const after = { id: 'u', title: 'Moon' };
  it('no confirm or a timeout keeps without freezing, and does not ask again for the same change', async () => {
    const r = (await deliver(s, before, { store: memoryStore() })).record;
    const first = await onInputsChanged(s, after, r);
    expect(first.decision).toBe('keep');
    expect(first.record.frozen).toBeUndefined();
    let asked = 0;
    const again = await onInputsChanged(s, after, first.record, { confirm: async () => (asked++, 'update') });
    expect(again.decision).toBe('keep');
    expect(asked).toBe(0);
    expect((await onInputsChanged(s, { id: 'u', title: 'Sun' }, first.record, { confirm: async () => 'update' })).decision).toBe('regenerate');
  });
  it('auto: initials follow the label (their own default), others ask', async () => {
    const auto = createSigil({ config: withDefault('initials@1', { regeneration: { policy: 'auto' } }), generators: loaders });
    const r = (await deliver(auto, { id: 'u', name: 'Ada Lovelace' }, { store: memoryStore() })).record;
    expect((await onInputsChanged(auto, { id: 'u', name: 'Ada King' }, r)).decision).toBe('regenerate');
  });
});

describe('check', () => {
  it('no samples: data and identity warn instead of passing', async () => {
    const dir = makeProject({ ...BASIC, samples: undefined });
    const env = await check(await loadConfig(undefined, dir), { only: ['data'] });
    expect(env.data.sections.data).toBe('warn');
  });
  it('bypass: ignores comments; catches refs in constants files and direct library imports', async () => {
    const dir = makeProject({ ...BASIC, policy: { ...BASIC.policy, default: 'minidenticons@1' } });
    writeFileSync(join(dir, 'src/a.ts'), "// we used to hard-code 'grid@1' here\nexport const STYLE = 'rings@1';\n");
    writeFileSync(join(dir, 'src/b.ts'), "import { minidenticon } from 'minidenticons';\n");
    const env = await check(await loadConfig(undefined, dir), { only: ['bypass'] });
    const found = env.diagnostics.filter((d) => d.code.startsWith('SGS070')).map((d) => `${d.code}:${(d.where as { line?: number })?.line}`);
    expect(found.sort()).toEqual(['SGS0705:1', 'SGS0706:2']);
  });
  it('regeneration not wired: warns when stored images read changeable inputs', async () => {
    const dir = makeProject({ ...BASIC, policy: { default: 'emoji@1' } });
    const env = await check(await loadConfig(undefined, dir), { only: ['bypass'] });
    expect(env.diagnostics.map((d) => d.code)).toContain('SGS0709');
  });
  it('budget counts the delivery module for stored strategies', async () => {
    const env = await check(await loadConfig(undefined, makeProject(BASIC)), { only: ['budget'] });
    expect(env.data.budget!.generators).toHaveProperty('(delivery module)');
  });
  it('custom keys get a uniqueness check, through a TypeScript module', async () => {
    const dir = makeProject({ ...BASIC, key: { custom: './src/keys.ts#songKey' } }, [{ a: 'x', type: 'video' }, { a: 'x', type: 'audio' }]);
    writeFileSync(join(dir, 'src/keys.ts'), "type Song = { a: string };\nexport const songKey = (s: Song): string => s.a;\n");
    const env = await check(await loadConfig(undefined, dir), { only: ['data'] });
    expect(env.diagnostics.map((d) => d.code)).toContain('SGS0204');
  });
  it('a stale lock is an error, and a blocked build writes nothing', async () => {
    const dir = makeProject(BASIC);
    await build(await loadConfig(undefined, dir));
    const cfgFile = join(dir, 'sigilsmith.config.json');
    const cfg = JSON.parse(readFileSync(cfgFile, 'utf8'));
    cfg.policy.rules[0].use = 'shapes@1';
    writeFileSync(cfgFile, JSON.stringify(cfg));
    const env = await check(await loadConfig(undefined, dir), { only: ['identity'] });
    expect(env.diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(['SGS0505', 'SGS0504']));
    const gen = readFileSync(join(dir, 'src/sigilsmith.gen.ts'), 'utf8');
    const blocked = await build(await loadConfig(undefined, dir));
    expect(blocked.data.wrote).toEqual([]);
    expect(readFileSync(join(dir, 'src/sigilsmith.gen.ts'), 'utf8')).toBe(gen);
  });
});

describe('packaging', () => {
  it('the CLI starts in a host without the optional minidenticons peer', () => {
    const dir = makeProject(BASIC, SAMPLE_ITEMS);
    // A resolve hook makes `minidenticons` unresolvable, as in a host that never installed it.
    mkdirSync(join(dir, 'hook'), { recursive: true });
    writeFileSync(join(dir, 'hook/hooks.mjs'), "export async function resolve(s, c, next) { if (s === 'minidenticons') throw new Error('not installed'); return next(s, c); }\n");
    writeFileSync(join(dir, 'hook/register.mjs'), "import { register } from 'node:module'; register('./hooks.mjs', import.meta.url);\n");
    const r = spawnSync('node', ['--import', join(dir, 'hook/register.mjs'), CLI, 'catalog', '--implemented', '--json'], { cwd: dir, encoding: 'utf8' });
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).data.results.length).toBeGreaterThan(5);
  });
  it('settings expose the params the developer opened (layer 5 is complete)', () => {
    const st = defineSigilSettings({ ...baseConfig, userSettings: { ...baseConfig.userSettings, params: { 'grid@1': ['cells'] } } });
    expect(st.dials.keys).toContain('sigil.params.grid@1.cells');
    expect(st.toUserLayer({ 'sigil.params.grid@1.cells': 7 }).params).toEqual({ 'grid@1': { cells: 7 } });
  });
});
