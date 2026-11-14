---
title: "zodal fit for sigilsmith: what the ecosystem covers, what it lacks, what to shim"
author: Thor Whalen
date: 2026-11-14
---

# zodal fit for sigilsmith

## 1. Summary

The author decided that UI and storage abstraction go through zodal (brief B20). This report maps every zodal piece the brief names onto sigilsmith's needs, from the READMEs, `AGENTS.md` files and the source of the exported functions (checked out under `$PP/i/_zodals/`, plus `$PP/i/holdall/`), and from what `npm` actually serves today. Where a claim could be tested cheaply it was run (a scratch install and a few `node` calls against the local builds); those are marked "verified by running".

**Verdict.** zodal covers storage, settings cascade, settings UI, secrets plumbing, agent-readable descriptions and persistence well enough to build on, with seven real gaps. In order of how much they hurt sigilsmith:

1. **Key resolution is the weakest fit.** `defineCollection` infers `idField` from flat field names only, silently falls back to the first field when nothing matches (verified: `{artist, title, year}` gets `idField = 'artist'`), has no nested paths, no composite keys, no canonical serialization, no uniqueness check, and `explain()` traces field affordances, not the id decision. B4.1 is a sigilsmith module; it should be built so it can be upstreamed (G1).
2. **The npm install does not resolve today.** The published `@zodal/dials-*@0.1.0` peer on `@zodal/core@^0.1.2`, while `@zodal/store-http`, `store-localstorage@0.2.0`, `store-s3`, `store-supabase` and `holdall` peer on `@zodal/core@^0.2.0` and `@zodal/store@^0.2.0`. `npm install` of both sets fails with `ERESOLVE` (verified). An npm `overrides` block forcing `core`, `store` and `ui` to 0.2.0 installs and the dials stack ran correctly on top of it (verified, narrow smoke test: `defineDials`, `createSettingsStore`, `toSettingsForm`, `toPrompt`, secret backend, HTTP blob provider, holdall facade all import and run). The clean fix is republishing dials against core 0.2.x (G10).
3. **Published versions lag the checkouts.** The local `main` branches are ahead of npm: core, store and ui are 0.2.6 locally against 0.2.0 on npm; dials packages are 0.2.0 locally against 0.1.0; `@zodal/ui-shadcn` is 0.3.4 against 0.1.0; `@zodal/store-localstorage` is 0.3.0 against 0.2.0; `@zodal/media` is unpublished. Things sigilsmith would like (the tiered cache provider, `secretPaths`, `toViewConfig` with an image role, `toOptionsFormConfig`) exist only on `main`.
4. **Blob handling is half there.** `DataProvider` has `setContent`, `getContent` and `getUrl`, and the HTTP, S3, Supabase, fs and IndexedDB blob providers exist. Missing: a content-type and cache-control argument on writes, "write only if absent" for content-addressed generate-once-store, a head call that returns a `ContentRef` without bytes, direct-to-bucket upload URLs, and upload validation hooks (G3, G4).
5. **Dials resolves one flat key space; sigilsmith needs a per-item, per-generator ladder.** A `preset` scope already works as plain data (verified), so presets are not blocked. What is missing is a declared ladder that selects layers from a context (item type, generator, rule) and a developer-limits model for end-user settings (`writableScopes` is in the dials plan but not in the source) (G5).
6. **No browser persistence for dials layers, no browser secret backend, no React hook** (G6, G7, G8). All three are thin.
7. **No Media Session helper.** `@zodal/media` has it on its roadmap only; `@zodal/speech` sets a title and no artwork (G9).

**Licence note.** The checkouts declare Apache-2.0 for core, store, ui and all dials packages, and MIT for the store adapters, `@zodal/media` and holdall. The npm registry shows no `license` field for `@zodal/core`, `@zodal/store`, `@zodal/ui` or the dials packages at the versions installable today. An MIT package depending on Apache-2.0 packages is fine; it still needs a NOTICE line and the missing registry metadata is worth an upstream issue (G10).

## 2. Map: sigilsmith need to zodal piece

"Fit" is full (use as is), partial (use, with a gap noted in section 3) or none. "npm" is the version `latest` on the registry on 2026-11-14; "main" is the version in the local checkout, where it differs and the difference matters. Every package is ESM with a CJS build (`"type": "module"`, dual `exports`); zod peers are given per package.

| # | Need (brief ref) | zodal piece and export | Fit | npm / main | zod peer, Node? |
|---|---|---|---|---|---|
| 1 | Key resolution + explain (B4.1, B0.6) | `@zodal/core` `defineCollection(schema, { idField, labelField })`, `.idField`, `.labelField`, `.explain(field?)` [1][2] | partial: explicit override works; detection is flat-name only, silent fallback, no composite or nested key, `explain()` does not cover the id decision | 0.2.0 / 0.2.6 | `^3.24 \|\| ^4`; yes (pure) | 
| 2a | Image bytes and uploads (B6, B18) | `@zodal/store` `DataProvider.setContent / getContent / getUrl`, `createBifurcatedProvider` [3]; `@zodal/store-http` `createHttpBlobProvider` [4] | partial: bytes, `ContentRef` with `url`, `mimeType`, `size` and `hash` exist; no write options, no head, no if-absent | store 0.2.0 / 0.2.6; store-http 0.1.0 / 0.1.0 | none (`@zodal/core` and `@zodal/store` ^0.2.0 peers); yes, over `fetch` (Node 18+ and browser) |
| 2b | Browser image cache | `@zodal/store-localstorage` `createIndexedDBBlobProvider`, `createBrowserBifurcatedProvider`, `createLocalStorageProvider` [5] | partial: stores `Blob` with its type; no `getUrl` (returns null; sigilsmith makes object URLs); localStorage metadata is quota-limited | 0.2.0 / 0.3.0 | none; browser only (needs `indexedDB`) |
| 2c | Cache with eviction | `@zodal/store` `createTieredProvider` (hot over cold, LRU, offline fallback) [3] | partial: right shape, byte budget and blob tiering are listed as later slices | not on npm (0.2.0 lacks it) / 0.2.6 | none; yes |
| 2d | Server-side stores | `@zodal/store-s3` `createS3BlobProvider`, `@zodal/store-supabase` `createSupabaseStorageBlobProvider`, `@zodal/store-fs` `createFsBlobProvider` [6][7][8] | full for plain put/get/URL; fs id handling unsafe for arbitrary keys (G2) | s3 0.2.0, supabase 0.2.0, fs 0.1.0 | none (AWS SDK v3 and supabase-js peers); S3 and fs are Node, supabase works in both |
| 3 | SSOT config + layered defaults + provenance (B0.2, B4.3) | `@zodal/dials-core` `defineDials`, `resolve`, `explain`, `UNSET`, scopes as data, `managed` policy band [9] | partial: effective value + provenance per key is exactly B0.6; flat per-key resolution, no per-item ladder | 0.1.0 / 0.2.0 | `>=4.1.13`; yes (pure) |
| 3b | Config file validation / editor schema | `@zodal/dials-codegen` `toJsonSchema` [10] | full | 0.1.0 / 0.2.0 | `>=4.1.13`; yes |
| 3c | Config file on disk (CLI) | `@zodal/dials-store-jsonc` `createJsoncStore`, `@zodal/dials-store-env` `createEnvStore` [11] | full for Node; JSONC edits preserve comments | 0.1.0 / 0.2.0 | none; Node only (`node:fs`) for jsonc, any runtime for env |
| 4 | End-user settings (B15) | `@zodal/dials-ui` `createSettingsStore`, `toSettingsForm`, `toFieldStates`, `createProfileStore` [12] | partial: reactive store, dirty set, reset, undo helpers; "within the limits the developer allows" is only the all-or-nothing `managed` band | 0.1.0 / 0.2.0 | `>=4.1.13`; yes |
| 5 | BYOK / secrets (B12) | `@zodal/dials-store-secret` `createSensitiveSettingsProvider`, `createMemorySecretBackend`, `revealSetting`; `SecretBackend`, `SecretRef`, `maskEffectiveResult` in dials-core [13] | partial: the routing and masking guarantees are strong and tested; the only backend is in-memory, and there is no persistent browser one | 0.1.0 / 0.2.0 | none; yes |
| 6a | Settings UI, React (B8) | `@zodal/dials-ui-shadcn` `SettingsPanel`, `SettingField`, `createShadcnSettingsRegistry` [14] | full for a panel; controls are plain elements with `zodal-dials-*` classes, not shadcn primitives; no hook | 0.1.0 / 0.2.0 | react `^18 \|\| ^19`; browser |
| 6b | Settings UI, vanilla (B8) | `@zodal/dials-ui-vanilla` `renderSettingsPanel`, `renderField`, `styles.css` [15] | full | 0.1.0 / 0.2.0 | none; DOM required (browser, or jsdom) |
| 6c | Item list thumbnails and generator-param forms | `@zodal/ui` `toViewConfig(collection, 'list' \| 'grid')` (image role), `toOptionsFormConfig(schema)`; renderers `@zodal/ui-vanilla`, `@zodal/ui-shadcn` [16][17] | partial: `toViewConfig` and `toOptionsFormConfig` are on `main` only; npm `@zodal/ui@0.2.0` has neither (verified) | ui 0.2.0 / 0.2.6; ui-vanilla 0.2.0 / 0.2.1; ui-shadcn 0.1.0 / 0.3.4 | `^3.24 \|\| ^4` (core, store, ui); browser for renderers |
| 7 | Agent-readable descriptions (B0.6, A3) | `@zodal/dials-codegen` `toPrompt(dials, { title })` for the settings; `@zodal/ui` `toPrompt(collection)` for a collection [10][18] | full: secrets are marked `[secret]` and never carry a default | codegen 0.1.0; ui 0.2.0 | `>=4.1.13`; yes |
| 8 | Client-side persistence, export/import, share links | `holdall` (core) and `holdall/zodal` `createPersistence` [19] | full for items-as-collection; not an image cache | 0.1.0 / 0.1.0 | none (Standard Schema validators); core is isomorphic with injectable browser globals; `bin: holdall` CLI in Node |
| 9 | Media Session artwork (B17) | `@zodal/media` [20] | none: `./media-session` is listed as "next"; `@zodal/speech` sets `MediaMetadata({ title })` only | media unpublished (404 on npm) / 0.1.0 | optional peers `zustand ^5`, `zod ^4`, `acture`; browser |

Notes that change decisions:

- **Where `toPrompt` lives.** There are two functions of that name. The one that describes sigilsmith's configuration (key fields, generators, params, which are dials settings) is `@zodal/dials-codegen`. The one in `@zodal/ui` describes a collection's table affordances and is only useful for the host app's item list.
- **Settings UI vs generator-param forms.** The dials panel is the right surface for end-user settings. Per-generator parameter forms, driven by each manifest's zod schema, would use `toOptionsFormConfig` (already handles secrets as password fields and non-serializable values as "supplied in code"), but that is `main`-only; the dials panel can render the same schema as a dials definition in the meantime.
- **Item key vs store id.** Every `DataProvider` method takes `id: string`. Composite keys therefore have to be serialized to one string before they reach any store (G1), and that string must be safe as a filename, an S3 key segment and a URL segment (G2).
- **What is sigilsmith's own, not zodal's.** The `check` drift command, the generator manifest, target registry, deterministic selection and the composed `explain(item)` (which key, which fields, which generator, which layer supplied each value) have no zodal equivalent. They compose `defineDials().explain` and the key resolver; sigilsmith owns them.

## 3. Gaps, proposed upstream additions, and local shims

Each gap gives the proposed upstream home, a signature, one paragraph, and the thin shim sigilsmith keeps until it lands. Shims live in one folder, `src/shims/zodal/`, one file per gap, each with a header comment `SHIM: upstream <repo>#<issue>; delete when @zodal/<pkg> >= <version>`, and nothing else in the package imports a shim except through the module that also imports the real zodal piece (so deletion is a one-file change).

### G1. Item key resolution: nested, composite, canonical, explained, checked

Home: `@zodal/core` (new module `identity.ts`), exported next to `defineCollection`.

```ts
export type KeySpec =
  | string                                   // 'id' or a nested path 'meta.uuid'
  | readonly string[]                        // composite, ordered: ['artist', 'title', 'year']
  | ((item: unknown) => string);             // custom

export interface KeyResolution {
  spec: KeySpec;
  keyOf(item: unknown): string | undefined;           // canonical string, undefined when a part is missing
  explain(item?: unknown): InferenceTrace[];          // which layer chose the spec; for an item, which parts were present
  check(samples: readonly unknown[]): KeyReport;      // uniqueness, completeness, instability suspects
}
export interface KeyReport { unique: boolean; duplicates: string[][]; missing: number; total: number; suspects: { field: string; reason: string }[] }

export function resolveKey(schema: z.ZodObject<any>, options?: {
  key?: KeySpec; candidates?: readonly string[]; samples?: readonly unknown[]; strict?: boolean }): KeyResolution;
export function canonicalKey(parts: readonly unknown[]): string;   // fixed order, NFC-normalized, JSON-escaped, unambiguous
```

`defineCollection` today picks `id`, `_id`, `uuid`, `key`, then the first field ending in `id`/`Id`/`_id`, then the first field of the schema, with no signal (source: `detectIdField` in `$PP/i/_zodals/zodal/packages/core/src/collection.ts`). That fallback is the dangerous part: a schema without an id gets a plausible but wrong key. The proposal is a separate resolver that returns a `KeyResolution` carrying its own trace in the same `InferenceTrace` shape that `explain()` already uses, accepts nested paths and composites, serializes composites with a canonical encoding (JSON array of NFC-normalized strings, so the separator can never collide with content), and checks samples for uniqueness and completeness, with `strict` throwing instead of falling back. `defineCollection` would then take `idField?: KeySpec` and use `resolveKey` internally, keeping today's behaviour as the last-resort layer but recording it in `explain()`. The fleet already ships RFC 8785 canonical JSON in holdall (`canonicalize`, used by `canonicalEquals` in `$PP/i/holdall/src/merge.ts`) so `canonicalKey` can be `canonicalize(parts.map(normalize))` rather than a new format.

Shim: `src/shims/zodal/key.ts` implementing `resolveKey`, `canonicalKey` and `KeyReport` with the signatures above, using `canonicalize` directly; it also reads the B4.1 detection priority list from the config. Sigilsmith's `check` command calls `KeyResolution.check`.

### G2. Store ids must be safe in every backend

Home: `@zodal/store/testing` (`providerContract`) plus `@zodal/store-fs`.

```ts
export function assertSafeId(id: string): void;        // rejects '', '.', '..', path separators, NUL, over-long ids
export function encodeId(id: string): string;          // reversible, filename- and URL-safe (base64url of UTF-8)
```

`@zodal/store-fs` builds `join(storagePath, `${id}.json`)` and `join(basePath, id, `${field}.${extension}`)` with no check (`$PP/i/_zodals/zodal-store-fs/src/provider.ts`, `blob-provider.ts`), so an id containing `..` or `/` reaches outside the folder; `@zodal/store-s3` composes `{prefix}{id}/{field}` so a `/` in an id silently nests. `@zodal/store-http` encodes each segment with `encodeURIComponent` and is safe. The contract tests should include hostile ids, and the fs and S3 providers should either encode or refuse. Shim: sigilsmith never passes a raw item key as an id. The store id is the lowercase hex of a SHA-256 over `canonicalKey(...)` plus the generator id and version (also the content-addressed cache key demanded by B3), which is safe everywhere and gives dedup for free. One consequence to design around: ids are then not human-readable, so the original key goes in metadata.

### G3. Content writes need options, a head call and if-absent

Home: `@zodal/store` (`DataProvider` optional methods) and each blob adapter.

```ts
export interface ContentWriteInit { mimeType?: string; cacheControl?: string; ifAbsent?: boolean; hash?: string }
setContent?(id: string, field: string, content: unknown, init?: ContentWriteInit): Promise<ContentRef>;
headContent?(id: string, field: string): Promise<ContentRef | null>;     // metadata only, null when absent
```

Today `setContent(id, field, content: unknown)` infers the type from the value (`Blob.type`, else `application/octet-stream`) and the HTTP provider lets a caller override it only through a provider-wide `contentTypeFor` option (`$PP/i/_zodals/zodal-store-http/src/blob-provider.ts`). Generate-once-store (B18) needs three things the interface does not offer: setting `Content-Type` and `Cache-Control` per write (an SVG must be served as `image/svg+xml` and cached immutably), "write only if absent" so concurrent clients generating the same deterministic image do not race (S3 `If-None-Match: *`, HTTP `If-None-Match`), and a way to ask "is it already stored, and what is its URL?" without downloading bytes. `ContentRef` already has `hash`, `mimeType`, `size` and `url`, so `headContent` returns the same type. Shim: `src/shims/zodal/content.ts` wraps a provider as `putImage(provider, id, blob, { mimeType, ifAbsent })`: it calls `getUrl` and `fetch(url, { method: 'HEAD' })` for the existence check, passes `mimeType` by wrapping the `Blob` (`new Blob([bytes], { type })`, which the HTTP, S3 and IndexedDB providers honour), and treats a server `412` as success. It feature-detects `headContent` and `init` so it degrades to the upstream method when it appears.

### G4. Direct-to-bucket upload URLs and upload validation

Home: `@zodal/store-http` blob provider (and `@zodal/store-s3` `urlFor` counterpart).

```ts
uploadUrlFor?: (id: string, field: string, init: { mimeType: string; size: number }) =>
  Promise<{ url: string; method?: 'PUT' | 'POST'; headers?: Record<string, string> }>;
validateContent?: (content: unknown, init: { mimeType?: string }) => void | Promise<void>;   // throw to reject
```

The brief's default strategy has the browser upload what it generated, and warns that the server receives client-made images (B18: check size, type, content). The HTTP blob provider always writes to `baseUrl` and the S3 provider needs credentials in the client, which a browser app must not hold. A presigned-URL seam (`uploadUrlFor`, mirroring the existing read-side `urlFor`) lets the developer's backend mint short-lived PUT URLs, and a client-side `validateContent` hook gives a single place for size and type limits (server-side validation remains the real defence). Shim: sigilsmith's `ImageStore` port has `put(key, blob, meta)`; its HTTP adapter calls the developer's endpoint for a URL, then `fetch`es the PUT, and runs size and MIME checks before and a magic-byte sniff for SVG/PNG/WebP before upload. This is the only shim that sits outside a zodal provider, and it is behind sigilsmith's own port, so replacing it is a change inside one adapter.

### G5. Per-item, per-generator layer ladder and developer limits (dials)

Home: `@zodal/dials-core` (new `ladder.ts`) and a `writableScopes` meta that the dials plan already names.

```ts
export interface Rung<Ctx> { scope: string; layer: Layer | ((ctx: Ctx) => Layer | undefined); managed?: boolean }
export function defineLadder<Ctx>(dials: DialsDefinition<any>, rungs: readonly Rung<Ctx>[]): {
  resolve(ctx: Ctx, options?: DialsResolveOptions): EffectiveResult;     // same provenance, with the rung's scope id
  explain(key: SettingKey, ctx: Ctx): KeyProvenance | undefined;
};
// .meta({ writableScopes: ['user'], userBounds: { min: 16, max: 256 } }) on a setting
```

The cascade already treats scopes as data and takes any ordered stack, so B4.3's five layers (generator defaults, presets by item type, project config, per-rule overrides, end-user settings within limits) work today by building the stack per call (verified: a `preset` scope won over defaults and was reported as `winningScope: 'preset'` with the default listed as shadowed). What is missing is the declaration of that ladder as data with context selectors, so the same ladder serves resolve, `explain`, the settings UI and `check`; and a way to say "the user may set this, within these bounds" that is more precise than the `managed` band, which locks the setting for everyone. Shim: `src/shims/zodal/ladder.ts`, about 40 lines, builds `ScopedLayer[]` from the rungs and calls `dials.resolve`; end-user bounds are enforced by clamping in sigilsmith's settings adapter and reported in `explain` as a limit applied, using dials `constraints` for validation.

### G6. A browser `LayerStore` for dials

Home: new `@zodal/dials-store-provider` (or an export of `@zodal/dials-core`), reusing the zodal stores, which the dials plan lists as intended ("reuse of zodal-store-* as config store").

```ts
export function createProviderLayerStore(options: {
  provider: DataProvider<{ id: string; layer: SerializedLayer }>; scope: string; docId?: string;
  sensitivityFor?: (key: SettingKey) => Sensitivity }): LayerStore;
```

Dials ships `LayerStore` adapters for env (read-only) and a Node-only JSONC file, and a localStorage `ProfileStorage` for named profiles, but nothing that persists the user's layer in the browser. A provider-backed `LayerStore` closes that and makes the same settings persist to localStorage, HTTP or S3 by swapping the provider (the abstraction the author wants). It must redact secrets on save the way `createJsoncStore` does. Shim: `src/shims/zodal/layer-store.ts`, a `LayerStore` over `createLocalStorageProvider`, using `serializeLayer` and `deserializeLayer` (exported by dials-core) so `UNSET` survives the round trip, and `redactSecretsFromLayer` on write.

### G7. A persistent BYOK secret backend for browsers

Home: `@zodal/dials-store-secret` (new export) or a sibling `@zodal/dials-store-secret-web`.

```ts
export function createWebStorageSecretBackend(options: {
  storage?: Storage;                     // default sessionStorage: gone when the tab closes
  encryptWith?: (plain: string) => Promise<string>; decryptWith?: (cipher: string) => Promise<string>;
  prefix?: string }): SecretBackend;
```

The only `SecretBackend` is `createMemorySecretBackend`, and the dials plan lists keychain and Vault backends for later. For a browser, the options are session storage, local storage, or IndexedDB with a WebCrypto key; none protects a key from script running on the page (XSS) or from the user's own browser profile, so the honest default is session-scoped storage with explicit "remember on this device" consent, and the docs must say so. The `SecretBackend` interface (`has`, `get`, `reveal`, `set`, `delete`, `list`) is already the right seam and the masked `SecretRef` guarantee is tested. Shim: `src/shims/zodal/secret-backend.ts` implementing `SecretBackend` over `sessionStorage` (default) or `localStorage` (consent), with no encryption claimed. The B12 rules (never in the bundle, proxy first) are sigilsmith policy, not zodal's.

### G8. A React hook for the settings store

Home: `@zodal/dials-ui-shadcn` (or a `@zodal/dials-react` subpath).

```ts
export function useSettings(store: SettingsStore): { state: SettingsState; form: SettingsForm; states: Record<SettingKey, SettingFieldState> };
```

`createSettingsStore` is framework-free with `subscribe` and `getState`, and the dials demo wires it to React with `useSyncExternalStore` by hand (`$PP/i/_zodals/zodal-dials/apps/instruments/src/App.tsx`). The "headless settings hook" the brief hopes for is therefore the store plus six lines of glue. Shim: `src/react/useSettings.ts` with `useSyncExternalStore(store.subscribe, store.getState, store.getState)` and a memoized `toSettingsForm`/`toFieldStates`.

### G9. Media Session artwork

Home: `@zodal/media` (its README already names `./media-session` as next).

```ts
export function bindMediaSession(player: MediaPlayer, options: {
  metadata: (item: unknown) => { title: string; artist?: string; album?: string; artwork: MediaImage[] };
  nav?: Pick<Navigator, 'mediaSession'> }): () => void;
export function toMediaImages(refs: readonly { url: string; width: number; type?: string }[]): MediaImage[];
```

Nothing in the fleet builds a `MediaMetadata` with `artwork`; `@zodal/speech` sets `{ title }` only (`$PP/i/_zodals/zodal-speech/src/vanilla.ts`). Artwork must be a stored URL (the OS fetches it; it does not run page script), which is the same constraint as B17's link-preview targets, so it follows from the storage decision, not from zodal. Shim: sigilsmith's target registry has a `media-session` target whose `register(item, images)` sets `navigator.mediaSession.metadata = new MediaMetadata({ title, artwork: [{ src, sizes: '512x512', type: 'image/png' }, ...] })` (about 15 lines, with the sizes list coming from the target's declared sizes). It does not depend on `@zodal/media`, which is unpublished and brings optional zustand/acture peers.

### G10. Packaging: peer skew, publishing lag and licence metadata

Home: the zodal and zodal-dials repos (issues, then a CI republish).

The dials packages need a republish against `@zodal/core@^0.2.x` (their `main` already declares `^0.2.0`), the `@zodal/ui-shadcn` and `@zodal/ui-vanilla` renderers need to catch up with `main`, and the registry metadata for core, store, ui and dials should carry a `license`. Until then sigilsmith pins as in section 4. Shim: none; this is a dependency decision, not code.

## 4. What is installable today and how to pin it

Verified on 2026-11-14 with a scratch project. All packages are installable individually. The two families cannot be installed together without an override:

- **Stores family (core 0.2):** `@zodal/core@0.2.0`, `@zodal/store@0.2.0`, `@zodal/ui@0.2.0`, `@zodal/store-http@0.1.0`, `@zodal/store-localstorage@0.2.0`, `@zodal/store-s3@0.2.0`, `@zodal/store-supabase@0.2.0`, `holdall@0.1.0`, `@zodal/ui-vanilla@0.2.0`. Installs clean with `zod@4`.
- **Dials family (core 0.1):** `@zodal/dials-core`, `-ui`, `-ui-vanilla`, `-ui-shadcn`, `-codegen`, `-store-secret`, `-store-jsonc`, `-store-env`, all `0.1.0`, peering `@zodal/core@^0.1.2`, `@zodal/ui@^0.1.2` and `zod >=4.1.13`. Installs clean with `@zodal/core@0.1.2`, `@zodal/store@0.1.2`, `@zodal/ui@0.1.2`.
- **Both together:** `ERESOLVE`. Working workaround, in the package that consumes both:

```json
{ "overrides": { "@zodal/core": "0.2.0", "@zodal/store": "0.2.0", "@zodal/ui": "0.2.0" } }
```

With that override, `defineDials`, `createSettingsStore`, `toSettingsForm`, `toPrompt`, `createMemorySecretBackend`, `createHttpBlobProvider`, `holdall/zodal` `createPersistence` and `wrap` all imported and ran. This is a smoke test, not a compatibility guarantee; the dials 0.1.0 tests were not run against core 0.2.0.

Recommendation for sigilsmith's `package.json`: make `zod` (`^4.1.13`), `@zodal/core`, `@zodal/store` and the specific adapters **optional peers**, not dependencies, so a host that only wants the core generators pulls nothing from zodal. Put the zodal-coupled code in subpath exports (`sigilsmith/settings`, `sigilsmith/storage`, `sigilsmith/react`) so importing the generators never imports zodal. Consume zodal packages through sigilsmith's own ports (`ImageStore`, `SettingsStore`, `SecretVault`), with the zodal-backed adapter as the default implementation, so a G-shim and its upstream replacement are interchangeable. Track upstream `main` for development by a local workspace link to the checkouts, and release against npm versions only.

Runtime coverage for a CLI: pure packages (`core`, `store`, `dials-core`, `dials-codegen`, `dials-ui` headless, `store-http` over global `fetch`, `holdall` core, `dials-store-env`) run in Node 18+. Node only: `dials-store-jsonc`, `store-fs`, `store-s3`. Browser only: `store-localstorage` (IndexedDB, `localStorage`), `dials-ui-vanilla`, `dials-ui-shadcn`, `ui-vanilla`, `ui-shadcn`, `@zodal/media`.

## Appendix A. API cheat sheet

All snippets are taken from the source under `$PP/i/_zodals/` and `$PP/i/holdall/`; the few I ran are marked. Every package below is ESM with a CJS twin; import paths are the package root unless stated. Zod is imported as `import { z } from 'zod'` (zod 4).

### A1. `@zodal/core`: `defineCollection`, `idField`, `labelField`, `explain()`

Source: `$PP/i/_zodals/zodal/packages/core/src/collection.ts`, `types.ts`, `index.ts`. Peer: `zod ^3.24 || ^4` (npm 0.2.0).

```ts
import { defineCollection } from '@zodal/core';
import type { CollectionConfig, CollectionDefinition, InferenceTrace } from '@zodal/core';

function defineCollection<TSchema extends z.ZodObject<any>>(
  schema: TSchema, config?: CollectionConfig<z.infer<TSchema>>): CollectionDefinition<TSchema>;

const c = defineCollection(
  z.object({ slug: z.string(), title: z.string(), cover: z.string().optional() }),
  { idField: 'slug', labelField: 'title' });          // both optional overrides (CollectionConfig.idField / labelField)

c.idField;                    // string
c.labelField;                 // string
c.explain('title');           // InferenceTrace[] = { field, affordance, finalValue, layers: { layer: 'type'|'refinement'|'name'|'meta'|'registry'|'config', value, reason }[] }[]
c.getContentFields();         // field names with storageRole === 'content'
c.describe();                 // human-readable summary string
```

Inference of the id (internal `detectIdField`): `id`, `_id`, `uuid`, `key`, then the first field matching `/[iI]d$/` or `_id$`, then the first field in the schema. The label (`detectLabelField`): the field flagged `summaryField`, then `name`, `title`, `label`, `displayName`, `display_name`, `username`, then the first editable string field. Verified by running: `{artist, title, year, cover}` gives `idField: 'artist'`, `labelField: 'title'`; `{meta: {uuid}, name}` gives `idField: 'meta'`. `explain()` does not report either decision. Also exported and useful: `ContentRef` (`{ _tag: 'ContentRef'; field; itemId; hash?; url?; mimeType?; size? }`), `isContentRef`, `FieldStorageRole = 'metadata' | 'content'`, and on `main` only the sensitivity helpers `secretPaths`, `redact`, `scrubSecrets`, `isSecretName`.

### A2. `@zodal/store`: `DataProvider<T>` and `createInMemoryProvider`

Source: `$PP/i/_zodals/zodal/packages/store/src/data-provider.ts`, `in-memory.ts`, `index.ts`. Peer: `zod`; depends on `@zodal/core` (npm 0.2.0 pins `0.2.0`).

```ts
import { createInMemoryProvider, createBifurcatedProvider, DEFAULT_CAPABILITIES } from '@zodal/store';
import type { DataProvider, GetListParams, GetListResult, ProviderCapabilities, DataChangeEvent } from '@zodal/store';

interface DataProvider<T> {
  getList(params: GetListParams): Promise<GetListResult<T>>;          // GetListParams = { sort?, filter?, search?, pagination?: { page; pageSize } } (1-based)
  getOne(id: string): Promise<T>;                                      // rejects when absent
  create(data: Partial<T>): Promise<T>;                                // assigns an id when none; rejects on duplicate id
  update(id: string, data: Partial<T>): Promise<T>;                    // shallow merge
  updateMany(ids: string[], data: Partial<T>): Promise<T[]>;
  delete(id: string): Promise<void>;
  deleteMany(ids: string[]): Promise<void>;
  upsert?(data: T): Promise<T>;
  getCapabilities?(): ProviderCapabilities;                            // canCreate/Update/Delete/Upsert, serverSort/Filter/Search/Pagination, bifurcated?, contentFields?
  subscribe?(cb: (e: DataChangeEvent<T>) => void): () => void;
  getContent?(id: string, field: string): Promise<unknown>;            // bytes (bifurcated providers)
  setContent?(id: string, field: string, content: unknown): Promise<ContentRef>;
  getUrl?(id: string, field: string): Promise<string | null>;          // prefer this for <img src>; null when no URL possible
}

const provider = createInMemoryProvider([{ id: '1', name: 'Alpha' }], { idField: 'id' });   // options: idField, simulateDelay, searchFields, clone
await provider.getList({ sort: [{ id: 'name', desc: false }], pagination: { page: 1, pageSize: 10 } });
```

Composition: `createBifurcatedProvider({ metadataProvider, contentProvider, contentFields, idField?, listStrategy?: 'reference' | 'omit', detailStrategy?: 'eager' | 'reference', toContentRef? })` returns one `DataProvider<T>`; list and detail items carry `ContentRef` objects in place of bytes. `wrapProvider(provider, { encode, decode })` applies a codec. On `main` only: `createTieredProvider({ hot, cold, maxItems?: 200, isFresh?, admit?, selectEvictions?, fallbackOn?, onFallback?, onCacheError?, residency?, idField?, now? })`, which returns `TieredProvider<T>` with `cached()` and `evict(id?)`. Subpaths: `@zodal/store/testing` (`providerContract`), `@zodal/store/descriptor`.

### A3. `@zodal/store-http` (npm 0.1.0, MIT)

Source: `$PP/i/_zodals/zodal-store-http/src/` and README. Peers: `@zodal/core ^0.2.0`, `@zodal/store ^0.2.0`. Browser and Node 18+ (global `fetch`, injectable).

```ts
import { createHttpProvider, createHttpBlobProvider, HttpError } from '@zodal/store-http';
import { createBifurcatedProvider } from '@zodal/store';

const images = createHttpBlobProvider<Item>({
  baseUrl: '/api/images',            // writes always go here
  contentFields: ['thumbnail'],
  idField: 'id',                     // default 'id'
  init: { credentials: 'include' },  // RequestInit for every call
  publicBaseUrl: 'https://cdn.example.com',   // optional: reads from a CDN
  urlFor: async (id, field) => '...',         // optional, wins over publicBaseUrl (may presign)
  writeMethod: 'PUT',                         // or 'POST'
  contentTypeFor: (id, field, content) => (id.endsWith('.svg') ? 'image/svg+xml' : undefined),
});
const ref = await images.setContent!('abc', 'thumbnail', new Blob([svg], { type: 'image/svg+xml' }));
// ref: { _tag:'ContentRef', field, itemId, url, mimeType, size? }   (size only for Uint8Array)
const url = await images.getUrl!('abc', 'thumbnail');   // '/api/images/abc'  (one content field: {base}/{id}; several: {base}/{id}/{field})

const items = createHttpProvider<Item>({ baseUrl: '/api/items', capabilities: { serverFilter: true } });
// options: baseUrl, idField, fetch, init, searchFields, toQuery, parseList, capabilities
```

`createHttpBlobProvider` infers `Content-Type` from the value (`Blob.type`, else `application/octet-stream`; strings `text/plain`; objects `application/json`).

### A4. `@zodal/store-localstorage` (npm 0.2.0, main 0.3.0, MIT)

Source: `$PP/i/_zodals/zodal-store-localstorage/src/`. Peers: `@zodal/core ^0.2.0`, `@zodal/store ^0.2.0`. Browser only.

```ts
import { createLocalStorageProvider, createIndexedDBBlobProvider, createBrowserBifurcatedProvider,
         CorruptStorageError, StorageQuotaError } from '@zodal/store-localstorage';

const meta = createLocalStorageProvider<Item>({ storageKey: 'sigilsmith.items', idField: 'id', searchFields: [], onCorrupt: 'throw' });
const blobs = createIndexedDBBlobProvider<Item>({ contentFields: ['thumbnail'], idField: 'id', dbName: 'zodal-blobs', storeName: 'blobs' });
const both = createBrowserBifurcatedProvider<Item>({ storageKey: 'k', contentFields: ['thumbnail'], dbName: 'zodal-content', storeName: 'content', listStrategy: 'reference' });
```

`createIndexedDBBlobProvider` keeps `Blob`s and has no `getUrl` (it returns `null`); use `URL.createObjectURL(await provider.getContent!(id, field) as Blob)`, and revoke it. The localStorage provider keeps the whole collection under one key, so it suits settings and metadata, not an image cache.

### A5. `@zodal/store-s3` (0.2.0), `@zodal/store-supabase` (0.2.0), `@zodal/store-fs` (0.1.0)

All MIT, peers `@zodal/core` and `@zodal/store` ^0.2.0 (fs ^0.1.0). Sources: `$PP/i/_zodals/zodal-store-s3/src/index.ts`, `zodal-store-supabase/src/index.ts`, `zodal-store-fs/src/index.ts`.

```ts
import { createS3BlobProvider } from '@zodal/store-s3';       // { client: S3Client, bucket, prefix?, contentFields, idField?, publicBaseUrl?, urlFor?, contentKey? }; peers @aws-sdk/client-s3 ^3, s3-request-presigner ^3; PutObject sets ContentType
import { createSupabaseStorageBlobProvider } from '@zodal/store-supabase';   // peer @supabase/supabase-js ^2; upload with { contentType, upsert: true }
import { createFsBlobProvider } from '@zodal/store-fs';       // Node only; unsanitized ids, see G2
```

Their READMEs are written for the older package names (`zodal-store-s3`); the scoped names are the ones on npm.

### A6. zodal-dials: cascade, scopes, provenance, persistence injection

Source: `$PP/i/_zodals/zodal-dials/packages/dials-core/src/` (`define-dials.ts`, `cascade.ts`, `model.ts`, `store.ts`, `patch.ts`). npm 0.1.0 (peers `@zodal/core ^0.1.2`, `zod >=4.1.13`); main 0.2.0 (peer `@zodal/core ^0.2.0`). Licence on main: Apache-2.0.

```ts
import { z } from 'zod';
import { defineDials, UNSET, serializeLayer, deserializeLayer, splitBySensitivity } from '@zodal/dials-core';
import type { Layer, ScopedLayer, EffectiveResult, KeyProvenance, LayerStore, SecretBackend, SecretRef } from '@zodal/dials-core';

const dials = defineDials(z.object({
  'key.fields': z.array(z.string()).default(['id']),
  'generator.id': z.string().default('identicon'),
  'generator.params': z.object({ size: z.number().default(64) }).default({ size: 64 }),   // objects deep-merge by default; arrays and scalars replace
  'byok.apiKey': z.string().meta({ secret: true }).optional(),                              // or a secret-looking name
}), { constraints, dependentDefaults, collection });                                        // all three optional

// scopes are DATA: any ordered stack, lowest precedence first; `managed: true` = policy band, wins and locks
const stack: ScopedLayer[] = [
  { scope: 'preset',  layer: { 'generator.id': 'initials' } },
  { scope: 'project', layer: { 'generator.params': { size: 128 } } },
  { scope: 'user',    layer: { 'byok.apiKey': 'sk-...' } },   // UNSET as a value removes a lower scope's contribution
];
const { effective, provenance, conflicts } = dials.resolve(stack, { includeDefaults: true, maskSecrets: true });
// provenance['generator.id'] = { key, winningScope: 'preset', value: 'initials', managed: false, mergeStrategy: 'replace',
//                                shadowed: [{ scope: 'default', value: 'identicon', managed: false }], mergedFrom? }   (verified by running)
dials.explain('generator.id', stack);       // KeyProvenance | undefined
dials.validate(effective);                  // ConstraintResult
dials.sensitivityFor('byok.apiKey');        // 'secret'; also keys, defaults, mergeStrategyFor, getCapabilities()
```

Persistence injection is the `LayerStore` contract (`$PP/i/_zodals/zodal-dials/packages/dials-core/src/store.ts`): `{ scope: string; getCapabilities(): { readable, writable, watchable }; load(): Promise<Layer>; save?(layer): Promise<void>; subscribe?(cb): () => void }`. Layers serialize losslessly through `serializeLayer` and `deserializeLayer`. Concrete stores:

```ts
import { createJsoncStore } from '@zodal/dials-store-jsonc';   // Node only: { path, scope?: 'file', fs?, sensitivityFor? }; format-preserving; redacts secrets on save
import { createEnvStore } from '@zodal/dials-store-env';       // { keys, prefix?, env?, scope?: 'env', coerce? }; 'a.bC' -> PREFIX_A__B_C
```

### A7. `@zodal/dials-store-secret`

Source: `$PP/i/_zodals/zodal-dials/packages/dials-store-secret/src/index.ts`. Peers: `@zodal/core`, `@zodal/dials-core`. npm 0.1.0, main 0.2.0.

```ts
import { createMemorySecretBackend, createSensitiveSettingsProvider, revealSetting } from '@zodal/dials-store-secret';

const secrets: SecretBackend = createMemorySecretBackend({ /* initial */ });   // has, get (masked SecretRef), reveal, set, delete, list
const provider: LayerStore = createSensitiveSettingsProvider({
  config: someLayerStore,                 // non-secret values go here
  secrets,                                // secret values go here, JSON-encoded
  sensitivityFor: dials.sensitivityFor,
  scope: 'user',                          // default: config.scope
});
await provider.save(layer);               // secrets first, then config; UNSET deletes a secret; a read-only config store throws
await provider.load();                    // config values plus a masked SecretRef per secret
await revealSetting(secrets, 'byok.apiKey');   // explicit, decoded plaintext
```

`SecretRef` is `{ _tag: 'SecretRef'; key; isSet; masked }`. Helpers in dials-core: `maskSecrets`, `maskEffectiveResult` (masks `effective`, `provenance[].value` and `shadowed[]`, and `conflicts[]`), `splitBySensitivity(layer, sensitivityFor) => { config, secrets }`, `redactSecretsFromLayer`, `isSecretRef`, `makeSecretRef`.

### A8. Headless settings and the React and vanilla renderers

Sources: `$PP/i/_zodals/zodal-dials/packages/dials-ui/src/` (`store.ts`, `form.ts`, `profiles.ts`), `dials-ui-shadcn/src/`, `dials-ui-vanilla/src/`.

```ts
import { createSettingsStore, toSettingsForm, toFieldStates, createProfileStore, createLocalStorageProfileStorage } from '@zodal/dials-ui';

const store = createSettingsStore(dials, { scopes: lowerScopes, layer: userLayer, scope: 'user', maskSecrets: true, onListenerError });
store.getState();          // { effective, provenance, conflicts, layer, scopes, dirty, validation }   (secrets masked, except `layer`, which holds raw values: split before saving)
store.subscribe(fn);       // returns unsubscribe
store.set(k, v); store.unset(k); store.reset(k); store.setLayer(l); store.setScopes(s); store.markSaved(); store.get(k); store.explain(k);

const result = dials.resolve([...store.getState().scopes, { scope: 'user', layer: store.getState().layer }], { maskSecrets: true });
const form = toSettingsForm(dials, { result });             // { fields: SettingFieldConfig[]; groups }
const states = toFieldStates(form.fields, result, store.getState().dirty);
```

React (peer `react ^18 || ^19`; props as in the README):

```tsx
import { SettingsPanel } from '@zodal/dials-ui-shadcn';
import '@zodal/dials-ui-shadcn/styles.css';
const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);   // no packaged hook (G8)
<SettingsPanel form={form} states={states} onPreview={applyToView} onChange={store.set} onReset={store.reset} />
```

Vanilla (no framework):

```ts
import { renderSettingsPanel } from '@zodal/dials-ui-vanilla';
import '@zodal/dials-ui-vanilla/styles.css';
host.replaceChildren(renderSettingsPanel(form, states, { onPreview, onChange: (key, value) => store.set(key, value), onReset: (key) => store.reset(key) }));
```

Display hints go in `.meta()`: `enumLabels`, `step`, `unit`, `editWidget: 'color' | 'radio' | ...`, `advanced: true`, `facets`, `order`. A search box appears above 15 settings. Secrets render masked and write-only.

### A9. `toPrompt` and `toJsonSchema`

```ts
import { toPrompt, toJsonSchema } from '@zodal/dials-codegen';    // npm 0.1.0, peers @zodal/core, @zodal/dials-core, zod >=4.1.13
toPrompt(dials, { title: 'Sigilsmith settings' }): string;
// '# Sigilsmith settings\n\nThis system exposes 4 settings. ...\n- `key.fields` (array, default ["id"]) — ...\n- `byok.apiKey` (string) [secret]'   (verified by running)
toJsonSchema(dials, options?): object;    // JSON Schema for the settings file; secret defaults/enums redacted
import { toPrompt as toCollectionPrompt } from '@zodal/ui';       // toCollectionPrompt(collection: CollectionDefinition<any>): string, a markdown table of fields, capabilities, operations
```

### A10. `holdall` (npm 0.1.0, MIT)

Source: `$PP/i/holdall/src/`, `README.md`. Dependencies: `fflate`, `canonicalize`, `browser-fs-access`. Peer: `@zodal/store ^0.2.0` (for the facade). Isomorphic core; CLI `holdall encode|decode`.

```ts
import { wrap, unwrap, makeShareLink, readShareLink, createAutosave, canonicalEquals,
         planImport, resolveImport, parseCollection, exportCollection, saveJson, openText,
         ensurePersistence, detectInstallEnv, installAdvice } from 'holdall';
import { createPersistence, persistenceOperations } from 'holdall/zodal';

const spec = { app: 'sigilsmith', kind: 'settings', version: 1, schema, migrations, bareVersion };   // EnvelopeSpec<T>
wrap(data, spec, { now? }): Envelope<T>;       // { app, kind, version, savedAt, data }
unwrap(raw, spec): T;                          // migrates, validates, refuses newer versions
createAutosave({ save, delay: 400, onError, win, doc }): { schedule, flush, pending, dispose };   // flushes on pagehide
createPersistence({ provider, app, kind, version, schema, idField: 'id', pageSize: 500 });          // exportAll, exportOne, planImport, applyImport, shareLink, readLink
canonicalEquals(a, b): boolean;                // RFC 8785 canonical JSON equality
```

`createPersistence` reads every page with `provider.getList`, so it works over any provider, including the HTTP and localStorage ones above.

### A11. `@zodal/media` (0.1.0 on main, not on npm, MIT)

Source: `$PP/i/_zodals/zodal-media/src/index.ts` and README. Root export (no dependencies): cues (`cueAt`, `wordAt`, `formatTime`), `parseWebVtt`, `seekThenPlay`, `createFollow`, `attachFollow`, `createTimedText`. Subpaths `./transport` (zustand) and `./commands` (acture, zod). No Media Session or artwork helper exists; see G9.

## References

1. [i2mint/zodal (core, store, ui monorepo)](https://github.com/i2mint/zodal). Local: `$PP/i/_zodals/zodal/`, architecture in `$PP/i/_zodals/zodal/.claude/CLAUDE.md`.
2. [@zodal/core on npm](https://www.npmjs.com/package/@zodal/core), source `$PP/i/_zodals/zodal/packages/core/src/collection.ts`.
3. [@zodal/store on npm](https://www.npmjs.com/package/@zodal/store), source `$PP/i/_zodals/zodal/packages/store/src/` (`data-provider.ts`, `bifurcated-provider.ts`, `tiered-provider.ts`, `in-memory.ts`).
4. [i2mint/zodal-store-http](https://github.com/i2mint/zodal-store-http), [@zodal/store-http on npm](https://www.npmjs.com/package/@zodal/store-http).
5. [i2mint/zodal-store-localstorage](https://github.com/i2mint/zodal-store-localstorage), [@zodal/store-localstorage on npm](https://www.npmjs.com/package/@zodal/store-localstorage).
6. [i2mint/zodal-store-s3](https://github.com/i2mint/zodal-store-s3), [@zodal/store-s3 on npm](https://www.npmjs.com/package/@zodal/store-s3).
7. [i2mint/zodal-store-supabase](https://github.com/i2mint/zodal-store-supabase), [@zodal/store-supabase on npm](https://www.npmjs.com/package/@zodal/store-supabase).
8. [i2mint/zodal-store-fs](https://github.com/i2mint/zodal-store-fs), [@zodal/store-fs on npm](https://www.npmjs.com/package/@zodal/store-fs).
9. [i2mint/zodal-dials](https://github.com/i2mint/zodal-dials), [@zodal/dials-core on npm](https://www.npmjs.com/package/@zodal/dials-core). Local: `$PP/i/_zodals/zodal-dials/AGENTS.md`, `docs/lessons-from-the-build.md`, `docs/dev-plan.md`.
10. [@zodal/dials-codegen on npm](https://www.npmjs.com/package/@zodal/dials-codegen).
11. [@zodal/dials-store-jsonc on npm](https://www.npmjs.com/package/@zodal/dials-store-jsonc), [@zodal/dials-store-env on npm](https://www.npmjs.com/package/@zodal/dials-store-env).
12. [@zodal/dials-ui on npm](https://www.npmjs.com/package/@zodal/dials-ui).
13. [@zodal/dials-store-secret on npm](https://www.npmjs.com/package/@zodal/dials-store-secret).
14. [@zodal/dials-ui-shadcn on npm](https://www.npmjs.com/package/@zodal/dials-ui-shadcn).
15. [@zodal/dials-ui-vanilla on npm](https://www.npmjs.com/package/@zodal/dials-ui-vanilla).
16. [@zodal/ui on npm](https://www.npmjs.com/package/@zodal/ui), source `$PP/i/_zodals/zodal/packages/ui/src/` (`prompt.ts`, `generators/view-config.ts`, `generators/options-form-config.ts`).
17. [i2mint/zodal-ui-vanilla](https://github.com/i2mint/zodal-ui-vanilla), [i2mint/zodal-ui-shadcn](https://github.com/i2mint/zodal-ui-shadcn); npm [@zodal/ui-vanilla](https://www.npmjs.com/package/@zodal/ui-vanilla), [@zodal/ui-shadcn](https://www.npmjs.com/package/@zodal/ui-shadcn).
18. `toPrompt` implementations: `$PP/i/_zodals/zodal/packages/ui/src/prompt.ts` and `$PP/i/_zodals/zodal-dials/packages/dials-codegen/src/prompt.ts`.
19. [i2mint/holdall](https://github.com/i2mint/holdall), [holdall on npm](https://www.npmjs.com/package/holdall). Local: `$PP/i/holdall/`.
20. [i2mint/zodal-media](https://github.com/i2mint/zodal-media) (not yet on npm). Local: `$PP/i/_zodals/zodal-media/README.md`.
21. [RFC 8785: JSON Canonicalization Scheme](https://www.rfc-editor.org/rfc/rfc8785), used by holdall through the `canonicalize` package.
22. [RFC 7386: JSON Merge Patch](https://www.rfc-editor.org/rfc/rfc7386), the layer merge semantics in dials-core.
