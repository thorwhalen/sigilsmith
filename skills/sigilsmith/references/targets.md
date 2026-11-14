# Integration targets

Generated from `src/targets/registry.ts` by `npm run docs` (sources verified 2026-11-14; see docs/research/integration-and-delivery.md). `npx sigilsmith targets --emit` writes the files and prints these snippets filled in; `check` validates them when `targets.html`/`targets.manifest` are set.

Crawler and OS targets (stored: yes) do not run your JavaScript: they need a stored file at a stable URL, PNG rather than SVG, and link previews need an absolute URL (`targets.baseUrl`).

## `favicon-svg`: SVG favicon (current, site)

- Stored URL required: yes
- Files: `icon.svg` svg
- Scalable; Safari supports SVG favicons from 26.0, so keep the ICO fallback.

```html
<link rel="icon" href="/icon.svg" type="image/svg+xml">
```

## `favicon-ico`: ICO favicon fallback (current, site)

- Stored URL required: yes
- Files: `favicon.ico` ico 32x32
- Kept at a stable, un-hashed URL; Google Search wants a square icon of at least 8 px, ideally more than 48 px, and does not list SVG.

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
```

## `apple-touch-icon`: Apple touch icon (current, site)

- Stored URL required: yes
- Files: `apple-touch-icon.png` png 180x180
- 180x180 PNG, opaque; iOS rounds the corners itself, so keep the art away from the edges.

```html
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

## `manifest-icons`: Web app manifest icons (current, site)

- Stored URL required: yes
- Files: `icon-192.png` png 192x192, `icon-512.png` png 512x512, `icon-mask.png` png 512x512 (maskable)
- Maskable icons must keep the art inside the central 80% (radius 40%); do not combine "any maskable" in one entry.

```json
{
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icon-mask.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

## `og-image`: Open Graph image (link previews) (current, item)

- Stored URL required: yes, absolute; keep under 300000 bytes
- Files: `og/{key}.png` png 1200x630
- Crawlers (WhatsApp, Slack, iMessage, LinkedIn, Facebook) do not run JavaScript and do not document SVG support: serve PNG/JPEG at an absolute URL. Keep under ~300 KB for WhatsApp (secondary sources). A changed image needs a new URL; content ids do that.

```html
<meta property="og:image" content="https://example.com/og/sg_….png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="">
```

## `twitter-image`: X/Twitter card image (optional, item)

- Stored URL required: yes, absolute; keep under 5000000 bytes
- Files: `og/{key}.png` png 1200x630
- Falls back to og:image when absent; sizes are from secondary sources.

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://example.com/og/sg_….png">
```

## `media-session-artwork`: Media Session artwork (current, item)

- Stored URL required: yes
- Files: `art/{key}-256.png` png 256x256, `art/{key}-512.png` png 512x512
- Lock-screen and notification art for playing media; the OS fetches the URL.

```js
navigator.mediaSession.metadata = new MediaMetadata({ title, artist, artwork: [{ src: '/art/sg_…-256.png', sizes: '256x256', type: 'image/png' }, { src: '/art/sg_…-512.png', sizes: '512x512', type: 'image/png' }] });
```

## `notification-icon`: Notification icon (optional, item)

- Stored URL required: yes
- Files: `notify/{key}-192.png` png 192x192
- No size in the spec; 192 px is a common choice.

```js
registration.showNotification(title, { icon: 'https://example.com/og/sg_….png' });
```

## `theme-color`: Theme colour (optional, site)

- Stored URL required: no
- Files: none
- Taken from the site sigil palette.

```html
<meta name="theme-color" content="#ffffff">
```

## `app-thumbnail`: In-app thumbnail (current, item)

- Stored URL required: no
- Files: none
- Next to the item name the image is decorative: alt="" (B14).

```html
<img src="https://example.com/og/sg_….png" alt="" width="40" height="40">
```

## `safari-mask-icon`: Safari pinned tab (legacy) (legacy, site)

- Stored URL required: yes
- Files: `mask-icon.svg` svg
- No longer needed in 2026.

```html
<link rel="mask-icon" href="/mask-icon.svg" color="#000000">
```
