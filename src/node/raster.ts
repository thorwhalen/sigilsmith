/**
 * Node-side rasterising: SVG → PNG through `@resvg/resvg-js` (an optional peer, MPL-2.0,
 * used unmodified), ICO packing, PNG header reading, and the pixel grid used by the
 * preview metrics.
 */
import { createRequire } from 'node:module';
import { diag, type Diagnostic } from './diagnostics.js';

type ResvgCtor = new (svg: string, opts?: Record<string, unknown>) => { render(): { asPng(): Uint8Array; pixels: Uint8Array; width: number; height: number } };

let cached: ResvgCtor | null | undefined;

/** The resvg constructor, resolved from the host project first, then from this package. */
export function loadResvg(cwd = process.cwd()): ResvgCtor | null {
  if (cached !== undefined) return cached;
  for (const base of [`${cwd}/`, import.meta.url]) {
    try {
      cached = (createRequire(base)('@resvg/resvg-js') as { Resvg: ResvgCtor }).Resvg;
      return cached;
    } catch {
      /* try next */
    }
  }
  cached = null;
  return null;
}

export function missingResvg(): Diagnostic {
  return diag('SGS0402', 'warning', 'PNG output needs @resvg/resvg-js, which is not installed', { fix: { summary: 'install it as a dev dependency', applicability: 'machine-applicable', commands: ['npm i -D @resvg/resvg-js'] } });
}

/** Rasterise an SVG to a square PNG of `size` px. */
export function svgToPng(svg: string, size: number, opts: { background?: string } = {}): Uint8Array {
  const Resvg = loadResvg();
  if (!Resvg) throw new Error('SGS0402: @resvg/resvg-js is not installed');
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: true }, ...(opts.background ? { background: opts.background } : {}) });
  return r.render().asPng();
}

/** RGBA pixels of an SVG at `size` px (for near-duplicate metrics). */
export function svgPixels(svg: string, size: number, background: string): Uint8Array | null {
  const Resvg = loadResvg();
  if (!Resvg) return null;
  return new Resvg(svg, { fitTo: { mode: 'width', value: size }, background, font: { loadSystemFonts: svg.includes('<text') } }).render().pixels;
}

/** Width and height from a PNG's IHDR chunk, or null if the bytes are not a PNG. */
export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 24 || sig.some((b, i) => bytes[i] !== b)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: dv.getUint32(16), height: dv.getUint32(20) };
}

/** Pack PNG images into an ICO container (PNG-in-ICO, supported by every current browser). */
export function packIco(pngs: Uint8Array[]): Uint8Array {
  const header = 6 + 16 * pngs.length;
  const total = header + pngs.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, 0, true);
  dv.setUint16(2, 1, true);
  dv.setUint16(4, pngs.length, true);
  let offset = header;
  pngs.forEach((png, i) => {
    const { width, height } = pngSize(png) ?? { width: 0, height: 0 };
    const e = 6 + 16 * i;
    out[e] = width >= 256 ? 0 : width;
    out[e + 1] = height >= 256 ? 0 : height;
    dv.setUint16(e + 4, 1, true);
    dv.setUint16(e + 6, 32, true);
    dv.setUint32(e + 8, png.length, true);
    dv.setUint32(e + 12, offset, true);
    out.set(png, offset);
    offset += png.length;
  });
  return out;
}

/** Place an SVG inside a larger canvas: for maskable safe zones, opaque backgrounds and OG cards. */
export function composeSvg(inner: string, opts: { width: number; height: number; background: string; artSize: number; title?: string; ink?: string }): string {
  const { width, height, background, artSize } = opts;
  const x = opts.title ? Math.round(height * 0.12) : Math.round((width - artSize) / 2);
  const y = Math.round((height - artSize) / 2);
  const nested = inner.replace(/^<svg /, `<svg x="${x}" y="${y}" width="${artSize}" height="${artSize}" `);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const title = opts.title
    ? `<text x="${x + artSize + Math.round(height * 0.1)}" y="${Math.round(height / 2)}" dy="0.35em" font-family="system-ui, sans-serif" font-size="${Math.round(height * 0.1)}" font-weight="600" fill="${opts.ink ?? '#111111'}">${esc(opts.title.slice(0, 40))}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/>${nested}${title}</svg>`;
}
