# Migrating an app's own thumbnails to sigilsmith

An app that already shows an image per item (a hand-rolled gradient "orb", an avatar library, stored cover art) moves to sigilsmith in one pass, without the list changing under its users more than it must. The first worked migration was arioso_studio's song art (2026-11-23); this is what it needed.

## 1. Find what is there: `sigilsmith adopt`

```bash
npx sigilsmith adopt [--dirs src,app] [--samples items.json] [--json]
```

Read-only. It reports, with file, line and call sites:

| finding | what it is | the move |
|---|---|---|
| `home-grown` | a module exporting something named like a thumbnail (Orb, Avatar, Identicon, Cover, Gradient...) that hashes strings into colours | the catalog generator with the same look, its palette pinned in params; swap every call site |
| `library` | an avatar / identicon package (jdenticon, boring-avatars, DiceBear, blockies, jazzicon...) | the closest generator, named in the finding |
| `media-session` | lock-screen artwork set by hand | `mediaArtwork` (below) |
| `image-field` | per-item image URLs in the sample items (cover art, avatars) | adopt them, or offer them in the picker |
| `sigilsmith` | an existing config and `<Sigil>` call sites | extend that config; never a second wiring |

and an ordered recipe. The rest of this page is that recipe in full.

## 2. Keep the look: a generator, with the old palette pinned

Never port the app's drawing code into the app's own generator: pick the catalog generator with the same look and pin the old parameters in the config. For blurred gradient fields (the commonest hand-rolled "cover art") that is `aura@1`:

```json
"generators": { "aura@1": { "params": { "hues": [268, 285, 300, 318, 330, 250, 225, 205, 185, 160, 40, 12], "shape": "square" } } },
"policy": { "default": "aura@1", "rules": [{ "when": { "type": "upload" }, "use": "rings@1" }] }
```

`aura@1` draws the way the common hand-rolled orb draws (cyrb53 of the key, field `k`'s hue from `cyrb53(key, k)`, its centre and reach from bit shifts, the base from `cyrb53(key, 9)`), so with the default single key input and the old palette pinned in the old order, every item keeps its colours: nothing changes for the app's users. `tests/migration.test.ts` holds arioso's original `orbColors` and checks it. If the old code hashed differently, the look is kept and each item's colours change once: say so in the PR. Reproducing some other hash exactly is the external-generator seam (thorwhalen/sigilsmith#12), not a reason to keep the old code.

Then `npx sigilsmith preview --generators aura@1` beside a screenshot of the old list, `npx sigilsmith build`, and swap each call site:

```tsx
// before
<Orb id={song.id} size={56} spinning={playing} />
// after: the app keeps its own wrapper for motion and overlays; the image is sigilsmith's
<SongArt song={song} size={56} spinning={playing} />   // renders <Sigil item={song} size={56} record={song.sigil} />
```

A wrapper the app owns is fine (motion while playing, a play button over it, its own corner radius: pin `shape: "square"` and let `<Sigil radius>` round it); a second source of truth for the image is not. Delete the old module in the same PR, so nothing can drift back to it. Its call sites, `adopt` listed them all.

## 3. Lock-screen art follows the list

```ts
import { mediaArtwork } from 'sigilsmith/targets';
navigator.mediaSession.metadata = new MediaMetadata({ title, artist, artwork: await mediaArtwork(sigil, song, { record: song.sigil }) });
```

The stored URL when the item has one (a custom image), else a PNG of the same sigil rendered in the browser (`browserPng`; lock screens take no SVG). It never throws. This replaces the canvas copy of the old thumbnail apps tend to keep for the lock screen, which drifts from the list the day the list changes.

## 4. Let users change an item's image

Three pieces, all through seams the app already has:

1. **The record on the item.** Add an optional `sigil` field (a `SigilRecord`, or `null` for "generated") to the item schema and to the item's update (PATCH). The server accepts only records whose `url` points at its own image route (or the item's own provider image), and lets the same people change it who may rename the item.
2. **The image store, through zodal.** Images go where the app's other blobs go: `fromDataProvider(createHttpBlobProvider({ baseUrl: \`${API}/sigils\`, contentFields: ['image'] }))` (`@zodal/store-http`; one content field, so the URL is `${API}/sigils/<id>`). The server side is two routes over the app's storage (S3 in production): `PUT /sigils/{id}` (id `sg_` + 32 hex, body capped, magic bytes PNG/JPEG/GIF/WebP, never SVG, idempotent) and `GET`/`HEAD /sigils/{id}` (`Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`). Content ids make uploads idempotent and cacheable forever.
3. **The picker.** `useSigilPicker(item, { record, store, candidates, onChange })` from `sigilsmith/react` (headless; draw it with the app's components), or `<SigilPicker>` for a plain default. Choices: the generated sigil (`null`), the current upload, the app's candidates, an upload button. `onChange(record)` persists the record (the PATCH above).

```tsx
const picker = useSigilPicker(song, {
  record: song.sigil,
  store,                                                   // the zodal-backed ImageStore
  candidates: [
    song.image_url && { id: 'provider', label: 'Cover art', url: song.image_url, adopt: () => copyProviderArt(song.id) },
    ...otherSongsWithImages.map((s) => ({ id: s.id, label: s.title, record: s.sigil })),
  ].filter(Boolean),
  onChange: (record) => updateSong(song.id, { sigil: record }),
});
```

A candidate is a `record` to reuse (another item's image), a `url` to adopt (`copy: true` copies it into the store), or the app's own `adopt()` (a server-side copy, for a URL the browser may not fetch across origins). Uploaded and adopted records are `source: 'custom'`, frozen: `deliver` and `onInputsChanged` never replace them.

## 5. Images the items already have

A field of image URLs (provider cover art, avatars from sign-up) is kept, not regenerated: either offer it as a picker candidate (users opt in per item), or adopt it for every item up front:

```ts
item.sigil = await adoptImage(item.image_url, { store });  // copies: right for expiring or foreign URLs
item.sigil = await adoptImage('/avatars/42.png');           // references: right for URLs the app owns
```

`adoptImage` refuses `javascript:`, protocol-relative and SVG URLs (SGS0111) and checks copied bytes like an upload (SGS0110). Provider CDN links expire: copy them, or copy them on the server (the browser often cannot fetch them across origins).

## 6. Done

`npx sigilsmith check` all ✓, the old module gone, `adopt` reporting only the `sigilsmith` finding, and the PR saying which images changed.
