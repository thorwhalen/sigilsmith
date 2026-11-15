/**
 * `screenshot@1`, an extra: a key screenshot as the thumbnail, cropped to the one thing
 * that identifies the item (a game's signature moment, a document's title block), with
 * a generated sigil when there is no screenshot.
 *
 * Extras sit outside the kernel: nothing in `sigilsmith` imports this module, and an app
 * ships it only when its config can select `screenshot@1` (the wiring module then
 * imports `sigilsmith/extras/screenshot/v1`).
 *
 * Inputs: `screenshot` (the image URL, as `src`), `screenshotFocus` (the region, as
 * `focus`), `$label` and `$key`. The focus is a point (`"0.3,0.6"`, `{x, y, zoom}`) or a
 * rectangle (`"0.1,0.2,0.4,0.4"`, `{x, y, w, h}`), in fractions of the image when every
 * coordinate is ≤ 1 and in pixels otherwise; a point takes the largest square that fits
 * divided by `zoom`. The crop is centred on the region and fills the tile.
 *
 * The output is an SVG with the screenshot embedded as a data URI and placed so the
 * region fills the tile: it shows wherever an
 * SVG does (an `<img>` cannot load external files from inside an SVG), it is byte-stable
 * for the same file, and the CLI can preview and check it. Ship small key frames (a few
 * hundred pixels, WebP), not full captures: `maxBytes` refuses big ones.
 *
 * Fallback: an item with no screenshot gets the `fallback` generator, drawn exactly as
 * that generator would draw the item at its defaults (same seed, hash and palette: the
 * kernel's `renderContext` and `selectInputs`). To fall back to whatever the app would
 * otherwise draw (a feature-driven glyph, a preset), guard the rule instead:
 * `{ "when": { "screenshot": { "exists": true } }, "use": "screenshot@1" }`. A screenshot
 * that cannot be used (missing file, network, CORS, an unreadable or oversized file, a
 * malformed focus) throws an `SGS0305` error, which the app shows as a retry and `check`
 * reports on the sample items. A missing file is an error, not a fallback, so a stored
 * image never keeps a fallback for a URL whose file appears later.
 *
 * Kind `content`: presets never replace its inputs (a preset's `semanticInputs` would
 * drop the screenshot). The ring and background take the item's identity colour from
 * `$key` alone, so they match whatever else the app draws for it.
 *
 * Determinism: pure in its inputs and the file's bytes. Replacing a file in place changes
 * its thumbnail under `derived` delivery (the image follows the file); a stored
 * (materialized) thumbnail only changes when the URL does, so use content-hashed file
 * names there.
 *
 * Frozen: this module's output for a given file, inputs and params never changes.
 */
import { renderContext } from '../../context.js';
import { hash32 } from '../../hash.js';
import { imageInfo } from '../../image-info.js';
import { selectInputs } from '../../inputs.js';
import { paletteFromHash } from '../../palette.js';
import { n, svgDoc, svgImage, tile } from '../../svg.js';
import type { FetchLike, GeneratorModule, RenderContext, SigilImage } from '../../types.js';
import { meta, type FallbackId, type ScreenshotParams } from './meta.js';

export type { FallbackId, FetchLike, ScreenshotParams };

export type Focus = { kind: 'point'; x: number; y: number; zoom?: number } | { kind: 'rect'; x: number; y: number; w: number; h: number };

export class ScreenshotError extends Error {
  readonly code = 'SGS0305';
  constructor(message: string) {
    super(`SGS0305: ${message}`);
    this.name = 'ScreenshotError';
  }
}

/** Parse a focus written as `"x,y"`, `"x,y,zoom"`, `"x,y,w,h"` or the same as a JSON object. */
export function parseFocus(text: string): Focus {
  const s = text.trim();
  let nums: number[];
  try {
    if (s.startsWith('{')) {
      const o = JSON.parse(s) as Record<string, number | undefined>;
      nums = [o.x, o.y, ...(o.w !== undefined || o.h !== undefined ? [o.w, o.h] : o.zoom !== undefined ? [o.zoom] : [])].map((v) => (typeof v === 'number' ? v : NaN));
    } else nums = s.split(/[\s,]+/).filter(Boolean).map(Number);
  } catch {
    nums = [];
  }
  const [x, y, a, b] = nums as [number, number, number, number];
  if (nums.length < 2 || nums.length > 4 || nums.some((v) => !(v >= 0)) || (nums.length === 4 && !(a > 0 && b > 0))) {
    throw new ScreenshotError(`bad focus \`${s}\`: use "x,y", "x,y,zoom" or "x,y,w,h" (non-negative; w, h > 0)`);
  }
  return nums.length === 4 ? { kind: 'rect', x, y, w: a, h: b } : { kind: 'point', x, y, ...(nums.length === 3 ? { zoom: a } : {}) };
}

/** The region of a `width`×`height` image to show, clamped inside it. */
export function cropRect(width: number, height: number, focus: Focus, zoom: number): { x: number; y: number; w: number; h: number } {
  const coords = focus.kind === 'rect' ? [focus.x, focus.y, focus.w, focus.h] : [focus.x, focus.y];
  const fractions = coords.every((v) => v <= 1);
  const px = (v: number, of: number) => (fractions ? v * of : v);
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
  let w: number, h: number, cx: number, cy: number;
  if (focus.kind === 'rect') {
    w = clamp(px(focus.w, width), 1, width);
    h = clamp(px(focus.h, height), 1, height);
    cx = px(focus.x, width) + px(focus.w, width) / 2;
    cy = px(focus.y, height) + px(focus.h, height) / 2;
  } else {
    w = h = Math.min(width, height) / Math.max(1, focus.zoom ?? zoom);
    cx = px(focus.x, width);
    cy = px(focus.y, height);
  }
  return { x: clamp(cx - w / 2, 0, width - w), y: clamp(cy - h / 2, 0, height - h), w, h };
}

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const FALLBACKS: Record<FallbackId, () => Promise<{ default: GeneratorModule<any> }>> = {
  grid: () => import('../../generators/grid/v1.js'),
  rings: () => import('../../generators/rings/v1.js'),
  shapes: () => import('../../generators/shapes/v1.js'),
  initials: () => import('../../generators/initials/v1.js'),
};

/** Draw the item as `fallback` would at its defaults: same seed, hash, palette and fields as the kernel would give it. */
async function drawFallback(id: FallbackId, ctx: RenderContext<ScreenshotParams>): Promise<SigilImage> {
  const mod = (await FALLBACKS[id]()).default;
  // The fallbacks read only `$key` and `$label`, so an empty item gives the kernel's inputs.
  const { fields, seed } = selectInputs({}, mod.defaultInputs, { key: ctx.fields.key ?? ctx.seed, label: ctx.fields.label });
  return mod.render(renderContext(`${mod.id}@${mod.major}`, seed, fields, mod.defaults, ctx.size));
}

function ringMarkup(shape: ScreenshotParams['shape'], width: number, colour: string): string {
  const w = Math.min(Math.max(width, 0), 20);
  if (w === 0) return '';
  const half = w / 2;
  const stroke = `fill="none" stroke="${colour}" stroke-width="${n(w)}"`;
  if (shape === 'circle') return `<circle cx="50" cy="50" r="${n(50 - half)}" ${stroke}/>`;
  const r = shape === 'rounded' ? ` rx="${n(Math.max(16 - half, 0))}"` : '';
  return `<rect x="${n(half)}" y="${n(half)}" width="${n(100 - w)}" height="${n(100 - w)}"${r} ${stroke}/>`;
}

/** Build the extra with its own file loader (default: the global `fetch`). */
export function createScreenshot(opts: { fetch?: FetchLike } = {}): GeneratorModule<ScreenshotParams> {
  const load: FetchLike = opts.fetch ?? ((url) => fetch(url));
  return {
    ...meta,
    async render(ctx) {
      const { fields, params } = ctx;
      const palette = paletteFromHash(hash32(fields.key ?? ctx.seed));
      const src = fields.src;
      if (!src) return drawFallback(params.fallback, ctx);
      let res: Awaited<ReturnType<FetchLike>>;
      try {
        res = await load(src);
      } catch (e) {
        throw new ScreenshotError(`cannot load \`${src}\`: ${(e as Error).message} (another origin needs CORS)`);
      }
      if (!res.ok) throw new ScreenshotError(`cannot load \`${src}\`: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (bytes.length > params.maxBytes) throw new ScreenshotError(`\`${src}\` is over maxBytes (${bytes.length} > ${params.maxBytes}); ship a small key frame`);
      const info = imageInfo(bytes);
      if (!info) throw new ScreenshotError(`\`${src}\` is not a PNG, JPEG, GIF or WebP`);
      const c = cropRect(info.width, info.height, parseFocus(fields.focus ?? params.focus), params.zoom);
      const clip = `c${ctx.hash.toString(36)}`;
      const style = params.pixelated ? ' style="image-rendering:pixelated"' : '';
      // Scale so the crop covers the 100×100 tile, centred on the crop (no nested <svg>:
      // its viewBox clipping differs between engines).
      const k = 100 / Math.min(c.w, c.h);
      const image = `<image x="${n(50 - k * (c.x + c.w / 2))}" y="${n(50 - k * (c.y + c.h / 2))}" width="${n(k * info.width)}" height="${n(k * info.height)}"${style} href="data:${info.mime};base64,${toBase64(bytes)}"/>`;
      const body = `<defs><clipPath id="${clip}">${tile('#000', params.shape)}</clipPath></defs><g clip-path="url(#${clip})">${tile(palette.background, 'square')}${image}</g>${ringMarkup(params.shape, params.ring, palette.primary)}`;
      return svgImage(svgDoc(body));
    },
  };
}

const screenshot = createScreenshot();
export default screenshot;
