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
    for (const bad of ['javascript:alert(1)', '//evil.example/x.png', 'data:image/svg+xml,<svg/>', 'ftp://x/y.png']) await expect(adoptImage(bad)).rejects.toThrow(/SGS0111/);
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
    expect(await resolveChoice(viaServer!)).toBe(server);
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
