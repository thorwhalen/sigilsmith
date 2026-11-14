---
name: sigilsmith
description: >-
  Give every item in an app's lists (songs, users, projects, documents, videos) a deterministic identity image: an identicon, avatar, thumbnail or favicon, generated in the browser, stable across reloads and devices. Use when asked to "add thumbnails/avatars/identicons/placeholder images", "auto-generate an image for each item", "favicon or og:image from the app's identity", "different image style per item type", "let users pick the thumbnail style", or whenever a sigilsmith.config.json, sigilsmith.gen.ts or an SGS diagnostic code appears. Covers choosing a generator from the catalog, previewing, pinning it in the config, building the wiring module, writing the glue, registering favicons/og:image/Media Session art, and passing `sigilsmith check`.
metadata:
  audience: coding agents integrating sigilsmith into an app
---

# sigilsmith: choose, preview, pin, build, glue, check

`sigilsmith.config.json` is the single source of truth. Every command below is also an MCP tool (`npx sigilsmith mcp`, same names with `_` for `-`, same JSON envelopes) if your agent prefers tools to a shell. App code never names a field, a generator or a param: it imports `sigil` from the generated wiring module (`src/sigilsmith.gen.ts`). The loop is done when `npx sigilsmith check --json` exits 0.

## The loop

1. **Install and init.** `npm i sigilsmith` (plus `@resvg/resvg-js` as a dev dependency for PNG previews and icons), then `npx sigilsmith init --samples <items.json>`. Give it 20–200 real items: they drive key detection, previews and drift checks.
2. **Key.** `npx sigilsmith detect-key <items.json> --json`. Read `chosen`, `candidates` and `warnings`. Prefer an immutable id. A display title as key means renaming an item changes its image. Record it with `--write`.
3. **Choose.** `npx sigilsmith catalog --implemented --json` with the user's constraints: `--style abstract,geometric`, `--max-gzip 1500`, `--no-network`, `--mit-only`. Read `excluded[].because` to relax constraints instead of guessing. Details: [references/choosing.md](references/choosing.md).
4. **Preview.** `npx sigilsmith preview --generators a@1,b@1 --json`, then look at `files.png` (rows: generator on light, then dark; columns: items at 128/64/32/16 px). Prefer generators with `nearDuplicates: 0` and visible figures on both backgrounds at the sizes the app uses.
5. **Pin.** Edit the config: `policy.default`, `policy.rules` (`{ "when": { "type": "video" }, "use": "rings@1" }`, or a weight map for deterministic mixing), `generators.<ref>.params`, `presets`, `budget.maxGzipBytes`, `userSettings.choices`. `npx sigilsmith explain --index 0 --json` shows, for one item, the key, the rule that chose the generator, the inputs, and the layer that supplied every param. Tuning: [references/tuning.md](references/tuning.md).
6. **Build.** `npx sigilsmith build`. It writes the wiring module (commit it, never edit it) and `sigilsmith.lock.json` (commit it: it pins what every sample item looks like).
7. **Glue** (the only code you write): wrap the app in `<SigilProvider sigil={sigil}>` and render `<Sigil item={item} size={40} record={item.sigil} />` (React), or `await sigil.render(item)` + `toDisplayUrl()` (vanilla). Storage, upload endpoint, regeneration prompt and settings panel: [references/integrating.md](references/integrating.md).
8. **Targets** (favicon, Apple touch icon, manifest icons, og:image, Media Session art): `npx sigilsmith targets --emit` writes files and prints snippets to paste. [references/targets.md](references/targets.md).
9. **Check.** `npx sigilsmith check --json`. Fix diagnostics in order; each has `fix.summary`, often `fix.commands` and `fix.edits`. Apply `machine-applicable` fixes directly; ask the user before `maybe-incorrect` ones that change identities (`build --accept`). Code meanings: [references/errors.md](references/errors.md) or `npx sigilsmith explain-code SGS0701`.

## Rules that are easy to break

- Never import `sigilsmith/generators/...` in app code, never write a ref like `'grid@1'` in app code, never call `Math.random` near sigilsmith: `check bypass` fails on all three.
- Never edit a generator's code to change its look: change params in the config, or pick another generator. Output changes are new majors (`grid@2`), chosen in the config.
- Changing a rule, weights, `policy.salt`, the key or a generator's inputs changes images; `check identity` lists which items. Only `build --accept` after the user agrees.
- Next to a name the image is decorative: `alt=""` (the default).
- API keys never go in the config or the bundle: use `remote.<ref>.transport: "proxy"` (your server holds the key) or a BYOK module transport.
- Crawler targets (og:image, favicons) need stored PNG files at stable URLs; `derived` (render-on-read) delivery cannot serve them.

## When to stop and ask the user

A key that is not an immutable id; a change that `check identity` says alters existing images; a remote/paid generator (cost, terms); anything that uploads client-generated images to their server (validation is theirs to own).
