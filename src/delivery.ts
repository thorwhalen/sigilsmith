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
import { sniffMime } from './image-info.js';
import { digestInputOf, idsOf, inputsDigestOf } from './ids.js';
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
  /** The item key the image was made for (a fallback key changes when the real id arrives). */
  key?: string;
  contentId: string;
  /** Digest of the resolved generator inputs: the regeneration trigger. */
  inputsDigest: string;
  url?: string;
  /** The user explicitly kept the image after an input change, or uploaded their own: stop asking. */
  frozen?: boolean;
  /** Inputs digest the user was asked about and did not answer: do not ask again for it. */
  declinedDigest?: string;
}

export type Rasterize = (svg: string, size: number) => Promise<{ bytes: Uint8Array; mime: string }>;

export interface DeliverOptions {
  strategy?: Strategy;
  store?: ImageStore;
  size?: number;
  /** Stored format; defaults to the config's `delivery.format`. PNG needs `rasterize`. */
  format?: 'svg' | 'png';
  rasterize?: Rasterize;
  /** The item's current record: a custom image is returned untouched, never replaced. */
  record?: SigilRecord | null;
  /** Called when a hybrid background upload fails. */
  onError?: (error: unknown) => void;
}

export interface Delivered {
  record: SigilRecord;
  /** URL to show now: the stored URL when there is one, else a data/object URL. */
  display: string;
  plan?: Plan;
  /** For hybrid: settles when the background upload is done. */
  stored?: Promise<SigilRecord>;
}

let _default: ImageStore | undefined;
function defaultStore(): ImageStore {
  return (_default ??= memoryStore());
}

async function encode(image: SigilImage, format: 'svg' | 'png', size: number, rasterize?: Rasterize): Promise<{ bytes: Uint8Array; mime: string }> {
  if (format === 'png' && image.type === 'svg') {
    if (!rasterize) throw new Error('SGS0402: format "png" needs a `rasterize` function');
    return rasterize(image.svg, size);
  }
  return toBytes(image);
}

/**
 * Produce (and, per strategy, store) the image for an item. The store is asked first,
 * by content id, so an image that exists (made on another device, or by a paid remote
 * generator) is never rendered or paid for again. A custom record passes through.
 */
export async function deliver(sigil: Sigil, item: Item, o: DeliverOptions = {}): Promise<Delivered> {
  if (o.record?.source === 'custom') return { record: o.record, display: o.record.url ?? '' };
  const strategy = o.strategy ?? sigil.config.delivery.strategy;
  const format = o.format ?? sigil.config.delivery.format ?? 'svg';
  const size = o.size ?? (format === 'png' ? 256 : 64);
  const plan = await sigil.plan(item);
  const { contentId, inputsDigest } = await idsOf(plan, format === 'png' ? `png@${size}` : 'svg');
  const base: SigilRecord = { source: 'generated', ref: plan.selection.ref, key: plan.key, contentId, inputsDigest };
  const s = o.store ?? defaultStore();
  if (strategy !== 'derived') {
    const existing = await s.head(contentId);
    if (existing) return { record: { ...base, url: existing }, display: existing, plan };
  }
  const image = await sigil.renderPlan(plan, size);
  if (strategy === 'derived') return { record: base, display: toDisplayUrl(image), plan };
  const put = async () => {
    const { bytes, mime } = await encode(image, format, size, o.rasterize);
    return { ...base, url: await s.put(contentId, bytes, { mime }) };
  };
  if (strategy === 'materialized') {
    const record = await put();
    return { record, display: record.url!, plan };
  }
  const stored = put();
  stored.catch((e) => o.onError?.(e));
  return { record: base, display: toDisplayUrl(image), plan, stored };
}


/**
 * Store a user-supplied image through the same path (B6). Raster formats only, by
 * default, checked by their magic bytes (not the claimed type), and capped in size.
 * SVG from users is refused unless `allowSvg`: a scripted SVG served from the app's
 * origin is stored XSS. This is a client-side courtesy; the server must check again.
 */
export async function storeCustom(data: Uint8Array, mime: string, o: { store?: ImageStore; maxBytes?: number; allowSvg?: boolean } = {}): Promise<SigilRecord> {
  const { maxBytes = 2_000_000, allowSvg = false } = o;
  if (data.length > maxBytes) throw new Error(`SGS0110: upload is ${data.length} bytes, over the ${maxBytes} byte limit`);
  const sniffed = sniffMime(data);
  const isSvg = !sniffed && mime === 'image/svg+xml';
  if (!sniffed && !(isSvg && allowSvg)) throw new Error(`SGS0110: upload is not a PNG, JPEG, GIF or WebP image${isSvg ? ' (SVG needs allowSvg and server-side sanitising)' : ''}`);
  const contentId = `sg_${(await sha256Hex(data)).slice(0, 32)}`;
  const url = await (o.store ?? defaultStore()).put(contentId, data, { mime: sniffed ?? 'image/svg+xml' });
  return { source: 'custom', contentId, inputsDigest: '', url, frozen: true };
}

export type RegenerationPolicy = 'always' | 'never' | 'ask';
export type RegenDecision = 'regenerate' | 'keep' | 'unchanged';

export interface RegenContext {
  item: Item;
  record: SigilRecord;
  nextDigest: string;
}

/** The policy that applies to an item: the option, else the config, else (for `auto`) the generator's own default, else `ask`. */
export async function regenerationPolicyFor(sigil: Sigil, ref: string, explicit?: RegenerationPolicy): Promise<RegenerationPolicy> {
  if (explicit) return explicit;
  const configured = sigil.config.regeneration.policy;
  if (configured !== 'auto') return configured;
  try {
    return (await sigil.load(ref)).regeneration ?? 'ask';
  } catch {
    return 'ask';
  }
}

/**
 * Decide what happens to a stored image when the item's generator inputs change (B19).
 *
 * `unchanged` when the inputs digest is the same (an identicon keyed on an immutable
 * id never asks). Custom and frozen images are always kept. `ask` calls `confirm`:
 * an explicit "keep" freezes the item; no `confirm`, a rejection or a timeout keep the
 * image without freezing it, and remember the digest so the same change is not asked
 * about twice.
 */
export async function onInputsChanged(
  sigil: Sigil,
  item: Item,
  record: SigilRecord,
  opts: { policy?: RegenerationPolicy; confirm?: (ctx: RegenContext) => Promise<'update' | 'keep'>; timeoutMs?: number } = {},
): Promise<{ decision: RegenDecision; record: SigilRecord }> {
  const plan = await sigil.plan(item);
  const nextDigest = await inputsDigestOf(digestInputOf(plan));
  if (nextDigest === record.inputsDigest) return { decision: 'unchanged', record };
  const policy = await regenerationPolicyFor(sigil, plan.selection.ref, opts.policy);
  if (record.source === 'custom' || record.frozen || policy === 'never' || record.declinedDigest === nextDigest) return { decision: 'keep', record };
  if (policy === 'always') return { decision: 'regenerate', record };
  const declined = { decision: 'keep' as const, record: { ...record, declinedDigest: nextDigest } };
  if (!opts.confirm) return declined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<'timeout'>((r) => {
    timer = setTimeout(() => r('timeout'), opts.timeoutMs ?? 60_000);
  });
  let answer: 'update' | 'keep' | 'timeout';
  try {
    answer = await Promise.race([opts.confirm({ item, record, nextDigest }), timeout]);
  } catch {
    answer = 'timeout';
  } finally {
    clearTimeout(timer);
  }
  if (answer === 'update') return { decision: 'regenerate', record };
  if (answer === 'keep') return { decision: 'keep', record: { ...record, frozen: true } };
  return declined;
}

/** Undo a freeze: the next input change will be decided by the policy again. */
export function unfreeze(record: SigilRecord): SigilRecord {
  const { frozen: _f, declinedDigest: _d, ...rest } = record;
  return rest;
}
