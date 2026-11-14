/**
 * Delivery strategies (B18) and the regeneration policy (B19).
 *
 * - `materialized` (default): render in the browser when the item is created, store
 *   the file under a content-addressed id, keep the URL in the item's record.
 * - `derived`: compute on read; nothing is stored, the image follows its inputs.
 * - `hybrid`: show the derived image at once and materialize in the background, for
 *   targets that need a stored URL or for slow generators.
 *
 * Storage is injected through the `ImageStore` port. `memoryStore()` is the working
 * default; `fromDataProvider` (in `sigilsmith/zodal`) adapts any zodal blob provider.
 */
import { sha256Hex } from './hash.js';
import { idsOf, inputsDigestOf } from './ids.js';
import type { Sigil } from './sigil.js';
import { toBytes, toDisplayUrl, svgToDataUrl } from './svg.js';
import type { Item, Plan, SigilImage } from './types.js';

export type Strategy = 'materialized' | 'derived' | 'hybrid';

/** Where images live. Ids are content addresses (`sg_…`), safe in any backend. */
export interface ImageStore {
  /** URL of a stored image, or null when absent. */
  head(id: string): Promise<string | null>;
  /** Store bytes under `id` (idempotent for the same id) and return their URL. */
  put(id: string, data: Uint8Array, meta: { mime: string }): Promise<string>;
}

/** In-memory store: data URLs, no network. The default, and right for tests and demos. */
export function memoryStore(): ImageStore & { size(): number } {
  const files = new Map<string, string>();
  return {
    async head(id) {
      return files.get(id) ?? null;
    },
    async put(id, data, { mime }) {
      const existing = files.get(id);
      if (existing) return existing;
      const url = mime === 'image/svg+xml' ? svgToDataUrl(new TextDecoder().decode(data)) : `data:${mime};base64,${toBase64(data)}`;
      files.set(id, url);
      return url;
    },
    size: () => files.size,
  };
}

function toBase64(data: Uint8Array): string {
  let s = '';
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000));
  return btoa(s);
}

/** What the app keeps per item (in whatever field it likes). */
export interface SigilRecord {
  source: 'generated' | 'custom';
  ref?: string;
  contentId: string;
  /** Digest of the resolved generator inputs: the regeneration trigger. */
  inputsDigest: string;
  url?: string;
  /** The user kept the image after an input change, or uploaded their own: stop asking. */
  frozen?: boolean;
}

export type Rasterize = (svg: string, size: number) => Promise<{ bytes: Uint8Array; mime: string }>;

export interface DeliverOptions {
  strategy?: Strategy;
  store?: ImageStore;
  size?: number;
  /** Store PNG instead of SVG (needs `rasterize`). */
  format?: 'svg' | 'png';
  rasterize?: Rasterize;
  /** Called when a hybrid background upload fails. */
  onError?: (error: unknown) => void;
}

export interface Delivered {
  record: SigilRecord;
  /** URL to show now: the stored URL when there is one, else a data/object URL. */
  display: string;
  plan: Plan;
  /** For hybrid: settles when the background upload is done. */
  stored?: Promise<SigilRecord>;
}

async function store(image: SigilImage, contentId: string, o: DeliverOptions): Promise<string> {
  const s = o.store ?? defaultStore();
  const existing = await s.head(contentId);
  if (existing) return existing;
  let bytes: Uint8Array;
  let mime: string;
  if (o.format === 'png' && image.type === 'svg') {
    if (!o.rasterize) throw new Error('format "png" needs a `rasterize` function (SGS0402)');
    ({ bytes, mime } = await o.rasterize(image.svg, o.size ?? 256));
  } else ({ bytes, mime } = await toBytes(image));
  return s.put(contentId, bytes, { mime });
}

let _default: ImageStore | undefined;
function defaultStore(): ImageStore {
  return (_default ??= memoryStore());
}

/** Produce (and, per strategy, store) the image for an item. Custom images pass through untouched. */
export async function deliver(sigil: Sigil, item: Item, o: DeliverOptions = {}): Promise<Delivered> {
  const strategy = o.strategy ?? sigil.config.delivery.strategy;
  const plan = await sigil.plan(item);
  const image = await sigil.renderPlan(plan, o.size ?? 64);
  const { contentId, inputsDigest } = await idsOf(plan);
  const base: SigilRecord = { source: 'generated', ref: plan.selection.ref, contentId, inputsDigest };
  if (strategy === 'derived') return { record: base, display: toDisplayUrl(image), plan };
  if (strategy === 'materialized') {
    const url = await store(image, contentId, o);
    return { record: { ...base, url }, display: url, plan };
  }
  const stored = store(image, contentId, o).then((url) => ({ ...base, url }));
  stored.catch((e) => o.onError?.(e));
  return { record: base, display: toDisplayUrl(image), plan, stored };
}

/** Store a user-supplied image through the same path (B6). */
export async function storeCustom(data: Uint8Array, mime: string, o: { store?: ImageStore } = {}): Promise<SigilRecord> {
  const contentId = `sg_${(await sha256Hex(data)).slice(0, 32)}`;
  const url = await (o.store ?? defaultStore()).put(contentId, data, { mime });
  return { source: 'custom', contentId, inputsDigest: '', url, frozen: true };
}

export type RegenerationPolicy = 'always' | 'never' | 'ask';
export type RegenDecision = 'regenerate' | 'keep' | 'unchanged';

export interface RegenContext {
  item: Item;
  record: SigilRecord;
  nextDigest: string;
}

/**
 * Decide what happens to a stored image when the item's generator inputs change (B19).
 *
 * `unchanged` when the inputs digest is the same (an identicon keyed on an immutable
 * id never asks). Custom and frozen images are always kept. `ask` calls `confirm`; no
 * `confirm`, a rejection or a timeout all mean keep. A keep under `ask` freezes the item.
 */
export async function onInputsChanged(
  sigil: Sigil,
  item: Item,
  record: SigilRecord,
  opts: { policy?: RegenerationPolicy; confirm?: (ctx: RegenContext) => Promise<'update' | 'keep'>; timeoutMs?: number } = {},
): Promise<{ decision: RegenDecision; record: SigilRecord }> {
  const policy = opts.policy ?? sigil.config.regeneration.policy;
  const plan = await sigil.plan(item);
  const nextDigest = await inputsDigestOf(plan.seed);
  if (nextDigest === record.inputsDigest) return { decision: 'unchanged', record };
  if (record.source === 'custom' || record.frozen || policy === 'never') return { decision: 'keep', record };
  if (policy === 'always') return { decision: 'regenerate', record };
  if (!opts.confirm) return { decision: 'keep', record: { ...record, frozen: true } };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'keep'>((r) => {
    timer = setTimeout(() => r('keep'), opts.timeoutMs ?? 60_000);
  });
  let answer: 'update' | 'keep';
  try {
    answer = await Promise.race([opts.confirm({ item, record, nextDigest }), timeout]);
  } catch {
    answer = 'keep';
  } finally {
    clearTimeout(timer);
  }
  return answer === 'update' ? { decision: 'regenerate', record } : { decision: 'keep', record: { ...record, frozen: true } };
}
