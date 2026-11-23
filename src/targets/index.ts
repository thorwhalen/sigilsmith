/**
 * Integration targets: registry, registration snippets and the Media Session helper.
 *
 * Browser-safe. Emitting files (rasterising PNGs, packing ICO) is Node-side, in
 * `sigilsmith/node` (`emitTargets`).
 */
import type { SigilRecord } from '../delivery.js';
import type { Item, SigilImage } from '../types.js';
import { TARGETS, type TargetSpec } from './registry.js';

export { TARGETS, getTarget } from './registry.js';
export type { TargetFile, TargetSpec } from './registry.js';

/** Fill a registration template. `{base}` is the public base URL (with trailing slash). */
export function snippet(target: TargetSpec, vars: Record<string, string>): string {
  if (target.registration.kind === 'manifest') {
    const icons = target.files.map((f) => ({
      src: `${vars.base ?? '/'}${f.path}`,
      sizes: `${f.width}x${f.height}`,
      type: 'image/png',
      ...(f.purpose && f.purpose !== 'any' ? { purpose: f.purpose } : {}),
    }));
    return JSON.stringify({ [target.registration.field]: icons }, null, 2);
  }
  return target.registration.template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export function listTargets(opts: { includeLegacy?: boolean } = {}, registry: readonly TargetSpec[] = TARGETS): TargetSpec[] {
  return registry.filter((t) => opts.includeLegacy || t.status !== 'legacy');
}

/**
 * Set lock-screen / notification artwork for the playing item (Media Session API).
 * `artwork` URLs must be fetchable by the OS, i.e. stored (B17): pass the record of a
 * materialized or hybrid delivery, or explicit URLs.
 */
export function setMediaSessionArtwork(
  meta: { title: string; artist?: string; album?: string },
  art: SigilRecord | Array<{ src: string; sizes: string; type?: string }>,
  nav: { mediaSession?: MediaSession } = typeof navigator === 'undefined' ? {} : navigator,
): boolean {
  if (!nav.mediaSession || typeof MediaMetadata === 'undefined') return false;
  const artwork = Array.isArray(art) ? art : art.url ? [{ src: art.url, sizes: '512x512', type: art.url.includes('svg') ? 'image/svg+xml' : 'image/png' }] : [];
  nav.mediaSession.metadata = new MediaMetadata({ ...meta, artwork });
  return true;
}

/** One Media Session artwork entry (`type` only when known). */
export interface ArtworkImage {
  src: string;
  sizes: string;
  type?: string;
}

/** Rasterise an SVG to a PNG data URL in the browser (Image + canvas). Lock screens and notifications do not take SVG. */
export function browserPng(svg: string, size: number): Promise<string> {
  // An SVG with only a viewBox has no intrinsic size, which some browsers refuse to draw.
  const sized = svg.replace(/^<svg(?![^>]*\swidth=)/, `<svg width="${size}" height="${size}"`);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = size;
        canvas.getContext('2d')!.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error('could not load the SVG to rasterise it'));
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(sized)}`;
  });
}

/** The MIME type of an image URL when it can be told from the URL; undefined otherwise. */
function typeOfUrl(url: string): string | undefined {
  const data = /^data:([^;,]+)/i.exec(url)?.[1];
  if (data) return data;
  const ext = /\.(png|jpe?g|webp|gif|svg)(\?|#|$)/i.exec(url)?.[1]?.toLowerCase();
  return ext ? ({ png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml' } as Record<string, string>)[ext] : undefined;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'image/png'};base64,${btoa(s)}`;
}

/**
 * Artwork for the playing item, matching what `<Sigil>` shows: a custom image's stored URL
 * (an upload or an adopted picture: raster by construction), else a PNG of the item's sigil
 * rendered in the browser (a stored generated image may be SVG, which lock screens refuse).
 * Replaces a hand-rolled canvas copy of an app's thumbnail, so the lock screen can never
 * drift from the list. Never throws: returns `[]` when nothing can be drawn.
 *
 * ```ts
 * navigator.mediaSession.metadata = new MediaMetadata({ title, artist, artwork: await mediaArtwork(sigil, song, { record: song.sigil }) });
 * ```
 */
export async function mediaArtwork(
  sigil: { render(item: Item, o?: { size?: number }): Promise<SigilImage> },
  item: Item,
  o: { record?: SigilRecord | null; size?: number; toPng?: (svg: string, size: number) => Promise<string> } = {},
): Promise<ArtworkImage[]> {
  const size = o.size ?? 256;
  const sizes = `${size}x${size}`;
  const entry = (src: string, type?: string): ArtworkImage[] => [{ src, sizes, ...(type ? { type } : {}) }];
  if (o.record?.source === 'custom' && o.record.url) return entry(o.record.url, typeOfUrl(o.record.url));
  try {
    const img = await sigil.render(item, { size });
    if (img.type === 'url') return entry(img.url, img.mime ?? typeOfUrl(img.url));
    if (img.type === 'blob') return entry(await blobToDataUrl(img.blob), img.mime); // a data URL: nothing to revoke
    return entry(await (o.toPng ?? browserPng)(img.svg, size), 'image/png');
  } catch {
    return [];
  }
}
