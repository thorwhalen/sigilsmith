# Migrating an app's own thumbnails to sigilsmith

An app that already shows an image per item (a hand-rolled gradient "orb", an avatar library, stored cover art) moves to sigilsmith in one pass, without the list changing under its users more than it must. The first worked migration was arioso_studio's song art (2026-11-23); this is what it needed.

## 1. Find what is there: `sigilsmith adopt`

```bash
npx sigilsmith adopt [--dirs src,app] [--samples items.json] [--json]
```

Read-only. It reads JS/TS, Vue, Svelte and Python sources (`--dirs` defaults to `src`; pass the server's package too, since a page rendered without the browser often keeps its own copy of the item art). It reports, with file, line and call sites:

| finding | what it is | the move |
|---|---|---|
| `home-grown` | a module exporting something named like a thumbnail (`Orb`, `orbColors`, `UserAvatar`, `Identicon`, `CoverArt`...) that hashes strings into colours | the catalog generator with the same look, its palette pinned in params; swap every call site |
| `library` | an avatar / identicon package (jdenticon, boring-avatars, DiceBear, blockies, jazzicon...) | the closest generator, named in the finding |
| `media-session` | lock-screen artwork set by hand | `mediaArtwork` (below) |
| `image-field` | per-item image URLs in the sample items (cover art, avatars) | adopt them, or offer them in the picker |
| `sigilsmith` | an existing config and `<Sigil>` call sites | extend that config; never a second wiring |

and an ordered recipe. The rest of this page is that recipe in full.

## 2. Keep the look: a generator, with the old palette pinned

Never port the app's drawing code into the app's own generator: pick the catalog generator with the same look and pin the old parameters in the config. A placeholder that says what kind of item it is plus one fact (a film frame with the year, a page with the file extension) is `badge@1`: an `icon` per item type by rule, the fact mapped to its caption (`"inputs": ["$key", { "field": "year", "as": "caption" }]`). Letters of the name are `initials@1`. For blurred gradient fields (hand-rolled "cover art" orbs) that is `aura@1`:

```json
"generators": { "aura@1": { "params": { "hues": [268, 285, 300, 318, 330, 250, 225, 205, 185, 160, 40, 12], "shape": "square", "blurPx": 6, "highlight": 0 } } },
"policy": { "default": "aura@1", "rules": [{ "when": { "type": "upload" }, "use": "rings@1" }] }
```

`aura@1` draws the way arioso's hand-rolled orb drew: cyrb53 of the key, field `k`'s hue from `cyrb53(key, k)`, its centre and reach from bit shifts of `cyrb53(key)`, the base from `cyrb53(key, 9)`. So when the old orb hashed that way, with the default single key input and the old palette pinned in the old order, every item keeps its colours and the geometry of its fields (`tests/migration.test.ts` holds arioso's original `orbColors` and checks it). A CSS `blur(6px)` is 6 px at every size: pin `blurPx: 6` (the SVG then follows the render size) rather than `blur`, which is relative to the tile. The sheen and any motion stay in the app's wrapper (`highlight: 0`), so a turning image keeps a still light. If the old code hashed differently, the look is kept and each item's colours change once: say so in the PR. When no catalog generator draws the old images exactly and they must not change, wrap the app's own function as an **extension**: a JS module default-exporting a generator (`{ id: 'app-orb', major: 1, kind: 'hash', determinism: 'pure', defaults, defaultInputs: ['$key'], render }`, optionally `catalog: { name, description, gzipBytes }`), named in the config (`"extensions": ["./src/sigils/orb.js"]`, then `"policy": { "default": "app-orb@1" }`). Catalog, build, explain, preview and check treat it like a built-in; its params are checked against its defaults. Swap the call sites now with no image changing, and move to a catalog generator later, deliberately (`check identity` lists what moves). The module goes into the browser: no zod or Node imports; Node loads it too (JavaScript, or erasable TypeScript on Node 23.6+).

Then `npx sigilsmith preview --generators aura@1` beside a screenshot of the old list, `npx sigilsmith build`, and swap each call site:

```tsx
// before
<Orb id={song.id} size={56} spinning={playing} />
// after: the app keeps its own wrapper for motion and overlays; the image is sigilsmith's
<Art id={song.id} record={song.sigil} size={56} spinning={playing} />   // renders <Sigil item={{ id }} record={…} />
```

A wrapper the app owns is fine (motion while playing, a play button over it, its own corner radius: pin `shape: "square"` and let the wrapper round it; to turn generated art, draw it at √2 its box so no corner shows, and never turn a picked photo); a second source of truth for the image is not. Delete the old module in the same PR, so nothing can drift back to it. Its call sites, `adopt` listed them all.

## 3. Lock-screen art follows the list

```ts
import { mediaArtwork } from 'sigilsmith/targets';
navigator.mediaSession.metadata = new MediaMetadata({ title, artist, artwork: await mediaArtwork(sigil, song, { record: song.sigil }) });
```

A custom image's stored URL, else a PNG of the same sigil rendered in the browser (`browserPng`; lock screens take no SVG, so a stored generated image, which may be SVG, is rendered again). It never throws. This replaces the canvas copy of the old thumbnail apps tend to keep for the lock screen, which drifts from the list the day the list changes.

## 4. Let users change an item's image

Three pieces, all through seams the app already has:

1. **The record on the item.** Add an optional `sigil` field (a `SigilRecord`, or `null` for "generated") to the item schema and to the item's update (PATCH). The server accepts only records whose `url` points at its own image route (or the item's own provider image), and lets the same people change it who may rename the item.
2. **The image store, through zodal.** Images go where the app's other blobs go: `fromDataProvider(createHttpBlobProvider({ baseUrl: \`${API}/sigils\`, contentFields: ['image'] }))` (`@zodal/store-http`; one content field, so the URL is `${API}/sigils/<id>`). The server side is two routes over the app's storage (S3 in production): `PUT /sigils/{id}` (id `sg_` + 32 hex, body capped, magic bytes PNG/JPEG/GIF/WebP, never SVG, idempotent) and `GET`/`HEAD /sigils/{id}` (`Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`). Content ids make uploads idempotent and cacheable forever. An upload's id is `sg_` + the first 32 hex of the SHA-256 of its bytes, so the server can check it and nothing can overwrite an image; check it only on a store that holds uploads alone, because a generated image's content id (`materialized`/`hybrid` delivery) hashes its inputs, not its bytes.
3. **The picker.** `useSigilPicker(item, { record, store, candidates, onChange })` from `sigilsmith/react` (headless; draw it with the app's components), or `<SigilPicker>` for a plain default. Choices: the generated sigil (`null`), the current upload, the app's candidates, an upload button. `onChange(record)` persists the record (the PATCH above).

```tsx
const candidates: SigilCandidate[] = [];
if (song.image_url) candidates.push({ id: 'provider', label: 'Cover art', url: song.image_url, adopt: () => copyProviderArt(song.id) });
for (const s of otherSongsWithImages) candidates.push({ id: `song:${s.id}`, label: s.title, record: s.sigil });

const picker = useSigilPicker(song, {
  record: song.sigil,
  store,                                       // the zodal-backed ImageStore
  candidates,
  onChange: (record) => updateSong(song.id, { sigil: record }),
});
```

A candidate is a `record` to reuse (another item's image), a `url` to adopt (`copy: true` copies it into the store), or the app's own `adopt()` (a server-side copy, for a URL the browser may not fetch across origins; `preview` is what its tile shows when it has no `url`). A record made from a candidate carries its id in `from`, so the picker still shows that candidate as current once the image lives in the store; let the server keep that field. Uploads are downscaled in the browser first (`maxSide`, default 512 px), since a phone photo is several megabytes. Uploaded and adopted records are `source: 'custom'`, frozen: `deliver` and `onInputsChanged` never replace them.

## 5. Images the items already have

A field of image URLs (provider cover art, video thumbnails, avatars from sign-up) is kept, not regenerated. The picture wins when it exists; the sigil is its placeholder while it loads and its fallback when it fails or is missing. Replace an `item.image_url ? <img …> : <Sigil …>` branch with one call:

```tsx
<Sigil item={item} size={48} record={pictureRecord(item.image_url)} />   // picture, else (or on error) the sigil
artwork: await mediaArtwork(sigil, item, { record: pictureRecord(item.image_url) })
```

A portrait box (a poster) takes `height` and `objectPosition` (`<Sigil item={film} size={40} height={56} objectPosition="50% 20%" record={…} />`). The app's own loading machinery (shimmer, fade-in, error placeholder) goes: `<Sigil>` reserves the box, fades the picture in, and falls back to the sigil. `pictureRecord` is synchronous and stores nothing (`null` for an empty or refused URL). To keep a copy of an expiring picture, or to let users replace it, adopt it into the store:

```ts
item.sigil = await adoptImage(item.image_url, { store });  // copies: right for expiring or foreign URLs
item.sigil = await adoptImage('/avatars/42.png');           // references: right for URLs the app owns
```

`adoptImage` refuses `javascript:`, protocol-relative, backslash and SVG URLs (SGS0111) and checks copied bytes like an upload (SGS0110). Provider CDN links expire: copy them, or copy them on the server (the browser often cannot fetch them across origins).

## 6. Done

`npx sigilsmith check` all ✓ (it counts the picker in the budget), the old module gone, `adopt` reporting no `home-grown`, `library` or `media-session` finding (an `image-field` finding stays while items keep their old URLs, which is fine once they are picker candidates or adopted), and the PR saying which images changed.
