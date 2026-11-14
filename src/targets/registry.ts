/**
 * The integration target registry (B17): every standard place an identity image gets
 * registered or picked up, as plain data.
 *
 * Seeded from docs/research/integration-and-delivery.md (§5, verified 2026-11-14).
 * Adding a target means adding an entry here or passing extra entries to the
 * functions that take a registry; no other code changes (open-closed). The zod schema
 * describing an entry is `TargetSpecSchema` in `src/node/schema.ts`.
 */

export interface TargetFile {
  /** Path relative to the public root, e.g. `icon-192.png`. `{key}` is replaced by an item's content id for per-item targets. */
  path: string;
  width: number;
  height: number;
  format: 'svg' | 'png' | 'ico';
  /** Opaque background required (Apple touch icon, maskable, og:image). */
  opaque?: boolean;
  /** Fraction of the canvas the art may occupy (maskable: 0.8). */
  safeZone?: number;
  purpose?: 'any' | 'maskable' | 'monochrome';
}

export interface TargetSpec {
  id: string;
  title: string;
  status: 'current' | 'optional' | 'legacy';
  scope: 'site' | 'item';
  /** Crawlers or the OS fetch it, so it needs a stored file at a stable URL. */
  requiresStoredUrl: boolean;
  /** The URL must be absolute (link previews). */
  absoluteUrl: boolean;
  maxBytes?: number;
  files: TargetFile[];
  registration:
    | { kind: 'html'; template: string }
    | { kind: 'manifest'; field: 'icons' | 'shortcuts' }
    | { kind: 'js'; template: string };
  notes: string;
  sources: string[];
}

export const TARGETS: TargetSpec[] = [
  {
    id: 'favicon-svg', title: 'SVG favicon', status: 'current', scope: 'site', requiresStoredUrl: true, absoluteUrl: false,
    files: [{ path: 'icon.svg', width: 0, height: 0, format: 'svg' }],
    registration: { kind: 'html', template: '<link rel="icon" href="{base}icon.svg" type="image/svg+xml">' },
    notes: 'Scalable; Safari supports SVG favicons from 26.0, so keep the ICO fallback.',
    sources: ['https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs', 'https://caniuse.com/link-icon-svg'],
  },
  {
    id: 'favicon-ico', title: 'ICO favicon fallback', status: 'current', scope: 'site', requiresStoredUrl: true, absoluteUrl: false,
    files: [{ path: 'favicon.ico', width: 32, height: 32, format: 'ico' }],
    registration: { kind: 'html', template: '<link rel="icon" href="{base}favicon.ico" sizes="32x32">' },
    notes: 'Kept at a stable, un-hashed URL; Google Search wants a square icon of at least 8 px, ideally more than 48 px, and does not list SVG.',
    sources: ['https://developers.google.com/search/docs/appearance/favicon-in-search'],
  },
  {
    id: 'apple-touch-icon', title: 'Apple touch icon', status: 'current', scope: 'site', requiresStoredUrl: true, absoluteUrl: false,
    files: [{ path: 'apple-touch-icon.png', width: 180, height: 180, format: 'png', opaque: true, safeZone: 0.78 }],
    registration: { kind: 'html', template: '<link rel="apple-touch-icon" href="{base}apple-touch-icon.png">' },
    notes: '180x180 PNG, opaque; iOS rounds the corners itself, so keep the art away from the edges.',
    sources: ['https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs'],
  },
  {
    id: 'manifest-icons', title: 'Web app manifest icons', status: 'current', scope: 'site', requiresStoredUrl: true, absoluteUrl: false,
    files: [
      { path: 'icon-192.png', width: 192, height: 192, format: 'png', purpose: 'any' },
      { path: 'icon-512.png', width: 512, height: 512, format: 'png', purpose: 'any' },
      { path: 'icon-mask.png', width: 512, height: 512, format: 'png', purpose: 'maskable', opaque: true, safeZone: 0.8 },
    ],
    registration: { kind: 'manifest', field: 'icons' },
    notes: 'Maskable icons must keep the art inside the central 80% (radius 40%); do not combine "any maskable" in one entry.',
    sources: ['https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/icons', 'https://web.dev/articles/maskable-icon'],
  },
  {
    id: 'og-image', title: 'Open Graph image (link previews)', status: 'current', scope: 'item', requiresStoredUrl: true, absoluteUrl: true, maxBytes: 300_000,
    files: [{ path: 'og/{key}.png', width: 1200, height: 630, format: 'png', opaque: true }],
    registration: { kind: 'html', template: '<meta property="og:image" content="{url}">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n<meta property="og:image:alt" content="{alt}">' },
    notes: 'Crawlers (WhatsApp, Slack, iMessage, LinkedIn, Facebook) do not run JavaScript and do not document SVG support: serve PNG/JPEG at an absolute URL. Keep under ~300 KB for WhatsApp (secondary sources). A changed image needs a new URL; content ids do that.',
    sources: ['https://ogp.me/', 'https://developers.facebook.com/docs/sharing/webmasters/images/'],
  },
  {
    id: 'twitter-image', title: 'X/Twitter card image', status: 'optional', scope: 'item', requiresStoredUrl: true, absoluteUrl: true, maxBytes: 5_000_000,
    files: [{ path: 'og/{key}.png', width: 1200, height: 630, format: 'png', opaque: true }],
    registration: { kind: 'html', template: '<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:image" content="{url}">' },
    notes: 'Falls back to og:image when absent; sizes are from secondary sources.',
    sources: ['https://developer.x.com/en/docs/x-for-websites/cards/overview/markup'],
  },
  {
    id: 'media-session-artwork', title: 'Media Session artwork', status: 'current', scope: 'item', requiresStoredUrl: true, absoluteUrl: false,
    files: [
      { path: 'art/{key}-256.png', width: 256, height: 256, format: 'png', opaque: true },
      { path: 'art/{key}-512.png', width: 512, height: 512, format: 'png', opaque: true },
    ],
    registration: { kind: 'js', template: "navigator.mediaSession.metadata = new MediaMetadata({ title, artist, artwork: [{ src: '{url256}', sizes: '256x256', type: 'image/png' }, { src: '{url512}', sizes: '512x512', type: 'image/png' }] });" },
    notes: 'Lock-screen and notification art for playing media; the OS fetches the URL.',
    sources: ['https://developer.mozilla.org/en-US/docs/Web/API/MediaMetadata/artwork'],
  },
  {
    id: 'notification-icon', title: 'Notification icon', status: 'optional', scope: 'item', requiresStoredUrl: true, absoluteUrl: false,
    files: [{ path: 'notify/{key}-192.png', width: 192, height: 192, format: 'png' }],
    registration: { kind: 'js', template: "registration.showNotification(title, { icon: '{url}' });" },
    notes: 'No size in the spec; 192 px is a common choice.',
    sources: ['https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification'],
  },
  {
    id: 'theme-color', title: 'Theme colour', status: 'optional', scope: 'site', requiresStoredUrl: false, absoluteUrl: false,
    files: [],
    registration: { kind: 'html', template: '<meta name="theme-color" content="{color}">' },
    notes: 'Taken from the site sigil palette.',
    sources: ['https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color'],
  },
  {
    id: 'app-thumbnail', title: 'In-app thumbnail', status: 'current', scope: 'item', requiresStoredUrl: false, absoluteUrl: false,
    files: [],
    registration: { kind: 'html', template: '<img src="{url}" alt="" width="40" height="40">' },
    notes: 'Next to the item name the image is decorative: alt="" (B14).',
    sources: ['https://www.w3.org/WAI/tutorials/images/decorative/'],
  },
  {
    id: 'safari-mask-icon', title: 'Safari pinned tab (legacy)', status: 'legacy', scope: 'site', requiresStoredUrl: true, absoluteUrl: false,
    files: [{ path: 'mask-icon.svg', width: 0, height: 0, format: 'svg' }],
    registration: { kind: 'html', template: '<link rel="mask-icon" href="{base}mask-icon.svg" color="#000000">' },
    notes: 'No longer needed in 2026.',
    sources: ['https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs'],
  },
];

export function getTarget(id: string, registry: readonly TargetSpec[] = TARGETS): TargetSpec {
  const t = registry.find((x) => x.id === id);
  if (!t) throw new Error(`unknown target \`${id}\`; run \`sigilsmith targets\` for the list (SGS0601)`);
  return t;
}
