/**
 * The `screenshot@1` extra: image sniffing, focus parsing and cropping, the frozen
 * markup, the fallback (identical to the fallback generator for the same item), the
 * errors, the CLI's static-file loader, and how the catalog and wiring module see it.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { cropRect, createScreenshot, parseFocus, type FetchLike } from '../src/extras/screenshot/v1.js';
import { sha256Hex } from '../src/hash.js';
import { imageInfo } from '../src/image-info.js';
import { createSigil } from '../src/index.js';
import { assetFetch } from '../src/node/assets.js';
import { renderWiringModule } from '../src/node/build.js';
import { catalog, check, loadConfig } from '../src/node/index.js';
import type { ResolvedConfig } from '../src/types.js';
import { makeProject } from './project.js';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Uint8Array) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC_TABLE[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A real, decodable solid-colour PNG of `w`×`h`. */
function png(w: number, h: number, rgb: [number, number, number] = [200, 40, 40]): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    v.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const raw = new Uint8Array(h * (1 + 3 * w));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (1 + 3 * w) + 1 + 3 * x);
  const parts = [new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())];
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const dataUrl = (bytes: Uint8Array) => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`;
const pad = (head: number[], len = 40) => new Uint8Array([...head, ...new Array(Math.max(0, len - head.length)).fill(0)]);

describe('imageInfo', () => {
  it('reads type and size from PNG, GIF, JPEG and the three WebP chunk kinds', () => {
    expect(imageInfo(png(320, 180))).toEqual({ mime: 'image/png', width: 320, height: 180 });
    expect(imageInfo(pad([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0xb4, 0x00]))).toEqual({ mime: 'image/gif', width: 320, height: 180 });
    // SOI, an APP0 segment of length 16, then SOF0: precision, height 180, width 320.
    const jpeg = pad([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0), 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xb4, 0x01, 0x40]);
    expect(imageInfo(jpeg)).toEqual({ mime: 'image/jpeg', width: 320, height: 180 });
    const riff = (chunk: string, body: number[]) => pad([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...[...chunk].map((c) => c.charCodeAt(0)), ...body]);
    // VP8X: 24-bit (width-1), (height-1) at offsets 24 and 27.
    expect(imageInfo(riff('VP8X', [0, 0, 0, 0, 0, 0, 0, 0, 0x3f, 0x01, 0x00, 0xb3, 0x00, 0x00]))).toEqual({ mime: 'image/webp', width: 320, height: 180 });
    // VP8 (lossy): 14-bit width and height at 26 and 28.
    expect(imageInfo(riff('VP8 ', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0x01, 0xb4, 0x00]))).toEqual({ mime: 'image/webp', width: 320, height: 180 });
    // VP8L (lossless): signature 0x2f, then 14-bit (width-1) and (height-1) bit-packed.
    const w1 = 319, h1 = 179;
    const bits = w1 | (h1 << 14);
    expect(imageInfo(riff('VP8L', [0, 0, 0, 0, 0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >> 24) & 0xff]))).toEqual({ mime: 'image/webp', width: 320, height: 180 });
  });

  it('returns null for anything else', () => {
    expect(imageInfo(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'.padEnd(40)))).toBeNull();
    expect(imageInfo(new Uint8Array(4))).toBeNull();
  });
});

describe('focus', () => {
  it('parses points, zoomed points and rectangles, as text or JSON', () => {
    expect(parseFocus('0.3,0.6')).toEqual({ kind: 'point', x: 0.3, y: 0.6 });
    expect(parseFocus(' 0.3 0.6 4 ')).toEqual({ kind: 'point', x: 0.3, y: 0.6, zoom: 4 });
    expect(parseFocus('0.1,0.2,0.4,0.5')).toEqual({ kind: 'rect', x: 0.1, y: 0.2, w: 0.4, h: 0.5 });
    expect(parseFocus('{"x":120,"y":40,"w":64,"h":64}')).toEqual({ kind: 'rect', x: 120, y: 40, w: 64, h: 64 });
    expect(parseFocus('{"x":0.5,"y":0.5,"zoom":2}')).toEqual({ kind: 'point', x: 0.5, y: 0.5, zoom: 2 });
  });

  it('refuses malformed focus with SGS0305', () => {
    for (const bad of ['', '0.5', '1,2,3,4,5', 'a,b', '-1,0', '0,0,0,1', '{"x":1}', '{nope']) expect(() => parseFocus(bad), bad).toThrow(/SGS0305/);
  });

  it('crops a centred square, a fractional or pixel rectangle, and stays inside the image', () => {
    expect(cropRect(200, 100, parseFocus('0.5,0.5'), 1)).toEqual({ x: 50, y: 0, w: 100, h: 100 });
    expect(cropRect(200, 100, parseFocus('0.5,0.5'), 4)).toEqual({ x: 87.5, y: 37.5, w: 25, h: 25 });
    expect(cropRect(200, 100, parseFocus('0.25,0,0.5,0.5'), 1)).toEqual({ x: 50, y: 0, w: 100, h: 50 });
    expect(cropRect(200, 100, parseFocus('10,20,30,40'), 1)).toEqual({ x: 10, y: 20, w: 30, h: 40 });
    // A point at the corner: the square slides back inside the image.
    expect(cropRect(200, 100, parseFocus('1,1'), 2)).toEqual({ x: 150, y: 50, w: 50, h: 50 });
  });
});

const fieldsFor = (o: Record<string, string>) => ({ key: 'pong', label: 'Pong', ...o });
async function renderWith(fetchImpl: FetchLike, fields: Record<string, string>, params: Record<string, unknown> = {}) {
  const mod = createScreenshot({ fetch: fetchImpl });
  const { cyrb128, seededRng } = await import('../src/hash.js');
  const { paletteFromHash } = await import('../src/palette.js');
  const seed = JSON.stringify(Object.values(fields));
  const [h] = cyrb128(`${seed}\u0000screenshot@1`);
  return mod.render({ seed, hash: h, rng: seededRng(seed), palette: paletteFromHash(h), fields: fieldsFor(fields), params: { ...mod.defaults, ...params }, size: 64 });
}
const serve = (bytes: Uint8Array | null, status = bytes ? 200 : 404): FetchLike => async () => ({ ok: status < 400, status, arrayBuffer: async () => (bytes ?? new Uint8Array()).slice().buffer as ArrayBuffer });

describe('render', () => {
  it('embeds the file and crops to the focus (frozen markup)', async () => {
    const shot = png(320, 180);
    const img = await renderWith(async (u) => fetch(u), { src: dataUrl(shot), focus: '0.25,0.5,2' }, { ring: 4, pixelated: true, shape: 'circle' });
    expect(img.type).toBe('svg');
    const svg = (img as { svg: string }).svg;
    // Crop 90×90 at (35, 45), scaled by 100/90 and centred on the tile.
    expect(svg).toContain('<image x="-38.89" y="-50" width="355.56" height="200" style="image-rendering:pixelated" href="data:image/png;base64,');
    expect(svg).toContain(`href="data:image/png;base64,${Buffer.from(shot).toString('base64')}"`);
    expect(svg).toContain('style="image-rendering:pixelated"');
    expect(svg).toMatch(/<circle cx="50" cy="50" r="48" fill="none" stroke="#[0-9a-f]{6}" stroke-width="4"\/><\/svg>$/);
    // The markup is part of the frozen contract of screenshot@1.
    expect(await sha256Hex(svg)).toBe(await sha256Hex((await renderWith(async (u) => fetch(u), { src: dataUrl(shot), focus: '0.25,0.5,2' }, { ring: 4, pixelated: true, shape: 'circle' }) as { svg: string }).svg));
    expect((await sha256Hex(svg)).slice(0, 16)).toMatchInlineSnapshot(`"b03bee1ff247a4bf"`);
  });

  it('draws the fallback for no screenshot, and throws SGS0305 for a screenshot it cannot use (a missing file included)', async () => {
    const none = await renderWith(serve(null), {});
    expect(none.type).toBe('svg');
    await expect(renderWith(serve(null, 404), { src: '/gone.png' })).rejects.toThrow(/SGS0305.*HTTP 404/);
    await expect(renderWith(serve(null, 500), { src: '/x.png' })).rejects.toThrow(/SGS0305.*HTTP 500/);
    await expect(renderWith(async () => { throw new TypeError('Failed to fetch'); }, { src: 'https://other.example/x.png' })).rejects.toThrow(/SGS0305.*CORS/);
    await expect(renderWith(serve(new TextEncoder().encode('not an image at all, not at all')), { src: '/x.png' })).rejects.toThrow(/SGS0305.*not a PNG/);
    await expect(renderWith(serve(png(64, 64)), { src: '/x.png' }, { maxBytes: 10 })).rejects.toThrow(/SGS0305.*maxBytes/);
    await expect(renderWith(serve(png(64, 64)), { src: '/x.png', focus: 'nope' })).rejects.toThrow(/SGS0305.*bad focus/);
  });
});

describe('fallback through the kernel', () => {
  const cfg = (rules: ResolvedConfig['policy']['rules'], dflt = 'grid@1'): ResolvedConfig => ({
    version: 1,
    itemTypeField: 'kind',
    key: { spec: { kind: 'field', field: 'id' }, fallback: [], onMissing: 'throw' },
    label: { fields: ['title'] },
    presets: [],
    generators: {},
    policy: { default: dflt, salt: 's', placeholder: 'grid@1', rules },
    delivery: { strategy: 'derived', format: 'svg' },
    regeneration: { policy: 'auto' },
    userSettings: { choices: [], perType: false, params: {} },
  });
  const generators = {
    'grid@1': () => import('../src/generators/grid/v1.js'),
    'initials@1': () => import('../src/generators/initials/v1.js'),
    'screenshot@1': () => import('../src/extras/screenshot/v1.js'),
  };
  const games = [
    { id: 'pong', title: 'Pong', kind: 'game', screenshot: dataUrl(png(160, 90)), screenshotFocus: '0.5,0.5,2' },
    { id: 'tetris', title: 'Tetris', kind: 'game' },
  ];

  it('unguarded: an item without a screenshot looks exactly as the fallback generator draws it', async () => {
    const withExtra = createSigil({ config: cfg([{ when: { kind: 'game' }, use: 'screenshot@1' }]), generators });
    const plain = createSigil({ config: cfg([]), generators });
    expect(await withExtra.render(games[1]!)).toEqual(await plain.render(games[1]!));
    const shot = await withExtra.render(games[0]!);
    expect(shot.type === 'svg' && shot.svg.includes('data:image/png;base64,')).toBe(true);
    const asInitials = createSigil({ config: cfg([{ when: { kind: 'game' }, use: 'screenshot@1', params: { 'screenshot@1': { fallback: 'initials' } } }]), generators });
    const initials = createSigil({ config: cfg([], 'initials@1'), generators });
    expect(await asInitials.render(games[1]!)).toEqual(await initials.render(games[1]!));
  });

  it('presets never replace its inputs (content kind)', async () => {
    const { PRESETS } = await import('../src/index.js');
    const withPreset = { ...cfg([{ when: { kind: 'game' }, use: 'screenshot@1' }]), presets: [PRESETS.documents!, PRESETS.media!] };
    const plan = await createSigil({ config: withPreset, generators }).plan(games[0]!);
    expect(plan.fields.src).toBe(games[0]!.screenshot);
    expect(plan.provenance.find((p) => p.path === 'inputs')?.layer ?? 'generator').toBe('generator');
  });

  it('guarded: items without a screenshot keep whatever the app draws otherwise', async () => {
    const sigil = createSigil({ config: cfg([{ when: { screenshot: { exists: true } }, use: 'screenshot@1' }], 'initials@1'), generators });
    expect((await sigil.plan(games[0]!)).selection.ref).toBe('screenshot@1');
    expect((await sigil.plan(games[1]!)).selection).toEqual({ ref: 'initials@1', via: 'default' });
  });
});

describe('the CLI side', () => {
  it('reads static files from public/ or the root, with or without a base path segment', async () => {
    const dir = makeProject({});
    mkdirSync(join(dir, 'public/games'), { recursive: true });
    writeFileSync(join(dir, 'public/games/pong.png'), png(8, 8));
    writeFileSync(join(dir, 'root.png'), png(4, 4));
    const f = assetFetch({ root: dir });
    for (const u of ['/games/pong.png', 'games/pong.png', './games/pong.png', '/myapp/games/pong.png', '/games/pong.png?v=3']) {
      const r = await f(u);
      expect(r.status, u).toBe(200);
      expect(imageInfo(new Uint8Array(await r.arrayBuffer()))?.width, u).toBe(8);
    }
    expect((await f('/root.png')).status).toBe(200);
    expect((await f('/missing.png')).status).toBe(404);
    expect((await f('/../etc/passwd')).status).toBe(404);
  });

  it('is listed as an extra, wired from sigilsmith/extras, and passes check on a project with screenshots', async () => {
    const row = (await catalog({ ref: 'screenshot@1' })).data.results[0]!;
    expect(row).toMatchObject({ ref: 'screenshot@1', implemented: true, tier: 'extra', importPath: 'sigilsmith/extras/screenshot/v1' });
    expect(row.usage).toMatch(/exists/);
    expect((await catalog({ implemented: true })).data.results.some((r) => r.ref === 'screenshot@1')).toBe(true);

    const items = Array.from({ length: 20 }, (_, i) => ({ id: `g${i}`, title: `Game ${i}`, kind: 'game', ...(i % 2 ? { screenshot: `/games/g${i}.png`, screenshotFocus: '0.5,0.5,2' } : {}) }));
    const dir = makeProject({ key: { field: 'id' }, itemType: { field: 'kind' }, delivery: { strategy: 'derived', format: 'svg' }, policy: { default: 'grid@1', rules: [{ when: { screenshot: { exists: true } }, use: 'screenshot@1' }] }, budget: { maxGzipBytes: 8000 } }, items);
    mkdirSync(join(dir, 'public/games'), { recursive: true });
    items.forEach((it, i) => it.screenshot && writeFileSync(join(dir, `public/games/g${i}.png`), png(32 + i, 18 + i)));
    const loaded = await loadConfig(undefined, dir);
    expect(renderWiringModule(loaded, join(dir, 'src/sigilsmith.gen.ts'))).toContain("'screenshot@1': () => import('sigilsmith/extras/screenshot/v1'),");
    // Run from another directory: files are read from the config's project, not the cwd.
    expect(process.cwd()).not.toBe(dir);
    const env = await check(loaded, { only: ['config', 'data', 'identity', 'budget'] });
    expect(env.diagnostics.filter((d) => d.severity === 'error' && d.code !== 'SGS0503')).toEqual([]);
    // The fallback generator counts toward the budget even when nothing else selects it.
    const rings = makeProject({ key: { field: 'id' }, itemType: null, policy: { default: 'initials@1', rules: [{ when: { screenshot: { exists: true } }, use: 'screenshot@1', params: { 'screenshot@1': { fallback: 'rings' } } }] } }, items);
    expect(Object.keys((await check(await loadConfig(undefined, rings), { only: ['budget'] })).data.budget!.generators)).toEqual(expect.arrayContaining(['initials@1', 'rings@1', 'screenshot@1', 'grid@1']));
    // Sample files that are missing or not images are reported, with the code, on their items.
    writeFileSync(join(dir, 'public/games/g3.png'), 'not an image, only text, long enough to sniff');
    const broken = (await check(loaded, { only: ['determinism'] })).diagnostics.filter((d) => d.code === 'SGS0305');
    expect(broken.some((d) => /g3\.png.*not a PNG/.test(d.message))).toBe(true);
    expect(broken.some((d) => /g5\.png.*HTTP 404/.test(d.message))).toBe(false);
  });
});
