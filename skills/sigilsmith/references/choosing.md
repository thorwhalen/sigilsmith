# Choosing a generator

Each catalog row carries the A4 criteria: `style` (abstract → geometric → illustrative → photorealistic), `semanticLevel` (hash → metadata → embedding → llm), `gzipBytes` (measured: the generator's incremental cost on top of the kernel), `network`, `cost`, `license`/`mitCompatible`, `determinism` and `sizeRange` (smallest legible px). Implemented generators (`implemented: true`) can be wired today; survey drafts describe what could be added.

| Need | Start with |
|---|---|
| Tiny, abstract, any list | `rings@1`, `shapes@1` |
| GitHub-style identicon | `grid@1` (in-house) or `minidenticons@1` (MIT adapter; install `minidenticons@4.2.1` exactly) |
| People | `initials@1` (or the `people` preset, which suggests it for `user`/`person`/`contact` items) |
| Concrete, readable at 24 px, a hint of meaning | `emoji@1` (keyword match on title/tags, else hash) |
| Several looks mixed in one list | a weighted rule: `"use": { "rings@1": 2, "shapes@1": 1 }` (deterministic per item) |
| AI or a hosted service | `remote` entries (proxy, BYOK module, DiceBear HTTP, mock for tests); the placeholder (`policy.placeholder`, default `grid@1`) shows while it works |

Budget: `budget.maxGzipBytes` covers the kernel (~4.2 kB gzip), the delivery module (1.7 kB, unless `derived`), the React adapter (1.9 kB, if used), the remote module (2.7 kB, if any remote ref) and every generator the config can select. Generators load lazily, one chunk each, but the budget counts them all. It is a total; `catalog --max-gzip` filters single generators by their own size over the kernel. When `check` reports SGS0401, its fix names the room left for the largest generator (`catalog --max-gzip <room>`), or, if the kernel and modules alone exceed the budget, the budget that would pass.

Research behind the catalog: `docs/research/generator-survey.md`; measured sizes and contact sheets for third-party libraries: `spikes/README.md`.

## Terms of use

Catalog rows carry `terms` (licence and service restrictions): read them before choosing, and tell the user about any that apply. The public DiceBear API (`"transport": "dicebear"`) is free for **non-commercial** use only: a commercial app self-hosts it and sets `baseUrl`; a non-commercial app acknowledges the terms with `"use": "non-commercial"` (otherwise `check` warns with `SGS0107`). DiceBear styles also carry their own licences (CC0, CC BY 4.0 with attribution, or the artist's terms).
