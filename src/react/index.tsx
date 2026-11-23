/**
 * `sigilsmith/react`: the optional React adapter (B8).
 *
 * - `<SigilProvider sigil={sigil}>` puts the wiring module's `sigil` in context.
 * - `<Sigil item={item} size={40} />` shows the item's identity image: the stored URL
 *   when the item has a record with one (materialized/hybrid), otherwise a local render
 *   (derived). The box is reserved at `size` so lists never shift; a tinted placeholder
 *   shows while loading, and a failed load shows a distinct state that retries on click.
 *   The image is decorative next to a name, so `alt` defaults to "" (B14).
 * - `useSigil(item)` is the headless version.
 * - `useSigilSettings(store)` subscribes to a zodal-dials settings store (B15).
 * - `useSigilPicker` / `<SigilPicker>` let a user change one item's image (`./picker.tsx`).
 *
 * Re-renders when end-user settings change the sigil's user layer.
 */
import { createContext, useCallback, useContext, useEffect, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { SigilRecord } from '../delivery.js';
import type { Sigil as SigilApi } from '../sigil.js';
import { toDisplayUrl } from '../svg.js';
import type { Item, SigilImage } from '../types.js';
import { displayCacheFor } from './display-cache.js';

const Ctx = createContext<SigilApi | null>(null);

export function SigilProvider({ sigil, children }: { sigil: SigilApi; children?: ReactNode }) {
  return <Ctx.Provider value={sigil}>{children}</Ctx.Provider>;
}

export function useSigilApi(explicit?: SigilApi): SigilApi {
  const s = explicit ?? useContext(Ctx);
  if (!s) throw new Error('no sigil: wrap the tree in <SigilProvider sigil={sigil}> (import sigil from your sigilsmith.gen.ts)');
  return s;
}

/** Re-render when the sigil's user layer changes. */
function useUserVersion(sigil: SigilApi): unknown {
  return useSyncExternalStore(sigil.subscribe, sigil.getUser, sigil.getUser);
}

export interface UseSigilResult {
  src?: string;
  status: 'loading' | 'ready' | 'error' | 'disabled';
  error?: unknown;
  retry(): void;
}

export function useSigil(item: Item, opts: { size?: number; record?: SigilRecord | null; sigil?: SigilApi } = {}): UseSigilResult {
  const sigil = useSigilApi(opts.sigil);
  const user = useUserVersion(sigil) as { enabled?: boolean } | undefined;
  const storedUrl = opts.record?.url;
  const custom = opts.record?.source === 'custom';
  const recordRef = opts.record?.ref;
  const itemKey = JSON.stringify(item);
  // Everything that decides the image: same key, same image (so it can be shown without rendering).
  const cacheKey = JSON.stringify([itemKey, opts.size ?? 64, storedUrl ?? null, recordRef ?? null, custom, user ?? null]);
  const cache = displayCacheFor(sigil);
  const cached = user?.enabled === false && !custom ? undefined : cache.get(cacheKey);
  const [state, setState] = useState<Omit<UseSigilResult, 'retry'>>(cached ? { status: 'ready', src: cached } : { status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (user?.enabled === false && !custom) {
      setState({ status: 'disabled' });
      return;
    }
    if (storedUrl && custom) {
      setState({ status: 'ready', src: storedUrl });
      return;
    }
    const hit = attempt === 0 ? cache.get(cacheKey) : undefined;
    if (hit) {
      setState((s) => (s.status === 'ready' && s.src === hit ? s : { status: 'ready', src: hit }));
      return;
    }
    let live = true;
    let objectUrl: string | undefined; // a placeholder's blob URL; the cache owns the final one
    setState((s) => ({ status: 'loading', ...(s.src ? { src: s.src } : {}) }));
    const size = opts.size ?? 64;
    const show = (img: SigilImage, final: boolean) => {
      const src = toDisplayUrl(img);
      const blob = img.type === 'blob';
      if (final) {
        if (live) cache.set(cacheKey, src, blob);
        else if (blob) URL.revokeObjectURL(src);
      } else if (blob) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = src;
      }
      if (live) setState({ status: 'ready', src });
    };
    (async () => {
      const plan = await sigil.plan(item);
      // The stored image wins, unless this item's user preference picked another generator.
      if (storedUrl && !(plan.selection.via === 'user' && plan.selection.ref !== recordRef)) {
        if (live) setState({ status: 'ready', src: storedUrl });
        return;
      }
      const mod = await sigil.load(plan.selection.ref);
      // Slow/remote generators: show the instant placeholder first (B5), keep it on failure.
      if (mod.determinism === 'cached-nondeterministic' && sigil.config.policy.placeholder !== plan.selection.ref) {
        show(await sigil.render(item, { ref: sigil.config.policy.placeholder, size }), false);
        try {
          show(await sigil.renderPlan(plan, size), true);
        } catch {
          /* placeholder stays */
        }
        return;
      }
      show(await sigil.renderPlan(plan, size), true);
    })().catch((error) => live && setState({ status: 'error', error }));
    return () => {
      live = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [sigil, cache, cacheKey, itemKey, storedUrl, recordRef, custom, user, attempt, opts.size]);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  return { ...state, retry };
}

export interface SigilProps {
  item: Item;
  size?: number;
  record?: SigilRecord | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  /** Corner radius of the reserved box; the image itself carries its own shape. */
  radius?: number | string;
  sigil?: SigilApi;
  /**
   * On failure, show a retry `<button>` (default). Pass `false` inside a row that is itself
   * a button/link: the failure renders the tinted placeholder with no focusable control,
   * and the image is tried again on the next mount.
   */
  retry?: boolean;
}

/** The failed-image view; split out so it can be rendered without running effects (tests). */
export function SigilFailure({ box, className, size, alt, retry, onRetry }: { box: CSSProperties; className?: string | undefined; size: number; alt: string; retry: boolean; onRetry(): void }) {
  if (!retry) return <span className={className} style={box} data-status="error" aria-hidden={alt === '' ? true : undefined} />;
  return (
    <button type="button" className={className} onClick={onRetry} title="Image failed to load. Click to retry." aria-label="Retry loading image" style={{ ...box, border: '1px dashed rgba(127,127,127,0.6)', padding: 0, cursor: 'pointer', fontSize: size * 0.4, lineHeight: 1, color: 'rgba(127,127,127,0.9)' }}>
      ↻
    </button>
  );
}

export function Sigil({ item, size = 40, record, alt = '', className, style, radius = '20%', sigil, retry: showRetry = true }: SigilProps) {
  const { src, status: hookStatus, retry } = useSigil(item, { size, ...(record !== undefined ? { record } : {}), ...(sigil ? { sigil } : {}) });
  // Track the <img> load against the current src (a stored URL can 404 or be slow).
  const [loaded, setLoaded] = useState<{ src?: string; ok: boolean }>({ ok: false });
  const [tries, setTries] = useState(0);
  const onRetry = () => {
    setLoaded({ ok: false });
    setTries((t) => t + 1);
    retry();
  };
  const status = hookStatus === 'ready' && loaded.src === src && !loaded.ok ? 'error' : hookStatus;
  const box: CSSProperties = { display: 'inline-block', width: size, height: size, flex: `0 0 ${size}px`, borderRadius: radius, overflow: 'hidden', background: status === 'ready' ? 'transparent' : 'rgba(127,127,127,0.18)', verticalAlign: 'middle', ...style };
  if (status === 'disabled') return <span className={className} style={box} aria-hidden={alt === '' ? true : undefined} />;
  if (status === 'error') return <SigilFailure box={box} className={className} size={size} alt={alt} retry={showRetry} onRetry={onRetry} />;
  return (
    <span className={className} style={box} data-status={status} aria-busy={status === 'loading' || undefined}>
      {src ? (
        <img
          key={`${src}#${tries}`}
          src={src}
          alt={alt}
          width={size}
          height={size}
          decoding="async"
          onLoad={() => setLoaded({ src, ok: true })}
          onError={() => setLoaded({ src, ok: false })}
          style={{ display: 'block', width: size, height: size, opacity: loaded.src === src && loaded.ok ? 1 : 0, transition: 'opacity 120ms ease-out' }}
        />
      ) : null}
    </span>
  );
}

/**
 * SHIM: upstream zodal-dials gap G8 (docs/research/zodal-fit.md); delete when
 * `@zodal/dials-ui-shadcn` ships a `useSettings` hook. Subscribes to a dials settings store.
 */
export function useSigilSettings<S>(store: { subscribe(fn: () => void): () => void; getState(): S }): S {
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

export { useSigilPicker, SigilPicker, pickerChoices, currentChoiceId, resolveChoice, type SigilCandidate, type SigilChoice, type SigilPickerProps, type SigilPickerState, type UseSigilPickerOptions } from './picker.js';
