/** Sigilsmith spike: bundle sizes, contact sheets, distinguishability metrics. Run with `npm run spike`. */
import { build } from 'esbuild';
import { Resvg } from '@resvg/resvg-js';
import { gzipSync, brotliCompressSync, constants as Z, deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { LIBS, SKIPPED } from './libs.mjs';

const require = createRequire(import.meta.url);
const ROOT = new URL('.', import.meta.url).pathname;
const TMP = ROOT + 'out-tmp/';
const SHEETS = ROOT + 'contact-sheets/';
const N_KEYS = 300, METRIC_PX = 32, SIZES = [128, 64, 32, 16];
const BG = { light: '#ffffff', dark: '#111111' };
const VANISH_CONTRAST = 1.5, VANISH_SHARE = 0.05, NEAR_DUP = 0.05, MAX_PNG = 300 * 1024;
const only = process.argv.slice(2);

const NAMES = [
  'Bohemian Rhapsody', 'Blue in Green', 'Clair de Lune', 'Take Five', 'Paranoid Android', 'Smells Like Teen Spirit',
  'Ada Lovelace', 'Grace Hopper', 'Katherine Johnson', 'Yuki Tanaka', 'Mohamed El-Amin', 'Zoë Müller',
  'sigilsmith', 'react-router', 'pydantic-core', 'my-cool-project', 'docs/api-v2', 'monorepo.web.app',
  '3f2504e0-4f89-11d3-9a0c-0305e82c3301', '9b2c5a64-7e1d-4f0b-8c3a-1d2e3f4a5b6c',
  'f47ac10b-58cc-4372-a567-0e02b2c3d479', '123e4567-e89b-12d3-a456-426614174000',
  'a', 'user@example.com',
];

// ---------- helpers
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry32 = (a) => () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
function syntheticKeys(n) {
  const r = mulberry32(12345), hex = (k) => Array.from({ length: k }, () => ((r() * 16) | 0).toString(16)).join('');
  const first = ['Ada', 'Alan', 'Grace', 'Linus', 'Yuki', 'Maria', 'Omar', 'Ines', 'Chen', 'Noor'];
  const last = ['Lovelace', 'Turing', 'Hopper', 'Torvalds', 'Tanaka', 'Silva', 'Haddad', 'Costa', 'Wei', 'Khan'];
  const words = ['api', 'web', 'core', 'docs', 'infra', 'ml', 'cli', 'ui', 'data', 'auth'];
  return Array.from({ length: n }, (_, i) => {
    const m = i % 3;
    if (m === 0) return `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
    if (m === 1) return `${words[(r() * 10) | 0]}-${words[(r() * 10) | 0]}-${i}`;
    return `${first[(r() * 10) | 0]} ${last[(r() * 10) | 0]} ${i}`;
  });
}
const median = (a) => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
const b64 = (buf) => Buffer.from(buf).toString('base64');

// minimal PNG encoder (for blurhash RGBA output)
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer ?? rgba, rgba.byteOffset ?? 0, w * h * 4).copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4); }
  const chunk = (t, d) => { const b = Buffer.alloc(12 + d.length); b.writeUInt32BE(d.length, 0); b.write(t, 4, 'latin1'); d.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + d.length)), 8 + d.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// fake DOM canvas for @download/blockies: records fillRect, toDataURL -> SVG
function installDomShim() {
  globalThis.document = {
    createElement() {
      const rects = []; const ctx = { fillStyle: '#000', fillRect(x, y, w, h) { rects.push([x, y, w, h, this.fillStyle]); } };
      const c = { width: 0, height: 0, getContext: () => ctx, toDataURL() {
        const body = rects.map(([x, y, w, h, f]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"/>`).join('');
        return 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${c.width} ${c.height}">${body}</svg>`);
      } };
      return c;
    },
  };
}

// ---------- 1. bundle sizes + loading renderers
async function bundle(lib) {
  const outfile = `${TMP}${lib.id}.mjs`;
  const common = { entryPoints: [`${ROOT}entries/${lib.id}.mjs`], bundle: true, minify: true, format: 'esm', platform: 'browser', treeShaking: true, outfile, logLevel: 'silent', external: lib.external ?? [] };
  await build(common);
  const code = readFileSync(outfile);
  return {
    minBytes: code.length,
    gzipBytes: gzipSync(code, { level: 9 }).length,
    brotliBytes: brotliCompressSync(code, { params: { [Z.BROTLI_PARAM_QUALITY]: 11, [Z.BROTLI_PARAM_LGWIN]: 24, [Z.BROTLI_PARAM_MODE]: Z.BROTLI_MODE_TEXT } }).length,
    outfile,
  };
}

async function loadRenderer(lib, outfile) {
  let mod;
  try { mod = await import(pathToFileURL(outfile).href); }
  catch (e) {
    // bundle with external react can fail in Node ESM (dynamic require shim); rebuild for node with everything inlined
    const alt = `${TMP}${lib.id}.node.mjs`;
    await build({ entryPoints: [`${ROOT}entries/${lib.id}.mjs`], bundle: true, format: 'esm', platform: 'node', outfile: alt, logLevel: 'silent', banner: { js: "import {createRequire as __cr} from 'module';const require=__cr(import.meta.url);" }, external: lib.react ? ['react', 'react-dom'] : [] });
    mod = await import(pathToFileURL(alt).href);
  }
  let toStr = (x) => x;
  if (lib.react) {
    const { renderToStaticMarkup } = await import('react-dom/server');
    toStr = (el) => renderToStaticMarkup(el);
  }
  return (key) => toStr(mod.default(key));
}

// normalise any output to an svg string
function toSvg(out) {
  if (out instanceof Uint8ClampedArray || out instanceof Uint8Array) {
    const png = encodePng(32, 32, out);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><image width="1" height="1" preserveAspectRatio="none" href="data:image/png;base64,${b64(png)}"/></svg>`;
  }
  if (typeof out !== 'string') throw new Error('unsupported output ' + typeof out);
  if (out.startsWith('data:image/svg+xml')) {
    const i = out.indexOf(','), head = out.slice(0, i), body = out.slice(i + 1);
    return head.includes('base64') ? Buffer.from(body, 'base64').toString() : decodeURIComponent(body);
  }
  // geopattern's sine-wave paths contain a stray comma ("S 530 0, 600, 67") that makes resvg panic (fatal); browsers truncate the path instead.
  out = out.replace(/(S [\d.]+ [\d.]+), ([\d.]+), ([\d.]+)/g, '$1, $2 $3');
  const k = out.indexOf('<svg');
  if (k < 0) throw new Error('no <svg in output: ' + out.slice(0, 60));
  return out.slice(k);
}

// force a square size on the root <svg>, centre-cropping non-square art
function fitSquare(svg, px) {
  const m = svg.match(/<svg\b[^>]*>/);
  let tag = m[0];
  const attr = (n) => (tag.match(new RegExp(`\\s${n}=["']([^"']*)["']`)) || [])[1];
  let vb = attr('viewBox');
  if (!vb) { const w = parseFloat(attr('width')), h = parseFloat(attr('height')); vb = `0 0 ${w || 100} ${h || 100}`; }
  tag = tag.replace(/\s(width|height|viewBox|preserveAspectRatio)=("[^"]*"|'[^']*')/g, '');
  // centre-crop non-square art by hand: resvg panics on preserveAspectRatio="slice" with a non-square viewBox
  const [vx, vy, vw, vh] = vb.split(/[\s,]+/).map(Number), side = Math.min(vw, vh);
  const ox = vx + (vw - side) / 2, oy = vy + (vh - side) / 2;
  vb = `${ox} ${oy} ${side} ${side}`;
  tag = tag.replace('<svg', `<svg width="${px}" height="${px}" viewBox="${vb}"`);
  // resvg panics (fatal) on geopattern wave paths translated far outside the visible window; they are invisible, so drop them.
  svg = svg.replace(/<path[^>]*transform="translate\((-?[\d.]+),(-?[\d.]+)\)"[^>]*><\/path>/g, (q, x, y) => (+y > oy + side + 20 || +y < oy - 250 || +x > ox + side + 20 ? '' : q));
  if (!/xmlns=/.test(tag)) tag = tag.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  return svg.replace(m[0], tag);
}
const raster = (svg, px) => (process.env.DBG && console.error(fitSquare(svg, px).slice(0, 200)), 0) || new Resvg(fitSquare(svg, px), { fitTo: { mode: 'width', value: px } }).render();

// ---------- 3. metrics
const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

function metrics(svgs) {
  const imgs = svgs.map((s) => raster(s, METRIC_PX));
  const bgL = hexRgb(BG.light), bgD = hexRgb(BG.dark), Ll = lum(...bgL), Ld = lum(...bgD);
  const vecs = [], contrast = { light: [], dark: [] };
  for (const im of imgs) {
    const px = im.pixels, v = new Float32Array(METRIC_PX * METRIC_PX * 3);
    let sl = 0, sd = 0, n = 0;
    for (let i = 0; i < METRIC_PX * METRIC_PX; i++) {
      const a = px[i * 4 + 3] / 255; // composite over white for the distance metric
      let r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2];
      const pm = a > 0 && a < 1 ? 1 : 1; // resvg returns straight alpha
      v[i * 3] = r * a + 255 * (1 - a); v[i * 3 + 1] = g * a + 255 * (1 - a); v[i * 3 + 2] = b * a + 255 * (1 - a);
      if (px[i * 4 + 3] >= 128) { const L = lum(r, g, b); sl += (Math.max(L, Ll) + 0.05) / (Math.min(L, Ll) + 0.05); sd += (Math.max(L, Ld) + 0.05) / (Math.min(L, Ld) + 0.05); n++; }
    }
    vecs.push(v);
    contrast.light.push(n ? sl / n : 1); contrast.dark.push(n ? sd / n : 1);
  }
  const norm = 255 * Math.sqrt(METRIC_PX * METRIC_PX * 3), d = [];
  for (let i = 0; i < vecs.length; i++) for (let j = i + 1; j < vecs.length; j++) {
    let s = 0; const a = vecs[i], b = vecs[j];
    for (let k = 0; k < a.length; k++) { const t = a[k] - b[k]; s += t * t; }
    d.push(Math.sqrt(s) / norm);
  }
  d.sort((x, y) => x - y);
  const vanish = (arr) => arr.filter((c) => c < VANISH_CONTRAST).length;
  const flag = (arr) => (vanish(arr) / arr.length > VANISH_SHARE ? 'VANISHES' : 'ok');
  return {
    pairs: d.length, minDistance: +d[0].toFixed(4), p1Distance: +pct(d, 0.01).toFixed(4), medianDistance: +median(d).toFixed(4),
    nearDupPairs: d.filter((x) => x < NEAR_DUP).length,
    contrastLight: +(contrast.light.reduce((a, b) => a + b, 0) / N_KEYS).toFixed(2), contrastDark: +(contrast.dark.reduce((a, b) => a + b, 0) / N_KEYS).toFixed(2),
    vanishLight: vanish(contrast.light), vanishDark: vanish(contrast.dark), flagLight: flag(contrast.light), flagDark: flag(contrast.dark),
  };
}

// ---------- 2. contact sheets
function contactSheet(lib, r, svgsByName, noteLine) {
  const COLS = 3, ROWS = 8, GAP = 8, LABEL = 16, cellW = SIZES.reduce((a, s) => a + s + GAP, GAP), cellH = 128 + LABEL + GAP * 2;
  const panelW = COLS * cellW, panelH = ROWS * cellH, HEAD = 28, W = panelW * 2, H = panelH + HEAD;
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#888"/>`,
    `<text x="8" y="19" font-family="sans-serif" font-size="14" fill="#fff">${esc(lib.id)} ${esc(r.version)} (${SIZES.join('/')} px, light | dark)</text>`];
  const pngs = new Map();
  NAMES.forEach((name) => SIZES.forEach((s) => pngs.set(name + s, b64(raster(svgsByName.get(name), s).asPng()))));
  ['light', 'dark'].forEach((theme, pi) => {
    parts.push(`<rect x="${pi * panelW}" y="${HEAD}" width="${panelW}" height="${panelH}" fill="${BG[theme]}"/>`);
    NAMES.forEach((name, i) => {
      const cx = pi * panelW + (i % COLS) * cellW, cy = HEAD + Math.floor(i / COLS) * cellH;
      let x = cx + GAP;
      for (const s of SIZES) { parts.push(`<image x="${x}" y="${cy + GAP}" width="${s}" height="${s}" href="data:image/png;base64,${pngs.get(name + s)}"/>`); x += s + GAP; }
      parts.push(`<text x="${cx + GAP}" y="${cy + GAP + 128 + 13}" font-family="sans-serif" font-size="11" fill="${theme === 'light' ? '#444' : '#bbb'}">${esc(name.length > 38 ? name.slice(0, 37) + '…' : name)}</text>`);
    });
  });
  parts.push('</svg>');
  const sheet = parts.join('');
  let scale = 1, png;
  for (const sc of [1, 0.85, 0.7, 0.55, 0.45, 0.35]) { png = new Resvg(sheet, { fitTo: { mode: 'zoom', value: sc } }).render().asPng(); scale = sc; if (png.length < MAX_PNG) break; }
  writeFileSync(`${SHEETS}${lib.id}.png`, png);

  // HTML: each name's SVG embedded once as a CSS variable
  const uris = NAMES.map((n, i) => `--i${i}:url("data:image/svg+xml;base64,${b64(fitSquare(svgsByName.get(n), 128))}")`).join(';');
  const panel = (theme) => `<section class="p ${theme}">${NAMES.map((n, i) => `<figure>${SIZES.map((s) => `<i style="width:${s}px;height:${s}px;background-image:var(--i${i})"></i>`).join('')}<figcaption>${esc(n)}</figcaption></figure>`).join('')}</section>`;
  const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${lib.id} contact sheet</title>
<style>:root{${uris}}body{margin:0;font:13px sans-serif;background:#888}h1{font-size:15px;color:#fff;margin:8px}.w{display:flex;flex-wrap:wrap}.p{flex:1 1 520px;padding:8px;display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}.light{background:${BG.light};color:#444}.dark{background:${BG.dark};color:#bbb}figure{margin:0;display:flex;flex-wrap:wrap;align-items:flex-end;gap:8px}figcaption{flex-basis:100%;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}i{display:block;background-size:cover;background-position:center}</style>
<h1>${lib.id} ${r.version} - ${esc(noteLine)} (<a style="color:#fff" href="${lib.id}.png">PNG</a>)</h1><div class="w">${panel('light')}${panel('dark')}</div>`;
  writeFileSync(`${SHEETS}${lib.id}.html`, html);
  return { png: `contact-sheets/${lib.id}.png`, html: `contact-sheets/${lib.id}.html`, pngBytes: png.length, pngScale: scale };
}

// ---------- main
function pkgInfo(name) {
  const dir = ROOT + 'node_modules/' + name + '/', p = JSON.parse(readFileSync(dir + 'package.json', 'utf8'));
  const lic = typeof p.license === 'string' ? p.license : p.license?.type ?? (p.licenses ? p.licenses.map((l) => l.type).join(' OR ') : 'UNKNOWN');
  return { name, version: p.version, license: lic, dir };
}

rmSync(TMP, { recursive: true, force: true }); mkdirSync(TMP, { recursive: true }); mkdirSync(SHEETS, { recursive: true });
const keys = syntheticKeys(N_KEYS);
const results = {};
for (const lib of LIBS) {
  if (only.length && !only.includes(lib.id)) continue;
  const infos = lib.pkgs.map(pkgInfo);
  const main = infos[0] ?? { version: 'in-house', license: 'MIT (ours)' };
  const r = { id: lib.id, packages: infos.map((i) => `${i.name}@${i.version}`), version: main.version, license: [...new Set(infos.map((i) => i.license))].join(' + ') || main.license, note: lib.note };
  if (lib.id === 'multiavatar') { r.licenseNote = readFileSync(infos[0].dir + 'LICENSE', 'utf8').split('\n').slice(0, 6).join(' ').slice(0, 300); }
  try { Object.assign(r, await bundle(lib)); delete r.outfile; r.bytes = { min: r.minBytes, gzip: r.gzipBytes, brotli: r.brotliBytes }; }
  catch (e) { r.bundleError = String(e.message).slice(0, 300); results[lib.id] = r; console.log(lib.id, 'BUNDLE FAIL', r.bundleError); continue; }
  if (lib.noRender) { r.render = 'skipped: ' + lib.dom; results[lib.id] = r; console.log(lib.id, r.gzipBytes, 'gzip (no render)'); continue; }
  if (lib.dom) installDomShim(); else delete globalThis.document;
  try {
    const render = await loadRenderer(lib, `${TMP}${lib.id}.mjs`);
    render(keys[0]);
    const svgs = [], times = [];
    for (let i = 0; i < 20; i++) render(keys[i]); // warm-up
    let deterministic = true;
    for (const k of keys) {
      const t0 = process.hrtime.bigint(); const out = render(k); times.push(Number(process.hrtime.bigint() - t0) / 1e6);
      const again = render(k);
      if (JSON.stringify(out instanceof Uint8ClampedArray ? Array.from(out) : out) !== JSON.stringify(again instanceof Uint8ClampedArray ? Array.from(again) : again)) deterministic = false;
      svgs.push(toSvg(out));
    }
    r.deterministic = deterministic; r.msPerImage = +median(times).toFixed(3);
    r.metrics = metrics(svgs);
    r.outputBytesMedian = median(svgs.map((s) => Buffer.byteLength(s)));
    const byName = new Map(NAMES.map((n) => [n, toSvg(render(n))]));
    r.sheet = contactSheet(lib, r, byName, lib.note);
    console.log(lib.id, r.gzipBytes, 'gzip', 'nearDup', r.metrics.nearDupPairs, 'min', r.metrics.minDistance, 'ms', r.msPerImage, 'det', deterministic, 'png', r.sheet.pngBytes);
  } catch (e) { r.renderError = String(e.stack).slice(0, 500); console.log(lib.id, 'RENDER FAIL', r.renderError); }
  results[lib.id] = r;
}

{
  if (only.length && existsSync(ROOT + 'results.json')) { const prev = JSON.parse(readFileSync(ROOT + 'results.json', 'utf8')).libs; for (const k of Object.keys(prev)) if (!(k in results)) results[k] = prev[k]; }
  writeFileSync(ROOT + 'results.json', JSON.stringify({ generated: new Date().toISOString().slice(0, 10), params: { nKeys: N_KEYS, metricPx: METRIC_PX, nearDupThreshold: NEAR_DUP, vanishContrast: VANISH_CONTRAST, vanishShare: VANISH_SHARE, backgrounds: BG, names: NAMES }, skipped: SKIPPED, libs: results }, null, 2));
  const kb = (n) => (n / 1024).toFixed(1);
  const rows = Object.values(results).sort((a, b) => a.gzipBytes - b.gzipBytes).map((r) => {
    const m = r.metrics;
    return `| [${r.id}](${r.sheet ? r.sheet.html : '#'}) | ${r.version} | ${r.license} | ${kb(r.minBytes)} | ${kb(r.gzipBytes)} | ${kb(r.brotliBytes)} | ${m ? m.nearDupPairs : 'n/a'} | ${m ? m.minDistance : 'n/a'} | ${m ? `${m.flagLight} (${m.contrastLight}) / ${m.flagDark} (${m.contrastDark})` : 'n/a'} | ${r.msPerImage ?? 'n/a'} | ${r.deterministic === undefined ? 'n/a' : r.deterministic ? 'y' : 'n'} |`;
  });
  const table = ['| library | version | licence | min kB | gzip kB | brotli kB | near-dup pairs | min dist | light / dark contrast | ms/image | deterministic |', '|---|---|---|---|---|---|---|---|---|---|---|', ...rows].join('\n');
  const readme = ROOT + 'README.md';
  if (existsSync(readme)) {
    const src = readFileSync(readme, 'utf8'), a = '<!-- table:start -->', b = '<!-- table:end -->';
    if (src.includes(a)) writeFileSync(readme, src.replace(new RegExp(`${a}[\\s\\S]*${b}`), `${a}\n${table}\n${b}`));
  }
  console.log('\n' + table);
}
