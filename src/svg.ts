/**
 * Small, byte-stable SVG helpers shared by the in-house generators.
 *
 * Numbers are formatted with at most two decimals and no trailing zeros, attributes
 * are written in a fixed order, and every SVG uses `viewBox="0 0 100 100"` with no
 * width or height, so the markup does not depend on the display size.
 */
import type { SigilImage } from './types.js';

/** Format a number for SVG: ≤ 2 decimals, no trailing zeros, no `-0`. */
export function n(x: number): string {
  const r = Math.round(x * 100) / 100;
  return (Object.is(r, -0) ? 0 : r).toString();
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Wrap body markup in a square SVG document. */
export function svgDoc(body: string, opts: { title?: string } = {}): string {
  const title = opts.title ? `<title>${escapeXml(opts.title)}</title>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${title}${body}</svg>`;
}

/** Background tile: square, rounded square or circle. */
export function tile(fill: string, shape: 'square' | 'rounded' | 'circle'): string {
  if (shape === 'circle') return `<circle cx="50" cy="50" r="50" fill="${fill}"/>`;
  const r = shape === 'rounded' ? ' rx="16"' : '';
  return `<rect width="100" height="100"${r} fill="${fill}"/>`;
}

export function svgImage(svg: string): SigilImage {
  return { type: 'svg', svg };
}

/** `data:` URL for an SVG string, URI-encoded (smaller than base64 for SVG). */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

/** Best display URL for any image (object URLs must be revoked by the caller). */
export function toDisplayUrl(img: SigilImage): string {
  if (img.type === 'svg') return svgToDataUrl(img.svg);
  if (img.type === 'url') return img.url;
  return URL.createObjectURL(img.blob);
}

/** Bytes and MIME of an image, for storage. URL images are fetched. */
export async function toBytes(img: SigilImage, fetchFn: typeof fetch = fetch): Promise<{ bytes: Uint8Array; mime: string }> {
  if (img.type === 'svg') return { bytes: new TextEncoder().encode(img.svg), mime: 'image/svg+xml' };
  if (img.type === 'blob') return { bytes: new Uint8Array(await img.blob.arrayBuffer()), mime: img.mime };
  const res = await fetchFn(img.url);
  if (!res.ok) throw new Error(`could not fetch ${img.url}: HTTP ${res.status}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), mime: img.mime ?? res.headers.get('content-type') ?? 'application/octet-stream' };
}
