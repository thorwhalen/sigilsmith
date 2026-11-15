/**
 * Remote and asynchronous generators (B12, B3, B5).
 *
 * A remote generator is an ordinary `GeneratorModule` whose `render` goes through a
 * `transport`. Keys never live in the bundle: the default transport posts to the
 * developer's own proxy endpoint, which holds the key; `byokTransport` asks a secret
 * store for the end user's key at call time. Results are cached by content id, so the
 * same item never triggers a second paid call. `progressive` shows an instant
 * placeholder from a cheap pure generator and swaps in the remote result, keeping the
 * placeholder on failure or timeout.
 */
import { contentIdOf } from './ids.js';
import type { Sigil } from './sigil.js';
import { svgDoc, svgImage, tile, n } from './svg.js';
import { hash32, sha256Hex } from './hash.js';
import { paletteFromHash } from './palette.js';
import type { GeneratorModule, Item, RenderContext, SigilImage } from './types.js';

export interface RemoteRequest {
  ref: string;
  seed: string;
  fields: Record<string, string>;
  params: Record<string, unknown>;
  size: number;
}

/** Turns a request into an image. Swap it to change where and how the call happens. */
export type Transport = (req: RemoteRequest) => Promise<SigilImage>;

/** Cache of finished remote images, keyed by content id. A `Map` works; so does an ImageStore-backed adapter. */
export interface ImageCache {
  get(id: string): Promise<SigilImage | undefined> | SigilImage | undefined;
  set(id: string, image: SigilImage): Promise<unknown> | unknown;
}

async function readImage(res: Response): Promise<SigilImage> {
  const type = res.headers.get('content-type') ?? '';
  if (type.includes('svg')) return svgImage(await res.text());
  if (type.includes('json')) {
    const body = (await res.json()) as { svg?: string; url?: string };
    if (body.svg) return svgImage(body.svg);
    if (body.url) return { type: 'url', url: body.url };
    throw new Error('proxy returned JSON without `svg` or `url`');
  }
  const blob = await res.blob();
  return { type: 'blob', blob, mime: type || blob.type || 'application/octet-stream' };
}

/**
 * Default transport: POST the request to the developer's endpoint, which holds the API
 * key and calls the paid service. The endpoint returns SVG, an image, or `{ svg | url }`.
 */
export function proxyTransport(url: string, opts: { fetch?: typeof fetch; init?: RequestInit } = {}): Transport {
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return async (req) => {
    const res = await f(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), ...opts.init });
    if (!res.ok) throw new Error(`proxy ${url} answered HTTP ${res.status}`);
    return readImage(res);
  };
}

/**
 * Bring-your-own-key transport: `getKey` reads the end user's key from a secret store
 * (for instance a zodal `SecretBackend`) at call time; `call` talks to the provider.
 * Nothing about the key is stored by sigilsmith.
 */
export function byokTransport(opts: { getKey: () => Promise<string | undefined>; call: (req: RemoteRequest, key: string) => Promise<SigilImage> }): Transport {
  return async (req) => {
    const key = await opts.getKey();
    if (!key) throw new Error('no API key set: ask the user to add one in settings (SGS0106)');
    return opts.call(req, key);
  };
}

/**
 * Keyless DiceBear HTTP API (SVG). The public api.dicebear.com is free for
 * NON-COMMERCIAL use only and rate-limited; commercial apps self-host it and pass
 * `baseUrl`. Only a hash of the seed (and any `params.options`) leaves the browser. The URL pins the major
 * (`9.x`); minor releases may still change output, so results are cached and the
 * generator is declared cached-nondeterministic.
 */
export function dicebearTransport(opts: { style?: string; baseUrl?: string; version?: string; fetch?: typeof fetch } = {}): Transport {
  const { style = 'shapes', baseUrl = 'https://api.dicebear.com', version = '9.x' } = opts;
  const f = opts.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  return async (req) => {
    // Send a hash, never the raw seed: the seed is the item key (it may be an email address).
    const seed = (await sha256Hex(`dicebear\u0000${req.seed}`)).slice(0, 24);
    // `params.options` (e.g. from a feature mapping) become DiceBear style options: scalars, or
    // arrays of scalars joined with commas. Anything else, and a `seed` option, is dropped.
    const options = req.params.options as Record<string, unknown> | undefined;
    const scalar = (v: unknown) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
    const extra = options && typeof options === 'object'
      ? Object.keys(options)
          .filter((k) => k !== 'seed' && (scalar(options[k]) || (Array.isArray(options[k]) && (options[k] as unknown[]).every(scalar))))
          .sort()
          .map((k) => `&${encodeURIComponent(k)}=${encodeURIComponent(Array.isArray(options[k]) ? (options[k] as unknown[]).join(',') : String(options[k]))}`)
          .join('')
      : '';
    const url = `${baseUrl}/${version}/${encodeURIComponent(style)}/svg?seed=${seed}${extra}`;
    const res = await f(url);
    if (!res.ok) throw new Error(`DiceBear answered HTTP ${res.status}`);
    return svgImage(await res.text());
  };
}

/**
 * A stand-in for an AI image service: after `latencyMs`, returns an SVG "painting"
 * derived from the request. Deterministic, so tests can assert on it, yet declared
 * `cached-nondeterministic` like the real services it stands for.
 */
export function mockTransport(opts: { latencyMs?: number; failWhen?: (req: RemoteRequest) => boolean; calls?: RemoteRequest[] } = {}): Transport {
  const { latencyMs = 300 } = opts;
  return async (req) => {
    opts.calls?.push(req);
    await new Promise((r) => setTimeout(r, latencyMs));
    if (opts.failWhen?.(req)) throw new Error('mock service failure');
    const h = hash32(req.seed);
    const p = paletteFromHash(h, { chroma: 0.17 });
    let body = tile(p.background, 'rounded');
    for (let i = 0; i < 6; i++) {
      const hh = hash32(`${req.seed}:${i}`);
      body += `<ellipse cx="${n(15 + (hh % 70))}" cy="${n(15 + ((hh >>> 8) % 70))}" rx="${n(10 + ((hh >>> 16) % 25))}" ry="${n(8 + ((hh >>> 4) % 20))}" fill="${[p.primary, p.secondary, p.accent][i % 3]}" fill-opacity="0.75"/>`;
    }
    return svgImage(svgDoc(body, { title: req.fields.title ?? req.fields.label ?? '' }));
  };
}

export interface RemoteGeneratorOptions {
  id: string;
  major: number;
  transport: Transport;
  cache?: ImageCache;
  defaults?: Record<string, unknown>;
  defaultInputs?: GeneratorModule['defaultInputs'];
  kind?: 'hash' | 'semantic';
  determinism?: GeneratorModule['determinism'];
}

/** Wrap a transport as a generator module, with result caching by content id. */
export function createRemoteGenerator(opts: RemoteGeneratorOptions): GeneratorModule {
  const cache = opts.cache ?? new Map<string, SigilImage>();
  const ref = `${opts.id}@${opts.major}`;
  // Concurrent renders of the same item share one call (two list rows, StrictMode double effects).
  const inFlight = new Map<string, Promise<SigilImage>>();
  return {
    id: opts.id,
    major: opts.major,
    kind: opts.kind ?? 'semantic',
    determinism: opts.determinism ?? 'cached-nondeterministic',
    defaults: opts.defaults ?? {},
    defaultInputs: opts.defaultInputs ?? ['title', 'description'],
    async render(ctx: RenderContext) {
      const id = await contentIdOf(ref, ctx.seed, ctx.params);
      const hit = await cache.get(id);
      if (hit) return hit;
      let pending = inFlight.get(id);
      if (!pending) {
        pending = (async () => {
          const image = await opts.transport({ ref, seed: ctx.seed, fields: ctx.fields, params: ctx.params, size: ctx.size });
          await cache.set(id, image);
          return image;
        })();
        inFlight.set(id, pending);
        pending.then(() => inFlight.delete(id), () => inFlight.delete(id));
      }
      return pending;
    },
  };
}

export interface ProgressiveResult {
  /** Rendered synchronously-fast by a pure generator; show it at once. */
  placeholder: SigilImage;
  /** Resolves to the final image, or to the placeholder after a failure or timeout. */
  final: Promise<{ image: SigilImage; status: 'ready' | 'failed' | 'timeout'; error?: unknown }>;
}

/**
 * Progressive enhancement (B5): an instant deterministic placeholder, then the remote
 * result. The placeholder uses `placeholderRef` (default `grid@1`), which must be in
 * the wiring module.
 */
export async function progressive(sigil: Sigil, item: Item, opts: { size?: number; placeholderRef?: string; timeoutMs?: number } = {}): Promise<ProgressiveResult> {
  const { size = 64, placeholderRef = sigil.config.policy.placeholder ?? 'grid@1', timeoutMs = 8000 } = opts;
  const placeholder = await sigil.render(item, { ref: placeholderRef, size });
  const final = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<'timeout'>((r) => {
      timer = setTimeout(() => r('timeout'), timeoutMs);
    });
    try {
      const out = await Promise.race([sigil.render(item, { size }), timeout]);
      if (out === 'timeout') return { image: placeholder, status: 'timeout' as const };
      return { image: out, status: 'ready' as const };
    } catch (error) {
      return { image: placeholder, status: 'failed' as const, error };
    } finally {
      clearTimeout(timer);
    }
  })();
  return { placeholder, final };
}

/** The `remote` entries of the config, as plain data (validated by the CLI). */
export type RemoteSpec =
  | { transport: 'proxy'; url: string }
  | { transport: 'dicebear'; style?: string; baseUrl?: string }
  | { transport: 'mock'; latencyMs?: number }
  | { transport: 'module'; module: string };

/**
 * Build a remote generator from a config entry. `module` transports are imported by
 * the wiring module and passed as `transport`.
 */
export function remoteFromSpec(id: string, major: number, spec: RemoteSpec, extra: { transport?: Transport; cache?: ImageCache } = {}): GeneratorModule {
  let transport: Transport;
  if (extra.transport) transport = extra.transport;
  else if (spec.transport === 'proxy') transport = proxyTransport(spec.url);
  else if (spec.transport === 'dicebear') transport = dicebearTransport({ ...(spec.style ? { style: spec.style } : {}), ...(spec.baseUrl ? { baseUrl: spec.baseUrl } : {}) });
  else if (spec.transport === 'mock') transport = mockTransport({ latencyMs: spec.latencyMs ?? 300 });
  else throw new Error(`remote \`${id}@${major}\` uses a module transport; the wiring module must pass it (run \`sigilsmith build\`)`);
  return createRemoteGenerator({
    id,
    major,
    transport,
    ...(extra.cache ? { cache: extra.cache } : {}),
    ...(spec.transport === 'dicebear' ? { kind: 'hash' as const, defaultInputs: ['$key'] } : {}),
  });
}
