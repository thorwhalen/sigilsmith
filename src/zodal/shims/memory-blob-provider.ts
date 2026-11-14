/**
 * SHIM: upstream i2mint/zodal gap G11 (docs/design/proposal.md §10); delete when
 * `@zodal/store` ships an in-memory provider with content methods.
 *
 * `createInMemoryProvider` stores records but has no `setContent`/`getContent`/
 * `getUrl`, so there is no zero-dependency blob provider for tests and demos. This one
 * keeps blobs in a Map and serves them as data URLs (works in Node and the browser),
 * and delegates record methods to `createInMemoryProvider`.
 */
import { createInMemoryProvider, type DataProvider } from '@zodal/store';

async function toDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (blob.type === 'image/svg+xml') return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new TextDecoder().decode(bytes))}`;
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(s)}`;
}

export function createMemoryBlobProvider<T extends { id: string }>(initial: T[] = []): DataProvider<T> & { contentCount(): number } {
  const records = createInMemoryProvider<T>(initial, { idField: 'id' } as never);
  const blobs = new Map<string, { blob: Blob; url: string }>();
  const k = (id: string, field: string) => `${id}\u0000${field}`;
  return {
    ...records,
    async setContent(id, field, content) {
      const blob = content instanceof Blob ? content : new Blob([content as BlobPart]);
      const url = await toDataUrl(blob);
      blobs.set(k(id, field), { blob, url });
      return { _tag: 'ContentRef', field, itemId: id, url, mimeType: blob.type, size: blob.size } as never;
    },
    async getContent(id, field) {
      const hit = blobs.get(k(id, field));
      if (!hit) throw new Error(`no content for ${id}/${field}`);
      return hit.blob;
    },
    async getUrl(id, field) {
      return blobs.get(k(id, field))?.url ?? null;
    },
    contentCount: () => blobs.size,
  };
}
