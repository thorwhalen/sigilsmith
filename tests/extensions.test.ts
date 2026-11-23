/**
 * Extensions (#12): a generator module outside sigilsmith, named in the config, seen by
 * catalog, build, explain and check like a built-in. The migration use: an app wraps its own
 * hand-rolled thumbnail so moving to sigilsmith changes no image.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { registerExtensions } from '../src/node/builtins.js';
import { loadConfig } from '../src/node/config.js';
import { runOperation } from '../src/node/operations.js';
import { makeProject } from './project.js';

afterEach(() => registerExtensions([]));

/** An app's own orb, as plain JS: the hash and the drawing it always had. */
const ORB = `
const hash = (s) => { let h = 0; for (const c of s) h = (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0; return h; };
export default {
  id: 'app-orb', major: 1, kind: 'hash', determinism: 'pure',
  defaults: { hues: [268, 300, 330], blur: 6 }, defaultInputs: ['$key'],
  catalog: { name: 'App orb', description: 'The app\\'s own orb, kept as it was.', gzipBytes: 420, license: 'MIT' },
  render({ seed, params }) {
    const hue = params.hues[hash(seed) % params.hues.length];
    return { type: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="hsl(' + hue + ' 60% 40%)"/></svg>' };
  },
};
`;

const project = (cfg: Record<string, unknown>) => {
  const dir = makeProject({ key: { field: 'id' }, extensions: ['./src/sigils/orb.mjs'], policy: { default: 'app-orb@1' }, budget: { maxGzipBytes: 20000 }, ...cfg });
  mkdirSync(join(dir, 'src', 'sigils'), { recursive: true });
  writeFileSync(join(dir, 'src', 'sigils', 'orb.mjs'), ORB);
  return dir;
};

describe('extensions', () => {
  it('load with the config, show in the catalog, and draw', async () => {
    const dir = project({});
    registerExtensions([]); // a fresh process: the catalog command alone must find them
    const cat = await runOperation('catalog', { implemented: true }, { cwd: dir });
    expect(cat.data.results.find((r: { ref?: string }) => r.ref === 'app-orb@1')).toMatchObject({ name: 'App orb', tier: 'extension' });
    const loaded = await loadConfig(undefined, dir);
    expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const ex = await runOperation('explain', { item: { id: 'song-1' } }, { cwd: dir });
    expect(ex.data.explanations[0].generator.ref).toBe('app-orb@1');
  });
  it('are imported by the wiring module relative to it, and counted in the budget at their declared size', async () => {
    const dir = project({});
    const built = await runOperation('build', {}, { cwd: dir });
    expect(built.ok).toBe(true);
    const gen = readFileSync(join(dir, 'src', 'sigilsmith.gen.ts'), 'utf8');
    expect(gen).toContain("'app-orb@1': () => import('./sigils/orb.mjs')");
    const chk = await runOperation('check', { only: ['budget', 'identity'] }, { cwd: dir });
    expect(chk.data.budget.generators['app-orb@1']).toBe(420);
    expect(chk.diagnostics.filter((d: { severity: string }) => d.severity === 'error')).toEqual([]);
  });
  it('have their params checked against their defaults', async () => {
    const dir = project({ generators: { 'app-orb@1': { params: { blur: 'soft' } } } });
    const loaded = await loadConfig(undefined, dir);
    expect(loaded.diagnostics.some((d) => d.severity === 'error' && d.code === 'SGS0302' && /blur/.test(String(d.where?.path)))).toBe(true);
  });
  it('say what is wrong: missing, not a generator, or a ref already taken', async () => {
    const missing = await loadConfig(undefined, makeProject({ key: { field: 'id' }, extensions: ['./nope.mjs'], policy: { default: 'grid@1' } }));
    expect(missing.diagnostics.map((d) => d.code)).toContain('SGS0112');
    const dir = makeProject({ key: { field: 'id' }, extensions: ['./bad.mjs', './clash.mjs'], policy: { default: 'grid@1' } });
    writeFileSync(join(dir, 'bad.mjs'), 'export default { hello: 1 };');
    writeFileSync(join(dir, 'clash.mjs'), ORB.replace("id: 'app-orb'", "id: 'grid'"));
    const codes = (await loadConfig(undefined, dir)).diagnostics.map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['SGS0112', 'SGS0113']));
  });
  it('belong to the project that named them: loading another config drops them', async () => {
    await loadConfig(undefined, project({}));
    const other = await loadConfig(undefined, makeProject({ key: { field: 'id' }, policy: { default: 'app-orb@1' } }));
    expect(other.diagnostics.map((d) => d.code)).toContain('SGS0104');
  });
});
