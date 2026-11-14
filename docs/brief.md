---
title: "Agent brief — browser-side identity image (thumbnail) generator package"
author: Thor Whalen
status: FINAL v1
---

# Agent brief — browser-side identity image generator package

## 0. How to read this brief (for the coding agent)

- **Part A — Vision** is the author's own statement, lightly edited from dictation. It is the authoritative statement of intent. When anything later in this brief seems to conflict with Part A, Part A wins; flag the conflict instead of resolving it silently.
- **Part B — Decisions & constraints** turns the vision into explicit choices so you don't fall back on your own defaults. Each item is tagged:
  - **DECIDED**: follow it.
  - **DEFAULT**: follow it unless research gives a strong reason not to; if you deviate, say why.
  - **OPEN**: a question your research must answer with a recommendation. Do not settle it yourself in code.
- **Part C — Research brief**: what to research, with seed terms and sources.
- **Part D — Deliverables & stopping point**: what to produce (research, design, then an MVP), and where to stop and hand back for review.
- **Glossary**: the author's terms mapped to standard ones. Use the standard terms in docs and code, and mention the author's term where it helps.

---

## Part A — Vision (author's words, cleaned from dictation)

**A1. The problem.** I want to create a new package, a JavaScript one. The problem this package solves is enabling browser-side image generation for a variety of needs, with a particular focus on creating unique thumbnails. This problem comes up any time we have a list of things. It could be a media player, where we have lists of songs, or an app with a list of users, projects, documents, etc. The most common way to display an item in a list is with a card (or some other consistent template) that holds a name and possibly a selection of the item's metadata, and which metadata gets shown depends on the context. In some cases, such as GitHub users or items in a media player, we also get an automatic thumbnail, which can then be replaced by a custom image if desired. I find this approach very good for UX, because the mind gauges identity much more easily from an image than from words. A title can give a sense of the content, if the title is relevant to the content, but what I'm talking about is *identity*. Once an identity has a place in the user's mind, the item's characteristics can snowball around it dynamically. In fact, I even wonder whether this gathering of characteristics (this "moss") accrues more easily when the symbol for the identity is more abstract, rather than explicit the way a title is. I'd like a bit of research on this, so that we can point to it in the background-research appendix of our documentation.

**A2. Purpose.** But I digress. The purpose of this package is to serve that use case: to give people a wide choice of ways to create an automatic thumbnail, favicon, or similar, for a particular app in a particular context.

**A3. Agent-first.** This package will be *agent-first*. By that I mean we recognize that, at present and more and more in the future, code will be developed not by humans but by AI agents. So a priority is to make the package useful to those agents.

**A4. A builder package.** The package is meant to be a *builder* package. That is, it is not a package that gets imported in the target application. Instead, it is used to create or parameterize the thing that will be included in the app. I don't know what this technique or design pattern is called; please look it up so we follow best practices. I picture the developer (human or agent) wanting to add this functionality to an existing app, or to one they're about to develop, and then having a menu of possible *image generators*. (Note: I'm not sure what to call these, since "image generation" is often taken to mean gen-AI only nowadays. I mean any function whose output includes an image.) The developer can choose which image generator(s) to use, one or several, based on various criteria:

- Maybe whatever gets included in their app has to be very lightweight. By default the image-generation functionality will be lazy-loaded, but even then they may want a cap on how many kilobytes need to be loaded.
- Maybe they will choose functionality that calls an external service through an API. Maybe it's free, maybe they pay for it, maybe they use a bring-your-own-token system that makes the user pay for it.
- Maybe they want the images to be on the abstract side, or to show actual concrete objects, or even to be photorealistic.
- Maybe they need the image to work as a very small thumbnail, or maybe they need a bigger image that actually has some distinguishing details.
- Maybe they want the image to relate to some characteristics of the item it represents. Within that constraint, it could be as semantically oblivious as a hash-based mapping, or, at the other end of the spectrum, it could use a large language model to make the image as relevant as possible to the semantics of the target item, with everything in between those two extremes.

**A5. Minimal output.** Whatever they choose, the developer should be able to pick what they want and then get the lightest possible code, which they can use to integrate this functionality wherever they need it in their application.

**A6. Combining generators.** Sometimes the developer will choose a single system. Sometimes they will want several, plus some mechanism to choose between them. That mechanism could be a simple weighted random selection (of the image generator), or a context-sensitive one (for example, videos use one kind, audio another, etc.). The developer may even want to let their users control this in their own settings. Our package should give them the ability to do that too.

**A7. Aggregator + façade + agent primitives.** So this package needs to:
1. be an extensible aggregator of many varied, and quite different, options;
2. act as a façade over them, to simplify interoperability and integration;
3. include agent primitives that help the developer choose the right thing, tune it, and integrate it.

**A8. Framework vs. agent-written code.** A package can offer this kind of adaptability in two ways. One is a parametrizable framework, possibly with a compile phase that reduces the code and resources that have to ship to the user's browser. The other is to let the developer's agents write the code, with the package providing well-tuned instructions, example code, suggestions, etc. I think the optimal balance lies somewhere between those two extremes. I'd like deep research on this, so that we can carefully choose the right balance for our current context.

**A9. Parameterization, defaults and maintainability** (added after review). Which item fields decide the image should not be a fixed rule; it depends. For some systems I'll want the image decided by the item's ID. For others I'll want it decided by the name or a description. For example, a song has a title and maybe its lyrics are available to the system, and I may want a particular thumbnail generator to look at the title, or even the lyrics, and decide based on those. More generally, the developer should be able to parameterize everything, to the fullest extent possible. Remember that the developer will often be an agent, so that is always good to have. But it's also good to have smart defaults wherever possible. An ID can also come in several forms, so we need logic that determines whether there is an ID and, if so, what it is; the ID may even be an aggregation of several fields. Finally, everything must be set up so it can be maintained well. For example, a field that serves as the ID at build time may later be renamed. When that happens, it should be changed in one single-source-of-truth configuration file, not by going through all the code and changing every place it appears. So however this builder package guides agents, and whatever code it provides, it must separate concerns and follow single source of truth, so that the developer or the agent can easily change these choices later.

**A10. Integration surfaces** (added after review). I mentioned favicons, but these identity images can be used in many places, and several of those places are standard ways of registering an image so it gets picked up: by the browser's icon, or by WhatsApp when you paste a URL and an image comes up, and so on. I want the agents, and the code in the package, to be well aware of these targets, so they can help the developer (or the developer's agent) set things up and integrate them properly.

**A11. Where compute happens, and where images live** (added after review). In general I want most of the compute to happen on the browser side, so that things scale as more users come. The most common use case, and probably the default: when a person creates a new item (say, a new song), its image is generated in the browser and sent to the server, where it is stored as that item's image and served back whenever the item is viewed. If the user chooses to change the image, the image they provide also goes to the server the same way. I can also see a use for on-the-fly creation of the image from the item's metadata, especially when the generator is deterministic. That could make things even more scalable (bandwidth, storage). I don't know whether this has been done before or whether it has a name, but it's worth exploring, with its pros, cons and gotchas, and the package should cover it. Wherever there is more than one option, we should not hard-wire one; we should at least leave a seam there, so the design stays open–closed.

**A12. When the item's inputs change** (added after review). If the image is derived from the name and the name changes, the image should not systematically change. I'm not even sure what the default should be. It should be able to go either way, depending on what the developer decides at build time. There may even be a hybrid that leaves the choice to the user. For example, a user makes a song, its image is created from the title, and later they change the title; they get a small prompt asking whether they want to change the image too or keep the same one. I think that is probably the better default, but I'm not sure. The research should tell us, and the coding agent must look into it.

**A13. Use zodal** (added after review). Any UI abstraction, and definitely any storage abstraction, should be done through my zodal package ecosystem.

**A14. Technologies to research.** Below is a list of technologies to research in the context of this package. Do not restrict yourself to these, but do include all of them in your research scope, so that the research is solid enough to develop the package from.

> Note: this list was compiled quickly. Some names, descriptions, sizes or groupings may be inaccurate, outdated, or refer to things that don't exist under that name. Verify each one; if an item can't be found, say so and suggest the most likely intended item.

**Identicons & deterministic visual hashing (GitHub-style)**
- Jdenticon: sharp geometric SVG/PNG identicons
- Blockies: Ethereum-style pixelated mirrored grids
- Minidenticons: ultra-lightweight (~1 KB) SVG GitHub-style identicons
- Hashicon: isometric shaded-cube identicons
- Avvvatars / Multiavatar: deterministic shape + character/symbol systems

**Parameterized geometric & pattern generators**
- Boring Avatars: Bauhaus, marble, beam, sunset, ring SVG themes
- DiceBear: modular deterministic SVG library with 30+ styles
- Trianglify: parameterized Delaunay low-poly triangle meshes
- GeoPattern: GitHub's repo-header generator (chevrons, hexes, sine waves from a string hash)
- PatternPad / SVG.js: grid-based primitive shapes + constrained color palettes

**Mesh gradients, noise & shader fields**
- MeshGradient.js / Stripe-style WebGL gradients: multi-point animated/static color blends
- simplex-noise / Perlin noise: organic flow fields, marble textures, topographic lines
- glsl-canvas: tiny WebGL fragment-shader runner for aurora/fluid gradients
- Rough.js: hand-drawn, sketchy parameterized SVG/Canvas primitives

**HTML/CSS to image (template cards)**
- Satori (Vercel): JSX/CSS → SVG/PNG, Node/Edge/WASM
- Takumi (Rust): fast HTML/CSS → image
- html-to-image / dom-to-image: browser DOM → PNG/SVG

**Creative coding & low-level 2D runtimes**
- HTML5 Canvas / SVG: zero-dependency native browser APIs
- p5.js / Two.js: 2D algorithmic drawing engines
- Paper.js: vector graphics scripting

**Stock photo + text compositing**
- Unsplash API / Pexels API: free keyword image search
- Sharp (Node.js) / Pillow (Python) / Canvas (browser): fast resizing, tinting, text overlay

**Lightweight / distilled AI models (local & server)**
- SD-Turbo / SDXL-Turbo: 1–4-step generation
- LCM (Latent Consistency Models): 4-step fast diffusion
- FLUX.2 [klein] 4B / Iris-3B: compact, fast open weights (~2–3 GB at Q4)
- Bonsai Image: 1-bit/ternary quantized (~1 GB)

**In-browser AI runtimes (WebGPU/WASM)**
- ONNX Runtime Web: browser GPU execution
- Transformers.js: Hugging Face JS wrapper for WebGPU/WASM
- WebSD / sd-1-5-webgpu: client-side Stable Diffusion via WebGPU

---

## Part B — Decisions & constraints

### B0. Overarching rules (apply to everything below)
**DECIDED.**
1. **Parameterize everything; default everything.** Every behavior is a parameter, and every parameter has a smart default (see B4 for the layering). A developer (usually an agent) can get a working result with zero configuration and override any single choice without touching the others. This is progressive disclosure.
2. **One configuration file is the single source of truth (SSOT).** These choices all live in one declarative, zod-validated config: key resolution (B4); which fields feed each generator; selected generators and their params and versions; policy/selector rules; presets and budgets.
3. **No hard-coded choices downstream.** Generated code, copied-in code and agent-written integration code must *read* the config; they must never inline a field name, generator choice or param. Renaming a data field should be a one-line config change.
4. **Separation of concerns.** Keep these as separate, independently swappable layers: key resolution; input selection (which fields a generator reads); generation; selection policy; caching; rendering/framework adapters.
5. **Drift detection.** A `check` command verifies that config, code and data agree. It catches a key field that no longer exists in sample data, keys that are no longer unique, a pinned generator version that has changed, and code that bypasses the config. It must say exactly how to fix each problem.
6. **Introspection.** For any item and config, an agent can ask what will happen and why: which key, which fields, which generator, which params, and which layer of defaults each value came from.

### B1. Scope of this run: research → design → MVP, then stop
**DECIDED.** This run covers three phases, in order: (1) Research: Part C. (2) Design proposal: D9. (3) MVP: D10. Build it following *your own* design recommendation, including the distribution model chosen in B9.

Write research and design down **before** writing MVP code, and keep the MVP consistent with the design. If building the MVP shows the design was wrong, update the design doc and say so. Do not silently diverge from it.

Throwaway *spikes* (bundle-size measurements, contact sheets) are allowed and encouraged during research. Do not create remote repos, push, publish to npm, or sign up for paid APIs. Work in a local git repo only.

### B2. Working vocabulary (DEFAULT; you may propose better names after research)
- **Item**: the thing being represented (song, user, project, document…).
- **Item key**: a stable identifier for the item (see B4).
- **Generator**: any function `item (+ params) → image`, whether procedural, compositing, retrieval (stock photos) or AI. This replaces the ambiguous term "image generator" (A4).
- **Manifest**: machine-readable metadata describing a generator (see B10). The set of manifests is the **catalog** (the "menu" in A4).
- **Policy / selector**: the rule that picks a generator for a given item and context (A6).
- **Integration output**: the code/config that ends up in the target app (A5).

### B3. Determinism and stability
**DECIDED.** The image *is* the item's identity (A1), so by default **the same item must get the same image** across reloads, sessions, devices, users and deploys. As a result:
- All randomness must be seeded from the generator's resolved inputs (B4); by default these are the item key. Never use `Math.random()` in a generator or in selection.
- Weighted selection between generators (A6) must be **deterministic per item** (hash-based bucketing), not re-rolled on each render. It is "random" across items, stable for a given item.
- Generators are **versioned**. A change to an algorithm that alters outputs is a breaking change, so the integration must be able to pin generator versions.
- Non-deterministic sources (diffusion models, LLMs, stock-photo search) must have their results **cached/persisted**, keyed by item key + generator id/version + params. Each manifest declares the generator's determinism level.
- The developer can opt out explicitly (e.g. "fresh image each time").

### B4. Input contract: key resolution, field selection and smart defaults
**DECIDED** (A9). Two separate, configurable steps run before any generator. Define every contract here as a zod schema.

**B4.1 Key resolver: what is the item's ID?**
- **Explicit first.** The config names one of: a single field (supporting nested paths, e.g. `meta.uuid`); a **composite key**, i.e. an ordered list of fields (e.g. `artist + title + year`); a custom key function.
- **Canonical composite keys.** Composite keys are serialized canonically (fixed field order, normalized values, unambiguous separators/escaping), so the same item always yields the same key.
- **Detection as fallback.** Look for common ID fields in a documented priority order (e.g. `id`, `_id`, `uuid`, `key`, `slug`, `url`, `path`/`filepath`, `isbn`/`isrc`…). Research and justify the list.
- **Detect once, at build/setup time, not silently at runtime.** The agent runs detection on sample data. The CLI reports what it chose, why, and how unique and complete it is across the samples. The choice is then **written into the config** (B0.2), so it can't shift later.
- **Warn loudly** when: no stable key is found; the key isn't unique across the samples; the key is missing for some items; the chosen field looks unstable (e.g. a display title or a timestamp).
- **Runtime fallback.** If an item lacks the configured key, the default is to fall back to a declared secondary (e.g. a composite of title + type) and emit a warning. Strict mode (throw) is configurable.

**B4.2 Input selection: which fields does a generator read?**
- Per generator (and per policy rule), the config declares which fields feed it: the key, `title`, `description`, `tags`, `lyrics`, any custom field, or a combination.
- For hash-based generators, these are the fields that get hashed. Docs and `explain` output must state the trade-off: hashing the title means renaming the item changes its image; the developer chooses that knowingly.
- For semantic generators (the middle and right of the A4 spectrum), these are the fields interpreted, e.g. a song's title and lyrics passed to an LLM or embedding model. Declare size limits and truncation rules for long fields like lyrics.

**B4.3 Smart defaults, in layers** (lowest priority first; each layer overrides the previous):
1. **Generator defaults**: each manifest declares its default inputs. Hash/identity generators default to the resolved key; semantic generators default to `title` + `description`.
2. **Presets by item type**, e.g. a `media` preset where songs also read `lyrics` when present, or a `people` preset where users get initials/avatars.
3. **Project config** (the SSOT file).
4. **Per-rule overrides** in the policy.
5. **End-user settings** (B15), within the limits the developer allows.

Missing optional fields degrade gracefully: the generator uses what's present and records what was missing. `explain` (B0.6) reports which layer supplied each value.

### B5. Output contract and loading behavior
**DEFAULT**, to be refined in design:
- Prefer **SVG** wherever the generator allows: tiny, scalable, crisp at favicon size, and renderable server-side. Use raster output (Blob/object URL/canvas) only when necessary.
- Use one **async** interface for all generators (remote/AI ones are inherently async). Consider a sync fast path for pure SVG generators.
- **Progressive enhancement**: when a slow or remote generator is chosen, show an instant deterministic placeholder (e.g. a cheap hash-based generator), then swap in the result. Define failure and timeout fallback.
- Lazy loading via dynamic `import()` is the default (A4). The kilobyte cap in A4 is a **budget** that the integration step checks and enforces.

### B6. Resolution order (custom images)
**DEFAULT.** A1 says automatic thumbnails can be replaced by custom images. Provide a resolver with this order: **custom image (if any) → end-user preference (A6) → developer policy → default generator**. Custom images and generated images are stored through the same injected storage path (B18, B20); the package never decides where images live.

### B7. Runtime targets
**DEFAULT.** Browser first (A1). Where it costs nothing, keep pure generators **isomorphic** (browser + Node + edge), so the same output can be pre-generated at build time, rendered server-side, or used for OG images/favicons. Each manifest declares runtime support (browser, Node, edge, WebGPU-required, network-required).

### B8. Stack
**DEFAULT.** TypeScript and ESM only. Use **zod** schemas as the single source of truth for generator params, manifests, policy and settings: validation, docs, CLI/agent tool schemas and settings UI all derive from them. **DECIDED:** UI and storage abstraction go through **zodal** (B20). **DECIDED:** the core is **framework-agnostic** (vanilla TS), with an optional **React** adapter; any UI follows shadcn/ui conventions. Use zustand/immer only where real state exists (e.g. end-user settings). You may choose the build, test and monorepo tooling (e.g. pnpm, tsup/tsdown, Vitest, changesets), but justify each choice in one line.

Design values to apply (from the author's general preferences): progressive disclosure (simple things simple, complex things possible), façade over many backends, plugin architecture (adding a generator = adding a module + manifest, with no core edits; open–closed), dependency injection (storage, fetch, cache, secrets provider), functional and declarative over class hierarchies, composition over inheritance. Don't be dogmatic about any of these.

### B9. Distribution model — OPEN (central research question)
This is the heart of A4 and A8. Do not settle it in code. Compare at least these options:
1. **Runtime library** on npm, with tree-shakable per-generator entry points.
2. **Copy-in registry** (shadcn/ui "open code" model): a CLI writes generator source into the host project, which then owns it.
3. **Build-time compile/codegen**: a config file goes in, and a minimal generated module (or a bundler plugin/virtual module) comes out.
4. **Agent-authored code**: the package ships skills/recipes, golden examples and conformance tests, and the developer's agent writes the integration.
5. **Hybrids** (e.g. a tiny shared runtime core plus copy-in generators plus agent recipes for the glue).

Criteria: bytes shipped; how bug fixes and upgrades reach integrations (especially copied or agent-written code); version pinning and determinism (B3); agent ergonomics; maintenance burden; testability; license compliance (B13); ease of adding third-party generators.

### B10. Generator manifest (the "menu")
**DECIDED (shape is DEFAULT).** Every generator has a machine-readable manifest, defined in zod. The manifest is the single source of truth for docs, catalog filtering, agent tools and the size budget. Proposed fields, each tied to the criteria in A4:
- `id`, `version`, `name`, `description`, `upstream` (library/service + URL), `license`
- `bundleSize` (min+gzip and brotli, **measured** from a minimal real import, not copied from READMEs), `lazyLoadable`
- `runtime` (browser / node / edge; needs WebGPU? needs network?)
- `cost` (free / paid / BYOK / free-tier limits), `requiresSecret`
- `style` on an abstraction axis: abstract → geometric → illustrative/concrete → photorealistic
- `semanticLevel` on a semantics axis: hash-only → metadata-mapped (e.g. type → shape, tag → hue) → embedding-driven → LLM-driven
- `sizeRange` (smallest size where items stay distinguishable, largest size before it looks empty), `outputFormat` (svg / png / …)
- `determinism` (pure / seeded / cached-nondeterministic), `latency` (typical, measured where possible)
- `paramsSchema` (zod), `examples`

### B11. Agent primitives (A3, A7)
**DEFAULT**, to be refined by research (C4). Assume the consuming agent works in a terminal and a repo. Candidate primitives:
- **Catalog query**: filter generators by constraints ("abstract, ≤ 3 kB gz, no network, good at 32 px").
- **Preview**: render a contact sheet (N sample items × sizes, light/dark backgrounds) to PNG/HTML, so the agent (and human) can *see* candidates.
- **Scaffold/integrate**: produce the integration output for a given project (framework, bundler, policy).
- **Tune**: adjust params and palette, then re-preview.
- **Detect key**: run key detection on sample data and write the result into the config (B4.1).
- **Explain**: for an item (or sample set), show the resolved key, inputs, generator, params, and which default layer supplied each (B0.6).
- **Check**: validate the size budget, determinism (same inputs → same bytes), the config schema, and drift between config, code and data (B0.5).

Candidate surfaces: a CLI with `--json` output, `AGENTS.md`, `llms.txt`, a Claude Code skill, and possibly an MCP server. Recommend which ones, and in what order. Error messages should tell the agent what to do next.

### B12. Secrets, paid APIs and terms of use
**DECIDED.** Never put a developer's API keys into a client bundle. Cover these patterns: developer-hosted proxy endpoint; BYOK (end user supplies their own key, stored client-side with clear consent); keyless free services. Also cover rate limits, cost caps, and caching so the same item never triggers a repeat paid call. Record each service's terms (e.g. attribution and hotlinking requirements for stock-photo APIs).

### B13. Licensing
**DECIDED.** Record the license of every library, style, asset set and model weight in its manifest. Some avatar style packs and model weights carry restrictions (attribution, non-commercial use, etc.); flag them. The package's own license is **MIT**. Do not bundle code or assets whose license is incompatible with MIT distribution; reference them as optional, user-installed dependencies instead.

### B14. Quality criteria for identity images
**DEFAULT.** Evaluate generators on: **distinguishability** at small sizes (16/32/48 px up to ~256 px); **collision / near-duplicate rate** over a set of N items; legibility on **light and dark** themes; **accessibility**: images that sit next to the item's name are usually decorative (`alt=""`), so state the rule; **safety of semantic/AI output**: moderation, and nothing offensive generated from user-supplied titles.

Build a small evaluation harness (contact sheets + simple metrics) as one of the spikes.

### B15. End-user settings (A6)
**DEFAULT.** Provide a policy/settings **schema** and a **headless** settings model, plus an optional settings component. Build these on zodal-dials and zodal UI renderers (B20). Persistence is injected; the package does not choose where settings live.

### B16. Name, repo, org
**DECIDED:** the repo will live in the **`thorwhalen`** GitHub org (`thorwhalen/<name>`); create it locally only (B1). **OPEN:** the name. Propose 5 names with npm-name availability checked, pick one provisionally for the MVP, and make it trivial to rename (a single constant/config, no name hard-coded across files).

### B17. Integration targets (A10)
**DECIDED.** The package knows the standard surfaces where an identity image gets registered or picked up. It keeps them in a **target registry**: pluggable, zod-described, and extensible without core edits. Each target declares: its required sizes, formats and color/background rules (e.g. maskable safe zone, transparency allowed or not); whether it must be served from a **stored URL** (fetched by crawlers or the OS) or can be rendered client-side; the exact registration snippet: HTML `<link>`/`<meta>` tags, web app manifest entries, or JS API calls.

Initial targets (research must verify current specs and sizes, and add any that are missing):
- **Browser icons**: favicon (SVG + PNG/ICO fallbacks), Apple touch icon, web app manifest icons (incl. maskable), Safari pinned-tab icon, Windows tiles.
- **Link previews ("unfurling")**: Open Graph `og:image`, Twitter/X Card. WhatsApp, Slack, iMessage, LinkedIn and others read these.
- **OS/media surfaces**: Media Session API artwork (lock-screen and notification art for playing media), Notification API icon/badge, PWA shortcut icons.
- **In-app**: list/card thumbnails and avatars at the app's own sizes.

Key constraint: link-preview crawlers and the OS don't run the app's JavaScript, so those targets need a **stored** image at a stable URL (see B18). Add a `targets` agent primitive: list targets, emit the images and snippets for a chosen set, and have `check` validate that they are registered correctly (right sizes, tags present, URLs absolute where required).

### B18. Delivery strategy: where images are generated and stored (A11)
**DECIDED** that this is a pluggable **strategy** with these built-ins:
1. **Generate once, store** (**default**). The browser generates the image when the item is created, uploads it through the injected storage (B20), and the server serves the stored file from then on. Custom images use the same upload path. This also satisfies stored-URL targets (B17).
2. **Render on the fly**. Nothing is stored; each viewer's browser derives the image from the item's metadata every time. This is only suitable for deterministic, lightweight generators.
3. **Hybrid**. Render on the fly for instant display, and keep a stored copy for surfaces that need one (B17) or for slow/AI generators.

General principle: push compute to the browser by default for scalability. Server-side generation stays possible as just another strategy (open–closed), not a hard-wired path.

**OPEN (research):** what is this trade-off called, and what are the gotchas? Seeds: derived/procedural assets; precompute (materialize) vs. compute-on-read; compute vs. storage/bandwidth trade-off; content-addressed caching. Gotchas to examine: stored-URL targets still need a stored copy; generator version changes silently alter on-the-fly images (B3 pinning); heavy generators cost compute on every view; canvas/font rendering differs across browsers (output not byte-identical); upload trust and validation: the server receives client-made images, so check size, type and content, and consider abuse.

### B19. Regeneration policy when inputs change (A12)
**DECIDED** that this is a developer-configurable policy, applying when the fields feeding an item's generator change (e.g. a title edit): `always`: regenerate, so the image follows the inputs; `never`: keep the existing image; `ask`: prompt the user ("Update the image too?"). This is a headless hook plus an optional UI component.

A custom (user-uploaded) image is **never** overwritten without explicit consent. With on-the-fly rendering nothing is stored, so the image follows its inputs automatically; say so in `explain`. **OPEN (research):** which policy should be the default? The author leans toward `ask`. Look for UX evidence and conventions (how existing products handle avatar/thumbnail changes after renames) and recommend one.

### B20. zodal for UI and storage abstraction (A13)
**DECIDED.** zodal is the author's own ecosystem: schema-driven affordances on Zod 4, in the `i2mint` GitHub org, published on npm under the `@zodal/*` scope. Use it for UI and storage abstraction instead of writing custom adapters. **Before designing, read the READMEs** of the packages below (on npm and on GitHub under `i2mint`). Where they overlap with this brief, **build on them rather than duplicate them**:

| Concern in this brief | zodal piece to evaluate |
|---|---|
| Key resolution and `explain` (B4.1, B0.6) | `@zodal/core` (`defineCollection` infers `idField` and `labelField`; `explain()` traces inference layer by layer). Align or extend rather than re-implement. |
| Image and cache storage, uploads (B6, B18) | `@zodal/store` (`DataProvider` + capability discovery) and adapters: `store-http`, `store-s3`, `store-supabase`, `store-localstorage`, `store-fs` |
| SSOT config, layered defaults, end-user settings (B0.2, B4.3, B15) | `zodal-dials` (`@zodal/dials-*`): settings cascade with effective value + provenance, plus headless settings UI |
| BYOK / secrets (B12) | `@zodal/dials-store-secret`: routes secret values to a separate backend |
| Settings UI, React/vanilla renderers (B8) | `@zodal/ui`, `@zodal/ui-shadcn`, `@zodal/ui-vanilla`; also `toPrompt()` for agent-readable descriptions |
| Client-side caching/persistence | `holdall` (agent-first client-side persistence) |
| Media Session artwork (B17) | `zodal-media`, if relevant |

These packages are young (0.1–0.2). If zodal lacks something this package needs, don't work around it silently. Note it as a proposed upstream addition in the design doc, and keep any local shim thin and clearly marked.

---

## Part C — Research brief

General rules: verify claims against primary sources (official docs, repos, papers). Date-stamp anything fast-moving (model releases, WebGPU browser support, agent tooling conventions) and don't rely on training memory for these. Separate established findings from your own speculation. Use **Vancouver-style citations** ([1], [2], …) with a **REFERENCES** section at the end of each report, as `[name](url)` links where possible.

**C1. Identity, images and memory** (A1; this becomes the background-research appendix). Questions: Is identity recognized faster or better from images than from text labels? Do abstract or arbitrary symbols accumulate associations (A1's "moss") more easily than descriptive labels, or less easily? What makes a visual identifier distinguishable? Seed terms (starting points, not conclusions): picture superiority effect; recognition vs. recall; pre-attentive features and visual search (color, shape); object files / visual indexing; elaborative encoding and associative networks (spreading activation); distinctiveness / von Restorff effect; the Baker–baker paradox (arbitrary vs. meaningful labels); icon research on concreteness, complexity and semantic distance (e.g. McDougall et al.); hash visualization (Perrig & Song, "random art"); SSH randomart; usability studies of visual key fingerprints (e.g. Tan et al., CHI 2017). If there is no direct evidence for the "abstract accretes more moss" hypothesis, say so plainly and present the nearest related findings.

**C2. The "builder package" pattern** (A4). What is it called, and what is current best practice? Seeds: code generation / scaffolding; shadcn/ui registry and "open code"; copy-in vs. dependency; compile-time / zero-runtime libraries (e.g. Svelte, vanilla-extract, Panda CSS); bundler plugins (unplugin, Vite virtual modules); tree-shaking and code-splitting; bundle budgets (e.g. size-limit); headless components; "eject" patterns.

**C3. Framework vs. agent-written code** (A8, B9). Where should the line fall between shipped, tested code and code written by the consumer's agent? Questions to cover: which parts must stay in tested code (hashing, seeding, versioning, budget checks), and which can safely be agent-written glue; how agent-written integrations stay upgradeable; using conformance tests as the contract an agent's code must pass; golden examples and recipes/skills. End with a concrete recommendation for our context.

**C4. Agent-first package design** (A3). Current conventions and evidence: `AGENTS.md`, `llms.txt`, Claude Code skills, MCP servers, CLIs with JSON output, typed schemas, actionable error messages, examples-as-tests, "agent experience (AX)". What actually helps agents choose, tune and integrate correctly?

**C5. Technology survey** (A14 + additions). For each technology, fill in the B10 manifest fields as far as possible, plus maintenance status (last release, activity). Produce a comparison table, and measure bundle sizes in a spike rather than quoting them. Add these categories, which the author did not list (author's list is not exhaustive): initials / letter avatars; emoji + background color (Notion/Slack style); icon-set mapping (Lucide, Iconify, Phosphor…) chosen by hash, keyword, embedding or LLM; **LLM-written SVG** (an LLM emits the SVG directly); **text embedding → generator parameters** (the middle of the semantics spectrum), including in-browser embeddings via Transformers.js; in-browser LLMs for semantic choices (e.g. Chrome built-in AI / Gemini Nano, WebLLM); hosted image APIs (e.g. OpenAI, Google, Black Forest Labs via fal/Replicate, Recraft for vector/icon output); deterministic palette generation (hash → OKLCH palettes), since color drives distinguishability; compact placeholders (BlurHash/ThumbHash) for progressive loading and caching.

Finally, place every generator on the **abstraction × semantics** grid from A4.

**C6. Integration, delivery and regeneration** (B17–B19). Cover: the current specs for each integration target (sizes, formats, registration, crawler behavior — e.g. which platforms accept SVG for `og:image`, which don't); the delivery-strategy trade-offs and their names (B18); UX evidence for the regeneration-policy default (B19); security of accepting client-generated uploads.

---

## Part D — Deliverables & stopping point

Write everything as Markdown, authored by "Thor Whalen", in the working repo:

1. `docs/research/identity-and-images.md`: C1, written as the background-research appendix.
2. `docs/research/builder-pattern-and-distribution.md`: C2 + C3, ending in a recommendation on B9.
3. `docs/research/agent-first-design.md`: C4.
4. `docs/research/generator-survey.md`: C5, with the comparison table and the abstraction × semantics grid.
5. `docs/research/integration-and-delivery.md`: C6.
6. `docs/research/zodal-fit.md`: a short map of which zodal packages cover which needs, with gaps proposed as upstream additions (B20).
7. `catalog/` (draft): one manifest per surveyed generator, validated by the zod manifest schema.
8. `spikes/`: bundle-size measurements and contact sheets for the 6–10 most promising lightweight generators, with a short README of the results.
9. `docs/design/proposal.md`. Contents: recommended architecture and distribution model; public API sketches (TypeScript signatures); manifest, policy and settings schemas; the determinism/versioning scheme; the agent primitives and their surfaces; one end-to-end walkthrough, e.g. a developer's agent asked for "abstract thumbnails ≤ 5 kB, no network, for a project list, with a type-based policy: videos one style, audio another"; risks; **open questions for the author**.
10. **MVP**, built per D9. Minimum scope (more only if it's cheap and doesn't delay these):
   - **Config**: the single SSOT config file and its zod schema (B0), with layered defaults and presets (B4.3), including at least a `media` preset (songs reading title + lyrics).
   - **Core**: zod schemas (item, manifest, params, policy, settings); the key resolver (explicit field, composite key, custom function, detection with uniqueness report; B4.1); per-generator input selection (B4.2); stable hashing + seeded PRNG; a deterministic palette helper; the **policy/selector** with both deterministic weighted selection and context rules (e.g. by `item.type`, per A6); the **resolver** from B6; lazy loading via dynamic `import()`; a cache interface (injected).
   - **Generators**: 4–6 lightweight, zero-network generators covering different points on the abstraction axis. At least one should be written in-house (tiny SVG, no dependencies) and at least one should wrap a third-party library from the survey, to prove the façade/plugin pattern.
   - **One async/remote generator path**, end to end: secret-safe interface (proxy or BYOK, per B12), result caching keyed per B3, and an instant placeholder with fallback (B5). A mock backend is acceptable if no free keyless service fits.
   - **Delivery** (B18): the generate-once-and-store strategy (default) through a zodal `DataProvider` (in-memory or HTTP adapter for the demo), the render-on-the-fly strategy, and the hybrid.
   - **Regeneration policy** (B19): `always` / `never` / `ask`, with the `ask` hook wired into the demo (rename a song → prompt).
   - **Integration targets** (B17): at least favicon, Apple touch icon, manifest icons, `og:image` and Media Session artwork. Emit images + registration snippets, and have `check` validate them.
   - **React adapter**: a thumbnail component plus a headless settings hook (B15), built on zodal UI/dials (B20).
   - **Agent primitives** (B11): at least catalog query, preview (contact sheet), detect-key, explain, targets and check (budget, determinism, drift, target registration) as CLI commands with `--json`; plus `AGENTS.md` and a Claude Code skill explaining how to choose, tune and integrate.
   - **Tests**: determinism (same inputs + version → identical output); key resolution (composite canonicalization, detection, fallback); default layering; budget checks; drift detection (e.g. renamed field in data → `check` fails with a fix hint, and a one-line config change fixes it); schema validation; policy selection.
   - **Example**: a minimal demo app showing a list of mixed item types (e.g. songs, videos, users) using a type-based policy plus an end-user setting.
   - `README.md` with progressive disclosure: a 3-line quick start first, depth after.

**Stop after D10.** Summarize the key recommendations, what the MVP does and doesn't do, measured sizes, and open questions. Then wait for review. Do not push or publish.

---

## Glossary — author's terms → standard terms

| Author's term (dictated) | Standard / expert terms |
|---|---|
| agent-first | agent-first, agent-native; *agent experience (AX)*, by analogy with DX |
| builder package, not imported in the app | build-time / dev-time tool; code generator; scaffolder; shadcn-style "open code" registry (copy-in components); compile-time or zero-runtime library; vendoring |
| image generators (not only gen-AI) | procedural / generative graphics; identicons; deterministic avatars; *generators* or *renderers* in this package |
| ID "detector"; ID made from several fields | key resolution / key extraction; ID-field detection (schema inference); composite key; canonical serialization |
| one place to change choices later | single source of truth (SSOT); declarative config; configuration drift detection |
| parameterize everything, with smart defaults | progressive disclosure; convention over configuration; layered/cascading config (defaults → presets → project → overrides) |
| places an image gets "registered" (browser icon, WhatsApp preview) | favicon / touch icon / web app manifest icons; Open Graph protocol, Twitter Cards; link-preview "unfurling"; Media Session API artwork |
| generate in browser, store on server vs. create on the fly | precompute/materialize vs. compute-on-read; derived/procedural assets; compute–storage–bandwidth trade-off |
| what happens to the image when the name changes | regeneration (invalidation) policy |
| hash-based mapping | hash visualization; visual hashing; identicon; seeded PRNG |
| choosing between generators | strategy pattern + policy/router; deterministic weighted selection (hash bucketing) |
| compile phase to reduce code | tree-shaking, dead-code elimination, code-splitting, bundle budget |
| lazy loading | dynamic `import()`, code-splitting |
| bring your own token | BYOK (bring your own key) |
| identity "snowballing", gathering "moss" | elaborative encoding; associative networks / spreading activation; object files (cognitive psychology) |
| framework vs. let agents write code | library/framework vs. codegen vs. LLM-authored code from recipes/skills ("golden examples", conformance tests) |
