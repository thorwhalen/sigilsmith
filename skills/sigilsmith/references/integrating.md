# Integrating

## Rendering

```tsx
import { sigil } from './sigilsmith.gen';
import { SigilProvider, Sigil } from 'sigilsmith/react';

<SigilProvider sigil={sigil}><App /></SigilProvider>
<Sigil item={song} size={40} record={song.sigil} />   // record: the stored SigilRecord, if any
```

Vanilla: `const img = await sigil.render(item); el.src = toDisplayUrl(img);` (`toDisplayUrl` from `sigilsmith`).

## Delivery (`delivery.strategy`)

- `materialized` (default): on item creation, `deliver(sigil, item, { store })` (from `sigilsmith/delivery`) renders in the browser, stores the bytes under a content id (`sg_…`, a hash of generator, inputs and params) and returns a `SigilRecord` with its `url`. Save the record on the item. Same inputs, same id: uploads are idempotent and cacheable forever (`Cache-Control: immutable`).
- `derived`: nothing stored; `<Sigil>` renders on every view. Only for pure generators (`check` enforces it).
- `hybrid`: shows a local render at once, stores in the background (`delivered.stored`).

Storage is the `store` argument: `memoryStore()` by default; any zodal blob provider through `fromDataProvider(provider)` from `sigilsmith/zodal` (`createHttpBlobProvider` from `@zodal/store-http` for your API, `createIndexedDBBlobProvider` from `@zodal/store-localstorage` for offline). Custom uploads use `storeCustom(bytes, mime, { store })` and are never overwritten.

**The upload endpoint is yours.** Treat client images as untrusted: cap size, check the MIME and magic bytes, prefer PNG; if you accept SVG, sanitize it and serve with `Content-Security-Policy: sandbox` and `X-Content-Type-Options: nosniff`, or re-render it on the server from the item's inputs (sigilsmith's in-house generators run in Node too).

## When inputs change (`regeneration.policy`)

Call `onInputsChanged(sigil, item, record, { confirm })` after an edit (`check` warns with `SGS0709` if stored images read changeable inputs and you never call it). It returns `unchanged` (inputs digest same: e.g. identicons keyed on an id never react to renames), `keep` or `regenerate`. The default policy `auto` uses the generator's own default (`initials@1` follows the label: `always`), else `ask`. Under `ask`, `confirm` should be a non-modal prompt that defaults to keep ("Image kept. Update it to match the new title?" with Update and Keep); an explicit Keep freezes the item, while no answer or a timeout keeps the image without freezing and does not ask again for the same change. `unfreeze(record)` resets. Custom images are always kept. Render images after the item has its real id: a fallback key (used while the id is missing) gives a different image.

## End-user settings

```ts
import { defineSigilSettings, createSigilSettingsStore, bindSettings } from 'sigilsmith/zodal/settings';
const settings = defineSigilSettings(sigil.config);           // a zodal-dials definition
const { store, view } = createSigilSettingsStore(settings);   // persist store.getState().layer with any dials LayerStore
bindSettings(sigil, settings, store);                         // user choices become layer 5
```

Render `view().form` / `view().states` with `SettingsPanel` from `@zodal/dials-ui-shadcn` (or `renderSettingsPanel` from `@zodal/dials-ui-vanilla`). This module pulls zod and dials (~100 kB gzip): import it lazily from the settings screen. Users can only pick refs listed in `userSettings.choices`.

## Remote generators

```json
"remote": { "ai@1": { "transport": "proxy", "url": "/api/sigil" } },
"policy": { "default": "grid@1", "rules": [{ "when": { "type": "album" }, "use": "ai@1" }] }
```

The proxy receives `{ ref, seed, fields, params, size }` and returns SVG, an image, or `{ svg | url }`. Results are cached by content id, so an item never triggers a second paid call. For BYOK: `{ "transport": "module", "module": "./src/byok.ts#transport" }` where `transport = byokTransport({ getKey, call })` from `sigilsmith/remote`, reading the key from a zodal `SecretBackend`. Use `progressive(sigil, item)` to show the placeholder at once.
