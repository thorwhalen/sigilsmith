---
title: "Integration targets, delivery strategies and regeneration policy for sigilsmith"
author: Thor Whalen
date: 2026-11-14
---

# Integration targets, delivery strategies and regeneration policy

Research for brief items A10, A11, A12, B17, B18, B19 and C6. All sources were retrieved on 2026-11-14 unless a source carries its own date. Claims marked **[unverified]** could not be confirmed against a primary source in this run (several platform developer sites returned errors or carry no documentation on the point); claims marked **[inference]** are my own reasoning, not a finding.

## Summary

- **The minimal browser-icon set in 2026 is four files** (Sitnik, "How to Favicon in 2026", dated 2026-01-21 [1]): a 32x32 `/favicon.ico`, one `icon.svg` (dark mode via a media query inside the SVG), a 180x180 `apple-touch-icon.png`, and a manifest with 192, 512 and 512-maskable PNGs. Safari pinned-tab `mask-icon` and Windows `msapplication-*` tiles are no longer needed [1]. caniuse lists SVG favicons as supported in Safari only from 26.0, so the ICO fallback is still earning its place [2].
- **Google Search does not require a multiple of 48 px.** The current page says square, at least 8x8, and "more than 48x48" recommended; formats listed omit SVG [3]. The "multiple of 48" rule is older folklore.
- **Targets split cleanly into two kinds.** Crawler/OS-fetched targets (favicon, touch icon, manifest icons, `og:image`, `twitter:image`) need a stored image at a stable absolute URL. Page-JS targets (Media Session artwork, Notification `icon`/`badge`, shortcuts via the manifest) are given URLs by the page or manifest; the first two run client-side but still take a URL string [4][5][6].
- **Link-preview crawlers do not run page JavaScript, and none of the platform documentation I could reach documents SVG support for `og:image`.** Facebook documents 200x200 minimum, 1200x630 recommended, 8 MB maximum [7]; LinkedIn documents 1200x627 and 5 MB [8]. WhatsApp's ~300 KB limit rests only on secondary sources and they disagree (300 KB vs 600 KB) [9]. Rasterise to PNG or JPEG for every unfurl target.
- **Security.** Treat client-generated images as untrusted input. Decode and re-encode raster uploads (OWASP) [10]; do not accept SVG from clients unless sanitised and served with `Content-Security-Policy: sandbox` and `nosniff` [11][12]. For isomorphic deterministic generators, the strongest check is [inference] to accept the generator inputs (key, generator id, version, params) and regenerate server-side, rather than trusting pixels.

## Recommendations

### B18 naming and defaults

1. **Name the trade-off "materialize vs derive".** Strategy ids: `materialized` (generate once, store; the default, matching B18.1), `derived` (render on read, nothing stored; B18.2) and `hybrid` (B18.3). Document the synonyms: precompute / compute-on-read, eager vs lazy generation, cache-aside and read-through caching for the hybrid. These are standard systems terms; I did not source them to a primary document in this run **[unverified as to citation, widely established usage]**.
2. **Name stored artefacts by content-addressed input hash:** `sha256(canonical(key, generator.id, generator.version, params, schemaVersion))`, truncated, in the filename or path. This gives immutable caching (`Cache-Control: max-age=31536000, immutable` is MDN's recommended pattern for hashed URLs [13]) and satisfies Facebook's documented rule that image caching is by URL and that a changed image needs a new URL [7].
3. **Hash the inputs, not the output bytes.** Raster output from canvas and font rendering is not guaranteed byte-identical across browsers and GPUs **[inference; unverified against a primary source]**. Pure SVG string output from a generator that avoids `<text>` is deterministic by construction. Rule: SVG is the canonical artefact for determinism tests; raster is a derived artefact and is never compared byte for byte.
4. **Hybrid is the sensible default for apps that need any unfurl target**; `materialized` is the default when the brief's A11 workflow applies (create in the browser, upload). Pure `derived` is only offered for generators declared `pure` and light, and `explain` must state that a version bump will silently change every image (so `derived` requires a pinned generator version in the SSOT config).
5. **Exception to immutability:** `/favicon.ico` and the site icon are best kept at a stable, non-hashed URL [1][3]. Content addressing applies to per-item images (cards, `og:image`, artwork), not to the site favicon.

### B19 default

**Default: `ask`, implemented as a non-modal, default-keep prompt.** Concretely:

- Prompt only when (a) the image is auto-generated (a custom image is never touched; this is B19's existing rule), and (b) the resolved generator inputs actually changed (compare the input hash, not the field edit event).
- Present it inline or as a toast ("Image kept. Update it to match the new title?" with an Update action and Undo after applying), never as a blocking modal. Dismissal, timeout and headless contexts resolve to `keep`.
- A "freeze once customised" state: once a user accepts or declines twice, or uploads a custom image, set the item to `pinned` and stop asking. A per-item setting, not a global one.
- Keep the previous image so `Update` is itself undoable.
- Developers who key the generator on an immutable ID (the common identicon case) never trigger the policy, because the key does not change on rename; `explain` should say so.

Rationale is in section 4. The evidence is thin: I found no controlled study of avatar regeneration after a rename, only product behaviour and general NN/g guidance. The recommendation is therefore a judgement call [inference].

## 1. Integration targets

### 1.1 Browser icons

**Minimal set (2026).** Sitnik's guide, metadata dated 2026-01-21 (last changelog entry 2024-09-05), recommends [1]:

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.webmanifest">
```

- `favicon.ico`: a single 32x32 image (optionally with a 16x16 layer), kept at the site root with `sizes="32x32"`, which the article says avoids a Chrome bug where ICO was chosen over SVG [1].
- `icon.svg`: dark mode is handled by a `<style>` block inside the SVG with `@media (prefers-color-scheme: dark)` overriding the `fill` of a classed path [1]. For sigilsmith this means identity SVGs used as favicons should expose a light and a dark colour token and let the generator emit the media query.
- Browser support for SVG favicons per caniuse (retrieved 2026-11-14): Chrome 80 and later, Firefox 41 and later, Safari 26.0 and later, not Safari up to 18.7 [2]. Hence the ICO/PNG fallback remains useful. Whether the `prefers-color-scheme` query inside a favicon works in every browser I could not confirm; secondary sources disagree and give version-specific claims **[unverified]**.
- `rel="shortcut icon"` is invalid; use `rel="icon"` [1].

**Apple touch icon.** 180x180 PNG; the guide recommends about 20 px of padding and a background colour, scaling art to 140x140 on a 180x180 canvas [1]. "No transparency" is the commonly stated rule (iOS composites transparency onto black) but I did not find Apple primary documentation for it in this run **[unverified]**; the safe rule is to render an opaque background, which sigilsmith can do trivially.

**Web app manifest icons.** MDN: `icons` entries take `src` (required), `sizes`, `type`, `purpose` (`any` default, `maskable`, `monochrome`; space-separated combinations allowed), and SVG can be declared with `sizes: "any"` [14]. Chrome's installability criteria list a 192x192 and a 512x512 icon plus a name, `start_url` and a `display` of `fullscreen`, `standalone` or `minimal-ui` [15]. The manifest page does not state accepted formats for installability.

```json
{
  "icons": [
    { "src": "/icon-192.png", "type": "image/png", "sizes": "192x192" },
    { "src": "/icon-mask.png", "type": "image/png", "sizes": "512x512", "purpose": "maskable" },
    { "src": "/icon-512.png", "type": "image/png", "sizes": "512x512" }
  ]
}
```

**Maskable icons.** web.dev: opaque image with padding; keep important content inside a circle centred on the icon with a radius of 40% of the icon width (the central 80%); outer edge may be cropped; do not use `"any maskable"` combined, since a maskable icon used as `any` is padded and shrunk; design `any` icons separately with transparent regions [16]. Sitnik's recipe: 512x512 canvas, art scaled to 409x409 [1]. Check with maskable.app or the DevTools Application panel [16]. `monochrome`: browser discards colour and uses the alpha channel only [14]; no browser or OS support list was extractable **[unverified]**.

**Safari pinned tab (`mask-icon`).** Not needed: Sitnik states a regular favicon works since Safari 12 and apple.com no longer uses it [1]. Registry: `status: "legacy"`, off by default.

**Windows tiles (`msapplication-*`).** Not needed per [1] (recent Windows no longer requires it). I did not independently verify the `msapplication` tags against Microsoft documentation **[unverified]**. Registry: `status: "legacy"`, off by default.

**Google Search favicon.** Google's current guidance [3]: one favicon per hostname; Googlebot (home page) and Googlebot-Image (favicon file) must be allowed to crawl; square (1:1), at least 8x8 px, more than 48x48 recommended, "does not require a multiple of 48"; formats listed are BMP, GIF, ICO, PNG, JPEG, PPM, TIFF (SVG not listed); do not change the favicon URL frequently; recrawl can take days to weeks; inappropriate icons are replaced. Registration: `<link rel="icon" href="...">` on the home page; `apple-touch-icon` also accepted [3]. Conflict with content addressing: keep the site favicon URL stable.

**`theme-color`.** `<meta name="theme-color" content="..." media="(prefers-color-scheme: dark)">`; flagged limited availability on MDN [17]. Not an image, but the identity palette can drive it.

**`apple-touch-startup-image`.** Not researched against primary sources in this run; it is a launch splash screen needing many device-specific sizes, and is outside the identity-image scope **[unverified; recommend omitting from the initial registry]**.

### 1.2 Link previews (unfurling)

**Open Graph.** ogp.me: `og:title`, `og:type`, `og:image`, `og:url` are the required properties; `og:image:url`, `:secure_url`, `:type`, `:width`, `:height`, `:alt` are optional; pages with `og:image` should also give `og:image:alt`; structured properties apply to the most recent `og:image`; the first `og:image` wins [18]. The spec does not mandate absolute URLs in the text I retrieved; the platforms below effectively require them (WhatsApp/Twitter claims are secondary **[unverified]**).

```html
<meta property="og:image" content="https://example.com/i/3f9a.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="...">
```

**Per-platform behaviour** (primary where marked, otherwise secondary):

| Platform | Documented behaviour | Source quality |
|---|---|---|
| Facebook | Min 200x200; at least 1200x630 recommended; 600x315 minimum for the large layout; about 1.91:1; max 8 MB; crawler accepts only gzip/deflate; caches by image URL; a new image needs a new URL; Sharing Debugger or Graph API re-scrape; `og:image:width/height` let the crawler render without a first-fetch download [7] | Primary |
| LinkedIn | Sharing module: 1200x627 px, max 5 MB, 1.91:1; blocked or protected image directories break previews; Post Inspector not described on the page fetched [8] | Primary (partial) |
| Slack | Classic unfurl "crawls the URL, looks for common OpenGraph and X Card metadata"; `unfurl_media`/`unfurl_links` flags [19]. User agent, caching and size limits not covered | Primary (partial) |
| WhatsApp | No official documentation found. Wix and a Shopify thread state a 300 KB limit, another guide says 600 KB, behaviour above the limit reported as silently dropped; dimensions unspecified [9] | Secondary, conflicting |
| X / Twitter | Primary docs unreachable (HTTP 402/404). Third-party guides give: `summary_large_image`, min 300x157, max 4096x4096, 5 MB, JPG/PNG/GIF/WebP; absolute URLs; SVG not mentioned [20] | Secondary **[unverified]** |
| Discord | Developer docs describe sending embeds, not unfurling; guides say Discord reads OG tags only [21][22] | Primary silent; secondary |
| Telegram | Reads OG tags; caches the card; `@WebpageBot` re-scrapes; no official page found [23] | Secondary **[unverified]** |
| iMessage | Apple's LinkPresentation framework fetches metadata; no official statement of size/format rules found. Third parties say it uses `og:image` [24] | Secondary **[unverified]** |

**SVG for `og:image`.** I found no platform documentation that accepts SVG; the formats named wherever formats are named are JPEG, PNG, GIF and WebP. Treat SVG as unsupported and emit PNG (or JPEG) at 1200x630, under 300 KB to satisfy the strictest reported limit (WhatsApp), with width/height/alt tags. This is a safe-side recommendation, not a verified rule.

**Twitter/X snippet** (tags per the legacy Twitter developer page, whose content was not retrievable; the tag names are well established but I could not re-verify them **[unverified]**):

```html
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="https://example.com/i/3f9a.png">
```

`summary` (small square) versus `summary_large_image` is the relevant choice for an identity image: use `summary` for a square avatar-like image and `summary_large_image` when a 1200x630 composition is produced **[unverified sizes]**.

**Re-scrape tools.** Facebook Sharing Debugger and Graph API [7]; Telegram `@WebpageBot` [23]; LinkedIn Post Inspector (named by secondary sources; not confirmed in the page fetched [8]). Because Facebook caches by URL [7], the content-addressed filename in B18 is also the cache-busting mechanism.

**Server-side analogue.** Vercel `@vercel/og` renders HTML/CSS to PNG with Satori and Resvg, recommends 1200x630, caches computed images at the CDN with correct headers, has a 500 KB bundle limit, supports `ttf`/`otf`/`woff` fonts, and recommends allowing the OG route in `robots.txt` so social crawlers can fetch it (docs updated 2026-06-16) [25]. It shows that `og:image` can legitimately point to a dynamic route rather than a stored file, provided the response is a raster image the crawler can fetch; that is the `derived` strategy applied to a crawler target, with compute on the server.

### 1.3 OS and media surfaces

- **Media Session `artwork`**: array of `{ src, sizes, type }`; the UA picks a size so providing several avoids scaling; MDN's example uses square PNGs at 96, 128, 192, 256, 384, 512; limited availability; no OS or browser list extractable from the page [4]. Called from page JS, so rendering is client-side, but `src` is a URL the UA fetches. Whether `blob:` and `data:` URLs are accepted on every platform I could not verify **[unverified]**; the dependable route is a stored URL or, for the hybrid strategy, a same-origin cached URL.
- **Notification `icon`, `badge`, `image`**: `icon` is a small image beside the title/body; `badge` is a small app icon for the status bar, about 96x96 on Android and masked to a monochrome silhouette; `image` is a large content image; layout depends on the browser and OS; secure context only; `showNotification()` is Baseline Widely available since March 2023 [5][26]. A badge therefore needs a monochrome variant of the identity (a generator capability flag: `monochromeOutput`).
- **Manifest `shortcuts` icons**: same format as `icons`, examples use 192x192; presentation is up to the browser or OS; limited availability [6].
- **Android adaptive icons**: delivered through maskable manifest icons for installed PWAs [14][16]. No separate target needed.

### 1.4 In-app

List cards and avatars at the app's own sizes: no registration snippet, only an `<img alt="">` (decorative when beside the item name, per B14).

## 2. Delivery strategy (B18)

**What it is called.** The trade-off is precompute versus compute-on-read, with the stored result called a materialised or precomputed (cached) derived artefact. In caching terminology the hybrid is cache-aside or read-through. I did not source these to a single primary document in this run **[unverified as to citation]**. Prior art for deriving on the fly from metadata exists at both ends:

- **Gravatar**: avatar URL is `gravatar.com/avatar/<SHA256 of email>`; with `d=identicon` (also `monsterid`, `wavatar`, `retro`, `robohash`) a deterministic image is generated server-side from the hash when the user has no photo; `s=` sets size from 1 to 2048 px [27]. This is `derived`, server-side, keyed on a stable hashed identifier.
- **GitHub identicons**: 5x5 sprites generated from a hash of the user ID, introduced 2013-08-14 for users without a Gravatar, post updated 2019-01-04 [28]. Keyed on ID, so inputs never change on rename.
- **Boring Avatars**: open-source React library generating SVG from a name string, plus a subscription service; its site does not document a hosted URL format on the pages I could retrieve [29].
- **`@vercel/og`**: server-side derive plus CDN caching [25].

**Pros and cons.**

| | `materialized` | `derived` | `hybrid` |
|---|---|---|---|
| Bytes and storage | One stored file per item | None | One stored file for crawler targets only |
| Compute | Once, in the creating browser | On every view, in every viewer's browser | Derive for display, once for the stored copy |
| Crawler/OS targets | Works | Cannot work (no JS, no stored URL) | Works |
| Version bump | Old images stay; migration is explicit | Every image changes at once | Display changes, stored copy goes stale |
| Custom images | Same path | Needs a stored override anyway | Same path |
| Trust surface | Server receives client pixels (section 3) | None | Server receives client pixels |

**Gotchas, each with its mitigation.**

1. **Stored-URL targets always need a stored copy** [7][3][1]. `derived` alone cannot serve favicons found by Google, `og:image`, or manifest icons. Mitigation: the `targets` primitive marks targets with `requiresStoredUrl: true`, and `check` fails a `derived`-only config that enables them.
2. **Generator version changes silently alter on-the-fly output.** Mitigation: pin version in the SSOT config; include the version in the content-addressed name; `check` flags a pinned version that differs from the installed one (B0.5).
3. **Heavy generators cost compute per view.** Mitigation: manifest `determinism` and `latency` fields gate `derived`; a memory or `localStorage`-style cache is injected; allow only `pure` light generators.
4. **Rendering differs across browsers** **[inference]**: font metrics, antialiasing and canvas GPU paths vary, so raster output is not reproducible byte for byte. SVG without text is a pure string function and is reproducible; text-bearing generators (initials) should convert glyphs to paths or declare `determinism: "seeded-renderer-dependent"`. Server-side rasterisers such as Resvg are a single implementation across environments [25].
5. **Upload trust**: see section 3.
6. **Cache key hygiene.** Immutable caching needs a content-addressed path [13]; the favicon at `/favicon.ico` is the exception [1].

## 3. Security of client-generated uploads

OWASP's File Upload Cheat Sheet (retrieved 2026-11-14) recommends [10]: allowlist extensions after validating input, watching double extensions, null bytes and case tricks; do not trust the `Content-Type` header; generate the stored filename server-side (for example a UUID); cap filename length and characters; set size limits; store outside the webroot or on a separate host and serve through an ID-to-file handler; apply Content Disarm and Reconstruct to documents; for images, decode and re-encode to an allowed format and strip metadata, noting this does not guarantee removal of all malicious content, so use up-to-date libraries with resource limits and sandboxing; require authentication and authorisation; scan with antivirus or a sandbox. The page has no SVG-specific section.

**Applied to sigilsmith.**

- **Raster uploads (PNG/JPEG/WebP):** validate magic bytes against an allowlist, enforce dimension and byte caps (for example, dimensions no larger than the largest declared target, and bytes under the strictest unfurl limit when the file serves `og:image`), then decode and re-encode server-side to strip metadata and polyglot payloads (OWASP's image rewriting) [10]. Polyglot detection specifically is not covered by the OWASP page; rewriting is the mitigation **[inference]**.
- **SVG uploads:** avoid accepting client SVG at all if a raster will do. SVG used through `<img>` runs no script and loads no external resources [30], but the same file opened as a top-level document or in `<iframe>`, `<object>` or `<embed>` can run script [30]. If SVG must be stored: (a) sanitise with DOMPurify's SVG profile (`USE_PROFILES: { svg: true, svgFilters: true }`; it strips event handlers; in Node use the latest jsdom, since older versions have XSS-relevant bugs and happy-dom is not considered safe) [31]; (b) serve with `Content-Type: image/svg+xml`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox` (no `allow-scripts`, never `allow-scripts` with `allow-same-origin`) [12]; (c) prefer a separate origin for user content [12]; (d) consider rasterising on the server and discarding the SVG. `foreignObject` and external references: DOMPurify's page does not describe the default treatment of `foreignObject` (it shows a hook removing it) [31], so remove it explicitly in the sanitiser configuration and verify with tests.
- **Strongest check for deterministic generators** [inference]: accept the generator inputs and regenerate on the server (B7 isomorphism), comparing at SVG level, rather than trusting uploaded pixels. This is only available for pure generators; for AI or custom images, the re-encode path applies.
- **Abuse:** user-supplied uploads can be offensive. Google replaces inappropriate favicons with a default [3], which shows search engines apply their own moderation to the icons they display. Apply upload rate limits per authenticated user, per-account quotas, and a moderation hook in the injected storage layer (not built into the package, in line with B18's "package never decides where images live").

## 4. Regeneration policy (B19)

**Product evidence** (mostly secondary; no primary source found for most):

- **GitHub identicons** hash the user ID [28]. The page does not discuss rename; by construction an ID-keyed image does not change on rename (inference from the keying).
- **Jira (Atlassian community answer):** initials generated from the name, so renaming changes them; colours random; workaround is an uploaded avatar. **Zoom:** a user reported a stale initial after renaming that support had to reset [32]. Both are community reports, not documentation. Pattern: letter avatars follow the name, and stale cases are treated as bugs.
- **Spotify playlists:** per secondary sources, a 2x2 mosaic of the first four tracks' art is auto-generated and updates as tracks change; a custom cover overrides it; removing the photo gives a music-note icon, not the mosaic; one Spotify Community thread reports mosaics sometimes not matching [33]. Pattern: follow inputs while auto-generated, freeze once customised.
- **YouTube thumbnails:** auto frames are offered at upload and the creator selects one; the July 2026 report says desktop Studio now offers three suggested frames [34]. I found no evidence that a title edit regenerates a thumbnail. Pattern: user picks once, then stable.
- **Gmail/Google account letter avatars, Slack and Notion workspace/page icons, Apple Music, Linear, Figma:** I could not find usable documentation on their rename behaviour in this run **[unverified; no claim made]**.

**General UX guidance.**

- NN/g, "User Control and Freedom" (Rosala, 2020-11-29): provide emergency exits and support undo and redo; make undo visible because a transient snackbar is easy to miss; use warning dialogs where reversal is impossible or impractical [35].
- NN/g, "Confirmation Dialogs Can Prevent User Errors" (Nielsen, 2018-02-18, reviewed 2026-08-07): reserve confirmations for serious or irreversible actions; overuse trains users to click through; undo is the stronger safeguard; use outcome-named buttons and no default answer [36].

**Reasoning for the default.**

- Regeneration is **reversible** if the previous image is retained. By NN/g, that favours undo over a blocking confirmation [36].
- It is **not harmless**: A1's premise is that the image is the identity users learn. Silently changing it on a minor rename (typo fix) breaks recognition, which argues against `always` as default. Conversely `never` leaves a stale image for a genuine retitle, and the evidence from letter-avatar products is that stale avatars are reported as defects [32].
- A modal `ask` on every rename is the "cry wolf" pattern [36] and a rename is a frequent action in some apps.
- Hence a default-keep, non-modal prompt (section Recommendations) captures the benefits of both: stable by default, one tap to follow the new title, undoable, and quiet once the user has made a choice (freeze). This is [inference]; no study I found directly tests it.

**Variants considered.**

| Variant | Behaviour | Verdict |
|---|---|---|
| `always` | Image follows inputs | Right for lists where the image is a *label* (letter avatars); offered as a preset. Fine for `derived` strategy, where it is automatic |
| `never` | Image frozen at creation | Right when keyed on an immutable ID; offered as a preset |
| `ask` (modal) | Blocking dialog | Not the default; interrupts a frequent action [36] |
| `ask` (toast/inline, default-keep, undoable) | As recommended | **Default** |
| `follow-while-auto` | Follow inputs until the user customises (Spotify pattern [33]) | Offered as a policy variant; equals `always` plus the existing custom-image protection |

## 5. Seed table for the zod target registry

`stored` means a stored image at a stable absolute (or origin-relative) URL is required for the target to work. `legacy` targets default off. Sizes are pixels. "Verified" refers to this report's sources.

| id | sizes | format | stored | snippet / API | status |
|---|---|---|---|---|---|
| `favicon-ico` | 32x32 (opt. 16 layer) | ICO | y | `<link rel="icon" href="/favicon.ico" sizes="32x32">` [1] | current |
| `favicon-svg` | scalable | SVG, with `prefers-color-scheme` inside | y | `<link rel="icon" href="/icon.svg" type="image/svg+xml">` [1][2] | current; Safari 26+ [2] |
| `favicon-search` | square, at least 8, more than 48 recommended | PNG/ICO/etc., not SVG | y | `<link rel="icon" href="...">` on home page; stable URL [3] | constraint set |
| `apple-touch-icon` | 180x180 (art about 140, padding about 20) | PNG, opaque [unverified rule] | y | `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` [1] | current |
| `manifest-icon-any` | 192, 512 | PNG (SVG with `sizes:"any"` allowed [14]) | y | manifest `icons` [14][15] | current |
| `manifest-icon-maskable` | 512 (art within central 80%, about 409) | PNG, opaque | y | `"purpose":"maskable"`, not combined with `any` [1][16] | current |
| `manifest-icon-monochrome` | as `any` | PNG/SVG, alpha only | y | `"purpose":"monochrome"` [14] | current; support unverified |
| `manifest-shortcut-icon` | 192 | PNG | y | `shortcuts[].icons` [6] | optional |
| `safari-mask-icon` | n/a | monochrome SVG | y | `<link rel="mask-icon">` | legacy, off [1] |
| `windows-tile` | n/a | n/a | y | `msapplication-*` | legacy, off [1] **[unverified]** |
| `theme-color` | none | colour | n | `<meta name="theme-color" content="..." media="(prefers-color-scheme: dark)">` [17] | optional |
| `og-image` | 1200x630 (min 200x200 Facebook; 1.91:1) | PNG/JPEG; keep under 300 KB for WhatsApp [secondary]; SVG not documented anywhere | y, absolute | `og:image`, `:width`, `:height`, `:alt` [7][18] | current |
| `twitter-image` | `summary_large_image`: min 300x157, 1200x630 typical [secondary] | PNG/JPEG/WebP/GIF, 5 MB [secondary] | y, absolute | `<meta name="twitter:card" ...>` + `twitter:image` | current; **[unverified]** |
| `linkedin-image` | 1200x627, 5 MB | PNG/JPEG | y | reads `og:image` [8] | current |
| `media-session-artwork` | 96, 128, 192, 256, 384, 512 | PNG (`type` hint) | url required; client-built blob/data URL **[unverified]** | `navigator.mediaSession.metadata = new MediaMetadata({ artwork: [...] })` [4] | current; support limited |
| `notification-icon` | no spec; small | PNG | url required | `showNotification(title, { icon })` [5][26] | current |
| `notification-badge` | about 96 (Android), monochrome | PNG, silhouette | url required | `showNotification(title, { badge })` [26] | current |
| `notification-image` | no spec | PNG/JPEG | url required | `showNotification(title, { image })` [26] | optional |
| `apple-touch-startup-image` | many device sizes | PNG | y | `<link rel="apple-touch-startup-image">` | out of scope **[unverified]** |
| `app-thumbnail` | app-defined | SVG preferred | n | `<img src alt="">` | in-app |

Suggested zod fields per target: `id`, `status` (`current | legacy | optional`), `sizes` (list of width/height or `"any"`), `formats`, `background` (`opaque | transparent-ok`), `safeZone` (for example `{ shape: "circle", radiusRatio: 0.4 }` for maskable), `monochrome` (boolean), `requiresStoredUrl`, `absoluteUrl`, `maxBytes`, `registration` (`{ kind: "link" | "meta" | "manifest" | "js", template }`), `sources` (reference ids), `verified` (date and quality: `primary | secondary | unverified`).

## 6. Gaps

- X/Twitter, WhatsApp, Telegram, iMessage and Discord primary documentation was unreachable or absent in this run; their rows are secondary or unverified. Verify with real shares before encoding limits as errors rather than warnings in `check`.
- Safari behaviour for `prefers-color-scheme` inside SVG favicons and the Apple "no transparency" rule need a primary source.
- `blob:`/`data:` URL acceptance for Media Session artwork and notification icons is unverified on every platform.
- Rename behaviour in Slack, Notion, Linear, Figma, Apple Music and Google account avatars is undocumented in what I could reach.

## REFERENCES

1. [Sitnik A. How to Favicon in 2026 (Evil Martians)](https://evilmartians.com/chronicles/how-to-favicon-in-2021-six-files-that-fit-most-needs)
2. [Can I use: SVG favicons](https://caniuse.com/link-icon-svg)
3. [Google Search Central: Define a favicon to show in search results](https://developers.google.com/search/docs/appearance/favicon-in-search)
4. [MDN: MediaMetadata.artwork](https://developer.mozilla.org/en-US/docs/Web/API/MediaMetadata/artwork)
5. [MDN: Notification.icon](https://developer.mozilla.org/en-US/docs/Web/API/Notification/icon)
6. [MDN: Web app manifest, shortcuts](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/shortcuts)
7. [Meta for Developers: Sharing best practices, images](https://developers.facebook.com/docs/sharing/webmasters/images/)
8. [LinkedIn Help: sharing module image requirements](https://www.linkedin.com/help/linkedin/answer/a521928)
9. [Wix Support: recommended og:image size](https://support.wix.com/en/article/wix-editor-recommended-ogimage-size) and [Shopify Community thread on missing share images](https://community.shopify.com/t/image-missing-for-product-and-collection-links-shared-on-social-media-dawn-v11/291114) (secondary; WhatsApp 300 KB vs 600 KB disagreement)
10. [OWASP Cheat Sheet Series: File Upload](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
11. [MDN: SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image)
12. [MDN: Content-Security-Policy sandbox directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox)
13. [MDN: Cache-Control header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control)
14. [MDN: Web app manifest, icons](https://developer.mozilla.org/en-US/docs/Web/Manifest/icons)
15. [Chrome for Developers: installable manifest](https://developer.chrome.com/docs/lighthouse/pwa/installable-manifest)
16. [web.dev: Maskable icon support](https://web.dev/articles/maskable-icon)
17. [MDN: meta name theme-color](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/theme-color)
18. [The Open Graph protocol](https://ogp.me/)
19. [Slack Developer Docs: Unfurling links in messages](https://docs.slack.dev/messaging/unfurling-links-in-messages/)
20. [Third-party summary of X card image limits (Twitter/X Card Validator guide)](https://achromatic.dev/tools/twitter-card-validator) and [Legacy Twitter card page](https://dev.Twitter.com/cards/types/summary-large-image) (secondary; primary docs.x.com unreachable)
21. [Discord Developer Docs: Message resource](https://docs.discord.com/developers/resources/message)
22. [Wild and Free Tools: meta tags for WhatsApp, Discord and Telegram](https://wildandfreetools.com/blog/meta-tags-social-media-whatsapp-discord) (secondary)
23. [Telegram link preview refresh, community guide (WebpageBot)](https://medium.com/@kapxapot/how-to-update-the-page-preview-in-telegram-beb24ddae5df) (secondary)
24. [Apple: LPLinkMetadata](https://developer.apple.com/documentation/linkpresentation/lplinkmetadata.md) (existence only; no image rules found)
25. [Vercel: Open Graph image generation](https://vercel.com/docs/og-image-generation)
26. [MDN: ServiceWorkerRegistration.showNotification](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/showNotification)
27. [Gravatar Docs: Images](https://docs.gravatar.com/general/images/)
28. [GitHub Blog: Identicons](https://github.blog/news-insights/company-news/identicons/)
29. [Boring Avatars](https://boringavatars.com/)
30. [MDN: SVG as an image](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image) (same page as [11], cited for the iframe/object contrast)
31. [DOMPurify (cure53)](https://github.com/cure53/DOMPurify)
32. [Atlassian Community: initials from name in Jira](https://community.atlassian.com/t5/Jira-questions/How-do-I-get-my-avatar-showing-my-initial-again/qaq-p/326322) and [Zoom Community: default avatar shows wrong initial](https://community.zoom.com/meetings-2/default-avatar-shows-wrong-initial-letter-n-instead-of-t-81364) (secondary)
33. [Spotify Community: default playlist cover](https://community.spotify.com/t5/Your-Library/Default-Playlist-Cover-Unsynced/m-p/5410442) and [Nerds Chalk: change Spotify playlist picture](https://nerdschalk.com/how-to-change-spotify-playlist-picture/) (secondary; official Spotify support page not retrieved)
34. [Engadget: YouTube adds new tools to make creating thumbnails easier](https://engadget.com/2223150/youtube-new-tools-thumbnails) (secondary)
35. [Rosala M. User Control and Freedom (Nielsen Norman Group, 2020-11-29)](https://www.nngroup.com/articles/user-control-and-freedom/)
36. [Nielsen J. Confirmation Dialogs Can Prevent User Errors, If Not Overused (Nielsen Norman Group, 2018-02-18, reviewed 2026-08-07)](https://www.nngroup.com/articles/confirmation-dialog/)
