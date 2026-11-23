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
  /** For a custom image: uploaded by a user, or adopted from an image the app already had (`adoptImage`). */
  origin?: 'upload' | 'adopted';
  /** For a custom image picked among an app's candidates: that candidate's id (the picker matches on it). */
  from?: string;
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
export async function storeCustom(data: Uint8Array, mime: string, o: { store?: ImageStore; maxBytes?: number; allowSvg?: boolean; origin?: SigilRecord['origin'] } = {}): Promise<SigilRecord> {
  const { maxBytes = 2_000_000, allowSvg = false } = o;
  if (data.length > maxBytes) throw new Error(`SGS0110: upload is ${data.length} bytes, over the ${maxBytes} byte limit`);
  const sniffed = sniffMime(data);
  const isSvg = !sniffed && mime === 'image/svg+xml';
  if (!sniffed && !(isSvg && allowSvg)) throw new Error(`SGS0110: upload is not a PNG, JPEG, GIF or WebP image${isSvg ? ' (SVG needs allowSvg and server-side sanitising)' : ''}`);
  const contentId = `sg_${(await sha256Hex(data)).slice(0, 32)}`;
  const url = await (o.store ?? defaultStore()).put(contentId, data, { mime: sniffed ?? 'image/svg+xml' });
  return { source: 'custom', contentId, inputsDigest: '', url, frozen: true, origin: o.origin ?? 'upload' };
}

/**
 * Store an image file a user picked (an `<input type="file">` File, or any Blob): the
 * one call behind an "Upload image" button. Same checks as `storeCustom`.
 */
export async function customFromFile(file: Blob, o: { store?: ImageStore; maxBytes?: number; allowSvg?: boolean; maxSide?: number } = {}): Promise<SigilRecord> {
  const { maxSide, ...rest } = o;
  const blob = maxSide ? await downscaleImage(file, maxSide) : file;
  return storeCustom(new Uint8Array(await blob.arrayBuffer()), blob.type || file.type, rest);
}

/**
 * Re-encode a picked photo so its longer side is at most `maxSide` px (a phone photo is
 * 3-12 MB; a thumbnail needs a few hundred pixels). Browser only (`createImageBitmap` and a
 * canvas); returns the file unchanged when it is already small, is a GIF (animation would
 * be lost), or the environment cannot decode it, so the size check still applies after.
 */
export async function downscaleImage(file: Blob, maxSide: number, o: { type?: 'image/jpeg' | 'image/webp' | 'image/png'; quality?: number } = {}): Promise<Blob> {
  if (file.type === 'image/gif' || typeof createImageBitmap !== 'function') return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 512_000) return (bitmap.close?.(), file);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const type = o.type ?? (file.type === 'image/png' ? 'image/png' : 'image/jpeg');
  try {
    if (typeof OffscreenCanvas !== 'undefined') {
      const canvas = new OffscreenCanvas(w, h);
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
      return await canvas.convertToBlob({ type, quality: o.quality ?? 0.88 });
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h);
    return await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b ?? file), type, o.quality ?? 0.88));
  } catch {
    return file;
  } finally {
    bitmap.close?.();
  }
}

/**
 * The URL `adoptImage` accepts, or null: http(s) or root-relative (resolved the way a browser
 * would, so `/\\host` and tab tricks that become another origin are caught), or a raster
 * `data:` URL. Never `javascript:`, protocol-relative, backslashes, control characters or SVG.
 */
function adoptable(url: string): string | null {
  const u = url.trim();
  if (/[\\\u0000-\u001f\u007f]/.test(u)) return null;
  if (/^data:/i.test(u)) return /^data:image\/(png|jpeg|gif|webp)[;,]/i.test(u) ? u : null;
  const base = 'http://adopt.invalid';
  let parsed: URL;
  try {
    parsed = new URL(u, base);
  } catch {
    return null;
  }
  const relative = u.startsWith('/') && !u.startsWith('//');
  if (relative ? parsed.origin !== base : !/^https?:$/.test(parsed.protocol) || !/^https?:\/\//i.test(u)) return null;
  if (/\.svgz?$/i.test(parsed.pathname)) return null;
  return u;
}

/**
 * The item's own picture as a record, synchronously, for display: `<Sigil item={item}
 * record={pictureRecord(item.image_url)} />` shows the picture, the sigil while it loads,
 * and the sigil again if it fails (`<Sigil fallback>`). `null` (the generated sigil) for an
 * empty or refused URL (the same rules as `adoptImage`). Nothing is stored; to keep a copy
 * of an expiring picture, `adoptImage(url, { store })`.
 */
export function pictureRecord(url: string | null | undefined): SigilRecord | null {
  const u = url ? adoptable(url) : null;
  return u ? { source: 'custom', contentId: `url:${u}`, inputsDigest: '', url: u, frozen: true, origin: 'adopted' } : null;
}

/**
 * Adopt an image the app already shows for an item (a hand-made thumbnail it stored, a
 * provider's cover art, an avatar URL) as the item's custom sigil: the migration path
 * for existing thumbnails. The record is custom and frozen, so `deliver` and
 * `onInputsChanged` never replace it, and `<Sigil record>` shows it as is.
 *
 * Without `store` the record points at the URL (no copy; right for URLs the app owns).
 * With `store` the bytes are fetched (refused past `maxBytes`, by the declared length before
 * the body is read), checked like an upload and stored under their content id, so a URL
 * that expires (a provider CDN link) or sits on another origin no longer matters.
 */
export async function adoptImage(url: string, o: { store?: ImageStore; fetch?: typeof fetch; maxBytes?: number } = {}): Promise<SigilRecord> {
  const u = adoptable(url);
  if (!u) throw new Error(`SGS0111: cannot adopt ${JSON.stringify(url.slice(0, 80))}: only http(s), root-relative or raster data: URLs of a raster image`);
  if (!o.store) return { source: 'custom', contentId: `url_${(await sha256Hex(u)).slice(0, 32)}`, inputsDigest: '', url: u, frozen: true, origin: 'adopted' };
  const maxBytes = o.maxBytes ?? 2_000_000;
  const res = await (o.fetch ?? fetch)(u);
  if (!res.ok) throw new Error(`SGS0111: could not fetch ${u}: HTTP ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > maxBytes) throw new Error(`SGS0110: image is ${declared} bytes, over the ${maxBytes} byte limit`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return storeCustom(bytes, res.headers.get('content-type') ?? '', { store: o.store, origin: 'adopted', maxBytes });
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
