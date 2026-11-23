---
name: sigilsmith
description: >-
  Give every item in an app's lists (songs, users, projects, documents, videos) a deterministic identity image: an identicon, avatar, thumbnail or favicon, generated in the browser, stable across reloads and devices. Use when asked to "add thumbnails/avatars/identicons/placeholder images", "auto-generate an image for each item", "favicon or og:image from the app's identity", "different image style per item type", "let users pick the thumbnail style", "thumbnails that show what the item is", "should these list items have sigils/thumbnails", "map item characteristics/features to the image", or whenever a sigilsmith.config.json, sigilsmith.gen.ts or an SGS diagnostic code appears. Also for replacing an app's own thumbnails (a hand-rolled gradient orb or identicon, an avatar library, stored cover art) with sigilsmith ("migrate the thumbnails", "let users pick or upload their own image per item", "change a song's thumbnail"): `sigilsmith adopt` finds them and gives the recipe. Covers choosing a generator from the catalog, previewing, pinning it in the config, building the wiring module, writing the glue, registering favicons/og:image/Media Session art, and passing `sigilsmith check`. Also covers feature-driven sigils: a feature schema (numeric, ordinal, categorical, binary dimensions), per-item feature vectors and a declarative mapping to generator params, so similar items look related.
metadata:
  audience: coding agents integrating sigilsmith into an app
---

# sigilsmith: choose, preview, pin, build, glue, check

`sigilsmith.config.json` is the single source of truth. Every command below is also an MCP tool (`npx sigilsmith mcp`, same names with `_` for `-`, same JSON envelopes) if your agent prefers tools to a shell. App code never names a field, a generator or a param: it imports `sigil` from the generated wiring module (`src/sigilsmith.gen.ts`). The loop is done when `npx sigilsmith check --json` exits 0.

## The loop

1. **Install and init.** `npm i sigilsmith` (plus `@resvg/resvg-js` as a dev dependency for PNG previews and icons), then `npx sigilsmith init --samples <items.json>`. Give it 20–200 real items: they drive key detection, the item-type field (`itemType`, what `when` rules and presets match on), previews, preview metrics and drift checks. Init starts on `delivery.strategy: "derived"` (render on read, nothing to store) and a total budget of 9000 B gzip; its `next` lists the remaining steps in order.
2. **Key.** `npx sigilsmith detect-key <items.json> --json`. Read `chosen`, `candidates` and `warnings`. Prefer an immutable id. A display title as key means renaming an item changes its image. Record it with `--write`.
3. **Choose.** `npx sigilsmith catalog --implemented --json` with the user's constraints: `--style abstract,geometric`, `--max-gzip 1500` (per generator, over the kernel), `--no-network`, `--mit-only`. Read `excluded[].because` to relax constraints instead of guessing. Details: [references/choosing.md](references/choosing.md).
4. **Preview.** `npx sigilsmith preview --generators a@1,b@1 --json`, then look at `files.png` (rows: generator on light, then dark; columns: items at 128/64/32/16 px). Prefer generators with `nearDuplicates: 0` and visible figures on both backgrounds at the sizes the app uses.
5. **Pin.** Edit the config: `policy.default`, `policy.rules` (`{ "when": { "type": "video" }, "use": "rings@1" }`, or a weight map for deterministic mixing), `generators.<ref>.params`, `presets`, `budget.maxGzipBytes` (a total: kernel ~4.2 kB + React adapter ~1.9 kB + delivery module ~1.7 kB unless `derived` + every selectable generator), `userSettings.choices`. `npx sigilsmith explain --index 0 --json` shows, for one item, the key, the rule that chose the generator, the inputs, and the layer that supplied every param. Tuning: [references/tuning.md](references/tuning.md).
6. **Build.** `npx sigilsmith build`. It writes the wiring module (commit it, never edit it) and `sigilsmith.lock.json` (commit it: it pins what every sample item looks like).
7. **Glue** (the only code you write): wrap the app in `<SigilProvider sigil={sigil}>` and render `<Sigil item={item} size={40} record={item.sigil} />` (React), or `await sigil.render(item)` + `toDisplayUrl()` (vanilla). With `derived` delivery that is all the glue. Switch to `materialized` (store, upload endpoint, `deliver()` on item creation) when an image must survive a change of its inputs (the "keep this image?" prompt after a rename), when a remote generator draws it, or when something outside the app needs its URL: [references/integrating.md](references/integrating.md).
8. **Targets** (favicon, Apple touch icon, manifest icons, og:image, Media Session art): `npx sigilsmith targets --emit` writes files and prints snippets to paste. Hrefs start with `/`; for an app served under a sub-path set `targets.basePath` (`"/myapp/"`, or `""` for relative hrefs) first. It never replaces a file it did not write (an existing hand-made `icon-512.png` is reported as SGS0606 and left alone; `--out <dir>` to compare, `--force` to replace). If the page already has its own icons, SGS0607 says so: keep them and drop the site targets they cover, since an SVG favicon outranks a PNG icon and some hosts derive their icons from the page. [references/targets.md](references/targets.md).
9. **Check.** `npx sigilsmith check --json`. Fix diagnostics in order; each has `fix.summary`, often `fix.commands` and `fix.edits`. Apply `machine-applicable` fixes directly; ask the user before `maybe-incorrect` ones that change identities (`build --accept`). Code meanings: [references/errors.md](references/errors.md) or `npx sigilsmith explain-code SGS0701`.

## Lists whose items have characteristics: feature-driven sigils

When a list's items differ in ways users choose by (instruments, presets, scenes, games, project types), give the image meaning instead of a hash: a **feature schema** (the dimensions), **vectors** (one per item, derived from the item definitions), and a **mapping** from dimensions to the params of `glyph@1` (or any generator, including a remote one). All three are JSON files named under `features` in the config; `build` inlines them, `explain` shows which dimension set each param, `check` flags vectors that do not fit (SGS0802) and features the mapping cannot show (SGS0803). Whether a list should have sigils at all, the channel cheat sheet and the loop: [references/features.md](references/features.md).

## Apps that already have thumbnails: `adopt`, then migrate

When the app already draws its own (a hand-rolled gradient orb, an avatar library, stored cover art, hand-set lock-screen art), run `npx sigilsmith adopt --json` first: it lists each piece with file, line and call sites, maps each to its replacement, and returns an ordered recipe. The moves: the catalog generator with the same look with the old palette pinned (`aura@1` reproduces the common cyrb53 gradient orb exactly, so items keep their colours), `mediaArtwork` for the lock screen, `adoptImage` for images items already have, and per-item choice through `useSigilPicker` / `<SigilPicker>` (`sigilsmith/react`) with a `sigil` record on the item and a zodal blob store. Full recipe: [references/migrating.md](references/migrating.md).

## Lists whose items have a picture of their own: the screenshot extra

When each item has a screenshot a user would recognise (a game's signature moment), `screenshot@1` (an extra, outside the kernel) shows it cropped to the region that identifies the item (`screenshotFocus`: `"x,y"`, `"x,y,zoom"` or `"x,y,w,h"`), and the app's own sigil when there is none: guard the rule with `{ "when": { "screenshot": { "exists": true } }, "use": "screenshot@1" }`. Data, config, delivery and failures (SGS0305): [references/screenshot.md](references/screenshot.md).

## Rules that are easy to break

- Never import `sigilsmith/generators/...` or a generator library in app code, and never write a ref like `'grid@1'` in app code: `check bypass` fails on both. `Math.random` near sigilsmith is flagged too (a warning).
- Never edit a generator's code to change its look: change params in the config, or pick another generator. Output changes are new majors (`grid@2`), chosen in the config.
- Changing a rule, weights, `policy.salt`, the key or a generator's inputs changes images; `check identity` lists which items. Only `build --accept` after the user agrees.
- Next to a name the image is decorative: `alt=""` (the default).
- Renaming a data field: change the config only. Inputs are seeded by value, so `{ "field": "name", "as": "title" }` keeps both the image and the name the generator sees.
- User uploads go through `storeCustom` (raster only, bytes sniffed, size-capped); never store user SVG without server-side sanitising.
- API keys never go in the config or the bundle: use `remote.<ref>.transport: "proxy"` (your server holds the key) or a BYOK module transport.
- Crawler targets (og:image, favicons) need stored PNG files at stable URLs; `derived` (render-on-read) delivery cannot serve them.

## When to stop and ask the user

A key that is not an immutable id; a change that `check identity` says alters existing images; a remote/paid generator (cost, terms); anything that uploads client-generated images to their server (validation is theirs to own).
