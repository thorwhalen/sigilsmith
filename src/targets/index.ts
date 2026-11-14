/**
 * Integration targets: registry, registration snippets and the Media Session helper.
 *
 * Browser-safe. Emitting files (rasterising PNGs, packing ICO) is Node-side, in
 * `sigilsmith/node` (`emitTargets`).
 */
import type { SigilRecord } from '../delivery.js';
import { TARGETS, type TargetSpec } from './registry.js';

export { TARGETS, getTarget } from './registry.js';
export type { TargetFile, TargetSpec } from './registry.js';

/** Fill a registration template. `{base}` is the public base URL (with trailing slash). */
export function snippet(target: TargetSpec, vars: Record<string, string>): string {
  if (target.registration.kind === 'manifest') {
    const icons = target.files.map((f) => ({
      src: `${vars.base ?? '/'}${f.path}`,
      sizes: `${f.width}x${f.height}`,
      type: 'image/png',
      ...(f.purpose && f.purpose !== 'any' ? { purpose: f.purpose } : {}),
    }));
    return JSON.stringify({ [target.registration.field]: icons }, null, 2);
  }
  return target.registration.template.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
}

export function listTargets(opts: { includeLegacy?: boolean } = {}, registry: readonly TargetSpec[] = TARGETS): TargetSpec[] {
  return registry.filter((t) => opts.includeLegacy || t.status !== 'legacy');
}

/**
 * Set lock-screen / notification artwork for the playing item (Media Session API).
 * `artwork` URLs must be fetchable by the OS, i.e. stored (B17): pass the record of a
 * materialized or hybrid delivery, or explicit URLs.
 */
export function setMediaSessionArtwork(
  meta: { title: string; artist?: string; album?: string },
  art: SigilRecord | Array<{ src: string; sizes: string; type?: string }>,
  nav: { mediaSession?: MediaSession } = typeof navigator === 'undefined' ? {} : navigator,
): boolean {
  if (!nav.mediaSession || typeof MediaMetadata === 'undefined') return false;
  const artwork = Array.isArray(art) ? art : art.url ? [{ src: art.url, sizes: '512x512', type: art.url.includes('svg') ? 'image/svg+xml' : 'image/png' }] : [];
  nav.mediaSession.metadata = new MediaMetadata({ ...meta, artwork });
  return true;
}
