/**
 * `sigilsmith/zodal`: storage and end-user settings through the zodal ecosystem (B20).
 *
 * - `fromDataProvider` adapts any `@zodal/store` blob provider (`store-http`,
 *   `store-localstorage`'s IndexedDB provider, `store-s3`, `store-supabase`) to the
 *   kernel's `ImageStore` port, so images go wherever the app's other content goes.
 * - `defineSigilSettings` turns the config's `userSettings` into a zodal-dials
 *   definition (B15): the dials store, panel and persistence then work unchanged, and
 *   `toUserLayer` feeds the result to the kernel as layer 5.
 *
 * This module imports zod and dials (~100 kB gzip): load it from the settings screen,
 * not from the list-rendering path.
 */
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import { createSettingsStore, toFieldStates, toSettingsForm, type SettingsStore } from '@zodal/dials-ui';
import type { DataProvider } from '@zodal/store';
import type { ImageStore } from '../delivery.js';
import type { ResolvedConfig, UserLayer } from '../types.js';
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

export interface SigilSettings {
  /** The zodal-dials definition: render it with any dials panel, persist it with any LayerStore. */
  dials: ReturnType<typeof defineDials>;
  /** Item types that get their own style setting. */
  types: string[];
  /** Map dials effective values to the kernel's user layer. */
  toUserLayer(effective: Record<string, unknown>): UserLayer;
}

/** Item types the policy distinguishes, read from rules that match on the item-type field. */
export function typesFromConfig(config: ResolvedConfig): string[] {
  const f = config.itemTypeField;
  const out = new Set<string>();
  if (!f) return [];
  for (const r of config.policy.rules) {
    const m = r.when[f];
    if (typeof m === 'string') out.add(m);
    else if (Array.isArray(m)) m.forEach((x) => out.add(String(x)));
  }
  return [...out].sort();
}

/**
 * End-user settings as a zodal-dials definition. Keys: `sigil.enabled`, then either one
 * `sigil.style` or one `sigil.style.<type>` per item type; values are `auto` (follow the
 * developer's policy) or one of the refs the developer allowed in `userSettings.choices`.
 */
export function defineSigilSettings(config: ResolvedConfig, opts: { types?: string[]; labels?: Record<string, string> } = {}): SigilSettings {
  const choices = config.userSettings.choices;
  const types = opts.types ?? (config.userSettings.perType ? typesFromConfig(config) : []);
  const styleEnum = () =>
    z
      .enum(['auto', ...choices] as [string, ...string[]])
      .default('auto')
      .meta({ enumLabels: { auto: 'Automatic', ...(opts.labels ?? {}) }, facets: { section: 'Thumbnails' } });
  const shape: Record<string, z.ZodType> = {
    'sigil.enabled': z.boolean().default(true).describe('Show generated thumbnails').meta({ facets: { section: 'Thumbnails' } }),
  };
  if (choices.length) {
    if (types.length) for (const t of types) shape[`sigil.style.${t}`] = styleEnum().describe(`Thumbnail style for ${t} items`);
    else shape['sigil.style'] = styleEnum().describe('Thumbnail style');
  }
  const dials = defineDials(z.object(shape));
  return {
    dials,
    types,
    toUserLayer(effective) {
      const style: Record<string, string> = {};
      for (const [k, v] of Object.entries(effective)) {
        if (typeof v !== 'string' || v === 'auto') continue;
        if (k === 'sigil.style') style['*'] = v;
        else if (k.startsWith('sigil.style.')) style[k.slice('sigil.style.'.length)] = v;
      }
      return { enabled: effective['sigil.enabled'] !== false, style };
    },
  };
}

/** A dials settings store for the sigil settings, plus the form and field states to render. */
export function createSigilSettingsStore(settings: SigilSettings, opts: { layer?: Record<string, unknown> } = {}): {
  store: SettingsStore;
  view(): { form: ReturnType<typeof toSettingsForm>; states: ReturnType<typeof toFieldStates> };
} {
  const store = createSettingsStore(settings.dials, { ...(opts.layer ? { layer: opts.layer } : {}), scope: 'user' });
  return {
    store,
    view() {
      const s = store.getState();
      const result = { effective: s.effective, provenance: s.provenance, conflicts: s.conflicts };
      const form = toSettingsForm(settings.dials, { result });
      return { form, states: toFieldStates(form.fields, result, s.dirty) };
    },
  };
}

/** Keep a sigil's user layer in sync with a settings store; returns an unsubscribe. */
export function bindSettings(sigil: { setUser(u: UserLayer): void }, settings: SigilSettings, store: SettingsStore): () => void {
  const apply = () => sigil.setUser(settings.toUserLayer(store.getState().effective));
  apply();
  return store.subscribe(apply);
}
