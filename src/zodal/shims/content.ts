/**
 * SHIM: upstream i2mint/zodal gap G3 (docs/research/zodal-fit.md); delete when
 * `@zodal/store` ships `headContent()` and write options (`mimeType`, `ifAbsent`).
 *
 * - `headViaUrl`: "is this content stored, and where?" without downloading it. Uses the
 *   provider's `headContent` when it exists, else `getUrl` + an HTTP HEAD for http(s)
 *   URLs, else `getContent`.
 * - `toBlob`: carries the MIME type on the value itself, which the HTTP, S3 and
 *   IndexedDB providers honour, since `setContent` has no options argument yet.
 */
import type { DataProvider } from '@zodal/store';

export async function headViaUrl(provider: DataProvider<any>, id: string, field: string, fetchFn?: typeof fetch): Promise<string | null> {
  const p = provider as DataProvider<any> & { headContent?: (id: string, field: string) => Promise<{ url?: string } | null> };
  if (p.headContent) return (await p.headContent(id, field))?.url ?? null;
  const url = (await provider.getUrl?.(id, field)) ?? null;
  if (url && /^https?:/.test(url)) {
    const f = fetchFn ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    const res = await f(url, { method: 'HEAD' });
    return res.ok ? url : null;
  }
  if (url) return url;
  try {
    const c = await provider.getContent?.(id, field);
    return c ? (typeof URL !== 'undefined' && c instanceof Blob ? URL.createObjectURL(c) : null) : null;
  } catch {
    return null;
  }
}

export function toBlob(data: Uint8Array, mime: string): Blob {
  return new Blob([data as BlobPart], { type: mime });
}
