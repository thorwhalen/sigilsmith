---
title: "sigilsmith design proposal (v0)"
author: Thor Whalen
date: 2026-11-14
status: proposal, implemented as the MVP in this repo
---

# sigilsmith design proposal

sigilsmith gives an app a deterministic *identity image* (a sigil) for every item in a list: songs, users, projects, documents. It is a **builder** package: a developer, usually an AI coding agent, uses its CLI to choose generators from a catalog, preview them, pin them in one config file, and generate the wiring the app imports. What reaches the browser is a kernel of about 2 kB plus only the generators that were chosen.

This document is the design deliverable D9 of the brief (`docs/brief.md`). It rests on six research reports in `docs/research/` and on the measurements in `spikes/`. Where the MVP had to change the design, section 12 says so.

## 0. Decisions at a glance

| Brief item | Decision | Grounds |
|---|---|---|
| B9 distribution (OPEN) | **Hybrid: pinned runtime kernel + generated wiring module + agent-written glue under a `check` contract.** Generators ship as frozen npm subpaths, one per output major. Copying generator code into the host is never the default. | `builder-pattern-and-distribution.md` (recommendation), measured costs below |
| B0.2 SSOT format | **`sigilsmith.config.json`** with a `$schema` link to a JSON Schema generated from zod. Deviation from the report's `sigilsmith.config.ts`: the CLI must *write* into the config (`detect-key --write`, `init`), which is safe for JSON and fragile for TypeScript. Custom key functions are referenced by module path, so nothing needs TS. | B4.1 "written into the config"; agent-first report §7 (machine-applicable edits) |
| zod at runtime | **Never.** zod lives in `sigilsmith/node` (CLI, `check`, `build`). Measured: `zod` classic costs 92 kB gzip in a browser bundle, `zod/mini` 4.4 kB, `@zodal/dials-core` 98 kB (it pulls classic zod). The runtime receives a config already validated and resolved by `sigilsmith build`. | scratch measurement (section 9), brief A5 |
| B18 delivery naming | Strategies **`materialized`** (default: generate once in the browser, store), **`derived`** (compute on read, nothing stored), **`hybrid`** (derive for display, materialize for stored-URL targets and slow generators). Stored files are content-addressed by a hash of the generator inputs, never the output bytes. | `integration-and-delivery.md` §2 |
| B19 regeneration default (OPEN) | **`ask`, non-modal and default-keep**: prompt only for auto-generated images whose resolved generator inputs really changed; dismissal, timeout and headless contexts keep the image; custom images are never touched; a user's "keep" or a custom upload freezes the item. | `integration-and-delivery.md` §4 (product conventions, NN/g; no controlled study exists) |
| B16 name (OPEN) | **`sigilsmith`** kept (owner's pick). Also free on npm on 2026-11-14: `sigilry`, `identiforge`, `idmark`, `emblemer`. The name lives in `package.json` and one constant, `PKG_NAME` in `src/meta.ts`; codegen, CLI help and the skill read it from there. | `npm view` check |
| B20 zodal | Storage through `@zodal/store` `DataProvider` (content methods). End-user settings through `@zodal/dials-*` (definition, store, panel). Key resolution and layered config provenance are sigilsmith's own, shaped so they can move upstream (gaps G1 and G5). | `zodal-fit.md` |
| Surfaces (B11) | **Typed core → CLI with `--json` → `AGENTS.md` block + one bundled skill.** MCP later, generated from the same schemas. | `agent-first-design.md` |

## 1. Architecture

### 1.1 Layers and who owns them

| Layer | Written by | Lives in | Updated by | Verified by |
|---|---|---|---|---|
| Kernel: canonical keys, hashing, PRNG, palette, input selection, layering, policy, resolver, loader, progressive placeholder | sigilsmith | npm `sigilsmith` (root export) | `npm update` (semver) | unit tests, size budget |
| Generators, one subpath per output major (`sigilsmith/generators/grid/v1`) | sigilsmith | npm, frozen once released | never changed; a new major is a new subpath | golden vectors in CI; `check identity` in the host |
| Adapters over third-party libraries (`sigilsmith/generators/minidenticons/v1`) | sigilsmith | npm; the upstream library is a peer the host installs | as above, plus an exact peer pin | golden vectors against the pinned upstream |
| SSOT config `sigilsmith.config.json` | developer or agent, via CLI | host repo | hand edit or `sigilsmith detect-key --write` | `check config` (zod) |
| Wiring module `sigilsmith.gen.ts` | `sigilsmith build` | host repo, committed, "do not edit" | re-run `build` | `check fresh` (config hash in header) |
| Lock `sigilsmith.lock.json` | `sigilsmith build` | host repo | re-run `build --accept` | `check identity` |
| Glue: where `<Sigil>` goes, which provider stores images, the upload endpoint, settings panel placement, `<head>` tags | the host's agent | host code | the agent, guided by the skill | `check bypass`, `check targets`, conformance helpers in `sigilsmith/testing` |

The rule that decides the line (from the distribution report): **anything whose output is an item's identity, or that decides whether the integration is correct, is shipped and tested code. Everything else is glue.**

### 1.2 Package layout (one npm package, subpath exports)

```
sigilsmith                        kernel (browser-safe, no zod)          ~2 kB gzip target
sigilsmith/generators/<id>/v<N>   one frozen generator major each        ≤ 1.5 kB gzip each (in-house)
sigilsmith/remote                 proxy / BYOK / keyless HTTP generators, result cache
sigilsmith/delivery               materialized / derived / hybrid, regeneration policy, ImageStore port
sigilsmith/targets                target registry data, snippets, Media Session helper
sigilsmith/zodal                  DataProvider adapter, end-user settings on zodal-dials (+ marked shims)
sigilsmith/react                  <SigilProvider>, <Sigil>, useSigil, useSigilSettings
sigilsmith/node                   zod schemas, catalog, preview, detect-key, explain, build, check, targets emit
sigilsmith/testing                golden-vector and conformance helpers
bin: sigilsmith                   CLI over sigilsmith/node
```

One package (not a monorepo of `@sigilsmith/*`): an agent installs one thing, renaming is one constant, and subpath exports with `"sideEffects": false` give the same tree-shaking as separate packages. Tooling: **tsup** (esbuild-fast ESM builds with `.d.ts`, the zodal convention), **Vitest** (native ESM and TS, same runner as zodal), **npm** (what the zodal peer workaround was verified with; one lockfile, no workspaces needed), **TypeScript 5.9** (tsup's declaration build needs the JS compiler API, which TypeScript 7 drops).

### 1.3 Seam table

Five seams, each one keyword argument with a working default.

| # | Seam | Default (no new dependency) | Replacement that exists today |
|---|---|---|---|
| 1 | `store` where images live (`ImageStore`) | in-memory store (object URLs in the browser, data URLs in Node) | any `@zodal/store` blob provider: `store-http`, `store-localstorage` (IndexedDB), `store-s3`, `store-supabase` via `fromDataProvider` |
| 2 | `cache` for non-deterministic results | `Map` | the same `ImageStore` (content-addressed), or `@zodal/store` tiered provider when published |
| 3 | `transport` for remote generators | `fetch` to a developer proxy URL | BYOK transport with a key from `@zodal/dials-store-secret`; DiceBear HTTP; a mock for tests |
| 4 | `rasterize` SVG → PNG | browser: `OffscreenCanvas`/`<canvas>`; Node: `@resvg/resvg-js` when installed | any function `(svg, size) → Promise<Blob or Uint8Array>` |
| 5 | `confirm` for regeneration `ask` | resolves to `keep` (headless-safe) | the demo's non-modal toast; any UI |

`NOT seams:` CLI argument parsing (`node:util` `parseArgs`), the JSON envelope shape, contact-sheet layout, hash and PRNG choice (they *are* the identity; changing them is a new generator major, not a swap).

Surface for v1: CLI + `AGENTS.md` block + skill, plus the React adapter the brief asks for. MCP and HTTP are answered (no core change needed: every CLI command is a pure function returning a JSON envelope) and not built.

## 2. Data model

### 2.1 The config (SSOT)

```jsonc
{
  "$schema": "./node_modules/sigilsmith/schema/config.schema.json",
  "version": 1,
  "itemType": { "field": "type" },                     // which field names the item's type (for presets and rules)
  "key": {                                             // B4.1
    "field": "id",                                     // or "fields": ["artist", "title", "year"], or "custom": "./src/keys.ts#songKey"
    "fallback": ["title", "type"],                     // used when the key is missing; warns
    "onMissing": "fallback"                            // or "throw" (strict)
  },
  "presets": ["media"],                                // B4.3 layer 2
  "generators": {                                      // B4.3 layer 3: per generator ref
    "grid@1": { "params": { "cells": 5 } },
    "rings@1": { "inputs": ["$key"] }
  },
  "policy": {                                          // A6
    "default": "grid@1",
    "salt": "sigilsmith",                              // weighted buckets; changing it reshuffles items
    "rules": [
      { "when": { "type": "video" }, "use": "rings@1" },
      { "when": { "type": "audio" }, "use": { "grid@1": 2, "shapes@1": 1 }, "params": { "shapes@1": { "count": 4 } } }
    ]
  },
  "delivery": { "strategy": "materialized", "format": "svg" },
  "regeneration": { "policy": "ask" },
  "budget": { "maxGzipBytes": 5000 },
  "userSettings": { "choices": ["grid@1", "rings@1", "shapes@1"], "perType": true },   // B4.3 layer 5 limits
  "samples": "./sigilsmith.samples.json",
  "check": { "src": ["src"] },
  "targets": { "ids": ["favicon-svg", "favicon-ico", "apple-touch-icon", "manifest-icons", "og-image"], "baseUrl": "https://example.com" }
}
```

A generator **ref** is `<id>@<major>`. Rules, user settings, the lock and the wiring module all use refs, so a pin is a string anyone can grep.

### 2.2 Key resolution (B4.1)

```ts
type KeySpec = { field: string } | { fields: string[] } | { custom: string /* module#export */ };
function keyOf(item: Item, spec: ResolvedKeySpec): { key: string; parts: Part[]; via: 'key' | 'fallback'; missing: string[] };
function canonicalKey(parts: readonly unknown[]): string;     // JSON array of NFC-normalized, trimmed strings: separator-free, escaping by JSON
function detectKey(samples: Item[], opts?: { candidates?: string[] }): KeyReport;
```

- Single fields use the raw normalized value (`"abc-123"`), so the common case stays readable. Composites serialize as `JSON.stringify(parts)` after normalizing each part to an NFC string (numbers via `String`, booleans as `true`/`false`, null and undefined as missing). JSON string escaping makes the encoding unambiguous with no separator to collide with.
- Nested paths use dots (`meta.uuid`); a literal dot in a field name is written `meta["a.b"]`.
- **Detection priority** (documented and overridable): `id`, `_id`, `uuid`, `guid`, `key`, `slug`, `isrc`, `isbn`, `doi`, `url`, `href`, `path`, `filepath`, `file`, then any field ending in `Id`/`_id`/`ID`, then nested `*.id`/`*.uuid` one level down. Rationale: explicit identifiers first, then natural keys that are globally unique by standard (ISRC for recordings, ISBN for books, DOI for papers), then locators (URLs and paths are unique but change when things move, so they rank after natural keys and earn an instability warning).
- **Report**: for each candidate, completeness (share of samples with a value), uniqueness (distinct/present), and suspicion flags: `display-text` (field named like `title`/`name`/`label`, or values with spaces), `timestamp` (date-like name or ISO values), `locator` (URL or path, can move), `low-cardinality`. With no acceptable candidate, the report proposes the smallest composite of complete fields that is unique across the samples.
- Detection runs **only** in the CLI (`detect-key`), and its choice is written into the config. At runtime only the configured spec is used.

zodal's `defineCollection` infers flat id names only and silently falls back to the first field (`zodal-fit.md` G1). This module is written to be upstreamed as `@zodal/core` `resolveKey`.

### 2.3 Inputs and the five layers (B4.2, B4.3)

`inputs` is a list of field paths, with two specials: `$key` (the resolved key) and `{ "field": "lyrics", "maxChars": 2000 }` (truncation for long text). Hash generators hash the canonical serialization of their input values; semantic generators receive them as named strings.

For one item and one generator ref, the effective `{ inputs, params }` is a JSON merge-patch fold (RFC 7386, the dials semantics: objects merge, arrays and scalars replace) over these layers, lowest first:

1. `generator`: the generator module's `defaults` and `defaultInputs` (hash generators: `["$key"]`; semantic: `["title", "description"]`).
2. `preset:<name>`: per item type, e.g. `media` gives songs `title`, `artist`, `lyrics (maxChars 2000)` for semantic generators.
3. `project`: `config.generators[ref]`.
4. `rule:<n>`: the matching policy rule's `inputs`/`params`.
5. `user`: end-user settings, only for keys the developer opened in `userSettings`.

Every leaf of the result carries the layer that supplied it (`provenance`), in the same shape as `@zodal/dials-core` (`winningScope`, `shadowed[]`), so `explain` reads like the dials panel. The fold is about 40 lines in the kernel; it is the G5 "ladder" shim, kept small so it can be replaced by `defineLadder` when dials grows one.

### 2.4 Generator module contract

```ts
export interface GeneratorModule<P extends object = Record<string, unknown>> {
  id: string;                       // 'grid'
  major: number;                    // 1: the output contract; never changes inside a released subpath
  kind: 'hash' | 'semantic';        // which default inputs apply
  defaults: P;                      // plain data; the zod schema lives in the manifest (Node side)
  defaultInputs: InputSpec[];
  render(ctx: RenderContext<P>): SigilImage | Promise<SigilImage>;   // sync SVG is the fast path
}
export interface RenderContext<P> {
  seed: string;                     // canonical serialization of the input values
  hash: number;                     // 32-bit hash of seed
  rng: () => number;                // sfc32 seeded from cyrb128(seed + id@major)
  palette: Palette;                 // hash → OKLCH palette, theme-safe
  fields: Record<string, string>;   // named input values (semantic generators)
  params: P;
  size: number;                     // requested px (generators may ignore: SVG scales)
}
export type SigilImage =
  | { type: 'svg'; svg: string }
  | { type: 'blob'; blob: Blob; mime: string }
  | { type: 'url'; url: string };
```

Adding a generator is adding `src/generators/<id>/v<N>.ts` (the module) and `src/generators/<id>/manifest.ts` (zod params schema plus catalog metadata), and one line in the built-in manifest list. No core edits (open-closed). Third parties implement the same interface in their own package and register a manifest; `check` treats them the same way.

### 2.5 Manifest (B10)

`src/node/schema.ts` defines `ManifestSchema` (zod). Fields: `id`, `major`, `ref`, `name`, `description`, `category`, `role`, `implemented` (`true` for importable generators, `false` for survey drafts), `importPath`, `upstream {name,url,npm,lastRelease,maintenance}`, `license {spdx, mitCompatible, restrictions, notes}`, `bundleSize {minBytes, gzipBytes, brotliBytes, measured, source}`, `lazyLoadable`, `runtime {browser,node,edge,webgpu,network}`, `cost {model, notes}`, `requiresSecret`, `style` (abstract | geometric | illustrative | photorealistic), `semanticLevel` (hash | metadata | embedding | llm), `sizeRange {minPx, maxPx, basis}`, `outputFormat[]`, `determinism` (pure | seeded | cached-nondeterministic), `latency {typicalMs, basis}`, `params` (described from the zod schema, `paramsSchema` kept in code), `defaultInputs`, `examples`, `verdict`. The catalog is the 61 survey drafts in `catalog/*.json` plus the implemented generators, merged by id, all validated by the same schema in a test. `bundleSize` for implemented generators is measured at package build time (`npm run measure`, esbuild, gzip -9 and brotli) and written into `catalog/_sizes.json`; nothing is copied from READMEs.

### 2.6 Policy and selection (A6, B3)

```ts
function select(item, cfg, { user }): { ref: string; via: 'user' | `rule:${number}` | `preset:${string}` | 'default'; weights?: Record<string, number>; bucket?: number };
```

Rules are evaluated in order; `when` matches item fields (`{ "type": "video" }`, `{ "type": ["audio", "song"] }`, `{ "tags": { "includes": "live" } }`). `use` is a ref or a weight map. Weighted choice is **deterministic per item**: `u = hash32(salt + "\u0000" + key) / 2^32`, then the cumulative-weight bucket over refs sorted by name. No `Math.random` anywhere (a test greps for it). Changing weights or the salt moves some items to another generator; `check identity` lists them.

### 2.7 Resolution order (B6)

`resolveSigil(item)`: **custom image** (the item's stored record says `source: 'custom'`) → **end-user preference** (settings: a ref for this item type, constrained to `userSettings.choices`) → **developer policy** → **`policy.default`**. The result carries `via` for `explain`.

### 2.8 The image record and delivery (B18)

The app keeps one small record per item, in whatever field it likes (glue):

```ts
interface SigilRecord {
  source: 'generated' | 'custom';
  ref?: string;              // generator ref that produced it
  contentId: string;         // 'sg_' + 32 hex of sha256(canonical([ref, inputs digest, params]))
  inputsDigest: string;      // hash of the resolved input values: the regeneration trigger
  url?: string;              // stored URL (materialized/hybrid) — absent for derived
  frozen?: boolean;          // B19: user kept or customized; stop asking
}
```

- `materialized`: on create, render in the browser, `store.head(contentId)`; if absent, `store.put(contentId, blob, { mime })`; return the record with `url`. Content addressing makes concurrent writers idempotent and allows `Cache-Control: immutable`.
- `derived`: render on display; the record has no `url`. Requires a pure generator (`check` refuses a remote or cached-nondeterministic generator here) and a pinned ref (it always is).
- `hybrid`: return a derived image immediately, materialize in the background, and use the stored URL for targets that need one.

`ImageStore` is the port: `{ head(id): Promise<string | null>; put(id, data, meta): Promise<string>; get?(id) }`. `fromDataProvider(provider, { field })` adapts any zodal blob provider (`setContent`, `getUrl`); the existence check, MIME and "if absent" handling sit in a marked shim until zodal adds `headContent` and write options (G3). Server-side validation of uploads is glue the skill describes (size and type caps, magic-byte sniff, SVG sanitising or re-rendering from inputs; see the integration report §3).

### 2.9 Regeneration (B19)

```ts
function onInputsChanged(record: SigilRecord, next: { inputsDigest: string }, opts: { policy: 'always' | 'never' | 'ask'; confirm?: (ctx) => Promise<'update' | 'keep'> }): Promise<'regenerate' | 'keep' | 'unchanged'>;
```

`unchanged` when the digest did not change (an identicon keyed on an immutable id never asks). `source: 'custom'` and `frozen` always keep. `ask` calls `confirm`; with no `confirm`, a rejection, or a timeout, it keeps. A `keep` answer sets `frozen`. `explain` states, for `derived` delivery, that the image follows its inputs automatically.

### 2.10 Remote generators (B12, B3, B5)

`sigilsmith/remote` builds generator modules whose `render` is async and goes through a `transport`:

- `proxyTransport(url)`: POST `{ ref, seed, fields, params }` to the developer's endpoint, which holds the real key. This is the default for paid APIs.
- `byokTransport({ getKey, call })`: the end user's key, read on demand from a secret store (zodal `SecretBackend`), never from the bundle; the CLI refuses a config that inlines a key (`SGS0105`).
- `dicebearTransport({ baseUrl })`: keyless HTTP SVG. DiceBear's public API is free for non-commercial use only and rate-limited; the base URL is a parameter so a self-hosted instance works.
- `mockTransport({ latencyMs })`: deterministic fake SVG after a delay, used by tests and the demo.

Results are cached by `contentId` through the injected cache (`Map` by default, or the `ImageStore`), so the same item never triggers a second paid call. `progressive(item)` returns an instant placeholder from a cheap pure generator (`grid@1` by default) and a promise for the final image, with a timeout (default 8 s) after which the placeholder stays.

### 2.11 Targets (B17)

A registry of plain-data `TargetSpec`s (zod-described on the Node side), seeded from the integration report's table: `favicon-svg`, `favicon-ico`, `apple-touch-icon`, `manifest-icons` (192/512 + maskable 512 with an 80% safe zone), `og-image` (1200×630 PNG, absolute URL), `twitter-image`, `media-session-artwork` (96–512 PNG), `notification-icon`, `notification-badge`, `theme-color`, `app-thumbnail`; `safari-mask-icon` and `windows-tile` as legacy, off. Each declares sizes, formats, background rule, safe zone, `requiresStoredUrl`, `absoluteUrl`, `maxBytes` and a registration template. `targets emit` renders the site's sigil (or an item's) to the required files (SVG, PNG through `rasterize`, ICO packed in-house) and prints snippets; `check targets` parses the host's HTML and web manifest and validates presence, sizes (from PNG headers) and absolute URLs. `setMediaSessionArtwork(metadata, record)` is the browser helper for Media Session.

## 3. Public API sketches

```ts
// sigilsmith (kernel)
export function createSigil(opts: { config: ResolvedConfig; generators: Record<string, () => Promise<GeneratorModule>>; keyFn?: (item: Item) => string; user?: UserLayer }): Sigil;
export interface Sigil {
  render(item: Item, opts?: { size?: number; ref?: string }): Promise<SigilImage>;
  renderSync?(item: Item, opts?): SigilImage | undefined;            // when the generator is loaded and sync
  plan(item: Item): Plan;                                              // key, ref, inputs, params, provenance; pure, no loading
  record(item: Item): Promise<SigilRecord>;                            // render + content ids (no storage)
  setUser(layer: UserLayer): void;
}
export { canonicalKey, keyOf, hash32, cyrb128, sfc32, palette, toDataUrl } ;

// sigilsmith/delivery
export function deliver(sigil: Sigil, item: Item, opts?: { strategy?: Strategy; store?: ImageStore; rasterize?: Rasterize }): Promise<{ record: SigilRecord; display: string }>;
export function onInputsChanged(...): Promise<RegenDecision>;
export function memoryStore(): ImageStore;

// sigilsmith/zodal
export function fromDataProvider(provider: DataProvider<any>, opts?: { field?: string }): ImageStore;
export function createMemoryBlobProvider(): DataProvider<any>;            // SHIM (G11)
export function defineSigilSettings(config: ResolvedConfig): { dials; toUserLayer(effective): UserLayer };

// sigilsmith/react
export function SigilProvider(props: { sigil: Sigil; children }): JSX.Element;
export function Sigil(props: { item: Item; size?: number; className?: string; alt?: string }): JSX.Element;   // alt defaults to "" (decorative)
export function useSigil(item: Item, opts?): { src?: string; status: 'loading' | 'ready' | 'error' };
export function useSigilSettings(store: SettingsStore): SettingsState;    // SHIM (G8)

// sigilsmith/node
export function loadConfig(path?): Promise<{ config: Config; resolved: ResolvedConfig; diagnostics: Diagnostic[] }>;
export function catalog(query): Envelope; export function detectKeyCmd(...): Envelope; export function explain(...): Envelope;
export function build(...): Envelope; export function check(...): Envelope; export function preview(...): Envelope; export function targets(...): Envelope;
```

## 4. Determinism and versioning (B3)

- **Hashing**: `cyrb128` (public domain, 128-bit, fast) for seeds; `sfc32` PRNG seeded from it. Seeds include the generator ref, so two generators reading the same key are decorrelated. SHA-256 (WebCrypto, async) for content ids only.
- **Frozen majors**: `sigilsmith/generators/grid/v1` never changes output. A change to output is `grid/v2`, a new subpath, and the old one stays until a package major after a long deprecation notice. Kernel changes that would alter any generator's output are forbidden; golden vectors catch them.
- **Golden vectors**: `tests/golden/<id>-v<N>.json` holds sha256 of the SVG for 16 fixed inputs per generator. CI fails on any byte change.
- **Host lock**: `sigilsmith build` writes `sigilsmith.lock.json` with, per ref, a fingerprint over the golden inputs, and, per sample item, its ref and the sha256 of its SVG. `check identity` re-renders and diffs. Accepting a change is `sigilsmith build --accept`, a reviewed edit.
- **Raster**: never compared byte for byte (canvas and fonts differ across engines). SVG is the canonical artifact; generators that use `<text>` (initials, emoji) are deterministic in *choice* and markup, not in pixels, and their manifests say so.
- **Opt-out**: `"determinism": "fresh"` on a rule adds a nonce to the seed (B3's explicit opt-out); `check` warns.

## 5. Agent primitives and surfaces (B11)

All commands print one JSON envelope with `--json` (`{ schema, ok, data, diagnostics[], next[] }`), diagnostics carry `code` (`SGS` + 4 digits: 01xx config, 02xx key, 03xx generator, 04xx budget, 05xx determinism, 06xx targets, 07xx drift), `message`, `where`, and `fix { summary, applicability, commands, edits }`. Exit codes: 0 ok, 1 check failed, 2 usage, 3 config invalid, 4 internal.

| Command | What it does |
|---|---|
| `init` | writes a starter config, samples file and the managed `AGENTS.md` block |
| `catalog [--style --semantic --max-gzip --no-network --min-px --implemented]` | filters manifests; returns `results` and `excluded` with reasons |
| `preview [--generators a,b] [--samples f] [--out dir]` | contact sheet: items × sizes (16/32/64/128) × light/dark, HTML and PNG (when resvg is installed), plus near-duplicate metrics |
| `detect-key <samples> [--write]` | B4.1 report; `--write` puts the choice in the config |
| `explain [--item json \| --index n]` | key, generator, inputs, params, each with its layer; delivery and regeneration notes |
| `build [--out sigilsmith.gen.ts] [--accept]` | resolves and freezes the config into the wiring module; writes the lock |
| `targets [--emit dir]` | lists targets, emits files and snippets |
| `check [--html f --manifest f]` | `config`, `fresh`, `key` (data drift), `identity`, `determinism`, `budget`, `bypass`, `targets` |
| `explain-code <SGSxxxx>` | the offline page for a diagnostic |

`AGENTS.md` (repo) and a managed block that `init` writes into the host's `AGENTS.md` carry only the non-inferable facts: the config path, the rule "never inline a field name, generator id or param; read the config", the commands, and the definition of done (`npx sigilsmith check --json` exits 0). The skill `skills/sigilsmith/SKILL.md` holds the choose → preview → pin → build → glue → check loop, with references for tuning, delivery and targets.

## 6. End-user settings (B15)

`defineSigilSettings(config)` builds a zodal-dials definition from the config's `userSettings`: `sigil.enabled` (boolean) and, per item type, `sigil.style.<type>` as an enum of the allowed refs (or one global `sigil.style`). The host persists the user layer through any dials `LayerStore` (glue). `toUserLayer(effective)` turns the dials effective values into the kernel's layer-5 input, which `sigil.setUser()` applies. The React demo renders it with `@zodal/dials-ui-shadcn`'s `SettingsPanel` and the G8 `useSigilSettings` shim. The panel and dials are loaded only by the settings screen; they never reach the list-rendering path (dials costs about 98 kB gzip today because it pulls classic zod).

## 7. Walkthrough: "abstract thumbnails ≤ 5 kB, no network, for a project list; videos one style, audio another"

1. `npx sigilsmith catalog --style abstract,geometric --no-network --max-gzip 5000 --implemented --json` returns `shapes@1`, `rings@1`, `grid@1` and `minidenticons@1`, with sizes, and lists the excluded ones with reasons.
2. `npx sigilsmith preview --generators shapes@1,rings@1 --samples data/projects.json` writes `.sigilsmith/preview/sheet.html` and `sheet.png`; the agent looks at the PNG and the near-duplicate counts.
3. `npx sigilsmith detect-key data/projects.json --write` finds `slug` complete and unique and writes `"key": { "field": "slug" }`.
4. The agent edits the config: `policy.rules = [{ when: { type: "video" }, use: "rings@1" }, { when: { type: "audio" }, use: "shapes@1" }]`, `default: "grid@1"`, `budget.maxGzipBytes: 5000`.
5. `npx sigilsmith build` writes `src/sigilsmith.gen.ts` (three lazy loaders, frozen config) and `sigilsmith.lock.json`.
6. The agent writes glue: `<SigilProvider sigil={sigil}>` at the app root and `<Sigil item={project} size={40} />` in the card.
7. `npx sigilsmith check --json` reports budget (kernel + three generators), determinism, identity, bypass; exit 0.
8. Months later someone renames `slug` to `handle` in the data: `check` fails with `SGS0701 key field \`slug\` is missing from 40 of 40 sample items`, fix: set `key.field` to `handle`. One line.

## 8. Risks

- **zodal packaging**: the dials and store families cannot be installed together from npm without an `overrides` block (peer skew, `zodal-fit.md` G10). The repo uses the override; hosts using the settings module must too until dials is republished.
- **Old-major accumulation** grows the tarball (not bundles).
- **Fonts in initials and emoji** make rasters differ between creators' devices; stored PNGs are whatever the creator's browser drew.
- **Agents ignoring the skill**: mitigated by the always-loaded `AGENTS.md` block and by `check` as the definition of done.
- **DiceBear HTTP** terms forbid commercial use of the public endpoint.
- **SVG uploads** are an XSS vector if a host stores client SVG and serves it inline; the materialized path should prefer re-rendering on the server from inputs, or PNG, or sanitize and serve with `Content-Security-Policy: sandbox`.

## 9. Measurements behind the decisions

Bundles were measured with esbuild (minified ESM, browser platform) and gzip -9, 2026-11-14. Third-party library sizes, contact sheets and distinguishability metrics are in `spikes/README.md`.

| Import | min bytes | gzip bytes |
|---|---|---|
| `zod` (classic, `z.object().parse`) | 453,916 | 92,483 |
| `zod/mini` (same) | 12,365 | 4,411 |
| `@zodal/dials-core` (`defineDials().resolve`) | 471,890 | 98,469 |
| `@zodal/dials-ui` + core | 476,885 | 100,135 |
| `@zodal/store-http` (`createHttpBlobProvider`) | 3,443 | 1,526 |

Sizes of the kernel and each built-in generator are measured by `npm run measure` and reported in `README.md` and `catalog/_sizes.json`.

## 10. zodal gaps proposed upstream

From `zodal-fit.md`, with the shims this repo keeps (all under `src/zodal/shims/`, each with a `SHIM:` header): G1 key resolution (`resolveKey`, `canonicalKey` in `@zodal/core`; shim is `src/key.ts`, kept dependency-free); G3 content write options and `headContent`; G5 layer ladder in dials (shim is `src/layers.ts`); G8 `useSettings` React hook; G9 Media Session artwork in `@zodal/media`; G10 republish dials against core 0.2 and add licence metadata; and, found while building, **G11 an in-memory blob provider** (`createInMemoryProvider` has no content methods) and **G12 dials-core on `zod/mini`** (98 kB gzip is too heavy for a settings screen in a light app).

## 11. Open questions for the author

1. Is JSON (not TypeScript) acceptable for the SSOT config, given that the CLI writes into it?
2. B19: is "ask, non-modal, default-keep, freeze after keep" the default you want, or should the default be `never` with `ask` opt-in?
3. Should `sigilsmith build` pin exact versions of third-party generator peers (minidenticons) in the host's `package.json`, since their output is part of identity?
4. Old generator majors: keep them all in `sigilsmith`, or move retired majors to a `sigilsmith-legacy` package after N years?
5. The DiceBear public API is non-commercial: keep it in the default catalog, or list it only as "self-host"?
6. zodal: should the G-gaps become issues on `i2mint/zodal` and `i2mint/zodal-dials` now (outward-facing, so not done in this run)?
7. MCP server: wait for a concrete agent without a shell, or build now from the same schemas?

## 12. Changes made while building the MVP

Recorded as they happen; empty means the MVP followed this document.
