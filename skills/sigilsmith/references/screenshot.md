# The screenshot extra (`screenshot@1`)

Some lists have a picture of their own that says more than any generated image: a game's signature moment, a document's title block, a level's map. The screenshot extra shows that picture, cropped to the one region that identifies the item, and draws a sigil when the item has none.

It is an **extra**: it lives outside the kernel and the generator set (`sigilsmith/extras/screenshot/v1`), the catalog lists it as `screenshot@1 (extra)`, and an app ships it only when its config can select it. Nothing else changes: `build` wires it, `explain` shows it, `check` renders it.

## When to use it

- Use it when each item has (or can get) a screenshot that a user would recognise, and the identifying part is a region of it: the board of a puzzle game, the ball and paddles of a pong, the waveform of a sound.
- Do not use it for items whose screenshots look alike (every settings page, every empty editor): the region that tells them apart is too small, and a feature-driven sigil ([features.md](features.md)) says more.
- Do not use it for user photos or uploads: those are custom images (`storeCustom`), which replace the generated image entirely.

## The data

Two fields on each item, both optional:

- `screenshot`: the URL of a **small key frame** (a few hundred pixels, WebP). Same-origin paths (`/games/pong.webp`) need nothing; another origin needs CORS headers. Files over `maxBytes` (1.5 MB) are refused.
- `screenshotFocus`: the region that identifies the item. A point `"0.72,0.35"` (the largest square that fits, centred there), a zoomed point `"0.72,0.35,3"`, or a rectangle `"0.1,0.2,0.4,0.4"` (`x,y,w,h`). Fractions of the image when every number is ≤ 1, pixels otherwise (so a rectangle read off an image editor works as is). The same as JSON: `{ "x": 0.72, "y": 0.35, "zoom": 3 }`. Without it, the `focus` param applies (default: the centre, zoom 1).

Rename the fields with the generator's inputs, never in code: `"generators": { "screenshot@1": { "inputs": [{ "field": "media.thumb", "as": "src" }, { "field": "media.focus", "as": "focus" }, "$label", "$key"] } }`.

## The config

Guard the rule, so an item without a screenshot keeps whatever the app draws otherwise (a preset, a feature-driven glyph, the default):

```json
"policy": {
  "default": "grid@1",
  "rules": [{ "when": { "screenshot": { "exists": true } }, "use": "screenshot@1" }]
}
```

Rules come before feature sets in the selection order, so with a feature set for the same list the result is: the screenshot when there is one, the feature glyph otherwise. That is the usual shape for a games hub.

Unguarded (`"use": "screenshot@1"` for every game), an item without a screenshot gets the `fallback` generator (`grid`, `rings`, `shapes` or `initials`), drawn exactly as that generator draws the item at its defaults.

The extra's kind is `content`: presets never replace its inputs (a `documents` or `media` preset's text inputs would otherwise drop the screenshot). Its ring and background take the item's identity colour from `$key`, so they match the item's other sigils.

Params: `focus`, `zoom` (1 to 16), `shape` (`square`, `rounded`, `circle`), `ring` (a ring in the item's identity colour, 0 for none), `pixelated` (hard pixel edges when zoomed, for pixel-art games), `fallback`, `maxBytes`. `npx sigilsmith catalog --ref screenshot@1 --json` lists them.

## Delivery and the CLI

- `derived` works: the extra is pure in its inputs and the file's bytes, so a thumbnail follows its file. Under `materialized`, a stored thumbnail only changes when the URL changes: use content-hashed file names (a bundler's `import shot from './pong.webp'` gives one).
- The output is an SVG with the file embedded, so it shows anywhere an SVG does, including favicons and stored records. An `<img>` cannot load an external file from inside an SVG, which is why the file is embedded rather than linked.
- `preview`, `check` and `build` run in Node without a web server: they read `/games/pong.webp` from `public/games/pong.webp` under the config's directory (then from that directory itself), also without a leading base segment (`/myapp/games/pong.webp`).
- Budget: 2.3 kB gzip for the extra, plus its `fallback` generator (counted even when nothing else selects it). Near the 9 kB starter budget on the React path with a second generator, so raise `budget.maxGzipBytes` by about 1 kB when you add it.

## Failures

A missing field is not an error (the guarded rule skips the item, or the fallback is drawn). A screenshot that cannot be used is `SGS0305`: the file is missing (404) or failed to load (network, CORS, another HTTP error), is not a PNG, JPEG, GIF or WebP, is over `maxBytes`, or the focus is malformed. A missing file is an error rather than a fallback so that a stored image never keeps a fallback for a URL whose file appears later. `<Sigil>` shows its retry state; `check` reports it on the sample items, which is how a typo in a path shows up before users see it.
