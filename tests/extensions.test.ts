/**
 * Extensions (#12): a generator module outside sigilsmith, named in the config, seen by
 * catalog, build, explain and check like a built-in. The migration use: an app wraps its own
 * hand-rolled thumbnail so moving to sigilsmith changes no image.
 */
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
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
    const loaded = await loadConfig(undefined, dir);
    expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    // once loaded (by a rendering command or the library), the catalog lists it
    const cat = await runOperation('catalog', { implemented: true }, { cwd: dir });
    expect(cat.data.results.find((r: { ref?: string }) => r.ref === 'app-orb@1')).toMatchObject({ name: 'App orb', tier: 'extension' });
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
  it('a TypeScript extension with extensionless imports loads like the app\'s bundler sees it, and a strict TS build accepts the wiring', async () => {
    const dir = project({ extensions: ['./src/sigils/orb.ts'] });
    symlinkSync(join(process.cwd(), 'node_modules'), join(dir, 'node_modules')); // the host has esbuild, as a Vite app does
    writeFileSync(join(dir, 'src', 'sigils', 'hash.ts'), 'export const hue = (s: string): number => s.length * 40;\n');
    writeFileSync(join(dir, 'src', 'sigils', 'orb.ts'), ORB.replace('const hash = ', "import { hue } from './hash';\nconst hash = ").replace("const hue = params.hues[hash(seed) % params.hues.length];", "const h: number = hue(seed); const hue2 = params.hues[h % params.hues.length];").replace("hsl(' + hue + '", "hsl(' + hue2 + '"));
    const loaded = await loadConfig(undefined, dir);
    expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    await runOperation('build', {}, { cwd: dir });
    expect(readFileSync(join(dir, 'src', 'sigilsmith.gen.ts'), 'utf8')).toMatch(/@ts-ignore[^\n]*\n\s*'app-orb@1': \(\) => import\('\.\/sigils\/orb'\)/);
    // the budget sizes it when it declares no size: bundled for the browser and gzipped
    writeFileSync(join(dir, 'src', 'sigils', 'orb.ts'), readFileSync(join(dir, 'src', 'sigils', 'orb.ts'), 'utf8').replace('gzipBytes: 420, ', ''));
    const chk = await runOperation('check', { only: ['budget'] }, { cwd: dir });
    expect(chk.data.budget.generators['app-orb@1']).toBeGreaterThan(50);
  });
  it('an edited extension is seen at once by a long-lived process (the MCP server)', async () => {
    const dir = project({});
    expect((await runOperation('build', {}, { cwd: dir })).ok).toBe(true);
    writeFileSync(join(dir, 'src', 'sigils', 'orb.mjs'), ORB.replace('60% 40%', '60% 70%'));
    await new Promise((r) => setTimeout(r, 20)); // a new mtime
    const chk = await runOperation('check', { only: ['identity'] }, { cwd: dir });
    expect(chk.diagnostics.map((d: { code: string }) => d.code)).toEqual(expect.arrayContaining(['SGS0504']));
  });
  it('is never run by the commands that do not render (catalog, detect-key, adopt)', async () => {
    const dir = project({});
    const marker = join(dir, 'ran.txt');
    writeFileSync(join(dir, 'src', 'sigils', 'orb.mjs'), `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(marker)}, 'x');\n${ORB}`);
    registerExtensions([]);
    await runOperation('catalog', { implemented: true }, { cwd: dir });
    const key = await runOperation('detect_key', { samples: 'items.json' }, { cwd: dir });
    expect(key.diagnostics.filter((d: { code: string }) => d.code === 'SGS0104')).toEqual([]); // its ref is not called unknown
    await runOperation('adopt', {}, { cwd: dir });
    expect(existsSync(marker)).toBe(false);
    await runOperation('explain', { item: { id: 'a' } }, { cwd: dir });
    expect(existsSync(marker)).toBe(true); // rendering commands do load it
  });
  it('refuse user-settings params on an extension (the browser could not show them)', async () => {
    const dir = project({ userSettings: { choices: ['app-orb@1', 'rings@1'], params: { 'app-orb@1': ['blur'] } } });
    expect((await loadConfig(undefined, dir)).diagnostics.map((d) => d.code)).toContain('SGS0114');
  });
  it('a dual-format package resolves to its ESM build from the project', async () => {
    const dir = project({ extensions: ['ext-dual'], policy: { default: 'dual-orb@1' } });
    const pkg = join(dir, 'node_modules', 'ext-dual');
    mkdirSync(pkg, { recursive: true });
    writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: 'ext-dual', version: '1.2.3', exports: { import: './esm.mjs', require: './cjs.cjs' } }));
    writeFileSync(join(pkg, 'esm.mjs'), ORB.replace("id: 'app-orb'", "id: 'dual-orb'"));
    writeFileSync(join(pkg, 'cjs.cjs'), "module.exports = { __esModule: true, default: { id: 'dual-orb', major: 9 } };");
    const loaded = await loadConfig(undefined, dir);
    expect(loaded.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const ex = await runOperation('explain', { item: { id: 'a' } }, { cwd: dir });
    expect(ex.data.explanations[0].generator.ref).toBe('dual-orb@1'); // major 1: the ESM build, not the CJS one
  });
  it('belong to the project that named them: loading another config drops them', async () => {
    await loadConfig(undefined, project({}));
    const other = await loadConfig(undefined, makeProject({ key: { field: 'id' }, policy: { default: 'app-orb@1' } }));
    expect(other.diagnostics.map((d) => d.code)).toContain('SGS0104');
  });
});
