/**
 * A small LRU of display URLs, so a remounted `<Sigil>` with an unchanged plan shows its image on
 * the first paint (#10). It owns the blob object URLs it holds and revokes them on eviction.
 */
export const DEFAULT_DISPLAY_CACHE_SIZE = 500;

export class DisplayUrlCache {
  private readonly entries = new Map<string, { src: string; blob: boolean }>();
  constructor(private readonly max: number = DEFAULT_DISPLAY_CACHE_SIZE) {}

  get(key: string): string | undefined {
    const hit = this.entries.get(key);
    if (!hit) return undefined;
    this.entries.delete(key); // refresh recency
    this.entries.set(key, hit);
    return hit.src;
  }

  set(key: string, src: string, blob: boolean): void {
    const old = this.entries.get(key);
    if (old && old.src !== src && old.blob) URL.revokeObjectURL(old.src);
    this.entries.delete(key);
    this.entries.set(key, { src, blob });
    while (this.entries.size > this.max) {
      const [oldest, entry] = this.entries.entries().next().value as [string, { src: string; blob: boolean }];
      this.entries.delete(oldest);
      if (entry.blob) URL.revokeObjectURL(entry.src);
    }
  }

  get size(): number {
    return this.entries.size;
  }
}

const perSigil = new WeakMap<object, DisplayUrlCache>();

/** The cache belonging to one `Sigil` instance (images of one wiring never mix with another's). */
export function displayCacheFor(sigil: object): DisplayUrlCache {
  let c = perSigil.get(sigil);
  if (!c) perSigil.set(sigil, (c = new DisplayUrlCache()));
  return c;
}
