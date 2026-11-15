/**
 * `preview`: a contact sheet an agent (or a person) can look at, plus simple
 * distinguishability metrics (B11, B14).
 *
 * Rows are generators; columns are sample items; each cell shows the item at 16, 32,
 * 64 and 128 px on a light and a dark background. Written as HTML (always) and PNG
 * (when resvg is installed). The sheet shows at most `SHEET_MAX_ITEMS` items.
 *
 * Metrics: each generator rendered at 32 px, then the minimum and median pairwise RGB
 * distance and the number of near-duplicate pairs. They run on the app's own samples
 * when there are at least `METRICS_MIN_SAMPLES` of them (up to `METRICS_MAX_ITEMS`),
 * else on `METRICS_SYNTHETIC_ITEMS` generated items; `metricsOn` says which.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Item } from '../types.js';
import { BUILTIN_BY_REF } from './builtins.js';
import type { LoadedConfig } from './config.js';
import { diag, envelope, type Diagnostic, type Envelope } from './diagnostics.js';
import { loadResvg, missingResvg, svgPixels, svgToPng } from './raster.js';
import { nodeSigil } from './runtime.js';

export const DEFAULT_SAMPLE_ITEMS: Item[] = [
  { id: 'trk_01', title: 'Blue Monday', type: 'song' },
  { id: 'trk_02', title: 'Ocean Drive', type: 'song' },
  { id: 'usr_ada', name: 'Ada Lovelace', type: 'user' },
  { id: 'usr_grace', name: 'Grace Hopper', type: 'user' },
  { id: 'prj_alpha', title: 'Project Alpha', type: 'project' },
  { id: 'prj_beta', title: 'Project Beta', type: 'project' },
  { id: 'vid_9f1c', title: 'Launch keynote', type: 'video' },
  { id: 'doc_77', title: 'Quarterly notes', type: 'document' },
  { id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', title: 'UUID item', type: 'project' },
  { id: 'trk_03', title: 'Moonlight Sonata', type: 'song' },
  { id: 'usr_sam1', name: 'Sam Lee', type: 'user' },
  { id: 'usr_sam2', name: 'Sam Lee', type: 'user' },
];

const SIZES = [16, 32, 64, 128];
/** Columns on the contact sheet; more would not be legible. */
export const SHEET_MAX_ITEMS = 24;
/** Fewer samples than this give too few pairs for the metrics to mean much. */
export const METRICS_MIN_SAMPLES = 20;
export const METRICS_SYNTHETIC_ITEMS = 150;
/** Pairwise distances grow as n²; this keeps preview to seconds. */
export const METRICS_MAX_ITEMS = 400;
// Varied probe labels, so label-driven generators (initials, emoji) are measured fairly.
const FIRST = ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus', 'Margaret', 'Tim', 'Yuki', 'Amara', 'Diego', 'Noor', 'Olu', 'Priya', 'Sven', 'Zoe'];
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Johnson', 'Torvalds', 'Hamilton', 'Berners', 'Tanaka', 'Okafor', 'Rivera', 'Haddad'];
const BGS = { light: '#ffffff', dark: '#111111' };

export interface Metrics {
  items: number;
  minDistance: number;
  medianDistance: number;
  nearDuplicates: number;
  /** Set when the generator draws text: pixels depend on this machine's fonts (Node has no colour-emoji font). */
  caveat?: string;
}

function distanceMetrics(pixels: Uint8Array[]): Metrics {
  const d: number[] = [];
  for (let i = 0; i < pixels.length; i++)
    for (let j = i + 1; j < pixels.length; j++) {
      const a = pixels[i]!;
      const b = pixels[j]!;
      let s = 0;
      for (let k = 0; k < a.length; k += 4) for (let c = 0; c < 3; c++) s += ((a[k + c]! - b[k + c]!) / 255) ** 2;
      d.push(Math.sqrt(s / ((a.length / 4) * 3)));
    }
  d.sort((x, y) => x - y);
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { items: pixels.length, minDistance: r(d[0] ?? 0), medianDistance: r(d[Math.floor(d.length / 2)] ?? 0), nearDuplicates: d.filter((x) => x < 0.05).length };
}

export async function preview(
  loaded: LoadedConfig,
  opts: { generators?: string[]; items?: Item[]; out?: string; metricsN?: number } = {},
): Promise<Envelope<{ files: Record<string, string>; grid: { generators: string[]; items: number; of: number; sizes: number[]; backgrounds: string[] }; metricsOn: 'samples' | 'synthetic'; metrics: Record<string, Metrics> }>> {
  const diagnostics: Diagnostic[] = [];
  const sigil = await nodeSigil(loaded, { remote: false });
  const refs = opts.generators?.length ? opts.generators : Object.keys(BUILTIN_BY_REF);
  const all = opts.items?.length ? opts.items : DEFAULT_SAMPLE_ITEMS;
  const items = all.slice(0, SHEET_MAX_ITEMS);
  const metricsOn: 'samples' | 'synthetic' = (opts.items?.length ?? 0) >= METRICS_MIN_SAMPLES ? 'samples' : 'synthetic';
  const synthetic = (i: number): Item => {
    const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}`;
    return { id: `metric-${i}`, title: name, name, type: 'project' };
  };
  const metricItems = metricsOn === 'samples' ? opts.items!.slice(0, METRICS_MAX_ITEMS) : Array.from({ length: Math.min(opts.metricsN ?? METRICS_SYNTHETIC_ITEMS, METRICS_MAX_ITEMS) }, (_, i) => synthetic(i));
  const outDir = resolve(loaded.dir, opts.out ?? '.sigilsmith/preview');
  mkdirSync(outDir, { recursive: true });
  const cells: Record<string, string[]> = {};
  for (const ref of refs) {
    if (!BUILTIN_BY_REF[ref]) {
      diagnostics.push(diag('SGS0104', 'warning', `\`${ref}\` is not a local generator; skipped in the preview`));
      continue;
    }
    cells[ref] = [];
    for (const item of items) {
      const img = await sigil.render(item, { ref });
      cells[ref]!.push(img.type === 'svg' ? img.svg : '');
    }
  }
  const label = (it: Item) => String(it.title ?? it.name ?? it.id ?? '');
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const uri = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const html = `<!doctype html><meta charset="utf-8"><title>sigilsmith preview</title>
<style>body{font:12px system-ui;margin:16px}table{border-collapse:collapse}td,th{padding:6px;vertical-align:middle;text-align:center}th{font-weight:600;max-width:90px}.l{background:#fff}.d{background:#111;color:#eee}img{margin:2px;vertical-align:middle}</style>
<table><tr><th>generator</th>${items.map((it) => `<th>${esc(label(it))}</th>`).join('')}</tr>
${Object.entries(cells)
  .map(([ref, svgs]) => Object.entries(BGS).map(([name]) => `<tr class="${name[0]}"><th>${ref}<br>${name}</th>${svgs.map((s) => `<td>${SIZES.map((z) => `<img src="${uri(s)}" width="${z}" height="${z}" alt="">`).join('')}</td>`).join('')}</tr>`).join('\n'))
  .join('\n')}</table>`;
  const files: Record<string, string> = { html: resolve(outDir, 'sheet.html') };
  writeFileSync(files.html!, html);

  const metrics: Record<string, Metrics> = {};
  if (loadResvg(loaded.dir)) {
    // PNG sheet: per generator two rows (light, dark); each cell 128+64+32+16 px side by side.
    const cellW = SIZES.reduce((s, z) => s + z + 4, 4);
    const rowH = 136;
    const left = 120;
    const W = left + cellW * items.length;
    const H = 24 + rowH * 2 * Object.keys(cells).length;
    let body = `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
    items.forEach((it, c) => (body += `<text x="${left + c * cellW + 4}" y="16" font-family="sans-serif" font-size="11" fill="#333">${esc(label(it).slice(0, 22))}</text>`));
    Object.entries(cells).forEach(([ref, svgs], r) => {
      Object.entries(BGS).forEach(([name, bg], b) => {
        const y0 = 24 + (r * 2 + b) * rowH;
        body += `<rect x="0" y="${y0}" width="${W}" height="${rowH}" fill="${bg}"/><text x="6" y="${y0 + 20}" font-family="sans-serif" font-size="12" fill="${b ? '#eee' : '#111'}">${ref}</text><text x="6" y="${y0 + 36}" font-family="sans-serif" font-size="10" fill="#888">${name}</text>`;
        svgs.forEach((s, c) => {
          let x = left + c * cellW + 4;
          for (const z of [...SIZES].reverse()) {
            body += s.replace(/^<svg /, `<svg x="${x}" y="${y0 + (rowH - z) / 2}" width="${z}" height="${z}" `);
            x += z + 4;
          }
        });
      });
    });
    const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${body}</svg>`;
    files.png = resolve(outDir, 'sheet.png');
    writeFileSync(files.png, svgToPng(sheet, W));
    for (const ref of Object.keys(cells)) {
      const pix: Uint8Array[] = [];
      for (const item of metricItems) {
        // A sample without a usable key is reported by `check`, not here; skip it.
        const img = await sigil.render(item, { ref }).catch(() => null);
        const p = img?.type === 'svg' ? svgPixels(img.svg, 32, '#808080') : null;
        if (p) pix.push(p);
      }
      metrics[ref] = distanceMetrics(pix);
      if (cells[ref]!.some((svg) => svg.includes('<text'))) metrics[ref]!.caveat = "draws <text>: measured with this machine's fonts; emoji render blank without a colour-emoji font, so judge them in a browser";
    }
  } else diagnostics.push(missingResvg());
  files.json = resolve(outDir, 'sheet.json');
  writeFileSync(files.json, JSON.stringify({ generators: Object.keys(cells), items: items.map(label), of: all.length, sizes: SIZES, backgrounds: Object.keys(BGS), metricsOn, metrics }, null, 2));
  return envelope(
    'preview',
    { files, grid: { generators: Object.keys(cells), items: items.length, of: all.length, sizes: SIZES, backgrounds: Object.keys(BGS) }, metricsOn, metrics },
    diagnostics,
    [{ command: files.png ? `open ${files.png}` : `open ${files.html}`, why: 'look at the sheet: rows are generators (light, then dark), columns are items at 128/64/32/16 px' }],
  );
}
