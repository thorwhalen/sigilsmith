# sigilsmith

Deterministic identity images (identicons, avatars, thumbnails, favicons) for every item in your app's lists, generated in the browser, stable across reloads, devices and deploys.

```bash
npm i sigilsmith && npx sigilsmith init --samples items.json && npx sigilsmith build
```
```tsx
import { sigil } from './sigilsmith.gen';  import { SigilProvider, Sigil } from 'sigilsmith/react';
<SigilProvider sigil={sigil}> … <Sigil item={song} size={40} /> … </SigilProvider>
```

![demo](docs/images/demo-list.png)

## What it is

sigilsmith is a *builder* package. You (or, more often, your coding agent) use its CLI to choose generators from a catalog, preview them on your own items, pin the choice in one config file, and generate a small wiring module your app imports. What reaches the browser is a ~3.8 kB gzip kernel plus only the generators you chose (0.6–1.4 kB each), each lazily loaded.

- **One source of truth.** `sigilsmith.config.json` decides the item key, which fields feed each generator, which generator draws which items, params, budgets and integration targets. App code never names a field or a generator; renaming a data field is a one-line config change, and `sigilsmith check` tells you which line.
- **Same item, same image.** Generators are seeded from the item's inputs, never from `Math.random`. Each generator major (`grid@1`) is frozen: output changes ship as a new major you opt into. A lock file records what your sample items look like, and `check` fails if anything would change them.
- **Agent-first.** Every command prints one JSON envelope with `--json`; every problem is a stable `SGS` code with a fix (often a machine-applicable edit). `AGENTS.md` and a bundled skill tell agents the loop: choose, preview, pin, build, glue, check.

## The commands

| Command | Does |
|---|---|
| `init [--samples f]` | starter config (key detected from your samples) and an `AGENTS.md` block |
| `catalog [--style … --max-gzip N --no-network --implemented]` | the menu: 6 implemented generators and 61 surveyed technologies, filtered by your constraints, with reasons for exclusions |
| `preview [--generators a@1,b@1]` | contact sheet (items × 16/32/64/128 px × light/dark) as HTML and PNG, plus near-duplicate metrics |
| `detect-key <samples> [--write]` | finds the field (or composite) that identifies items; flags unstable choices |
| `explain [--index N]` | for an item: key, generator and the rule that chose it, inputs, and the layer every param came from |
| `build [--accept]` | writes the wiring module and the lock |
| `targets [--emit]` | favicon, Apple touch icon, manifest icons, og:image, Media Session art: files and snippets |
| `check` | config, freshness, data drift, identity, determinism, budget, peers, bypass, target registration |

## Generators (implemented)

| ref | style × semantics | gzip (incremental) | notes |
|---|---|---|---|
| `grid@1` | geometric × hash | 613 B | mirrored grid identicon, in-house |
| `rings@1` | abstract × hash | 577 B | concentric arcs, in-house |
| `shapes@1` | abstract × hash | 689 B | Bauhaus shapes, in-house |
| `initials@1` | geometric × metadata | 740 B | letters from the label, colour from the key |
| `emoji@1` | illustrative × metadata | 1411 B | keyword match on title/tags, else hash |
| `minidenticons@1` | geometric × hash | 640 B | adapter over the MIT `minidenticons` (peer, pinned 4.2.1) |
| remote (`proxy`, `module`/BYOK, `dicebear`, `mock`) | any | 2.6 kB module | cached by content id, instant placeholder, keys never in the bundle |

Measured with esbuild + gzip -9 on 2026-11-14 (`npm run measure`); third-party libraries are measured in `spikes/README.md`.

## Policies, settings, delivery

```jsonc
"policy": {
  "default": "grid@1",
  "rules": [
    { "when": { "type": "video" }, "use": "rings@1" },
    { "when": { "type": "song" }, "use": { "emoji@1": 1, "shapes@1": 1 } }   // deterministic per item
  ]
},
"userSettings": { "choices": ["grid@1", "rings@1", "shapes@1"] },          // end users may pick among these
"delivery": { "strategy": "materialized" },                                 // or "derived" / "hybrid"
"regeneration": { "policy": "ask" }                                         // or "always" / "never"
```

- **Delivery**: `materialized` renders once in the browser and stores the file (content-addressed, through any `@zodal/store` blob provider via `sigilsmith/zodal`); `derived` renders on every view and stores nothing; `hybrid` does both.
- **Regeneration**: when an item's generator inputs change (an identicon keyed on an id never does), `ask` shows a non-modal "update the image?" prompt that defaults to keep. Custom images are never overwritten.
- **End-user settings**: `sigilsmith/zodal/settings` turns `userSettings` into a zodal-dials definition, rendered by any dials panel. Load it lazily (it brings zod and dials).

## Example

`examples/demo` is a Vite + React app with songs, videos, users and a podcast: a type-based policy, a weighted mix, a slow mock AI generator behind a placeholder, stored images through a zodal provider, the rename prompt, the settings panel and favicons. `cd examples/demo && npm i && npm run sigils && npm run dev`; `node e2e/smoke.mjs` drives it in Chrome.

## Documentation

- Design: [`docs/design/proposal.md`](docs/design/proposal.md).
- Research: [`docs/research/`](docs/research/): identity and memory (background), distribution model, agent-first design, generator survey, integration and delivery, zodal fit.
- Agents integrating sigilsmith: [`skills/sigilsmith/SKILL.md`](skills/sigilsmith/SKILL.md). Agents developing it: [`AGENTS.md`](AGENTS.md).

MIT © Thor Whalen
