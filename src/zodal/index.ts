/**
 * `sigilsmith/zodal`: image storage through `@zodal/store` (B20). Light: no zod.
 *
 * `fromDataProvider` adapts any zodal blob provider (`store-http`, `store-localstorage`'s
 * IndexedDB provider, `store-s3`, `store-supabase`) to the kernel's `ImageStore` port,
 * so images go wherever the app's other content goes. End-user settings, which need
 * zod and dials, are in `sigilsmith/zodal/settings`.
 */
import type { DataProvider } from '@zodal/store';
import type { ImageStore } from '../delivery.js';
import { headViaUrl, toBlob } from './shims/content.js';

export { createMemoryBlobProvider } from './shims/memory-blob-provider.js';

/**
 * Adapt a zodal blob provider to the `ImageStore` port. Images are stored as the
 * `field` content of an item whose id is the content id (`sg_…`), which is safe as a
 * filename, an S3 key and a URL segment (zodal-fit G2).
 */
export function fromDataProvider(provider: DataProvider<any>, opts: { field?: string; fetch?: typeof fetch } = {}): ImageStore {
  const field = opts.field ?? 'image';
  if (!provider.setContent) throw new Error('this DataProvider has no content methods (setContent/getUrl); use a blob provider such as createHttpBlobProvider or createIndexedDBBlobProvider');
  return {
    head: (id) => headViaUrl(provider, id, field, opts.fetch),
    async put(id, data, { mime }) {
      const existing = await headViaUrl(provider, id, field, opts.fetch);
      if (existing) return existing;
      const ref = await provider.setContent!(id, field, toBlob(data, mime));
      const url = ref.url ?? (await provider.getUrl?.(id, field)) ?? null;
      if (url) return url;
      const blob = (await provider.getContent?.(id, field)) as Blob | undefined;
      if (blob && typeof URL !== 'undefined' && 'createObjectURL' in URL) return URL.createObjectURL(blob);
      throw new Error('provider stored the image but offers no URL for it');
    },
  };
}

