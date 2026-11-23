---
title: "sigilsmith design proposal (v0)"
author: Thor Whalen
date: 2026-11-14
status: proposal, implemented as the MVP in this repo
---

# sigilsmith design proposal

sigilsmith gives an app a deterministic *identity image* (a sigil) for every item in a list: songs, users, projects, documents. It is a **builder** package: a developer, usually an AI coding agent, uses its CLI to choose generators from a catalog, preview them, pin them in one config file, and generate the wiring the app imports. What reaches the browser is a kernel of 3.8 kB gzip (measured) plus only the generators that were chosen, 0.6–1.4 kB each.

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
sigilsmith                        kernel (browser-safe, no zod)          3.8 kB gzip measured (target was ~2 kB)
sigilsmith/generators/<id>/v<N>   one frozen generator major each        0.6–1.4 kB gzip each, measured
sigilsmith/remote                 proxy / BYOK / keyless HTTP generators, result cache
sigilsmith/delivery               materialized / derived / hybrid, regeneration policy, ImageStore port
sigilsmith/targets                target registry data, snippets, Media Session helper
sigilsmith/zodal                  DataProvider adapter for image storage, no zod (+ marked shims)
sigilsmith/zodal/settings         end-user settings on zodal-dials (zod + dials: load lazily)
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
    "rings@1": { "inputs": ["$key"] },
    "emoji@1": { "inputs": [{ "field": "name", "as": "title" }] }   // renamed data field, same seed and same generator-facing name
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
  plan(item: Item, opts?: { ref?: string }): Promise<Plan>;            // key, ref, inputs, params, provenance (loads the generator for its defaults)
  renderPlan(plan: Plan, size?: number): Promise<SigilImage>;          // render an existing plan without planning twice
  load(ref: string): Promise<GeneratorModule>;
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
- **Golden vectors**: `tests/golden/<id>-v<N>.json` holds sha256 of the SVG for 8 fixed inputs per generator, with default and non-default params; `tests/golden/kernel-v1.json` runs items end to end through `createSigil` (composite and fallback keys, presets, weighted rules, params), so a kernel change that alters any image fails too. A missing golden file fails; it is written only with `UPDATE_GOLDEN=1`.
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
| `check [--only a,b]` | `config`, `fresh`, `data` (drift), `identity`, `determinism`, `budget`, `peers`, `bypass`, `targets` (HTML and manifest paths come from `targets.html` / `targets.manifest` in the config) |
| `explain-code <SGSxxxx>` | the offline page for a diagnostic |

`AGENTS.md` (repo) and a managed block that `init` writes into the host's `AGENTS.md` carry only the non-inferable facts: the config path, the rule "never inline a field name, generator id or param; read the config", the commands, and the definition of done (`npx sigilsmith check --json` exits 0). The skill `skills/sigilsmith/SKILL.md` holds the choose → preview → pin → build → glue → check loop, with references for tuning, delivery and targets.

## 6. End-user settings (B15)

`defineSigilSettings(config)` builds a zodal-dials definition from the config's `userSettings`: `sigil.enabled` (boolean) and, per item type, `sigil.style.<type>` as an enum of the allowed refs (or one global `sigil.style`). The host persists the user layer through any dials `LayerStore` (glue). `toUserLayer(effective)` turns the dials effective values into the kernel's layer-5 input, which `sigil.setUser()` applies. The React demo renders it with `@zodal/dials-ui-shadcn`'s `SettingsPanel` and the G8 `useSigilSettings` shim. The panel and dials are loaded only by the settings screen; they never reach the list-rendering path (dials costs about 98 kB gzip today because it pulls classic zod).

## 7. Walkthrough: "abstract thumbnails ≤ 5 kB, no network, for a project list; videos one style, audio another"

1. `npx sigilsmith catalog --style abstract --no-network --max-gzip 1000 --implemented --json` returns `rings@1` (577 B) and `shapes@1` (689 B), and lists `grid@1` as excluded because its style is geometric.
2. `npx sigilsmith preview --generators rings@1,shapes@1 --samples data/projects.json` writes `.sigilsmith/preview/sheet.html` and `sheet.png`; the agent looks at the PNG and the near-duplicate counts.
3. `npx sigilsmith detect-key data/projects.json --write` finds `slug` complete and unique and writes `"key": { "field": "slug" }`.
4. The agent edits the config: `policy.rules = [{ when: { type: "video" }, use: "rings@1" }, { when: { type: "audio" }, use: "shapes@1" }]`, `default: "rings@1"`, `budget.maxGzipBytes: 5000`.
5. `npx sigilsmith build` writes `src/sigilsmith.gen.ts` (two lazy loaders, frozen config) and `sigilsmith.lock.json`.
6. The agent writes glue: `<SigilProvider sigil={sigil}>` at the app root and `<Sigil item={project} size={40} />` in the card.
7. `npx sigilsmith check --json` reports **budget: 3833 + 577 + 689 = 5099 B, over the 5000 B budget** (`SGS0401`, with the largest generator named and a `catalog --max-gzip` command that fits). This is the honest outcome with today's kernel: a 5 kB *total* cap fits the kernel plus one abstract generator, not two. The agent asks the user to choose: one generator for both types (4.4 kB), or a 5.5 kB cap. With `maxGzipBytes: 5500`, everything else (config, fresh, data, identity, determinism, peers, bypass) passes and `check` exits 0.
8. Months later someone renames `slug` to `handle` in the data: `check` fails with `SGS0701 key field \`slug\` is missing from 40 of 40 sample items`, and its fix is the edit `key.field = "handle"`. One line (this exact scenario is a test: `tests/cli.test.ts`, "drift").

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

Sizes of the kernel and each built-in generator, as an app ships them (`npm run measure`, generator = kernel+generator minus kernel):

| Module | min bytes | gzip | brotli |
|---|---|---|---|
| kernel (`createSigil`) | 8,126 | 3,833 | 3,509 |
| `grid@1` / `rings@1` / `shapes@1` | 1,278 / 1,246 / 1,542 | 613 / 577 / 689 | 577 / 535 / 611 |
| `initials@1` / `emoji@1` / `minidenticons@1` | 1,479 / 3,357 / 1,324 | 740 / 1,411 / 640 | 660 / 1,230 / 575 |
| `sigilsmith/remote` | 5,222 | 2,608 | 2,328 |
| `sigilsmith/delivery` | 3,199 | 1,477 | 1,315 |

In the demo app (Vite production build) the list path carries no zod and no dials: the main chunk is 80 kB gzip, nearly all React; the settings screen is a separate 41 kB gzip chunk loaded on demand; each generator is its own chunk.

## 10. zodal gaps proposed upstream

From `zodal-fit.md`, with the shims this repo keeps (all under `src/zodal/shims/`, each with a `SHIM:` header): G1 key resolution (`resolveKey`, `canonicalKey` in `@zodal/core`; shim is `src/key.ts`, kept dependency-free); G3 content write options and `headContent`; G5 layer ladder in dials (shim is `src/layers.ts`); G8 `useSettings` React hook; G9 Media Session artwork in `@zodal/media`; G10 republish dials against core 0.2 and add licence metadata; and, found while building, **G11 an in-memory blob provider** (`createInMemoryProvider` has no content methods), **G12 dials-core on `zod/mini`** (98 kB gzip in a plain esbuild bundle; 41 kB in the demo's Vite chunk), **G13 `@zodal/dials-ui-shadcn@0.1.0` ships no `styles.css`** although its README imports one, and **G14 enum option labels**: the published dials-ui 0.1.0 shows raw enum values (`rings@1`) and ignores `enumLabels`; it reads `meta.title` and a `facets` array.

## 11. Open questions, answered (2026-11-14)

The owner answered Q5–Q7 and delegated Q1–Q4 to an independent reviewer (a Fable model reading the brief, this document and the code); its recommendations were adopted.

1. **JSON config: kept.** The CLI writes into it, any language reads it, loading runs no user code. JSON has no comments, so the schema accepts `$comment` (the `//` in the example above is illustrative only). Revisit if configs need computed or shared values: then a TS `defineConfig` that *emits* the JSON.
2. **Regeneration default: `auto`.** Each generator may declare its own default (`initials@1`: `always`, since its letters *are* the label); otherwise `ask`. Under `ask`, only an explicit "keep" freezes an item; no answer, a rejection or a timeout keep the image without freezing and remember the declined digest so the same change is not asked twice (`unfreeze()` resets). `check` warns (`SGS0709`) when stored images read changeable inputs and the app never calls `onInputsChanged`.
3. **Third-party pins: `build` does not edit the host's package.json.** The lock's fingerprint plus `check peers` catch drift; `check peers` also warns when the host declares a range rather than the exact version. sigilsmith's own peer range is `^4.2.1` so a future adapter major can coexist; vendoring small MIT libraries into the frozen subpath is the fallback if that ever conflicts.
4. **Old majors: kept forever in the package.** Tarball bytes are not bundle bytes, and stored records and `derived` delivery need old refs as long as the host's data lives. Shared helpers (`src/hash.ts`, `src/palette.ts`, `src/svg.ts`) are part of every major's output and are frozen too (AGENTS.md). Deprecate through `check` only for a security or licence problem.
5. **DiceBear: kept, terms surfaced** (§12, item 12).
6. **zodal gaps: filed and being resolved** (§12, item 13).
7. **MCP: built** (§12, item 11).

## 12. Changes made while building the MVP

1. **Kernel size.** The ~2 kB target (an estimate from the distribution report) did not hold: the kernel measures 3.8 kB gzip with everything `createSigil` needs (key resolution, inputs, layers with provenance, policy, palette, hashing, loader). Content ids and SHA-256 were moved out of the kernel into `src/ids.ts` (used by delivery, remote and the CLI), which saved 0.24 kB. The walkthrough (§7) now shows the budget check failing a 5 kB total cap, which is the honest result.
2. **`renderWithIds` replaced by `renderPlan(plan)`**, so delivery plans once and computes ids itself.
3. **`sigilsmith/zodal` split** into storage (`sigilsmith/zodal`, no zod) and settings (`sigilsmith/zodal/settings`). Found by the demo's Vite build: one module for both pulled zod and dials into the list path.
4. **Placeholder ref** joined the resolved config (`policy.placeholder`), so `<Sigil>` shows the instant placeholder for cached-nondeterministic (remote) generators without extra glue.
5. **Settings labels come from generator manifests** (`defineSigilSettings`), because `check bypass` correctly flagged the demo for hard-coding refs as display labels.
6. **Package root lookup** walks up to `package.json`; tsup's shared chunks broke a fixed relative path.
7. **Lock computation plans remote items without calling them**, and the budget counts the remote module (2.6 kB) when any remote ref is selectable.
8. Surveyed drafts that a built-in now implements carry `implementedAs` and are hidden from catalog results.
9. **`minidenticons@1` passes the kernel's `hash32` to the library.** `preview` metrics showed 60 near-duplicates among 150 sequential ids with the library's own string hash; with `hash32`, none. (Unreleased, so changing it was allowed; after release this would be `minidenticons@2`.)
10. **Preview metrics over text generators** use varied probe names and real fonts, and carry a `caveat`: emoji render blank in Node without a colour-emoji font, so their pixel metrics are not meaningful outside a browser.

Preview metrics (150 items at 32 px, `docs/images/preview-sheet.png`): near-duplicate pairs `grid@1` 0, `rings@1` 0, `shapes@1` 0, `minidenticons@1` 0, `initials@1` 10 (people sharing initials and a nearby hue).


### Not built in this MVP (named next steps)

- `sigilsmith/testing` conformance helpers (§1.2) and the `vendor` / `migrate` commands: the golden vectors and `check` cover the contract for now.
- A separate `tune` command (tuning is config edits plus `preview` and `explain`) and `skill install` (the skill ships in the package; the `AGENTS.md` block points at it).
- The Vite/unplugin virtual-module alternative to the generated file.
- Golden vectors run in Node only; a cross-engine run (Chromium, WebKit, Firefox) is the next determinism check (palette uses `Math.cos`/`Math.sin`).
- An upload endpoint with server-side validation (host glue, described in the skill).

### After the owner's review (2026-11-14)

11. **MCP server built** (owner's answer to §11 Q7). One operation registry, `src/node/operations.ts` (name, zod input schema, MCP annotations, one function returning the envelope), drives both the CLI and `src/mcp/server.ts` (`npx sigilsmith mcp`, stdio, `@modelcontextprotocol/sdk` as an optional peer). There is no second list to keep in sync. `preview` returns the PNG sheet as MCP image content. `zod` became a regular dependency because the CLI needs it; the browser kernel still never imports it.
12. **DiceBear kept, with its terms surfaced** (Q5): catalog rows carry `terms` and `usage`; a `dicebear` remote without a self-hosted `baseUrl` raises `SGS0107` (warning) until the config acknowledges `"use": "non-commercial"` (info).
13. **zodal gaps filed** (Q6) as i2mint/zodal#128–131, zodal-store-fs#14, zodal-store-s3#7, zodal-store-http#8, zodal-dials#39–44, with comments on zodal-dials#35, #38, zodal-media#3 and zodal#119; a `zodal-issues` session is resolving them and the other open zodal issues. The shims named in §10 are deleted as their fixes land on npm (publishing is blocked on i2mint/zodal#23).

### Independent review (Fable, 2026-11-14) and what changed

Before any release, so output formats could still change; golden vectors were regenerated deliberately.

14. **Generator meta split from drawing code** (`src/generators/<id>/meta.ts`): the CLI, catalog and settings read ids and defaults without loading generators, so the CLI starts in a host without the optional `minidenticons` peer (it failed before), and the settings chunk no longer pulls every generator.
15. **Seeds are built from input values, never field names**, and inputs accept `as`: renaming a field in the data and the config (A9) no longer changes images.
16. **`emoji@1`** looked keywords up on a plain object, so "The Constructor" drew `function Object()`; now an own-property lookup.
17. **Content ids include the stored variant** (`svg`, `png@256`), so an SVG and a PNG of one item never collide.
18. **`deliver` asks the store before rendering** (no repeat renders or paid calls across devices), honours `delivery.format` from the config, passes custom records through, and records the item key. Remote generators share in-flight calls. `<Sigil>` bypasses a stored image only when this item's own user preference picked a different generator.
19. **Weighted selection uses rendezvous hashing**: adding or reweighting a ref only moves the items that must move.
20. **Uploads**: `storeCustom` checks magic bytes and size and refuses SVG unless `allowSvg`; params interpolated into SVG are escaped or coerced; the DiceBear transport sends a hash of the seed, not the raw key, and is declared cached-nondeterministic.
21. **`check`**: warns without samples instead of passing; key uniqueness uses the keys the runtime computes (custom and fallback keys included); bypass scans every file, ignores comments, catches direct generator-library imports; distinct codes (`SGS0706` ref, `SGS0707` Math.random, `SGS0708` key field, `SGS0709` regeneration not wired); a lock written for another config is `SGS0505`; budget counts the delivery module and the React adapter; tag checks are attribute-order independent; unknown or unreachable refs under `generators` are reported.
22. **Custom key and transport modules** are bundled with esbuild (when the host has it) before import, so TypeScript and extensionless imports work on any Node ≥ 20.
23. **A build that would change identities writes nothing**; failed generator chunk loads can be retried; an explicit `ref` reports `via: 'explicit'`; `initials` honours `maxLetters: 3`; object-valued key parts serialize with sorted keys; end-user settings expose the params listed in `userSettings.params` (layer 5 complete).
24. **The CLI no longer truncates long `--json` output** (it set `process.exit` right after writing to a pipe), found by the new packaging test.

Sizes after these changes: kernel 3,922 B gzip (3,583 brotli); delivery 1,644 B; React adapter 1,460 B; remote 2,686 B.


### First integration (media_player, 2026-11-15) and what changed

25. **Starter budget is 8000 B, documented as a total** (#3). `init` wrote 5000, and kernel + React adapter + the smallest generator is ~6 kB, so the documented React path failed `check` whatever generator was picked. `budget.maxGzipBytes` now says in the schema, SGS0401 and the skill that it counts kernel, modules and generators; `catalog --max-gzip` says it is per generator.
26. **SGS0401's fix is computed from real headroom**: the room left for the largest generator (`catalog --max-gzip <room>`), or, when the kernel and modules alone exceed the budget, an edit raising it. It used to offer `--max-gzip 0`.
27. **`init` reads the item type from the samples** (#4): a conventional name (`type`, `kind`, `category`, `source`, …) or a low-cardinality string field present in nearly every item, else `itemType: null`, instead of a `type` field the data may not have.
28. **`init` writes `delivery.strategy: "derived"`.** The starter generator is pure, so the commonest first use (a list view) needs no storage, upload route or `deliver()` call. `materialized` (still the schema default when the field is omitted) is the opt-in for the rename prompt (A12), remote generators and stored URLs; SGS0303 already catches a non-pure generator under `derived`.
29. **`init`'s `next` walks the whole loop** (detect-key, catalog, preview, build), and `catalog`'s already led to `preview`.
30. **Preview metrics run on the app's samples** when there are at least 20 (`metricsOn: "samples"`), else on 150 synthetic items (`"synthetic"`); `grid.of` gives the sample count beside the 24-column sheet cap.

### Second integration (arioso, 2026-11-15) and what changed

31. **Peer ranges** (#5): `@zodal/dials-*` accept `^0.1.0 || ^0.2.0` (sigilsmith's settings tests pass against dials 0.2.0), and the unused `@zodal/core` peer is gone: no module imports it, and its `^0.2.0` range made `npm i sigilsmith` fail in any app on the published dials 0.1.0 (which peers core `^0.1.2`). CI now runs `scripts/install-smoke.sh`, which installs the packed tarball into fresh apps beside the latest release of each peer family, so a range that excludes a current release fails the build.
32. **`targets.basePath`** (#6): emitted snippets use it as the href prefix (`"/"` by default, `"/myapp/"`, or `""` for relative hrefs), and an emit without it says how to set it.
33. **`targets --emit` replaces only its own files** (#6): the lock records the sha256 of every file it wrote (`emitted`, kept across rebuilds); an existing file that is neither identical nor recorded is left alone with SGS0606, and `--force` replaces it.
34. **A stale item-type default no longer fails `check`** (#4 comment): a missing `itemType` field is a warning whose fix is `"itemType": null`, and an error only when a rule matches on it. `init --samples` warns below 20 items.
35. **SGS0607: the page already has icons** (#6 comment): when `targets.html` declares icons sigilsmith did not emit, emitting site icons warns that they would compete (SVG outranks PNG; hosts may derive icons from the page) and offers to drop those targets.


### Feature-driven sigils (0.2.0, 2026-11-15)

36. **Feature sets** (`src/features.ts`, config `features`): a feature schema (numeric, ordinal, categorical, binary dimensions), vectors (an item field, or a table keyed by item key) and a mapping (`use` + per-ref param encodings: `map`, `range`, `value`), each a JSON file the config names. Asked for by the owner for somaphone's instruments ("a clean separate concern": the feature vector and the mapping maintained as data). Selection order gains a step after rules: the first matching set's `use`. Plans gain a `features` layer (after the project's params, before a rule's and the end user's, so a rule can still override one item) and a `features` block (vector, source dimension per param, problems, and a `tag`: the canonical encoded params). The tag enters the inputs digest, so the regeneration trigger follows the features; the render seed never includes it, so changing one mapping constant does not re-roll any other randomness (the adversarial review's blocker 2). Content ids follow through the params.
37. **The planner is a seam on `createSigil`** (`features: planFeatures` from `sigilsmith/features`), passed by the wiring module only when the config has feature sets: kept in the kernel, the encoding code cost every app 1.1 kB; as a separate subpath it costs 1.1 kB and only the apps that use it. The kernel grew 0.23 kB for every app (selection step and layer plumbing): 4,132 B gzip, so a tight `budget.maxGzipBytes` set against 0.1.x may need ~250 B more on upgrade.
38. **`glyph@1`**, the generator a mapping drives: hue, chroma, tone, shape (9), size, fill (5), rings, orbit, mark (6), rotation, jitter and tile are all params; its own hash only adds a small rotation and phase offset (and the blob and noise forms). 2.1 kB gzip, larger than the hash generators because it carries every channel.
39. **Remote generators take feature options**: the DiceBear transport forwards `params.options` as style options, so a mapping can target a light free API without code (the computed glyph stays the default).
40. **The optional `@zodal/store` peer accepts `^0.1.2 || ^0.2.0`**: thoremin pins 0.1.2, and npm refused the install over an optional peer that only `sigilsmith/zodal` imports (types and `createInMemoryProvider`, both in 0.1.2).
41. **Diagnostics `08xx`**: SGS0801 (a feature file missing, invalid, or a mapping reading an unknown dimension or leaving levels unmapped), SGS0802 (a sample's vector does not fit), SGS0803 (dimensions that drive nothing, items with different features drawn alike). Mapping values are validated against the generator's params schema.

42. **Adversarial review before release (2026-11-15), all fixed:** glyph's every channel is frozen by a golden matrix (`glyph-v1-matrix.json`: every shape × fill, every mark, extremes), and the features path end to end by `features-v1.json`; glyph's trig is rounded to 1e-6 before scaling and a test nudges `Math.cos`/`Math.sin` by one ulp both ways (engines differ in the last bit; vertices on rounding ties printed differently); glyph is `kind: 'hash'` (presets' semantic inputs no longer feed its seed); the silhouette shrinks for its rings and satellites so they never collide; `<defs>` ids include the colours; validation warns on map keys that are not levels, numeric maps with non-integer keys, ranges whose interior points break an integer param (probed at 0, ¼, ½, ¾, 1), and dimensions with `min ≥ max` or a default outside their values; SGS0803 compares only the dimensions the encodings read, after defaults, and reports items with identical features as info; param paths may not use `__proto__`/`constructor`/`prototype`, vector tables are read by own keys; DiceBear options are scalars only and never `seed`; diagnostics keep the config's feature-set indices when one set is invalid.
43. **Encodings by generator id, and encoding lists**: a mapping may key encodings by `glyph` (any major) as well as `glyph@1`, so a later `glyph@2` reads the same mapping; and an encoding may be a list tried in order (`hue` from `kind` for some items, from `sound` for the rest), so the vector keeps facts and the mapping keeps every visual decision. Both asked for by the music-UX review of the first integration, which also gave `glyph@1` an `accentShift` param (the second colour's hue offset; the fixed 150° paired violet with amber) and coarser patterns and strokes for 20–32 px lists.
44. **Extras** (`src/extras/<id>/`, `sigilsmith/extras/<id>/v<N>`, `tier: 'extra'` in the manifest): modules that are listed, wired, explained and checked like generators but are a different kind of thumbnail (content, not identity), kept out of the kernel and the generator set and shipped only when a config selects them. The catalog marks them `(extra)`. The first is **`screenshot@1`**, asked for by the owner for a games hub: an item's key screenshot cropped to the region that identifies it (a point with zoom or a rectangle, fractions or pixels), embedded in an SVG (an `<img>` cannot load external files from inside an SVG, and an embedded file keeps the output byte-stable and usable for targets and stored records). Fallback in two layers: a guarded rule (`screenshot: { exists: true }`) leaves items without one to whatever the app draws otherwise, feature glyphs included, since rules precede feature sets; unguarded, the extra draws its `fallback` generator exactly as that generator would at its defaults, through the same `renderContext` (new `src/context.ts`, now the one home of the seed→hash/rng/palette step for the kernel, the CLI's fingerprints and the extra) and `selectInputs`. A screenshot that cannot be used, a missing file (404) included, is SGS0305: a fallback stored for a broken URL would never be refreshed when the file appears, because the URL is in the seed and the bytes are not. It is `pure` (in its inputs and the file's bytes), so `derived` delivery is allowed; under `materialized`, content-hashed file names make a replaced file a new image. A new generator kind, `content`, keeps presets from replacing its inputs (a preset's `semanticInputs` would have dropped the screenshot). Its ring and background colour come from `$key` alone. The file loader is a seam (`createScreenshot({ fetch })`); the CLI injects one that reads the config's project (`public/`, then its root): `BuiltinManifest.load` now takes `{ dir }`. Manifests may declare `fixtures` (inputs the fingerprint also renders, so the lock covers the crop path, not only the no-screenshot fallback the golden seeds reach) and `implies` (generators a module draws itself: the budget counts and the lock fingerprints them, `shippedRefs`). Its fallback generators are lazy chunks, so its own 2.3 kB excludes them; the budget adds the fallback. `check` now reports sample items that fail to render (it used to drop `computeLock`'s diagnostics). The kernel grew 21 B gzip (4,167 B) for the shared context and the `content` kind. Fleet search for the two helpers: the zodal ContentRef shims resolve blob URLs but read no image sizes, and `zodal-store-fs` is a store, not a root-scoped static reader; `image-info.ts` and `node/assets.ts` are extraction candidates if a second package needs them. Image type and size sniffing moved to `src/image-info.ts`, shared with `storeCustom`. An extra published as its own npm package would need a config seam for external modules (thorwhalen/sigilsmith#12); until one exists, extras ship in this package.

### Migrating an app's own thumbnails (0.3.0, 2026-11-23)

45. **`adopt`, the migration planner** (`src/node/adopt.ts`, an operation, so CLI and MCP): asked for by the owner when arioso_studio's songs had no way to change their image and their art was a hand-rolled orb, so that "the next app's migration is a short recipe". Read-only heuristics, cheapest first: imports of known avatar/identicon packages (mapped to the nearest generator), modules exporting a thumbnail-named symbol that both hash strings and build colours (with their call sites, so the size of the swap is known; tests and generated files are not call sites), hand-set `MediaMetadata` artwork, and image-URL fields in the sample items. It returns findings and an ordered recipe; `skills/sigilsmith/references/migrating.md` is the long form.
46. **`aura@1`**: blurred colour fields on a dark base, the look of the gradient "orb" many media apps hand-roll in CSS, drawn with the algorithm those usually use (cyrb53 of the seed, hue `k` from `cyrb53(seed, k)`, centre and reach from bit shifts, the CSS geometry of a radial gradient on an `inset: -25%` layer reproduced in user-space SVG gradients). With a single key input the seed is the raw key, so a migrated app keeps every item's colours: the migration guarantee, tested against arioso's original `orbColors`. It deliberately ignores the kernel's per-ref `hash`/`rng`. Exact continuity for other hand-rolled hashes is the external-module seam (#12), not more built-ins.
47. **Custom images beyond uploads**: `adoptImage(url, { store? })` turns an image an item already has (stored cover art, an avatar URL) into a frozen custom record, referencing it or (with a store) copying it so expiring provider links stop mattering; it refuses `javascript:`, protocol-relative and SVG URLs (SGS0111). `customFromFile(file)` is the one call behind an upload button. Records gain `origin: 'upload' | 'adopted'`.
48. **The picker** (`useSigilPicker` headless, `<SigilPicker>` a plain default, both in `sigilsmith/react`, with pure `pickerChoices` / `currentChoiceId` / `resolveChoice`): choices are the generated sigil (`null`), the current custom image, and app candidates (a record to reuse, a URL to adopt or copy, or an app `adopt()` for a server-side copy); pending is shown with `aria-busy`, never `disabled`, and repeat presses are ignored. It stays in the React entry: unused, it tree-shakes away (the React figure grew from 1.46 to 1.85 kB gzip because the 0.2.x display-URL cache had not been re-measured, not because of the picker).
49. **`mediaArtwork(sigil, item, { record })`** (`sigilsmith/targets`): lock-screen art from the stored URL, else a browser-rasterised PNG of the same sigil (`browserPng`), never throwing; it replaces the canvas copies of thumbnails apps keep for the Media Session, which drift from the list.
50. **Adversarial review before release (2026-11-23), fixed:** the picker lost track of a candidate once its image was copied into the store (records made from a candidate now carry `from`, matched after URL equality; a copy with no store throws; an `adopt`-only candidate has a `preview`); `mediaArtwork` never hands a stored generated image (which may be SVG) to the lock screen and omits unknown MIME types, and returns data URLs instead of leaking blob URLs; `aura@1` gained `blurPx` (a CSS pixel blur is the same at every size, so `blur`, relative to the tile, could not match it), sRGB filters (as CSS filters run), fields 4-6 from their own hash (the bit shifts run out past the third), `<defs>` ids that include every param, and `Math.sqrt` instead of `Math.hypot` (engines may differ by an ulp); `adoptImage` parses URLs as a browser would (`/\\host` and tab tricks), refuses backslashes, control characters and `.svg`, and checks the declared length before reading; `adopt` anchors thumbnail names to whole camelCase words, escapes them, ignores comments and strings when counting call sites, and stops flagging artwork that already comes from `mediaArtwork`; `check budget` counts the picker (it pulls in the upload code), measured as its own module. Claims were narrowed to what is tested: colours and field geometry match an orb that hashed with cyrb53.
51. **Found by the first consumer (arioso_studio)**: `fromDataProvider`'s existence check skipped the HEAD for root-relative URLs (an app's own API), so an upload was taken as already stored and never sent; now any URL that is not `data:`/`blob:` is asked. `<Sigil>` stretched non-square custom images (now `object-fit: cover`), and phone photos exceeded the upload cap (`customFromFile(file, { maxSide })` and `downscaleImage`, default 512 px in the picker).
52. **The item's own picture, the sigil as fallback (0.3.1, found migrating media_player):** an app that already has a picture for some items drew `item.image_url ? <img> : <Sigil>` by hand, with nothing when the picture failed to load. `pictureRecord(url)` (synchronous, nothing stored, `adoptImage`'s URL rules) makes a display record, and `<Sigil>` falls back to the generated sigil when a custom picture fails to load (`fallback`, default on; the decision is the pure `shownRecord`). `adopt` now points at plain `<img>` tags drawing an image field.
53. **Non-square boxes (0.3.1, found migrating costar):** a film poster is a portrait box; `<Sigil height objectPosition>` sizes the box and lets the image cover it (a generated sigil is cropped to its centre, a photo keeps faces with `'50% 20%'`), so an app's whole image state machine (pending, shimmer, fade, error placeholder) reduces to one `<Sigil record={pictureRecord(url)}>`.
54. **`badge@1`, the typed placeholder (#21, found migrating costar):** apps hand-draw a placeholder that says what kind of item it is plus one fact (costar: a film frame with the year). `initials@1` covers letters, nothing covered "icon of the kind + caption". `badge@1` draws one of ten line icons (`icon`, chosen per type by rule) and a caption from an input named `caption`, on a tile coloured from the key; the caption path is frozen by manifest fixtures (the golden seeds carry no caption). `check budget` also counts the targets module (`mediaArtwork`) when sources import `sigilsmith/targets`.
