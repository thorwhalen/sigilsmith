/**
 * The pieces an app needs to move its own thumbnails to sigilsmith with minimum
 * disruption (docs: skills/sigilsmith/references/migrating.md): `aura@1` for hand-rolled
 * gradient art, `adoptImage` / `customFromFile` for images the app or its users already
 * have, `mediaArtwork` for the lock screen, and the picker's pure logic.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createSigil } from '../src/index.js';
import { adoptImage, customFromFile, deliver, memoryStore, onInputsChanged } from '../src/delivery.js';
import { scanAdoption } from '../src/node/adopt.js';
import { BUILTIN_BY_REF } from '../src/node/builtins.js';
import { auraField, cyrb53 } from '../src/generators/aura/v1.js';
import { meta } from '../src/generators/aura/meta.js';
import { runOperation } from '../src/node/operations.js';
import { currentChoiceId, pickerChoices, resolveChoice, SigilPicker } from '../src/react/picker.js';
import { mediaArtwork } from '../src/targets/index.js';
import { fromDataProvider } from '../src/zodal/index.js';
import { baseConfig, loaders } from './fixtures.js';
import { makeProject } from './project.js';

const PNG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13]);
const auraConfig = { ...baseConfig, generators: { 'aura@1': {} }, policy: { ...baseConfig.policy, default: 'aura@1', placeholder: 'aura@1', rules: [] } };
const auraSigil = () => createSigil({ config: auraConfig, generators: { ...loaders, 'aura@1': () => import('../src/generators/aura/v1.js') } });

describe('aura@1', () => {
  it('is a pure, catalogued generator whose params schema takes an app palette', () => {
    const b = BUILTIN_BY_REF['aura@1']!;
    expect(b.manifest).toMatchObject({ ref: 'aura@1', implemented: true, determinism: 'pure' });
    expect(b.paramsSchema.parse({ hues: [268, 300] }).hues).toEqual([268, 300]);
    expect(() => b.paramsSchema.parse({ hues: [] })).toThrow();
  });
  it('draws only from the pinned hues, blurred and clipped, with ids unique per image', async () => {
    const one = (await auraSigil().render({ id: 'song-1' })) as { svg: string };
    const two = (await auraSigil().render({ id: 'song-2' })) as { svg: string };
    expect(one.svg).toContain('feGaussianBlur');
    expect(one.svg).toContain('clip-path');
    const id1 = /id="(a[0-9a-z]+)c"/.exec(one.svg)![1];
    const id2 = /id="(a[0-9a-z]+)c"/.exec(two.svg)![1];
    expect(id1).not.toBe(id2); // two inline copies never share gradient ids
    const s = createSigil({ config: { ...auraConfig, generators: { 'aura@1': { params: { hues: [120], blur: 0, highlight: 0 } } } }, generators: { 'aura@1': () => import('../src/generators/aura/v1.js') } });
    const flat = (await s.render({ id: 'x' })) as { svg: string };
    expect(flat.svg).not.toContain('feGaussianBlur');
    for (const c of flat.svg.match(/stop-color="(#[0-9a-f]{6})"/g)!) expect(c).not.toMatch(/#fff/);
  });
});

/** arioso_studio's hand-rolled orb (src/components/Orb.tsx before the migration), verbatim. */
function orbColorsReference(id: string) {
  const hash = (text: string, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  };
  const PALETTE = [268, 285, 300, 318, 330, 250, 225, 205, 185, 160, 40, 12];
  const h = hash(id);
  const pick = (k: number) => PALETTE[Math.floor(hash(id, k) % PALETTE.length)];
  const spot = (k: number) => ({ hue: pick(k), x: 15 + ((h >>> (k * 3)) % 70), y: 10 + ((h >>> (k * 5 + 1)) % 75), r: 45 + ((h >>> (k * 4 + 2)) % 35) });
  return { baseHue: pick(9), spots: [spot(1), spot(2), spot(3)] };
}

describe('aura@1 keeps a hand-rolled orb\'s colours (the migration guarantee)', () => {
  it('picks the same hues, centres and reaches as the cyrb53 orb, for any key', async () => {
    const hues = meta.defaults.hues;
    for (const id of ['a', 'song-1', '0b9f6c1e-2c0a-4b8e-9d7a-3f1d2e4c5b6a', 'Ωμέγα', '🎵']) {
      const ref = orbColorsReference(id);
      expect(hues[cyrb53(id, 9) % hues.length]).toBe(ref.baseHue);
      ref.spots.forEach((s, i) => {
        const f = auraField(id, i + 1);
        expect({ hue: hues[Math.floor(f.hueSeed % hues.length)], x: f.x, y: f.y, r: f.r }).toEqual(s);
      });
      // and the drawing puts field 1 where the CSS layer did
      const svg = ((await auraSigil().render({ id })) as { svg: string }).svg;
      expect(svg).toContain(`cx="${Math.round((-25 + ref.spots[0]!.x * 1.5) * 100) / 100}"`);
    }
  });
});

describe('adopting existing images (the migration path for stored thumbnails)', () => {
  it('references a URL the app owns without copying, as a frozen custom record', async () => {
    const r = await adoptImage('/api/covers/42.jpg');
    expect(r).toMatchObject({ source: 'custom', frozen: true, origin: 'adopted', url: '/api/covers/42.jpg' });
    expect(r.contentId).toMatch(/^url_[0-9a-f]{32}$/);
  });
  it('refuses scripts, protocol-relative and SVG URLs', async () => {
    for (const bad of ['javascript:alert(1)', '//evil.example/x.png', 'data:image/svg+xml,<svg/>', 'ftp://x/y.png', '/\\evil.example/x.png', '/\t/evil.example/x.png', 'https://x.example/a.svg', 'HTTPS:x.example/a.png', ' javascript:x']) await expect(adoptImage(bad)).rejects.toThrow(/SGS0111/);
  });
  it('copies an expiring URL into the store, checked like an upload', async () => {
    const store = memoryStore();
    const fetch = vi.fn(async () => new Response(PNG, { headers: { 'content-type': 'image/png' } }));
    const r = await adoptImage('https://cdn.example.com/cover.png', { store, fetch: fetch as unknown as typeof globalThis.fetch });
    expect(r).toMatchObject({ source: 'custom', origin: 'adopted' });
    expect(r.contentId).toMatch(/^sg_/);
    expect(r.url).toMatch(/^data:image\/png;base64,/);
    const html = vi.fn(async () => new Response('<html>', { headers: { 'content-type': 'image/png' } }));
    await expect(adoptImage('https://cdn.example.com/x.png', { store, fetch: html as unknown as typeof globalThis.fetch })).rejects.toThrow(/SGS0110/);
    const gone = vi.fn(async () => new Response('', { status: 403 }));
    await expect(adoptImage('https://cdn.example.com/y.png', { store, fetch: gone as unknown as typeof globalThis.fetch })).rejects.toThrow(/HTTP 403/);
  });
  it('an adopted or uploaded image is never replaced by delivery or regeneration', async () => {
    const sigil = auraSigil();
    const adopted = await adoptImage('/covers/1.png');
    expect((await deliver(sigil, { id: 's1' }, { record: adopted, store: memoryStore() })).record).toBe(adopted);
    expect((await onInputsChanged(sigil, { id: 's1', title: 'renamed' }, adopted, { policy: 'always' })).decision).toBe('keep');
    const uploaded = await customFromFile(new Blob([PNG], { type: 'image/png' }), { store: memoryStore() });
    expect(uploaded).toMatchObject({ source: 'custom', origin: 'upload', frozen: true });
  });
});

describe('mediaArtwork (lock-screen art that matches the list)', () => {
  it('uses the stored URL of a custom image', async () => {
    const art = await mediaArtwork(auraSigil(), { id: 's' }, { record: await adoptImage('/covers/1.jpg') });
    expect(art).toEqual([{ src: '/covers/1.jpg', sizes: '256x256', type: 'image/jpeg' }]);
  });
  it('never hands a stored generated image (maybe SVG) to the lock screen, and omits unknown types', async () => {
    const toPng = vi.fn(async () => 'data:image/png;base64,AA');
    const art = await mediaArtwork(auraSigil(), { id: 's' }, { record: { source: 'generated', ref: 'aura@1', contentId: 'sg_g', inputsDigest: '', url: '/sigils/sg_g' }, toPng });
    expect(art).toEqual([{ src: 'data:image/png;base64,AA', sizes: '256x256', type: 'image/png' }]);
    expect(await mediaArtwork(auraSigil(), { id: 's' }, { record: await adoptImage('/sigils/sg_x') })).toEqual([{ src: '/sigils/sg_x', sizes: '256x256' }]);
  });
  it('rasterises the generated sigil when nothing is stored, and never throws', async () => {
    const toPng = vi.fn(async (svg: string, size: number) => `data:image/png;base64,${size}:${svg.length}`);
    const art = await mediaArtwork(auraSigil(), { id: 's' }, { size: 512, toPng });
    expect(art[0]).toMatchObject({ sizes: '512x512', type: 'image/png' });
    expect(toPng).toHaveBeenCalledWith(expect.stringContaining('<svg'), 512);
    expect(await mediaArtwork(auraSigil(), { id: 's' }, { toPng: async () => Promise.reject(new Error('no canvas')) })).toEqual([]);
  });
});

describe('the picker', () => {
  const candidates = [
    { id: 'provider', label: 'Cover art', url: 'https://cdn.example.com/c.png', copy: true },
    { id: 'other', label: 'From "Song B"', record: { source: 'custom' as const, contentId: 'sg_b', inputsDigest: '', url: '/sigils/sg_b', frozen: true } },
  ];
  it('lists generated first, the current upload when no candidate is it, then candidates', () => {
    expect(pickerChoices(null, candidates).map((c) => c.id)).toEqual(['generated', 'provider', 'other']);
    const upload = { source: 'custom' as const, contentId: 'sg_u', inputsDigest: '', url: '/sigils/sg_u', frozen: true };
    const withUpload = pickerChoices(upload, candidates);
    expect(withUpload.map((c) => c.id)).toEqual(['generated', 'current', 'provider', 'other']);
    expect(currentChoiceId(withUpload, upload)).toBe('current');
    expect(currentChoiceId(pickerChoices(candidates[1]!.record, candidates), candidates[1]!.record)).toBe('other');
    expect(currentChoiceId(pickerChoices(null, candidates), { source: 'generated', contentId: 'x', inputsDigest: '' })).toBe('generated');
  });
  it('resolves a choice: generated is null, a record is reused, a URL candidate is copied into the store, adopt wins', async () => {
    const choices = pickerChoices(null, candidates);
    expect(await resolveChoice(choices[0]!)).toBeNull();
    expect(await resolveChoice(choices[2]!)).toBe(candidates[1]!.record);
    const fetch = vi.fn(async () => new Response(PNG, { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetch);
    try {
      const copied = await resolveChoice(choices[1]!, { store: memoryStore() });
      expect(copied?.contentId).toMatch(/^sg_/);
    } finally {
      vi.unstubAllGlobals();
    }
    const server = { source: 'custom' as const, contentId: 'sg_srv', inputsDigest: '', url: '/sigils/sg_srv', frozen: true };
    const [, viaServer] = pickerChoices(null, [{ id: 'p', label: 'Cover art', url: 'https://x/c.png', adopt: async () => server }]);
    expect(await resolveChoice(viaServer!)).toEqual({ ...server, from: 'p' });
  });
  it('still knows the picked candidate once its image lives in the store (review finding 1)', async () => {
    const provider = { id: 'provider', label: 'Cover art', url: 'https://cdn.example.com/c.png', copy: true };
    const fetch = vi.fn(async () => new Response(PNG, { headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', fetch);
    let picked;
    try {
      picked = await resolveChoice(pickerChoices(null, [provider])[1]!, { store: memoryStore() });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(picked!.url).not.toBe(provider.url);
    const after = pickerChoices(picked, [provider]);
    expect(after.map((c) => c.id)).toEqual(['generated', 'provider']); // no duplicate "Current image"
    expect(currentChoiceId(after, picked)).toBe('provider');
    // another item's reused picture is matched by its URL, not by the candidate it came from
    const reused = { id: 'song:b', label: 'B', record: { ...picked!, from: 'provider' } };
    expect(currentChoiceId(pickerChoices(reused.record, [provider, reused]), reused.record)).toBe('song:b');
  });
  it('refuses a copy with no store, and never matches two URL-less records (findings 9, 10)', async () => {
    const copy = pickerChoices(null, [{ id: 'p', label: 'P', url: 'https://x.example/c.png', copy: true }])[1]!;
    await expect(resolveChoice(copy)).rejects.toThrow(/SGS0111/);
    const adoptOnly = { id: 'a', label: 'A', adopt: async () => ({ source: 'custom' as const, contentId: 'sg_a', inputsDigest: '' }), preview: '/p.png' };
    expect(pickerChoices(null, [adoptOnly])[1]!.record?.url).toBe('/p.png');
    const noUrl = { source: 'custom' as const, contentId: 'sg_z', inputsDigest: '' };
    expect(currentChoiceId(pickerChoices(noUrl, [{ id: 'x', label: 'X', adopt: adoptOnly.adopt }]), noUrl)).toBe('current');
  });
  it('renders one radio per choice plus an upload button, the current one checked', () => {
    const sigil = { subscribe: () => () => {}, getUser: () => undefined } as never;
    const html = renderToStaticMarkup(createElement(SigilPicker, { item: { id: 's' }, sigil, record: candidates[1]!.record, candidates, onChange: () => {} } as never));
    expect(html.match(/role="radio"/g)).toHaveLength(3);
    expect(html).toMatch(/aria-checked="true"[^>]*>.*From &quot;Song B&quot;/);
    expect(html).toContain('Upload image');
    expect(html).not.toContain(' disabled=');
  });
});

describe('adopt (finding an app\'s own thumbnails)', () => {
  const ORB = `import * as React from 'react';
export function hash(t: string) { let h = 0; for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 2654435761); return h >>> 0; }
export function orbColors(id: string) { return { base: \`hsl(\${hash(id) % 360} 45% 12%)\` }; }
export function Orb({ id }: { id: string }) { return <div style={{ background: \`radial-gradient(circle, \${orbColors(id).base}, transparent)\`, filter: 'blur(6px)' }} />; }
`;
  const write = (dir: string, files: Record<string, string>) => {
    for (const [p, t] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), t);
    }
  };
  it('finds a hand-rolled gradient identicon with its call sites, avatar libraries, lock-screen art and image fields', () => {
    const dir = makeProject({ key: { field: 'id' }, policy: { default: 'rings@1' } }, [{ id: 's1', image_url: 'https://cdn.example.com/1.png' }, { id: 's2', image_url: '' }, { id: 's3', cover: '/c/3.jpg' }]);
    write(dir, {
      'src/components/Orb.tsx': ORB,
      'src/components/Row.tsx': "import { Orb } from './Orb';\nexport const Row = () => <Orb id=\"a\" />;\n",
      'src/Player.tsx': "import { orbColors } from './components/Orb';\nconst c = orbColors('x');\nnavigator.mediaSession.metadata = new MediaMetadata({ title: 't', artwork: [{ src: c.base }] });\n",
      'src/Avatar.tsx': "import Avatar from 'boring-avatars';\nimport { toSvg } from 'jdenticon/standalone';\n",
      'src/Row.test.tsx': "import { Orb } from './components/Orb';\n<Orb id=\"t\" />\n",
      'src/sigilsmith.gen.ts': 'export const sigil = 1;',
      'src/List.tsx': "import { Sigil } from 'sigilsmith/react';\nexport const L = () => <Sigil item={{ id: 1 }} />;\n",
    });
    const r = scanAdoption(dir, { samples: JSON.parse(readFileSync(join(dir, 'items.json'), 'utf8')) });
    const byKind = (k: string) => r.findings.filter((f) => f.kind === k);
    const home = byKind('home-grown')[0]!;
    expect(home).toMatchObject({ file: join('src', 'components', 'Orb.tsx'), name: 'orbColors, Orb' });
    expect(home.suggestion).toMatch(/aura@1/);
    expect(home.uses!.map((u) => u.file).sort()).toEqual([join('src', 'Player.tsx'), join('src', 'components', 'Row.tsx')]); // tests and generated files are not call sites
    expect(byKind('library').map((f) => f.name).sort()).toEqual(['boring-avatars', 'jdenticon']);
    expect(byKind('media-session')[0]).toMatchObject({ file: join('src', 'Player.tsx'), line: 3 });
    expect(byKind('image-field').map((f) => f.name).sort()).toEqual(['cover', 'image_url']);
    expect(r.usesSigilsmith).toBe(true);
    expect(r.recipe.join('\n')).toMatch(/mediaArtwork[\s\S]*adoptImage[\s\S]*sigilsmith check/);
    expect(r.recipe[0]).not.toMatch(/init/); // already configured
  });
  it('ignores look-alike names, comments and strings, and an app that already uses mediaArtwork (findings 7, 8)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sigilsmith-adopt-'));
    write(dir, {
      'src/theme.ts': "export function gradientFor(s: string) { return `hsl(${hash(s)} 50% 50%)`; }\nexport const coverLetterTemplate = (s: string) => s.charCodeAt(0);\nexport const orbital = 1;\n",
      'src/Use.ts': "// gradientFor(x) in a comment\nconst s = 'coverLetterTemplate(1)';\n",
      'src/Player.tsx': "import { mediaArtwork } from 'sigilsmith/targets';\nnavigator.mediaSession.metadata = new MediaMetadata({ title: 't', artwork: await mediaArtwork(sigil, song) });\n",
      'src/$Orb.tsx': "export const $Orb = (id: string) => `hsl(${id.charCodeAt(0)} 50% 50%)`;\n",
      'src/Row.tsx': "import { $Orb } from './$Orb';\nconst c = $Orb('a'); // $Orb('b')\n",
    });
    const r = scanAdoption(dir);
    const found = r.findings.filter((f) => f.kind === 'home-grown');
    expect(found.map((f) => f.name)).toEqual(['$Orb']); // gradientFor, coverLetterTemplate, orbital are not thumbnails
    expect(found[0]!.uses).toEqual([{ file: join('src', 'Row.tsx'), line: 2 }]); // a name with $ is escaped; the comment is no call site
    expect(r.findings.filter((f) => f.kind === 'media-session')).toEqual([]);
    write(dir, { 'src/$Orb.tsx': 'export const unrelated = 1;\n', 'src/SongOrb.tsx': "export const SongOrb = (id: string) => `hsl(${id.charCodeAt(0)} 50% 50%)`;\n", 'src/List.tsx': "const a = SongOrb('x'); // SongOrb('y')\nconst t = 'SongOrb(z)';\n" });
    const home = scanAdoption(dir).findings.filter((f) => f.kind === 'home-grown');
    expect(home.map((f) => f.name)).toEqual(['SongOrb']);
    expect(home[0]!.uses).toHaveLength(1);
  });
  it('a plain app with no thumbnails gets init first and no swap step', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sigilsmith-adopt-'));
    write(dir, { 'src/App.tsx': 'export const App = () => <div>hi</div>;\n' });
    const r = scanAdoption(dir);
    expect(r.findings).toEqual([]);
    expect(r.recipe[0]).toMatch(/sigilsmith init/);
    expect(r.recipe.join('\n')).not.toMatch(/call site/);
  });
  it('is an operation, so the CLI and MCP both have it', async () => {
    const dir = makeProject({ key: { field: 'id' }, policy: { default: 'rings@1' } });
    write(dir, { 'app/Orb.tsx': ORB });
    const env = await runOperation('adopt', { dirs: ['app'] }, { cwd: dir });
    expect(env.ok).toBe(true);
    expect(env.data.findings[0].kind).toBe('home-grown');
  });
});

describe('fromDataProvider over an app API with root-relative URLs (found migrating arioso_studio)', () => {
  it('asks the server before skipping an upload, so a new image is really stored', async () => {
    const stored = new Map<string, Blob>();
    const calls: string[] = [];
    const provider = {
      getUrl: async (id: string) => `/api/app/sigils/${id}`,
      setContent: async (id: string, field: string, blob: Blob) => (stored.set(id, blob), { _tag: 'ContentRef', field, itemId: id, url: `/api/app/sigils/${id}` }),
    } as never;
    const fetch = vi.fn(async (url: string, init?: RequestInit) => (calls.push(`${init?.method} ${url}`), new Response(null, { status: stored.has(url.split('/').pop()!) ? 200 : 404 })));
    const store = fromDataProvider(provider, { fetch: fetch as unknown as typeof globalThis.fetch });
    const rec = await customFromFile(new Blob([PNG], { type: 'image/png' }), { store });
    expect(stored.has(rec.contentId)).toBe(true);
    expect(rec.url).toBe(`/api/app/sigils/${rec.contentId}`);
    expect(calls[0]).toBe(`HEAD /api/app/sigils/${rec.contentId}`);
    await customFromFile(new Blob([PNG], { type: 'image/png' }), { store }); // present now: HEAD says so, no second PUT
    expect(stored.size).toBe(1);
  });
});

describe('downscaleImage (phone photos before upload)', () => {
  it('re-encodes a large photo to maxSide on its longer side, keeps GIFs and undecodable files', async () => {
    const { downscaleImage } = await import('../src/delivery.js');
    const big = new Blob([new Uint8Array(600_000)], { type: 'image/jpeg' });
    expect(await downscaleImage(big, 512)).toBe(big); // no createImageBitmap (Node): unchanged
    const drawn: number[][] = [];
    vi.stubGlobal('createImageBitmap', async () => ({ width: 4000, height: 3000, close() {} }));
    vi.stubGlobal('OffscreenCanvas', class {
      constructor(public w: number, public h: number) {}
      getContext() { return { drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => drawn.push([w, h]) }; }
      async convertToBlob(o: { type: string }) { return new Blob([new Uint8Array(10)], { type: o.type }); }
    });
    try {
      const out = await downscaleImage(big, 512);
      expect(drawn).toEqual([[512, 384]]);
      expect(out.type).toBe('image/jpeg');
      const gif = new Blob([new Uint8Array(10)], { type: 'image/gif' });
      expect(await downscaleImage(gif, 512)).toBe(gif);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('the item\'s own picture, the sigil as fallback (found migrating media_player)', () => {
  it('pictureRecord makes a display record synchronously, or null for nothing or a refused URL', async () => {
    const { pictureRecord } = await import('../src/delivery.js');
    expect(pictureRecord('https://i.ytimg.com/vi/x/hq.jpg')).toMatchObject({ source: 'custom', url: 'https://i.ytimg.com/vi/x/hq.jpg', frozen: true, origin: 'adopted' });
    expect(pictureRecord('/covers/1.png')?.url).toBe('/covers/1.png');
    for (const none of [undefined, null, '', 'javascript:alert(1)', '/\\evil.example/x.png', 'https://x.example/a.svg']) expect(pictureRecord(none as string)).toBeNull();
  });
  it('a custom picture that failed to load gives way to the generated sigil, unless fallback is off', async () => {
    const { shownRecord } = await import('../src/react/index.js');
    const pic = { source: 'custom' as const, contentId: 'url:/a.png', inputsDigest: '', url: '/a.png' };
    expect(shownRecord(pic, null)).toBe(pic);
    expect(shownRecord(pic, '/a.png')).toBeNull();
    expect(shownRecord(pic, '/a.png', false)).toBe(pic);
    expect(shownRecord(pic, '/other.png')).toBe(pic); // a new picture is tried again
    expect(shownRecord(undefined, '/a.png')).toBeUndefined();
  });
});

describe('adopt points at an image field drawn with a plain <img>', () => {
  it('lists where, and suggests pictureRecord', () => {
    const dir = makeProject({ key: { field: 'id' }, policy: { default: 'rings@1' } }, [{ id: 'a', image_url: 'https://i.example/a.jpg' }]);
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(join(dir, 'src', 'Row.tsx'), "export const T = ({ item }) =>\n  item.image_url ? <img src={item.image_url} alt=\"\" /> : null;\n");
    const f = scanAdoption(dir, { samples: [{ id: 'a', image_url: 'https://i.example/a.jpg' }] }).findings.find((x) => x.kind === 'image-field')!;
    expect(f.uses).toEqual([{ file: join('src', 'Row.tsx'), line: 2 }]);
    expect(f.suggestion).toMatch(/pictureRecord\(item\.image_url\)/);
  });
});

describe('<Sigil> in a non-square box (found migrating costar: portrait posters)', () => {
  it('takes a height and an object-position, and the image covers the box', async () => {
    const { Sigil, displayCacheFor } = await import('../src/react/index.js').then(async (m) => ({ ...m, displayCacheFor: (await import('../src/react/display-cache.js')).displayCacheFor }));
    const sigil = { subscribe: () => () => {}, getUser: () => undefined } as never;
    const item = { id: 'tt1' };
    displayCacheFor(sigil).set(JSON.stringify([JSON.stringify(item), 40, null, null, false, null]), 'data:image/svg+xml,x', false);
    const html = renderToStaticMarkup(createElement(Sigil, { item, size: 40, height: 56, objectPosition: '50% 20%', sigil }));
    expect(html).toMatch(/width:40px;height:56px/);
    expect(html).toMatch(/height="56"/);
    expect(html).toMatch(/object-fit:cover;object-position:50% 20%/);
  });
});

describe('badge@1: a typed placeholder (sigilsmith#21, from costar\'s film-frame + year)', () => {
  const render = async (fields: Record<string, string>, params: Record<string, unknown> = {}) => {
    const { default: badge } = await import('../src/generators/badge/v1.js');
    const { renderContext } = await import('../src/context.js');
    return ((await badge.render(renderContext('badge@1', fields.key!, fields, { ...badge.defaults, ...params }, 64) as never)) as { svg: string }).svg;
  };
  it('draws the icon of the item kind and the caption under it', async () => {
    const svg = await render({ key: 'tt0068646', caption: '1972' }, { icon: 'film' });
    expect(svg).toContain('M7 4v16'); // the film frame's perforations
    expect(svg).toMatch(/<text[^>]*>1972<\/text>/);
  });
  it('cuts a long caption with an ellipsis, centres the icon without one, and shows a caption alone with icon none', async () => {
    const { captionOf } = await import('../src/generators/badge/v1.js');
    expect(captionOf('markdown', 4)).toBe('mar…');
    expect(captionOf('  1994 ', 6)).toBe('1994');
    expect(await render({ key: 'a' }, { icon: 'music' })).toContain('translate(26 26) scale(2)');
    const alone = await render({ key: 'a', caption: 'v2' }, { icon: 'none' });
    expect(alone).not.toContain('<g ');
    expect(alone).toMatch(/font-size="30"[^>]*>v2</);
  });
  it('escapes the caption (it comes from item data)', async () => {
    expect(await render({ key: 'a', caption: '<b>' })).toContain('&lt;b&gt;');
  });
});

describe('check budget counts the targets module when the app imports it (sigilsmith#21)', () => {
  it('adds "(targets module)" only for sources importing sigilsmith/targets', async () => {
    const { check, loadConfig } = await import('../src/node/index.js');
    const dir = makeProject({ key: { field: 'id' }, policy: { default: 'rings@1' }, budget: { maxGzipBytes: 20000 } });
    const before = await check(await loadConfig(undefined, dir), { only: ['budget'] });
    expect(before.data.budget!.generators['(targets module)']).toBeUndefined();
    writeFileSync(join(dir, 'src', 'session.ts'), "import { mediaArtwork } from 'sigilsmith/targets';\n");
    const after = await check(await loadConfig(undefined, dir), { only: ['budget'] });
    expect(after.data.budget!.generators).toHaveProperty('(targets module)');
  });
});

describe('adopt reads Python too (found after arioso\'s share page kept a Python copy of its orb)', () => {
  it('finds a server-rendered orb by its public functions, ignoring private ones, tests and comments', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sigilsmith-adopt-py-'));
    const write = (p: string, t: string) => { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), t); };
    write('app/shares.py', "def _hash(s):\n    return sum(ord(c) for c in s)\n\ndef orb_background(id):\n    return f'radial-gradient(circle, hsl({_hash(id) % 360} 95% 62%), transparent)'\n\ndef _art(id):\n    # orb_background(id) in a comment\n    return orb_background(id)\n");
    write('app/pages.py', "from .shares import orb_background\nbg = orb_background('x')\n");
    write('app/tests/test_shares.py', "from app.shares import orb_background\norb_background('t')\n");
    const home = scanAdoption(dir, { dirs: ['app'] }).findings.filter((f) => f.kind === 'home-grown');
    expect(home.map((f) => [f.file, f.name])).toEqual([[join('app', 'shares.py'), 'orb_background']]);
    expect(home[0]!.uses).toEqual([{ file: join('app', 'pages.py'), line: 2 }]);
    expect(home[0]!.suggestion).toMatch(/server-side copy/);
  });
});

describe('adopt skips built bundles', () => {
  it('ignores content-hashed and minified scripts in a build output dir', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sigilsmith-adopt-dist-'));
    mkdirSync(join(dir, 'app', 'frontend', 'assets'), { recursive: true });
    const bundle = "navigator.mediaSession.metadata=new MediaMetadata({title:t,artwork:[{src:a}]});";
    writeFileSync(join(dir, 'app', 'frontend', 'assets', 'index-D8zxAvO5.js'), bundle);
    writeFileSync(join(dir, 'app', 'frontend', 'assets', 'vendor.min.js'), bundle);
    writeFileSync(join(dir, 'app', 'player.js'), bundle);
    writeFileSync(join(dir, 'app', 'use-tracking.js'), bundle); // a real name that is 8 letters after a dash
    const ms = scanAdoption(dir, { dirs: ['app'] }).findings.filter((f) => f.kind === 'media-session');
    expect(ms.map((f) => f.file).sort()).toEqual([join('app', 'player.js'), join('app', 'use-tracking.js')]);
  });
});
