import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createSigil } from '../src/index.js';
import { deliver } from '../src/delivery.js';
import { check, emitTargets, loadConfig, pngSize } from '../src/node/index.js';
import { Sigil, SigilProvider } from '../src/react/index.js';
import { snippet, TARGETS } from '../src/targets/index.js';
import { bindSettings, createMemoryBlobProvider, createSigilSettingsStore, defineSigilSettings, fromDataProvider } from '../src/zodal/index.js';
import { baseConfig, loaders } from './fixtures.js';
import { BASIC, makeProject } from './project.js';

describe('integration targets (B17)', () => {
  it('emits favicon, touch icon, manifest icons, og:image and Media Session art at the right sizes', async () => {
    const dir = makeProject({ ...BASIC, targets: { ids: ['favicon-svg', 'favicon-ico', 'apple-touch-icon', 'manifest-icons', 'og-image', 'media-session-artwork'], baseUrl: 'https://example.com', site: { seed: 'my-site' } } });
    const env = await emitTargets(await loadConfig(undefined, dir), { item: { id: 'trk_1', title: 'Blue Monday', type: 'audio' } });
    const byName = Object.fromEntries(env.data.files.map((f) => [f.path.split('/public/')[1], f.path]));
    expect(Object.keys(byName)).toEqual(expect.arrayContaining(['icon.svg', 'favicon.ico', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-mask.png']));
    expect(pngSize(new Uint8Array(readFileSync(byName['apple-touch-icon.png']!)))).toEqual({ width: 180, height: 180 });
    const og = Object.keys(byName).find((k) => k.startsWith('og/'))!;
    expect(pngSize(new Uint8Array(readFileSync(byName[og]!)))).toEqual({ width: 1200, height: 630 });
    expect(env.data.snippets['og-image']).toContain('content="https://example.com/og/sg_');
    expect(env.data.snippets['manifest-icons']).toContain('"purpose": "maskable"');
    expect(env.data.snippets['media-session-artwork']).toContain('512x512');
  });
  it('check validates registration: missing tags, relative og:image, missing files', async () => {
    const dir = makeProject({ ...BASIC, targets: { ids: ['favicon-svg', 'apple-touch-icon', 'og-image'], html: 'index.html', site: { seed: 's' } } });
    writeFileSync(join(dir, 'index.html'), '<head><link rel="icon" href="/icon.svg" type="image/svg+xml"><meta property="og:image" content="/og/x.png"></head>');
    const env = await check(await loadConfig(undefined, dir), { only: ['targets'] });
    const codes = env.diagnostics.map((d) => d.code);
    expect(codes).toEqual(expect.arrayContaining(['SGS0602', 'SGS0604', 'SGS0603']));
    expect(env.diagnostics.find((d) => d.code === 'SGS0602')!.message).toMatch(/apple-touch-icon/);
  });
  it('every target in the registry fills its snippet', () => {
    for (const t of TARGETS) expect(snippet(t, { base: '/', url: 'https://x/y.png', alt: '', color: '#fff', url256: 'a', url512: 'b' })).not.toMatch(/\{(base|url|alt|color)\}/);
  });
});

describe('zodal storage and settings (B20, B15)', () => {
  it('stores generated images through a zodal DataProvider, once per content id', async () => {
    const provider = createMemoryBlobProvider();
    const store = fromDataProvider(provider);
    const sigil = createSigil({ config: baseConfig, generators: loaders });
    const a = await deliver(sigil, { id: 'p1', type: 'project' }, { store });
    const b = await deliver(sigil, { id: 'p1', type: 'project' }, { store });
    expect(a.record.url).toMatch(/^data:image\/svg\+xml/);
    expect(b.record.url).toBe(a.record.url);
    expect(provider.contentCount()).toBe(1);
  });
  it('end-user settings are a dials definition whose values become layer 5', async () => {
    const settings = defineSigilSettings(baseConfig);
    expect(settings.types).toEqual(['audio', 'video']);
    expect(settings.dials.keys).toEqual(expect.arrayContaining(['sigil.enabled', 'sigil.style.audio', 'sigil.style.video']));
    const { store, view } = createSigilSettingsStore(settings);
    const sigil = createSigil({ config: baseConfig, generators: loaders });
    const unbind = bindSettings(sigil, settings, store);
    expect((await sigil.plan({ id: 'v1', type: 'video' })).selection.ref).toBe('rings@1');
    store.set('sigil.style.video', 'shapes@1');
    expect((await sigil.plan({ id: 'v1', type: 'video' })).selection).toMatchObject({ ref: 'shapes@1', via: 'user' });
    expect(store.explain('sigil.style.video')!.winningScope).toBe('user');
    expect(view().form.fields.map((f) => f.key)).toContain('sigil.style.video');
    unbind();
  });
});

describe('React adapter (B8)', () => {
  it('reserves the box and renders decoratively by default', () => {
    const sigil = createSigil({ config: baseConfig, generators: loaders });
    const html = renderToString(createElement(SigilProvider, { sigil }, createElement(Sigil, { item: { id: 'p1' }, size: 32 })));
    expect(html).toContain('width:32px');
    expect(html).toContain('data-status="loading"');
    const stored = renderToString(createElement(Sigil, { sigil, item: { id: 'p1' }, size: 32, record: { source: 'generated', contentId: 'sg_x', inputsDigest: 'd', url: 'https://cdn/x.svg' } }));
    expect(stored).toContain('loading');
  });
});
