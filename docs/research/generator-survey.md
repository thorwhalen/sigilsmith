---
title: "Identity-image generator survey for sigilsmith"
author: Thor Whalen
date: 2026-11-14
---

# Identity-image generator survey for sigilsmith

## Summary

This survey covers 61 technologies: every item of the brief's A14 list plus the C5 additions (initials, emoji, icon-set mapping, LLM-written SVG, embeddings, in-browser LLMs, hosted image APIs, palettes, placeholders). Each has a manifest draft in `catalog/<id>.json`. Facts were checked on npm [1], GitHub [2] and vendor pages on 2026-11-14; fast-moving facts (prices, model releases, browser support) carry that date. Bundle sizes are deliberately not measured here (a separate spike does that); `bundleSize.measured` is `false` everywhere and README-quoted figures appear only as `source`.

Key findings:

- **Licensing is the main filter, not size.** Trianglify is GPL-3.0 [1][2][15] and p5.js is LGPL-2.1 [1][2][30], so neither can be bundled into an MIT package. Multiavatar's custom licence forbids re-packaging its design assets [1][2][9][10]. DiceBear's code is MIT but styles split into 42 CC0, 14 CC BY 4.0, 1 MIT and 4 "artist's own terms" [1][2][12][13]. Satori and resvg-js are MPL-2.0 (usable as unmodified dependencies) [1][2][26].
- **A14 name problems.** "Avvvatars" is only on npm as `avvvatars-react` (no `avvvatars` package); "PatternPad" is a hosted design tool with no API or npm package; "MeshGradient.js" maps to several unrelated packages; "WebSD / sd-1-5-webgpu" is not a package (closest real items: the `web-txt2img` library and Microsoft's `js/sd-turbo` example); "Stripe-style WebGL gradient" exists only as a stale npm repackaging; "Iris-3B" is real (Sperid Labs, Oct 2026, ~12 GB, not 2-3 GB at Q4 except community quantisations) [48]; "Bonsai Image" is real (PrismML, May 2026) but has no documented browser runtime [49][50]; Imagen 4 is retired on the Gemini API [1][67][68][69]. Details in the next section.
- **Most maintained identicon libraries are stale.** Jdenticon, minidenticons, hashicon, blockies, multiavatar and geopattern have had no release for 2.5 to 12 years; their algorithms are small and stable, which argues for wrapping the best (minidenticons, jdenticon) and writing a few in-house.
- **The only keyless, free, deterministic remote service found is the DiceBear HTTP API** [14] (non-commercial; 50 req/s SVG).

Recommended MVP set (details at the end): in-house `native-svg`, in-house `initials-avatar`, in-house `emoji-background`, third-party `minidenticons`, `icons-lucide` keyword mapping, all on the shared in-house `oklch-hash-palette`; remote path: `dicebear-http-api` as the real keyless service plus a mock AI backend for the BYOK/cached-nondeterministic path.

## Method and conventions

- Release dates and licences come from the npm registry [1]; push dates, archive flags and licence detection from the GitHub API [2]. Licence expressions on npm sometimes differ from GitHub's detection (e.g. `NOASSERTION` for svg.js and paper.js, both MIT on npm); the `notes` field says so.
- Maintenance: `active` = release in the last 6 months; `maintained` = release within 24 months or recent commits; `stale` = neither; `archived` as on GitHub. This is a heuristic of this survey.
- Sizes (`sizeRange`) and latencies are labelled estimates (basis `estimate`); no timing or bundle measurement was run.
- `mitCompatible` means "may be bundled into an MIT-licensed distribution". `false` entries can still be offered as optional, user-installed peers (brief B13).
- Web searches were used for vendor pricing and news; where only secondary sources were found this is said in the entry. Licence text itself should be re-read at implementation time.

## Verification of the author's list (A14)

| A14 item | Finding |
|---|---|
| Jdenticon | Exists, MIT, v3.3.0 (2024-05-10) [1][2][3] |
| Blockies | `ethereum/blockies` is archived; maintained-ish ports: `blockies-ts` (2020) [1][2][4] |
| Minidenticons ("~1 KB") | Exists; README badges show a few hundred bytes minified, so "~1 KB" is plausible-to-conservative [1][2][5][6] |
| Hashicon | Exists (`hashicon` 0.3.0, Apache-2.0, 2019; repo now emeraldpay/hashicon) [1][2][7] |
| Avvvatars | Real name is `avvvatars-react`; React-only, 2022 [1][2][8] |
| Multiavatar | Exists; custom licence, not MIT [1][2][9][10] |
| Boring Avatars | Exists, MIT, v2.0.4 (2025-09-28), React [1][2][11] |
| DiceBear "30+ styles" | Now 61 styles; core 10.7.0 (2026-08-26) [1][2][12][13] |
| Trianglify | Exists but GPL-3.0 [1][2][15] |
| GeoPattern | Exists, MIT, last release 2014 [1][2][16] |
| PatternPad / SVG.js | PatternPad is a hosted tool without API [18]; SVG.js is real [1][2][17]. Likely intended: SVG.js plus hand-written grid patterns |
| MeshGradient.js / Stripe gradient | Ambiguous [1][2][19][20]; Stripe gradient only as stale `stripe-gradient` [1][2][21] |
| simplex-noise, glsl-canvas, Rough.js | Exist [1][2][23][1][2][24][1][2][25]; glsl-canvas stale |
| Satori, Takumi, html-to-image | Exist [1][2][26][1][2][27][28][1][2][29]; Takumi outputs raster only; `dom-to-image` last released 2017 |
| Canvas/SVG, p5.js, Two.js, Paper.js | Exist [1][2][30][1][2][31][1][2][32]; p5 is LGPL-2.1 |
| Unsplash / Pexels | Exist; restrictive API terms [1][33][34][35][1][36][37] |
| Sharp / Pillow / Canvas | Sharp exists [1][2][38]; Pillow is Python-only, out of scope |
| SD-Turbo / SDXL-Turbo / LCM | Exist; Stability community licence and OpenRAIL++ issues [40][41][2][43][44] |
| FLUX.2 [klein] 4B | Real, Apache-2.0 (the 9B variants are non-commercial) [45][46][47] |
| Iris-3B | Real, Apache-2.0, ~12 GB [48] |
| Bonsai Image | Real, Apache-2.0, 0.93-1.21 GB transformer (vendor figures) [49][50] |
| ONNX Runtime Web, Transformers.js | Exist, current [1][2][51][1][2][52][53] |
| WebSD / sd-1-5-webgpu | Not found under those names; closest [1][2][54][55] |

## Fast-moving facts (dated 2026-11-14)

- **WebGPU** ships in Chrome/Edge (desktop from 113), Safari 26 and Firefox (Windows 141, Apple-silicon macOS later); web.dev calls it Baseline across major browsers, but Linux/Android/Intel-Mac Firefox coverage is still partial; one analysis estimates full support for ~84% of page views [65]. Treat WebGPU as an opt-in tier with a capability check.
- **Chrome Prompt API** (Gemini Nano) shipped in Chrome 148 per secondary reports; reported requirements include ~22 GB free disk and a GPU with >4 GB VRAM or 16 GB RAM; other engines oppose it [62][63].
- **OpenAI**: newest listed image model gpt-image-2.6 (output USD 30 per 1M tokens) [1][66]. **Google**: Imagen 4 retired in 2026; Gemini image models have no free tier [1][67][68][69]. **BFL** and **Recraft** per-image prices in their entries [70][73][74].
- **Model releases**: FLUX.2 klein 4B (Jan 2026, single-source date) [45][46][47]; Bonsai Image (May 2026) [49][50]; Iris-3B (Oct 2026) [48].

## Technologies

### Identicons and deterministic visual hashing

#### Jdenticon (`jdenticon`) [1][2][3]

Sharp geometric identicons from a hash, as SVG or PNG.

- Upstream: https://github.com/dmester/jdenticon; npm: `jdenticon`
- Licence: MIT; MIT-compatible to bundle: yes. Repo licence MIT; no new release since 2024-05 (npm).
- Maintenance: stale; last release 2024-05-10
- Runtime: browser,node,edge. Cost: free; Local, no network. Secret needed: no
- Style: geometric; semantics: hash; output: svg, png; determinism: pure; latency ~1 ms (estimate); useful size 16-256 px (estimate)
- Bundle size: not measured here (spikes). Quoted: README links a Bundlephobia badge; no figure quoted.
- Verdict: **later**. Mature, MIT, hue/saturation/lightness params; wrap right after MVP set (larger than minidenticons).

#### Blockies (blockies-ts) (`blockies`) [1][2][4]

Ethereum-style pixelated mirrored 8x8 grid identicons (original ethereum/blockies is archived; blockies-ts is a TS port).

- Upstream: https://github.com/pedrouid/blockies-ts; npm: `blockies-ts`
- Licence: MIT; MIT-compatible to bundle: yes. Original ethereum/blockies repo is archived on GitHub; npm 'ethereum-blockies' last published 2017.
- Maintenance: stale; last release 2020-04-02
- Runtime: browser,node,edge. Cost: free;  Secret needed: no
- Style: geometric; semantics: hash; output: svg, png; determinism: seeded; latency ~1 ms (estimate); useful size 24-128 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **study**. Recognisable but pixel-art look and unmaintained; the algorithm is ~60 lines and can be re-implemented in-house.

#### Minidenticons (`minidenticons`) [1][2][5][6]

Tiny GitHub-style 5x5 mirrored SVG identicons, coloured by a hash-derived HSL hue.

- Upstream: https://github.com/laurentpayot/minidenticons; npm: `minidenticons`
- Licence: MIT; MIT-compatible to bundle: yes. Repo MIT; last npm release 2024-03.
- Maintenance: stale; last release 2024-03-01
- Runtime: browser,node,edge. Cost: free;  Secret needed: no
- Style: geometric; semantics: hash; output: svg; determinism: pure; latency ~1 ms (estimate); useful size 16-128 px (estimate)
- Bundle size: not measured here (spikes). Quoted: README badges quote ~269-453 B brotli and ~311-552 B zip (two badge pairs; not measured by us).
- Verdict: **mvp**. MIT, tiny, zero-dependency, covers the small-geometric point; proves the third-party wrap pattern.

#### Hashicon (`hashicon`) [1][2][7]

Isometric shaded-cube identicons from a hash (canvas based).

- Upstream: https://github.com/emeraldpay/hashicon; npm: `hashicon`
- Licence: Apache-2.0; MIT-compatible to bundle: yes; restrictions: Apache-2.0 notice/attribution required when redistributing. npm package 'hashicon' 0.3.0 (ETCDEVTeam); repo moved to emeraldpay/hashicon, last push 2022-02.
- Maintenance: stale; last release 2019-08-14
- Runtime: browser. Cost: free; Draws to a canvas, so Node needs a canvas shim. Secret needed: no
- Style: geometric; semantics: hash; output: png, svg; determinism: pure; latency ~5 ms (estimate); useful size 48-256 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **study**. Distinctive look, but stale, canvas-dependent and a poor fit at 16-32 px.

#### Avvvatars (`avvvatars`) [1][2][8]

Avatars from a hash: gradient-less shape avatars or initials ('character') variants; React component only.

- Upstream: https://github.com/nusu/avvvatars; npm: `avvvatars-react`
- Licence: MIT; MIT-compatible to bundle: yes. There is no package named 'avvvatars'; the real one is avvvatars-react (React-only). Repo URL not in npm metadata; unverified here.
- Maintenance: stale; last release 2022-03-18
- Runtime: browser,node. Cost: free;  Secret needed: no
- Style: geometric; semantics: hash; output: svg; determinism: pure; latency ~2 ms (estimate); useful size 24-96 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **study**. React-only and stale since 2022; the 'shape or initials' idea is better done in-house.

#### Multiavatar (`multiavatar`) [1][2][9][10]

Multicultural avatar generator: 12 character 'cultures' with SHA-256-chosen parts, SVG output.

- Upstream: https://github.com/multiavatar/Multiavatar; npm: `@multiavatar/multiavatar`
- Licence: LicenseRef-Multiavatar-1.0; MIT-compatible to bundle: NO; restrictions: Custom 'Multiavatar License v1.0': free incl. commercial, but may not re-package or re-brand the design assets; May not be used to build a competing product/service; Must be treated as an addition to the product, not the product itself; Attribution appreciated, not mandatory. GitHub reports NOASSERTION; npm says 'SEE LICENSE IN LICENSE'. Not MIT: do not bundle; optional user-installed only.
- Maintenance: stale; last release 2021-10-09
- Runtime: browser,node,edge. Cost: free;  Secret needed: no
- Style: illustrative; semantics: hash; output: svg; determinism: pure; latency ~3 ms (estimate); useful size 32-256 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **optional-peer**. Appealing characters but custom licence forbids re-packaging assets, so never bundle; offer as user-installed adapter.

### Parameterised geometric and pattern generators

#### Boring Avatars (`boring-avatars`) [1][2][11]

Seeded SVG avatars in six styles (marble, beam, pixel, sunset, ring, bauhaus) from a colour palette; React component.

- Upstream: https://github.com/boringdesigners/boring-avatars; npm: `boring-avatars`
- Licence: MIT; MIT-compatible to bundle: yes. Code and designs MIT.
- Maintenance: active; last release 2025-09-28
- Runtime: browser,node,edge. Cost: free; Also offers a hosted API (not surveyed). Secret needed: no
- Style: abstract; semantics: hash; output: svg; determinism: pure; latency ~2 ms (estimate); useful size 24-256 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **later**. Best abstract set under MIT and actively released, but React-only API; wrap by server-rendering or re-implement templates after MVP.

#### DiceBear (`dicebear`) [1][2][12][13]

Modular deterministic SVG avatar library with 61 styles (core @dicebear/core + styles); also a free HTTP API.

- Upstream: https://github.com/dicebear/dicebear; npm: `@dicebear/core`
- Licence: MIT; MIT-compatible to bundle: yes; restrictions: Code is MIT but each style has its own licence: 42 CC0 1.0, 14 CC BY 4.0 (attribution), 1 MIT (Icons), 4 'artist's own terms' (Avataaars, Avataaars Neutral, Bottts, Bottts Neutral); Only bundle/recommend CC0 styles by default; CC BY styles need credit, artist-terms styles need a manual read. @dicebear/core 10.7.0 (2026-08-26); @dicebear/collection 9.4.2 (2026-03-19) on the previous major. Counts from the DiceBear licences page, 2026-11-14.
- Maintenance: active; last release 2026-08-26
- Runtime: browser,node,edge. Cost: free; Local use free; HTTP API see dicebear-http-api. Secret needed: no
- Style: illustrative; semantics: hash; output: svg; determinism: pure; latency ~3 ms (estimate); useful size 24-256 px (estimate)
- Bundle size: not measured here (spikes). Quoted: Not quoted by README.
- Verdict: **later**. Richest ecosystem, MIT code, but style licences vary; wrap per-style with CC0-only allow-list after MVP (size to be measured).

#### DiceBear HTTP API (`dicebear-http-api`) [14]

Keyless hosted endpoint returning deterministic avatars (SVG, PNG, JPG, WebP, AVIF) from a seed in the URL.

- Upstream: https://www.dicebear.com/how-to-use/http-api/; npm: none
- Licence: MIT; MIT-compatible to bundle: yes; restrictions: API free for non-commercial use only; commercial use or higher limits: self-host; Style licences still apply to output; No availability guarantee; may change output. Service terms from the DiceBear docs, fetched 2026-11-14.
- Maintenance: active; last release n/a
- Runtime: browser,node,edge,network. Cost: free; Limits 2026-11: 50 req/s SVG, 10 req/s raster (raster capped at 256 px). Self-hosting recommended for commercial use. Secret needed: no
- Style: illustrative; semantics: hash; output: svg, png; determinism: pure; latency ~150 ms (estimate); useful size 24-256 px (estimate)
- Bundle size: not measured here (spikes). Quoted: n/a (network).
- Verdict: **mvp**. Only genuinely keyless, free, deterministic remote service found; ideal real remote/async path for the MVP (with self-host seam).

#### Trianglify (`trianglify`) [1][2][15]

Low-poly Delaunay triangle meshes coloured by a ColorBrewer scale, seeded.

- Upstream: https://github.com/qrohlf/trianglify; npm: `trianglify`
- Licence: GPL-3.0; MIT-compatible to bundle: NO; restrictions: GPL-3.0 is copyleft: incompatible with bundling in an MIT package; Could only be an optional, user-installed peer; any distribution of a combined work would be GPL. npm and GitHub both report GPL-3.0 (checked 2026-11-14). Last push 2025-05, last release 2020-11.
- Maintenance: stale; last release 2020-11-01
- Runtime: browser,node,edge. Cost: free;  Secret needed: no
- Style: abstract; semantics: hash; output: svg, canvas; determinism: seeded; latency ~30 ms (estimate); useful size 64-1024 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **avoid**. GPL-3.0 conflicts with the MIT package; same look reachable with an in-house jittered-grid triangulation.

#### GeoPattern (`geopattern`) [1][2][16]

GitHub's repo-header generator: 16 SVG patterns (chevrons, hexagons, sine waves, ...) from a string hash.

- Upstream: https://github.com/btmills/geopattern; npm: `geopattern`
- Licence: MIT; MIT-compatible to bundle: yes. Last release 2014; last commit 2021.
- Maintenance: stale; last release 2014-12-03
- Runtime: browser,node,edge. Cost: free;  Secret needed: no
- Style: geometric; semantics: hash; output: svg; determinism: pure; latency ~5 ms (estimate); useful size 64-512 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **later**. Distinct banner-style patterns under MIT; old code, but a clean port of a few patterns is cheap.

#### PatternPad (`patternpad`) [18]

Web-based geometric pattern design tool exporting SVG/PNG/JPG; not a library.

- Upstream: https://www.producthunt.com/products/patternpad; npm: none
- Licence: none/unclear; MIT-compatible to bundle: NO; restrictions: No public API or licence terms found; SaaS aggregator pages say there is no API. Not an npm package. Likely intended alternatives: svg.js (grid primitives) or hand-written pattern modules.
- Maintenance: unknown; last release n/a
- Runtime: browser,network. Cost: free; Pricing unverified Secret needed: no
- Style: geometric; semantics: hash; output: svg, png; determinism: pure; latency unknown; useful size n/a
- Bundle size: not measured here (spikes). 
- Verdict: **avoid**. A hosted design tool without an API or documented licence; cannot be a generator.

### Mesh gradients, noise and shader fields

#### Mesh gradient (@mesh-gradient/core) (`mesh-gradient`) [1][2][19][20]

WebGL multi-point mesh gradient renderer; 'MeshGradient.js' is ambiguous, this is the closest maintained match.

- Upstream: https://github.com/mikhailmogilnikov/mesh-gradient; npm: `@mesh-gradient/core`
- Licence: MIT; MIT-compatible to bundle: yes. Name 'MeshGradient.js' maps to several packages (mesh-gradient.js, stripe-gradient 2022, @mesh-gradient/core, @paper-design/shaders); no single canonical one.
- Maintenance: maintained; last release 2026-05-05
- Runtime: browser. Cost: free; WebGL. Secret needed: no
- Style: abstract; semantics: hash; output: canvas, png; determinism: seeded; latency ~20 ms (estimate); useful size 48-512 px (estimate)
- Bundle size: not measured here (spikes). Quoted: Repository README states ~8 kB gzipped (unverified).
- Verdict: **later**. Pretty soft gradients but needs WebGL; static output is better done with SVG radial gradients in-house.

#### Stripe-style WebGL gradient (stripe-gradient) (`stripe-gradient`) [1][2][21]

npm packaging of the animated Stripe.com WebGL gradient.

- Upstream: https://github.com/khasty720/stripe-gradient; npm: `stripe-gradient`
- Licence: MIT; MIT-compatible to bundle: yes. Derived from Stripe's site script; provenance of original code unclear.
- Maintenance: stale; last release 2022-12-26
- Runtime: browser. Cost: free; WebGL Secret needed: no
- Style: abstract; semantics: hash; output: canvas; determinism: seeded; latency ~30 ms (estimate); useful size 128-1024 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **avoid**. Animated hero effect, stale, murky provenance; not an identity-thumbnail tool.

#### Paper Design Shaders (`paper-design-shaders`) [1][2][22]

Zero-dependency WebGL shader components (mesh gradient, swirl, grain, warp ...), with React wrappers.

- Upstream: https://github.com/paper-design/shaders; npm: `@paper-design/shaders`
- Licence: Apache-2.0; MIT-compatible to bundle: yes; restrictions: Apache-2.0 notice required. Pre-1.0 (0.0.82), fast-moving API.
- Maintenance: active; last release 2026-10-21
- Runtime: browser. Cost: free; WebGL Secret needed: no
- Style: abstract; semantics: hash; output: canvas, png; determinism: seeded; latency ~20 ms (estimate); useful size 64-512 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **study**. Active and attractive, pre-1.0 and WebGL-bound; study the shader recipes.

#### simplex-noise (`simplex-noise`) [1][2][23]

Seedable 2D/3D/4D simplex noise (PRNG-injectable); building block for flow fields and marble textures.

- Upstream: https://github.com/jwagner/simplex-noise.js; npm: `simplex-noise`
- Licence: MIT; MIT-compatible to bundle: yes
- Maintenance: maintained; last release 2024-07-26
- Runtime: browser,node,edge. Cost: free;  Secret needed: no
- Style: abstract; semantics: hash; output: svg, canvas; determinism: seeded; latency ~2 ms (estimate); useful size 32-512 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **later**. Tiny and seedable, a good helper for organic in-house generators.

#### glsl-canvas (`glsl-canvas`) [1][2][24]

Tiny WebGL fragment-shader runner for aurora/fluid gradient shaders.

- Upstream: https://github.com/actarian/glsl-canvas; npm: `glsl-canvas-js`
- Licence: MIT; MIT-compatible to bundle: yes. Last npm release 2022; repo push 2023-04. Another unrelated 'glsl-canvas' npm package also exists.
- Maintenance: stale; last release 2022-01-30
- Runtime: browser. Cost: free; WebGL Secret needed: no
- Style: abstract; semantics: hash; output: canvas; determinism: seeded; latency ~20 ms (estimate); useful size 64-512 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **avoid**. Unmaintained and WebGL-only; shaders can run on a plain WebGL canvas without it.

### HTML/CSS to image (template cards) and rasterisers

#### Satori (`satori`) [1][2][26]

Vercel's JSX/CSS (flexbox subset) to SVG renderer, runs in Node, edge and WASM; the engine behind OG-image generators.

- Upstream: https://github.com/vercel/satori; npm: `satori`
- Licence: MPL-2.0; MIT-compatible to bundle: yes; restrictions: MPL-2.0 is file-level copyleft: fine as an unmodified dependency, modifications to Satori files must be shared; Needs fonts supplied by caller; check each font's licence. Do not vendor/modify without keeping MPL files separate.
- Maintenance: active; last release 2026-10-20
- Runtime: browser,node,edge. Cost: free;  Secret needed: no
- Style: illustrative; semantics: metadata; output: svg, png; determinism: pure; latency ~60 ms (estimate); useful size 256-1200 px (estimate)
- Bundle size: not measured here (spikes). Quoted: Wasm yoga + fonts; not quoted.
- Verdict: **later**. Right tool for template cards and OG images from metadata; larger and needs fonts, so after MVP.

#### Takumi (`takumi`) [1][2][27][28]

Rust HTML/CSS (flexbox, grid) to raster image engine with Node native and WASM bindings; Satori alternative.

- Upstream: https://github.com/kane50613/takumi; npm: `@takumi-rs/core`
- Licence: MIT OR Apache-2.0; MIT-compatible to bundle: yes. Dual licence on npm; GitHub reports Apache-2.0.
- Maintenance: active; last release 2026-11-08
- Runtime: node,edge. Cost: free; Browser/edge via @takumi-rs/wasm; core package is a native Node addon. Secret needed: no
- Style: illustrative; semantics: metadata; output: png, webp, jpeg; determinism: pure; latency ~30 ms (estimate); useful size 256-1200 px (estimate)
- Bundle size: not measured here (spikes). Quoted: Native/WASM binary; not quoted.
- Verdict: **later**. Fast and active, raster only (no SVG); consider as server-side option behind the same template interface.

#### html-to-image (`html-to-image`) [1][2][29]

Browser DOM to PNG/SVG/canvas via SVG foreignObject; dom-to-image is its stale ancestor (2017).

- Upstream: https://github.com/bubkoo/html-to-image; npm: `html-to-image`
- Licence: MIT; MIT-compatible to bundle: yes. dom-to-image (2017-10) is stale; use this fork or dom-to-image-more / modern-screenshot.
- Maintenance: active; last release 2025-02-14
- Runtime: browser. Cost: free; Browser only. Secret needed: no
- Style: illustrative; semantics: metadata; output: png, svg, jpeg; determinism: cached-nondeterministic; latency ~100 ms (estimate); useful size 64-1200 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **optional-peer**. Only browser path for arbitrary HTML cards, but fonts/CSS differ per browser so output is not byte-stable.

#### resvg-js (`resvg-js`) [1][2][39]

Rust SVG renderer with Node and WASM bindings; turns generator SVG into PNG for crawlers (og:image, apple-touch-icon).

- Upstream: https://github.com/yisibl/resvg-js; npm: `@resvg/resvg-js`
- Licence: MPL-2.0; MIT-compatible to bundle: yes; restrictions: MPL-2.0 file-level copyleft; use as unmodified dependency
- Maintenance: maintained; last release 2024-03-26
- Runtime: browser,node,edge. Cost: free; @resvg/resvg-wasm for browser/edge. Secret needed: no
- Style: geometric; semantics: hash; output: png; determinism: pure; latency ~15 ms (estimate); useful size n/a
- Bundle size: not measured here (spikes). 
- Verdict: **optional-peer**. Needed to rasterise SVG for targets that reject SVG; deterministic across platforms unlike canvas.

### Creative-coding and 2D runtimes

#### SVG.js (`svgjs`) [1][2][17]

Lightweight SVG manipulation/animation library (builder for grid shapes and constrained palettes).

- Upstream: https://github.com/svgdotjs/svg.js; npm: `@svgdotjs/svg.js`
- Licence: MIT; MIT-compatible to bundle: yes. npm MIT; GitHub reports NOASSERTION (licence file format).
- Maintenance: active; last release 2026-08-04
- Runtime: browser,node. Cost: free; Needs a DOM (svgdom in Node). Secret needed: no
- Style: geometric; semantics: hash; output: svg; determinism: pure; latency unknown; useful size n/a
- Bundle size: not measured here (spikes). 
- Verdict: **study**. DOM dependency is unnecessary when generators emit SVG strings; useful only as a reference.

#### Rough.js (`rough-js`) [1][2][25]

Hand-drawn, sketchy SVG/Canvas primitives with seed for repeatable wobble.

- Upstream: https://github.com/rough-stuff/rough; npm: `roughjs`
- Licence: MIT; MIT-compatible to bundle: yes. Last push 2024-07.
- Maintenance: stale; last release 2023-11-20
- Runtime: browser,node. Cost: free; Needs DOM/SVG; Node via svgdom or canvas. Secret needed: no
- Style: illustrative; semantics: hash; output: svg, canvas; determinism: seeded; latency ~10 ms (estimate); useful size 48-512 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **later**. Gives a hand-drawn finish to any shape-based generator and is seedable.

#### Native SVG/Canvas (in-house) (`native-svg`) 

Zero-dependency SVG string builders using seeded PRNG and the OKLCH palette; sigilsmith's own tiny abstract/geometric generators.

- Upstream: none; npm: none
- Licence: MIT; MIT-compatible to bundle: yes. Written in-house; no upstream.
- Maintenance: active; last release n/a
- Runtime: browser,node,edge. Cost: free;  Secret needed: no
- Style: abstract; semantics: hash; output: svg; determinism: pure; latency ~1 ms (estimate); useful size 16-512 px (estimate)
- Bundle size: not measured here (spikes). Quoted: in-house; to be measured.
- Verdict: **mvp**. Zero dependencies, sub-kilobyte, fully deterministic: the in-house anchor of the MVP.

#### p5.js (`p5js`) [1][2][30]

2D algorithmic drawing framework (setup/draw model), instance mode usable headless in the browser.

- Upstream: https://github.com/processing/p5.js; npm: `p5`
- Licence: LGPL-2.1; MIT-compatible to bundle: NO; restrictions: LGPL-2.1: bundling into an MIT package is problematic; dynamic optional peer only. p5 2.x (2.4.0 on 2026-11-11). Large relative to need.
- Maintenance: active; last release 2026-11-11
- Runtime: browser. Cost: free;  Secret needed: no
- Style: abstract; semantics: hash; output: canvas, svg; determinism: seeded; latency ~30 ms (estimate); useful size 64-512 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **avoid**. LGPL and a heavy runtime for what plain Canvas/SVG does; keep as an optional peer for user-written sketches.

#### Two.js (`twojs`) [1][2][31]

Renderer-agnostic 2D scene graph (SVG, Canvas, WebGL).

- Upstream: https://github.com/jonobr1/two.js; npm: `two.js`
- Licence: MIT; MIT-compatible to bundle: yes
- Maintenance: active; last release 2026-08-29
- Runtime: browser. Cost: free;  Secret needed: no
- Style: geometric; semantics: hash; output: svg, canvas; determinism: seeded; latency ~10 ms (estimate); useful size 48-512 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **study**. Active and MIT but a scene graph adds weight over direct SVG strings.

#### Paper.js (`paperjs`) [1][2][32]

Vector graphics scripting (paths, booleans, curves) on Canvas, with PaperScript.

- Upstream: https://github.com/paperjs/paper.js; npm: `paper`
- Licence: MIT; MIT-compatible to bundle: yes. GitHub reports NOASSERTION; npm MIT.
- Maintenance: active; last release 2026-11-03
- Runtime: browser,node. Cost: free; Node needs canvas/jsdom. Secret needed: no
- Style: geometric; semantics: hash; output: svg, canvas; determinism: seeded; latency ~20 ms (estimate); useful size 48-512 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **study**. Strong path boolean and curve tools; heavy and canvas-centric.

### Stock photo and compositing

#### Unsplash API (`unsplash-api`) [1][33][34][35]

Keyword photo search; returns hotlinked CDN photo URLs.

- Upstream: https://unsplash.com/documentation; npm: `unsplash-js`
- Licence: LicenseRef-Unsplash-API-Terms; MIT-compatible to bundle: NO; restrictions: API guidelines: must hotlink the photo URLs returned by the API (no re-hosting); Must credit photographer and Unsplash with UTM links; Must call the download-tracking endpoint when a photo is used; Demo apps limited to 50 req/h; production up to 5000 req/h after approval. Photo licence is Unsplash's own; guidelines read from help.unsplash.com via search, full text not retrieved: re-verify before shipping.
- Maintenance: active; last release 2026-08-14
- Runtime: browser,node,edge,network. Cost: free-tier; Free API key required; hotlink + attribution + tracking. Secret needed: yes
- Style: photorealistic; semantics: metadata; output: jpeg; determinism: cached-nondeterministic; latency ~300 ms (estimate); useful size 64-1200 px (estimate)
- Bundle size: not measured here (spikes). Quoted: n/a (network); unsplash-js MIT wrapper.
- Verdict: **later**. Hotlinking and attribution rules conflict with the generate-once-and-store strategy; needs a proxy, never a client key.

#### Pexels API (`pexels-api`) [1][36][37]

Keyword photo and video search with free API key.

- Upstream: https://www.pexels.com/api/documentation/; npm: `pexels`
- Licence: LicenseRef-Pexels-API-Terms; MIT-compatible to bundle: NO; restrictions: Visible link back to Pexels requested on API use; Default 200 req/h and 20,000 req/month; raising limits currently paused; Bulk/systematic copying and automated extraction forbidden; Hotlinking rule not found in official text. npm client 'pexels' last release 2022-09 but the REST API works without it.
- Maintenance: stale; last release 2022-09-19
- Runtime: browser,node,edge,network. Cost: free-tier; Free key. Secret needed: yes
- Style: photorealistic; semantics: metadata; output: jpeg; determinism: cached-nondeterministic; latency ~300 ms (estimate); useful size 64-1200 px (estimate)
- Bundle size: not measured here (spikes). Quoted: n/a (network).
- Verdict: **later**. Simple REST API, but terms discourage caching in bulk; same proxy requirement as Unsplash.

#### sharp (`sharp`) [1][2][38]

Fast Node.js image resize, tint, composite and SVG text overlay on libvips; Pillow is the Python analogue.

- Upstream: https://github.com/lovell/sharp; npm: `sharp`
- Licence: Apache-2.0; MIT-compatible to bundle: yes; restrictions: libvips (LGPL-3.0) binaries are shipped as prebuilt packages by sharp; check for static-linking obligations if redistributing. Pillow (Python) is HPND-style and out of scope for a TS package.
- Maintenance: active; last release 2026-09-27
- Runtime: node. Cost: free; Node only; native binaries. Secret needed: no
- Style: photorealistic; semantics: hash; output: png, jpeg, webp, avif, svg; determinism: pure; latency ~20 ms (estimate); useful size 16-4096 px (estimate)
- Bundle size: not measured here (spikes). Quoted: native.
- Verdict: **optional-peer**. Best compositing/resizing helper for server-side stored images; keep behind a processor seam.

### Distilled and compact AI models

#### SD-Turbo (`sd-turbo`) [40][41]

Stability AI's 1-4 step distilled Stable Diffusion 2.1 text-to-image model (512 px).

- Upstream: https://huggingface.co/stabilityai/sd-turbo; npm: none
- Licence: LicenseRef-Stability-AI-Community; MIT-compatible to bundle: NO; restrictions: Model card: non-commercial/research under the licence; commercial use via Stability community licence (free under USD 1M annual revenue) or Enterprise; Revenue test applies to the deploying organisation, not to this package. Could not confirm a dedicated SD-Turbo licence page; stability.ai/license read via search. Re-verify.
- Maintenance: unknown; last release n/a
- Runtime: browser,node,edge,webgpu. Cost: free; Weights download ~2.3 GB via web-txt2img; on-device. Secret needed: no
- Style: photorealistic; semantics: llm; output: png; determinism: cached-nondeterministic; latency ~3000 ms (estimate); useful size 512-512 px (estimate)
- Bundle size: not measured here (spikes). Quoted: weights ~2.3 GB (web-txt2img README).
- Verdict: **study**. Weights licence blocks bundling and complicates commercial users; good only as a user-chosen local backend.

#### SDXL-Turbo (`sdxl-turbo`) [42]

Stability AI's 1-step distilled SDXL (512 px).

- Upstream: https://huggingface.co/stabilityai/sdxl-turbo; npm: none
- Licence: LicenseRef-Stability-AI-Community; MIT-compatible to bundle: NO; restrictions: Same Stability community licence as SD-Turbo; 2023 launch post said not for commercial use, current framing is the $1M revenue tier. Too large for browsers in practice.
- Maintenance: unknown; last release n/a
- Runtime: node,webgpu. Cost: free; Local GPU. Secret needed: no
- Style: photorealistic; semantics: llm; output: png; determinism: cached-nondeterministic; latency ~5000 ms (estimate); useful size 512-1024 px (estimate)
- Bundle size: not measured here (spikes). Quoted: several GB; not quoted.
- Verdict: **avoid**. Larger than SD-Turbo with the same licence issues; not a browser target.

#### Latent Consistency Models (LCM) (`lcm`) [2][43][44]

4-step distilled diffusion approach; LCM and LCM-LoRA adapters for SD1.5/SDXL.

- Upstream: https://github.com/luosiallen/latent-consistency-model; npm: none
- Licence: MIT; MIT-compatible to bundle: NO; restrictions: Core LCM repo and LCM_Dreamshaper_v7 card are MIT, but LCM-LoRA-SDXL weights are CreativeML OpenRAIL++ with use restrictions and the underlying SD base models carry their own licences. Repo licence read from a third-party aggregator; verify at source.
- Maintenance: stale; last release n/a
- Runtime: browser,node,webgpu. Cost: free; Local. Secret needed: no
- Style: photorealistic; semantics: llm; output: png; determinism: cached-nondeterministic; latency ~4000 ms (estimate); useful size 512-1024 px (estimate)
- Bundle size: not measured here (spikes). Quoted: adapters tens-hundreds of MB.
- Verdict: **avoid**. A technique, not a product: superseded by SD-Turbo/FLUX klein for this use, with mixed licensing.

#### FLUX.2 [klein] 4B (`flux2-klein-4b`) [45][46][47]

Black Forest Labs' compact open-weight FLUX.2 text-to-image model, sub-second on a good GPU; Apache-2.0.

- Upstream: https://huggingface.co/black-forest-labs/FLUX.2-klein-4B; npm: none
- Licence: Apache-2.0; MIT-compatible to bundle: yes; restrictions: The 9B klein models use the FLUX Non-Commercial License; only the 4B is Apache-2.0. Release date from Vercel AI Gateway page only (single source). BFL repo black-forest-labs/flux2 Apache-2.0 code.
- Maintenance: active; last release 2026-01-15
- Runtime: node,webgpu. Cost: free; Local weights; hosted at USD 0.014 first megapixel via BFL (2026-11-14). Secret needed: no
- Style: photorealistic; semantics: llm; output: png; determinism: cached-nondeterministic; latency ~2000 ms (estimate); useful size 256-1024 px (estimate)
- Bundle size: not measured here (spikes). Quoted: README: ~8 GB VRAM; 4B weights several GB.
- Verdict: **study**. Best-licensed open model of the set, but ~8 GB VRAM and multi-GB weights rule out in-browser use; use hosted or user-installed.

#### Iris-3B (`iris-3b`) [48]

Sperid Labs 3B pixel-space (no VAE) text-to-image model, Apache-2.0, released October 2026; the author's 'Iris-3B'.

- Upstream: https://huggingface.co/speridlabs/iris-3b; npm: none
- Licence: Apache-2.0; MIT-compatible to bundle: yes. Release date per secondary reports (Oct 7-8, 2026); weights ~12 GB plus a 4B text encoder.
- Maintenance: active; last release 2026-10-07
- Runtime: node,webgpu. Cost: free; Local only; ~12 GB download. Secret needed: no
- Style: photorealistic; semantics: llm; output: png; determinism: cached-nondeterministic; latency unknown; useful size 512-1024 px (estimate)
- Bundle size: not measured here (spikes). Quoted: ~12 GB (model card via search).
- Verdict: **study**. Real and openly licensed but ~12 GB; the author's 'about 2-3 GB at Q4' is only true for community quantisations.

#### Bonsai Image 4B (PrismML) (`bonsai-image`) [49][50]

1-bit and ternary quantised FLUX.2 klein 4B derivative (0.93-1.21 GB transformer).

- Upstream: https://prismml.com/news/bonsai-image-4b; npm: none
- Licence: Apache-2.0; MIT-compatible to bundle: yes. Licence per PrismML docs table; runtimes MLX (Apple Silicon), Gemlite (CUDA), iOS app; no browser/WebGPU runtime documented as of 2026-11-14.
- Maintenance: active; last release 2026-05-26
- Runtime: node. Cost: free; On-device; ~3.4-3.9 GB full MLX payload. Secret needed: no
- Style: photorealistic; semantics: llm; output: png; determinism: cached-nondeterministic; latency ~6000 ms (estimate); useful size 512-1024 px (estimate)
- Bundle size: not measured here (spikes). Quoted: transformer 0.93 GB (1-bit) / 1.21 GB (ternary), vendor docs.
- Verdict: **study**. Promising small footprint, but vendor-reported numbers and no web runtime yet.

### In-browser AI runtimes

#### ONNX Runtime Web (`onnxruntime-web`) [1][2][51]

Microsoft's browser inference engine (WASM, WebGL, WebGPU) for ONNX models.

- Upstream: https://github.com/microsoft/onnxruntime; npm: `onnxruntime-web`
- Licence: MIT; MIT-compatible to bundle: yes. Models loaded through it carry their own licences.
- Maintenance: active; last release 2026-10-26
- Runtime: browser,webgpu. Cost: free; WASM/WebGPU on device. Secret needed: no
- Style: photorealistic; semantics: embedding; output: n/a; determinism: pure; latency unknown; useful size n/a
- Bundle size: not measured here (spikes). Quoted: WASM binaries several MB.
- Verdict: **optional-peer**. Underlying engine for embeddings and diffusion; consume through Transformers.js rather than directly.

#### Transformers.js (`transformers-js`) [1][2][52][53]

Hugging Face's JS library running ONNX models in browser (WASM/WebGPU) and Node via onnxruntime; v4 is current (@huggingface/transformers).

- Upstream: https://github.com/huggingface/transformers.js; npm: `@huggingface/transformers`
- Licence: Apache-2.0; MIT-compatible to bundle: yes; restrictions: Each model has its own licence (all-MiniLM-L6-v2: Apache-2.0). Old package @xenova/transformers 2.17.2 (2024-05) is superseded.
- Maintenance: active; last release 2026-10-27
- Runtime: browser,node,webgpu,network. Cost: free; Model download on first use, cached by browser. Secret needed: no
- Style: abstract; semantics: embedding; output: n/a; determinism: pure; latency unknown; useful size n/a
- Bundle size: not measured here (spikes). Quoted: library plus model files: all-MiniLM-L6-v2 quantised ~23 MB (HF repo listing).
- Verdict: **optional-peer**. Standard way to do local embeddings; loads models from HF Hub (network once) so keep it an optional peer.

#### web-txt2img (WebSD / SD-Turbo in browser) (`web-txt2img`) [1][2][54][55]

Browser library running SD-Turbo via WebGPU; closest real match to the author's 'WebSD / sd-1-5-webgpu', which could not be verified as named.

- Upstream: https://github.com/lacerbi/web-txt2img; npm: `web-txt2img`
- Licence: MIT; MIT-compatible to bundle: NO; restrictions: Library MIT, but SD-Turbo weights carry the Stability community licence. 'WebSD' exists only as a Hugging Face space (silait/sd-web); no 'sd-1-5-webgpu' package found. Microsoft's onnxruntime-inference-examples js/sd-turbo is the official demo.
- Maintenance: maintained; last release 2025-09-01
- Runtime: browser,webgpu,network. Cost: free; ~2.3 GB weights downloaded to the browser; requires WebGPU. Secret needed: no
- Style: photorealistic; semantics: llm; output: png; determinism: cached-nondeterministic; latency ~5000 ms (estimate); useful size 512-512 px (estimate)
- Bundle size: not measured here (spikes). Quoted: ~2.3 GB weights (README via search).
- Verdict: **study**. Proves in-browser diffusion is feasible; far too heavy and licence-encumbered for default use.

### Initials and letter avatars

#### Initials / letter avatar (in-house) (`initials-avatar`) 

Initials on a hash-coloured background (OKLCH), the Gmail/Slack default; DiceBear 'initials' (CC0) and gr2m/initials are third-party equivalents.

- Upstream: none; npm: none
- Licence: MIT; MIT-compatible to bundle: yes. DiceBear initials style is CC0; gr2m/initials npm package MIT (2021).
- Maintenance: active; last release n/a
- Runtime: browser,node,edge. Cost: free; Needs font stack; use system-ui to avoid bundling fonts. Secret needed: no
- Style: geometric; semantics: metadata; output: svg; determinism: pure; latency ~1 ms (estimate); useful size 16-128 px (estimate)
- Bundle size: not measured here (spikes). Quoted: in-house; to be measured.
- Verdict: **mvp**. Highest recognition for people lists; needs name field (metadata level); tiny and in-house.

### Emoji plus background colour

#### Emoji + background colour (in-house) (`emoji-background`) [1][2][56]

Emoji chosen by hash (or keyword) over a coloured background, as in Notion/Slack icons; emoji list from unicode-emoji-json.

- Upstream: https://github.com/muan/unicode-emoji-json; npm: `unicode-emoji-json`
- Licence: MIT; MIT-compatible to bundle: yes; restrictions: Emoji glyphs rendered by the platform font; Noto Emoji (OFL/Apache) or Twemoji (CC-BY 4.0 graphics) if images are embedded. emoji-mart (MIT, 2024-04) offers search data.
- Maintenance: active; last release 2026-04-18
- Runtime: browser,node,edge. Cost: free; Glyphs differ per OS, so pixels are not stable; the chosen emoji is. Secret needed: no
- Style: illustrative; semantics: metadata; output: svg; determinism: pure; latency ~1 ms (estimate); useful size 24-128 px (estimate)
- Bundle size: not measured here (spikes). Quoted: emoji list data ~ tens of kB; subset it.
- Verdict: **mvp**. Concrete and instantly distinguishable at small sizes; keyword mapping gives metadata semantics.

### Icon-set mapping

#### Lucide (`icons-lucide`) [1][2][57]

Icon set usable for hash/keyword/embedding/LLM-chosen glyph on a coloured tile: pick an icon by metadata, draw its SVG on a palette background.

- Upstream: https://github.com/lucide-icons/lucide; npm: `lucide`
- Licence: ISC; MIT-compatible to bundle: yes; restrictions: ISC; some icons derive from Feather (MIT): keep both notices. 1.x line (1.73.0 on 2026-11-14).
- Maintenance: active; last release 2026-11-14
- Runtime: browser,node,edge. Cost: free; Import individual icons to avoid bundling the full set. Secret needed: no
- Style: illustrative; semantics: metadata; output: svg; determinism: pure; latency ~1 ms (estimate); useful size 24-256 px (estimate)
- Bundle size: not measured here (spikes). Quoted: per-icon ~0.3-1 kB gz (estimate); full set not bundled.
- Verdict: **mvp**. Clean consistent set, ISC, per-icon ESM; best default for keyword to icon mapping.

#### Iconify (`icons-iconify`) [1][2][58][59]

Icon set usable for hash/keyword/embedding/LLM-chosen glyph on a coloured tile: pick an icon by metadata, draw its SVG on a palette background.

- Upstream: https://github.com/iconify/iconify; npm: `@iconify/utils`
- Licence: MIT; MIT-compatible to bundle: yes; restrictions: Framework MIT but ~200 icon sets each with own licence (some CC BY, GPL): filter by set licence. Data via @iconify-json/* packages or api.iconify.design (network).
- Maintenance: active; last release 2026-09-06
- Runtime: browser,node,edge. Cost: free; Import individual icons to avoid bundling the full set. Secret needed: no
- Style: illustrative; semantics: metadata; output: svg; determinism: pure; latency ~1 ms (estimate); useful size 24-256 px (estimate)
- Bundle size: not measured here (spikes). Quoted: per-icon ~0.3-1 kB gz (estimate); full set not bundled.
- Verdict: **later**. Largest catalogue, so it needs a licence-filtered allow-list; wrap later.

#### Phosphor Icons (`icons-phosphor`) [1][2][60]

Icon set usable for hash/keyword/embedding/LLM-chosen glyph on a coloured tile: pick an icon by metadata, draw its SVG on a palette background.

- Upstream: https://github.com/phosphor-icons/core; npm: `@phosphor-icons/core`
- Licence: MIT; MIT-compatible to bundle: yes. npm last release 2024-03; repo push 2026-01.
- Maintenance: maintained; last release 2024-03-29
- Runtime: browser,node,edge. Cost: free; Import individual icons to avoid bundling the full set. Secret needed: no
- Style: illustrative; semantics: metadata; output: svg; determinism: pure; latency ~1 ms (estimate); useful size 24-256 px (estimate)
- Bundle size: not measured here (spikes). Quoted: per-icon ~0.3-1 kB gz (estimate); full set not bundled.
- Verdict: **later**. Six weights per icon is a neat variation axis; similar role to Lucide.

#### Tabler Icons (`icons-tabler`) [1][2][61]

Icon set usable for hash/keyword/embedding/LLM-chosen glyph on a coloured tile: pick an icon by metadata, draw its SVG on a palette background.

- Upstream: https://github.com/tabler/tabler-icons; npm: `@tabler/icons`
- Licence: MIT; MIT-compatible to bundle: yes. 5,900+ icons claimed upstream (not verified).
- Maintenance: active; last release 2026-11-08
- Runtime: browser,node,edge. Cost: free; Import individual icons to avoid bundling the full set. Secret needed: no
- Style: illustrative; semantics: metadata; output: svg; determinism: pure; latency ~1 ms (estimate); useful size 24-256 px (estimate)
- Bundle size: not measured here (spikes). Quoted: per-icon ~0.3-1 kB gz (estimate); full set not bundled.
- Verdict: **later**. Very large and active; good for keyword coverage; per-icon import only.

### LLM-written SVG

#### LLM-written SVG (`llm-svg`) 

A language model emits SVG source directly from item title/description (e.g. via hosted or in-browser LLM).

- Upstream: none; npm: none
- Licence: MIT; MIT-compatible to bundle: yes; restrictions: Licence of output depends on provider terms; sanitise SVG (scripts, foreignObject, external refs) before use. Technique, not a package. Needs SVG sanitiser (e.g. DOMPurify, MIT/Apache) and moderation.
- Maintenance: unknown; last release n/a
- Runtime: browser,node,edge,network. Cost: byok; Cost per call depends on model; cache per item. Secret needed: yes
- Style: illustrative; semantics: llm; output: svg; determinism: cached-nondeterministic; latency ~3000 ms (estimate); useful size 32-512 px (estimate)
- Bundle size: not measured here (spikes). Quoted: n/a.
- Verdict: **later**. Cheap, resolution-independent semantic images; needs strict sanitising and caching, plus a placeholder while waiting.

### Text embedding to generator parameters

#### Text embedding to generator parameters (`embedding-params`) [53]

Embed title/description (Transformers.js MiniLM, ~384 dims), project to a few numbers (hue, shape id, density) to drive a deterministic generator.

- Upstream: none; npm: none
- Licence: Apache-2.0; MIT-compatible to bundle: yes; restrictions: Depends on the embedding model licence (all-MiniLM-L6-v2: Apache-2.0). Model files ~23 MB quantised; first-run download; vectors can differ across runtimes/quantisation, so cache the derived params per item.
- Maintenance: unknown; last release n/a
- Runtime: browser,node,webgpu,network. Cost: free; One-time model download. Secret needed: no
- Style: abstract; semantics: embedding; output: svg; determinism: cached-nondeterministic; latency ~50 ms (estimate); useful size 16-512 px (estimate)
- Bundle size: not measured here (spikes). Quoted: model ~23 MB (HF repo listing).
- Verdict: **later**. Gives similar items similar colours and shapes with no per-call cost; the model download is the hurdle.

### In-browser LLMs

#### Chrome Prompt API (Gemini Nano) (`chrome-prompt-api`) [62][63]

Built-in on-device LLM in Chrome via LanguageModel; shipped in Chrome 148 (May 2026) per secondary reports.

- Upstream: https://developer.chrome.com/docs/ai/prompt-api; npm: none
- Licence: none/unclear; MIT-compatible to bundle: NO; restrictions: Not a library; on-device Gemini Nano model governed by Google terms and Prohibited Use Policy; Mozilla, Apple, Microsoft and the W3C TAG formally opposed; other browsers do not ship it. Docs updated 2026-05-19 list Chrome 148; whether core API is stable vs origin trial for sampling params is reported inconsistently.
- Maintenance: active; last release 2026-05-05
- Runtime: browser,webgpu. Cost: free; Needs ~22 GB free disk and >4 GB VRAM or 16 GB RAM; model ~4.27 GB downloaded once (secondary report). Secret needed: no
- Style: illustrative; semantics: llm; output: svg; determinism: cached-nondeterministic; latency ~2000 ms (estimate); useful size n/a
- Bundle size: not measured here (spikes). Quoted: n/a (browser built-in).
- Verdict: **optional-peer**. Free, private, but Chrome-desktop-only and heavy; progressive-enhancement tier behind capability check.

#### WebLLM (`web-llm`) [1][2][64][65]

MLC's in-browser LLM engine on WebGPU with OpenAI-compatible API.

- Upstream: https://github.com/mlc-ai/web-llm; npm: `@mlc-ai/web-llm`
- Licence: Apache-2.0; MIT-compatible to bundle: yes; restrictions: Model weights carry their own licences (Llama, Gemma, Qwen terms vary)
- Maintenance: active; last release 2026-11-10
- Runtime: browser,webgpu,network. Cost: free; Downloads 0.5-several GB model on first use. Secret needed: no
- Style: illustrative; semantics: llm; output: svg; determinism: cached-nondeterministic; latency ~5000 ms (estimate); useful size n/a
- Bundle size: not measured here (spikes). Quoted: library plus model weights, hundreds of MB to GB.
- Verdict: **optional-peer**. Cross-browser WebGPU path for LLM-chosen icons/SVG; model size makes it opt-in only.

### Hosted image APIs

#### OpenAI gpt-image (`openai-gpt-image`) [1][66]

Hosted image generation/editing API (gpt-image family; newest listed 2026-11-14: gpt-image-2.6 variants).

- Upstream: https://developers.openai.com/api/docs/pricing; npm: `openai`
- Licence: Apache-2.0; MIT-compatible to bundle: yes; restrictions: API terms apply; check output ownership and usage policies; gpt-image-1 retired 2026-10-23; gpt-image-1.5 and -mini retiring 2026-12-01 per secondary sources. SDK is Apache-2.0.
- Maintenance: active; last release 2026-11-13
- Runtime: browser,node,edge,network. Cost: paid; Token billing: image output USD 30 per 1M tokens (official pricing page 2026-11-14); per-image USD ~0.01-0.2 depending on quality (secondary sources). Secret needed: yes
- Style: photorealistic; semantics: llm; output: png, webp, jpeg; determinism: cached-nondeterministic; latency ~15000 ms (estimate); useful size 256-1536 px (estimate)
- Bundle size: not measured here (spikes). Quoted: n/a.
- Verdict: **later**. Highest quality and text rendering, paid and slow; BYOK/proxy only, cache per item.

#### Google Gemini image (Nano Banana) and Imagen (`google-gemini-image`) [1][67][68][69]

Gemini image models ('Nano Banana' family) via @google/genai; Imagen 4 retired in 2026.

- Upstream: https://ai.google.dev/gemini-api/docs/pricing; npm: `@google/genai`
- Licence: Apache-2.0; MIT-compatible to bundle: yes; restrictions: Imagen 4 endpoints retired (Firebase page says 2026-06-24; Gemini API table via secondary sources says 2026-08-17); gemini-2.5-flash-image scheduled shutdown 2027-03-15. SDK Apache-2.0.
- Maintenance: active; last release 2026-11-12
- Runtime: browser,node,edge,network. Cost: paid; No free tier for image models (pricing page 2026-11-14): Nano Banana 2.1 USD 0.0336 per 1K image, Flash Lite Image USD 0.0336. Secret needed: yes
- Style: photorealistic; semantics: llm; output: png; determinism: cached-nondeterministic; latency ~8000 ms (estimate); useful size 256-2048 px (estimate)
- Bundle size: not measured here (spikes). Quoted: n/a.
- Verdict: **later**. Cheap and good, but models churn fast; the author's 'Imagen' is retired, use the Gemini image models.

#### Black Forest Labs FLUX API (`bfl-flux-api`) [70]

BFL's hosted FLUX.2 / FLUX.1 models, billed per megapixel; klein 4B from USD 0.014 per first megapixel.

- Upstream: https://bfl.ai/pricing; npm: none
- Licence: LicenseRef-BFL-API-Terms; MIT-compatible to bundle: NO; restrictions: API terms apply; weights for FLUX.2 [dev]/9B under FLUX Non-Commercial License, only klein 4B is Apache-2.0. No official JS SDK found on npm (@bfl/api does not exist); plain REST or via fal/Replicate.
- Maintenance: active; last release n/a
- Runtime: browser,node,edge,network. Cost: paid; 2026-11-14: FLUX.2 pro USD 0.03 first MP; flex 0.05; klein 9B 0.015; klein 4B 0.014. Secret needed: yes
- Style: photorealistic; semantics: llm; output: png, jpeg; determinism: cached-nondeterministic; latency ~4000 ms (estimate); useful size 256-2048 px (estimate)
- Bundle size: not measured here (spikes). Quoted: n/a.
- Verdict: **later**. Cheapest quality hosted option; REST only, so a thin fetch wrapper through a proxy.

#### fal.ai (client) (`fal`) [1][2][71]

Hosted model marketplace/inference with @fal-ai/client; runs FLUX, Recraft and others with proxy support for keeping keys server-side.

- Upstream: https://github.com/fal-ai/fal-js; npm: `@fal-ai/client`
- Licence: MIT; MIT-compatible to bundle: yes; restrictions: Each hosted model has its own terms. Provides a proxy mode so browsers never hold the API key.
- Maintenance: active; last release 2026-11-14
- Runtime: browser,node,edge,network. Cost: paid; Pay per use; per-model prices on fal.ai (not retrieved). Secret needed: yes
- Style: photorealistic; semantics: llm; output: png, jpeg, svg; determinism: cached-nondeterministic; latency ~5000 ms (estimate); useful size 256-2048 px (estimate)
- Bundle size: not measured here (spikes). Quoted: n/a.
- Verdict: **later**. One BYOK/proxy integration reaches many models, including FLUX and Recraft.

#### Replicate (client) (`replicate`) [1][2][72]

Hosted model API with official JS client; FLUX and many community models.

- Upstream: https://github.com/replicate/replicate-javascript; npm: `replicate`
- Licence: Apache-2.0; MIT-compatible to bundle: yes; restrictions: Per-model licences apply. Last release 2025-11 (modified 2026-06).
- Maintenance: maintained; last release 2025-11-17
- Runtime: node,edge,network. Cost: paid; Per-second/per-run billing. Secret needed: yes
- Style: photorealistic; semantics: llm; output: png, webp; determinism: cached-nondeterministic; latency ~6000 ms (estimate); useful size 256-2048 px (estimate)
- Bundle size: not measured here (spikes). Quoted: n/a.
- Verdict: **later**. Same role as fal; add only if users ask.

#### Recraft API (`recraft`) [73][74]

Hosted raster and true vector (SVG) generation, including icon-like styles; 1 USD = 1000 API units.

- Upstream: https://www.recraft.ai/docs/api-reference/pricing; npm: none
- Licence: LicenseRef-Recraft-Terms; MIT-compatible to bundle: NO; restrictions: Commercial usage terms not confirmed in the pricing page; read terms before shipping; Official MCP server repo recraft-ai/mcp-recraft-server is archived (MIT). No official JS SDK; OpenAI-compatible REST.
- Maintenance: active; last release n/a
- Runtime: browser,node,edge,network. Cost: paid; 2026-11-14: raster USD 0.007-0.04/image (V4.1 Flash V2 0.007); vector USD 0.05-0.08/image; no free tier listed. Secret needed: yes
- Style: illustrative; semantics: llm; output: svg, png; determinism: cached-nondeterministic; latency ~8000 ms (estimate); useful size 64-2048 px (estimate)
- Bundle size: not measured here (spikes). Quoted: n/a.
- Verdict: **later**. Only mainstream API returning real SVG, a fit for tiny scalable icons; paid and BYOK/proxy.

#### Pollinations image endpoint (`pollinations`) [75]

Keyless text-to-image GET endpoint (image.pollinations.ai); newer gen.pollinations.ai API reportedly needs a key.

- Upstream: https://pollinations.ai; npm: none
- Licence: none/unclear; MIT-compatible to bundle: NO; restrictions: Anonymous tier reportedly ~1 request per 15 s and may watermark; no SLA; terms not read from the official site. Only third-party descriptions retrieved; endpoint returned HTTP 200 on 2026-11-14.
- Maintenance: unknown; last release n/a
- Runtime: browser,node,edge,network. Cost: free; Keyless but throttled. Secret needed: no
- Style: photorealistic; semantics: llm; output: jpeg, png; determinism: cached-nondeterministic; latency ~10000 ms (estimate); useful size 256-1024 px (estimate)
- Bundle size: not measured here (spikes). Quoted: n/a.
- Verdict: **avoid**. Only keyless AI image endpoint seen, but throttled, unofficial terms and no SLA; use a mock instead.

### Deterministic palette generation

#### Hash-to-OKLCH palette (in-house) (`oklch-hash-palette`) 

Maps a hash to hue and fixed-lightness/chroma in OKLCH, with gamut clamping; guarantees even perceptual spacing and contrast.

- Upstream: none; npm: none
- Licence: MIT; MIT-compatible to bundle: yes. Hand-rolled (OKLab matrices ~30 lines); culori is the validating reference.
- Maintenance: active; last release n/a
- Runtime: browser,node,edge. Cost: free;  Secret needed: no
- Style: abstract; semantics: hash; output: svg; determinism: pure; latency ~0.01 ms (estimate); useful size n/a
- Bundle size: not measured here (spikes). Quoted: in-house; to be measured.
- Verdict: **mvp**. Colour drives distinguishability; tiny, no dependency; shared by every in-house generator.

#### culori (`culori`) [1][2][76]

Tree-shakeable colour library with OKLCH, gamut mapping and interpolation.

- Upstream: https://github.com/Evercoder/culori; npm: `culori`
- Licence: MIT; MIT-compatible to bundle: yes
- Maintenance: maintained; last release 2025-06-27
- Runtime: browser,node,edge. Cost: free;  Secret needed: no
- Style: abstract; semantics: hash; output: n/a; determinism: pure; latency ~0.05 ms (estimate); useful size n/a
- Bundle size: not measured here (spikes). 
- Verdict: **optional-peer**. Excellent but unneeded at runtime if the in-house palette suffices; use in spikes and tests as the reference.

#### chroma.js (`chroma-js`) [1][2][77]

Colour manipulation and scales, including ColorBrewer palettes.

- Upstream: https://github.com/gka/chroma.js; npm: `chroma-js`
- Licence: (BSD-3-Clause AND Apache-2.0); MIT-compatible to bundle: yes; restrictions: Notices for BSD-3-Clause and Apache-2.0 (ColorBrewer) parts. GitHub reports NOASSERTION; npm gives the expression.
- Maintenance: active; last release 2026-11-09
- Runtime: browser,node,edge. Cost: free; Larger than culori. Secret needed: no
- Style: abstract; semantics: hash; output: n/a; determinism: pure; latency ~0.05 ms (estimate); useful size n/a
- Bundle size: not measured here (spikes). 
- Verdict: **study**. Useful scales but heavier and less OKLCH-native than the in-house helper.

### Placeholders (BlurHash, ThumbHash)

#### BlurHash (`blurhash`) [1][2][78]

Compact string encoding of a blurred image preview (Wolt).

- Upstream: https://github.com/woltapp/blurhash; npm: `blurhash`
- Licence: MIT; MIT-compatible to bundle: yes. Reference TS decoder is tiny; repo push 2024-07.
- Maintenance: stale; last release 2023-02-17
- Runtime: browser,node,edge. Cost: free; Encoding needs pixel data. Secret needed: no
- Style: abstract; semantics: hash; output: png, canvas; determinism: pure; latency ~1 ms (estimate); useful size 16-64 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **later**. Stores a ~20-30 char string per item to show before the real image; helpful for slow generators.

#### ThumbHash (`thumbhash`) [1][2][79]

Evan Wallace's improved placeholder hash, ~25 bytes, preserves aspect and alpha.

- Upstream: https://github.com/evanw/thumbhash; npm: `thumbhash`
- Licence: MIT; MIT-compatible to bundle: yes. Stable single-file algorithm; repo push 2024-05.
- Maintenance: stale; last release 2023-03-22
- Runtime: browser,node,edge. Cost: free;  Secret needed: no
- Style: abstract; semantics: hash; output: png, canvas; determinism: pure; latency ~1 ms (estimate); useful size 16-64 px (estimate)
- Bundle size: not measured here (spikes). 
- Verdict: **later**. Better colour and alpha than BlurHash at similar size; same role.


## Comparison table

Runtime codes: B browser, N node, E edge, GPU needs WebGPU, Net needs network.

| id | cat | licence | MIT ok | maint | runtime | style | semantics | determinism | verdict |
|---|---|---|---|---|---|---|---|---|---|
| jdenticon | identicon | MIT | yes | stale | B/N/E | geometric | hash | pure | later |
| blockies | identicon | MIT | yes | stale | B/N/E | geometric | hash | seeded | study |
| minidenticons | identicon | MIT | yes | stale | B/N/E | geometric | hash | pure | mvp |
| hashicon | identicon | Apache-2.0 | yes | stale | B | geometric | hash | pure | study |
| avvvatars | identicon | MIT | yes | stale | B/N | geometric | hash | pure | study |
| multiavatar | identicon | LicenseRef-Multiavatar-1.0 | no | stale | B/N/E | illustrative | hash | pure | optional-peer |
| boring-avatars | pattern | MIT | yes | active | B/N/E | abstract | hash | pure | later |
| dicebear | pattern | MIT | yes | active | B/N/E | illustrative | hash | pure | later |
| dicebear-http-api | pattern | MIT | yes | active | B/N/E/Net | illustrative | hash | pure | mvp |
| trianglify | pattern | GPL-3.0 | no | stale | B/N/E | abstract | hash | seeded | avoid |
| geopattern | pattern | MIT | yes | stale | B/N/E | geometric | hash | pure | later |
| svgjs | creative-runtime | MIT | yes | active | B/N | geometric | hash | pure | study |
| patternpad | pattern | - | no | unknown | B/Net | geometric | hash | pure | avoid |
| mesh-gradient | gradient-noise | MIT | yes | maintained | B | abstract | hash | seeded | later |
| stripe-gradient | gradient-noise | MIT | yes | stale | B | abstract | hash | seeded | avoid |
| paper-design-shaders | gradient-noise | Apache-2.0 | yes | active | B | abstract | hash | seeded | study |
| simplex-noise | gradient-noise | MIT | yes | maintained | B/N/E | abstract | hash | seeded | later |
| glsl-canvas | gradient-noise | MIT | yes | stale | B | abstract | hash | seeded | avoid |
| rough-js | creative-runtime | MIT | yes | stale | B/N | illustrative | hash | seeded | later |
| satori | html-to-image | MPL-2.0 | yes | active | B/N/E | illustrative | metadata | pure | later |
| takumi | html-to-image | MIT OR Apache-2.0 | yes | active | N/E | illustrative | metadata | pure | later |
| html-to-image | html-to-image | MIT | yes | active | B | illustrative | metadata | cached-nondeterministic | optional-peer |
| native-svg | creative-runtime | MIT | yes | active | B/N/E | abstract | hash | pure | mvp |
| p5js | creative-runtime | LGPL-2.1 | no | active | B | abstract | hash | seeded | avoid |
| twojs | creative-runtime | MIT | yes | active | B | geometric | hash | seeded | study |
| paperjs | creative-runtime | MIT | yes | active | B/N | geometric | hash | seeded | study |
| unsplash-api | stock-photo | LicenseRef-Unsplash-API-Terms | no | active | B/N/E/Net | photorealistic | metadata | cached-nondeterministic | later |
| pexels-api | stock-photo | LicenseRef-Pexels-API-Terms | no | stale | B/N/E/Net | photorealistic | metadata | cached-nondeterministic | later |
| sharp | stock-photo | Apache-2.0 | yes | active | N | photorealistic | hash | pure | optional-peer |
| resvg-js | html-to-image | MPL-2.0 | yes | maintained | B/N/E | geometric | hash | pure | optional-peer |
| sd-turbo | ai-model | LicenseRef-Stability-AI-Community | no | unknown | B/N/E/GPU | photorealistic | llm | cached-nondeterministic | study |
| sdxl-turbo | ai-model | LicenseRef-Stability-AI-Community | no | unknown | N/GPU | photorealistic | llm | cached-nondeterministic | avoid |
| lcm | ai-model | MIT | no | stale | B/N/GPU | photorealistic | llm | cached-nondeterministic | avoid |
| flux2-klein-4b | ai-model | Apache-2.0 | yes | active | N/GPU | photorealistic | llm | cached-nondeterministic | study |
| iris-3b | ai-model | Apache-2.0 | yes | active | N/GPU | photorealistic | llm | cached-nondeterministic | study |
| bonsai-image | ai-model | Apache-2.0 | yes | active | N | photorealistic | llm | cached-nondeterministic | study |
| onnxruntime-web | ai-runtime | MIT | yes | active | B/GPU | photorealistic | embedding | pure | optional-peer |
| transformers-js | ai-runtime | Apache-2.0 | yes | active | B/N/GPU/Net | abstract | embedding | pure | optional-peer |
| web-txt2img | ai-runtime | MIT | no | maintained | B/GPU/Net | photorealistic | llm | cached-nondeterministic | study |
| initials-avatar | initials | MIT | yes | active | B/N/E | geometric | metadata | pure | mvp |
| emoji-background | emoji | MIT | yes | active | B/N/E | illustrative | metadata | pure | mvp |
| icons-lucide | icon-mapping | ISC | yes | active | B/N/E | illustrative | metadata | pure | mvp |
| icons-iconify | icon-mapping | MIT | yes | active | B/N/E | illustrative | metadata | pure | later |
| icons-phosphor | icon-mapping | MIT | yes | maintained | B/N/E | illustrative | metadata | pure | later |
| icons-tabler | icon-mapping | MIT | yes | active | B/N/E | illustrative | metadata | pure | later |
| llm-svg | llm-svg | MIT | yes | unknown | B/N/E/Net | illustrative | llm | cached-nondeterministic | later |
| embedding-params | embedding | Apache-2.0 | yes | unknown | B/N/GPU/Net | abstract | embedding | cached-nondeterministic | later |
| chrome-prompt-api | in-browser-llm | - | no | active | B/GPU | illustrative | llm | cached-nondeterministic | optional-peer |
| web-llm | in-browser-llm | Apache-2.0 | yes | active | B/GPU/Net | illustrative | llm | cached-nondeterministic | optional-peer |
| openai-gpt-image | hosted-image-api | Apache-2.0 | yes | active | B/N/E/Net | photorealistic | llm | cached-nondeterministic | later |
| google-gemini-image | hosted-image-api | Apache-2.0 | yes | active | B/N/E/Net | photorealistic | llm | cached-nondeterministic | later |
| bfl-flux-api | hosted-image-api | LicenseRef-BFL-API-Terms | no | active | B/N/E/Net | photorealistic | llm | cached-nondeterministic | later |
| fal | hosted-image-api | MIT | yes | active | B/N/E/Net | photorealistic | llm | cached-nondeterministic | later |
| replicate | hosted-image-api | Apache-2.0 | yes | maintained | N/E/Net | photorealistic | llm | cached-nondeterministic | later |
| recraft | hosted-image-api | LicenseRef-Recraft-Terms | no | active | B/N/E/Net | illustrative | llm | cached-nondeterministic | later |
| pollinations | hosted-image-api | - | no | unknown | B/N/E/Net | photorealistic | llm | cached-nondeterministic | avoid |
| oklch-hash-palette | palette | MIT | yes | active | B/N/E | abstract | hash | pure | mvp |
| culori | palette | MIT | yes | maintained | B/N/E | abstract | hash | pure | optional-peer |
| chroma-js | palette | (BSD-3-Clause AND Apache-2.0) | yes | active | B/N/E | abstract | hash | pure | study |
| blurhash | placeholder | MIT | yes | stale | B/N/E | abstract | hash | pure | later |
| thumbhash | placeholder | MIT | yes | stale | B/N/E | abstract | hash | pure | later |

## Abstraction by semantics grid

Rows are style on the abstraction axis; columns are semantic level. Cells list generator-role entries (helpers, runtimes and placeholders omitted); MVP picks are bold. Hash-level generators with enormous variety (DiceBear, multiavatar) sit at the style given in their manifests; metadata-level cells are populated by in-house mappings (initials, emoji, icons) and template renderers.

| abstraction \ semantics | hash | metadata | embedding | llm |
|---|---|---|---|---|
| abstract | boring-avatars, trianglify, mesh-gradient, stripe-gradient, paper-design-shaders, **native-svg** | - | embedding-params | - |
| geometric | jdenticon, blockies, **minidenticons**, hashicon, avvvatars, geopattern, patternpad | **initials-avatar** | - | - |
| illustrative | multiavatar, dicebear, **dicebear-http-api** | satori, takumi, html-to-image, **emoji-background**, **icons-lucide**, icons-iconify, icons-phosphor, icons-tabler | - | llm-svg, recraft |
| photorealistic | - | unsplash-api, pexels-api | - | sd-turbo, sdxl-turbo, lcm, flux2-klein-4b, iris-3b, bonsai-image, openai-gpt-image, google-gemini-image, bfl-flux-api, pollinations |

Observations: the grid is dense at (abstract, hash) and (geometric, hash), thin in the embedding column (only the in-house `embedding-params` technique, which drives an abstract generator), and every photorealistic generator is cached-nondeterministic, which forces the B3 cache rule.

## Recommended MVP set

All five generators are zero-network, lazy-loadable and cover different abstraction points. They share one helper, `oklch-hash-palette` (in-house), so colour behaviour is uniform and replaceable.

| # | id | abstraction x semantics | provenance | why |
|---|---|---|---|---|
| 1 | `native-svg` | abstract x hash | in-house, no dependencies | The tiny seeded SVG anchor of the façade; sub-kilobyte, deterministic, no licence risk |
| 2 | `minidenticons` | geometric x hash | third-party wrap, MIT [1][2][5][6] | Smallest credible third-party identicon; proves the wrap/plugin path with a permissive licence |
| 3 | `initials-avatar` | geometric x metadata | in-house | Best recognition for person-like lists; reads `name` |
| 4 | `emoji-background` | illustrative x metadata | in-house + MIT emoji list [1][2][56] | Concrete and distinguishable at 24 px; keyword override |
| 5 | `icons-lucide` | illustrative x metadata | third-party data, ISC [1][2][57] | Keyword or tag to icon mapping on a coloured tile; import individual icons only |

Mind the following in the MVP: emoji glyphs differ per OS, so only the emoji choice (not pixels) is deterministic; keep the emoji data subset small; take Lucide icons per-icon, not the whole set.

Not in the MVP although attractive: `boring-avatars` and `jdenticon` (add right after, MIT) and `dicebear` (wrap per style with a CC0 allow-list; recommended as the first "later" item because of the style catalogue).

### Remote and async path candidate

Recommend a two-part answer:

1. **Real keyless service: `dicebear-http-api`.** It is free, keyless, deterministic and returns SVG, so it exercises the async/placeholder/cache/timeout path end to end [14]. Constraints: the public API is free for non-commercial use only, rate limited (50 req/s SVG, 10 req/s raster), no availability guarantee, style licences still apply; the seam must accept a self-hosted base URL.
2. **Mock backend for the AI/BYOK path.** No keyless service for AI images is dependable: Pollinations' anonymous tier is throttled with no SLA and its terms were not verifiable first-hand [75]. Implement a mock returning cached-nondeterministic SVG after a delay, with a proxy/BYOK interface matching OpenAI/BFL/Recraft usage (keys never in the bundle, per B12) and a cache keyed by item key + generator id/version + params (B3).

## Per-concern recommendations that came out of the survey

- **Stock photos** (Unsplash, Pexels): their terms (hotlinking, attribution, download tracking, rate limits) conflict with generate-once-and-store (B18); only via a developer proxy and never by default [1][33][34][35][1][36][37].
- **Local diffusion** is not viable as a default: SD-Turbo needs ~2.3 GB and WebGPU with a licence that restricts commercial use [1][2][54][55][40][41].
- **Embeddings** are the cheapest real semantic step: all-MiniLM-L6-v2 is ~23 MB quantised [1][2][52][53], but cache the derived parameters since vectors can shift across runtimes and quantisation.
- **LLM-written SVG** must be sanitised and moderated before use; treat as cached-nondeterministic .
- **Rasterising for crawlers**: a deterministic SVG-to-PNG helper (resvg) is needed for targets that reject SVG [1][2][39].

## REFERENCES

1. [npm registry (package metadata, queried 2026-11-14)](https://registry.npmjs.org/)
2. [GitHub REST API (repository metadata, queried 2026-11-14)](https://docs.github.com/rest/repos/repos#get-a-repository)
3. [jdenticon (repository)](https://github.com/dmester/jdenticon)
4. [blockies-ts (repository)](https://github.com/pedrouid/blockies-ts)
5. [minidenticons (repository)](https://github.com/laurentpayot/minidenticons)
6. [minidenticons README](https://github.com/laurentpayot/minidenticons#readme)
7. [hashicon (repository)](https://github.com/emeraldpay/hashicon)
8. [avvvatars-react (repository)](https://github.com/nusu/avvvatars)
9. [@multiavatar/multiavatar (repository)](https://github.com/multiavatar/Multiavatar)
10. [Multiavatar LICENSE](https://raw.githubusercontent.com/multiavatar/Multiavatar/main/LICENSE)
11. [boring-avatars (repository)](https://github.com/boringdesigners/boring-avatars)
12. [dicebear (repository)](https://github.com/dicebear/dicebear)
13. [DiceBear licences page](https://www.dicebear.com/licenses/)
14. [DiceBear API](https://www.dicebear.com/how-to-use/http-api/)
15. [trianglify (repository)](https://github.com/qrohlf/trianglify)
16. [geopattern (repository)](https://github.com/btmills/geopattern)
17. [@svgdotjs/svg.js (repository)](https://github.com/svgdotjs/svg.js)
18. [PatternPad](https://www.producthunt.com/products/patternpad)
19. [@mesh-gradient/core (repository)](https://github.com/mikhailmogilnikov/mesh-gradient)
20. [pkgstats: mesh-gradient.js and alternatives search](https://www.pkgstats.com/pkg:@mesh-gradient/core)
21. [stripe-gradient (repository)](https://github.com/khasty720/stripe-gradient)
22. [@paper-design/shaders (repository)](https://github.com/paper-design/shaders)
23. [simplex-noise (repository)](https://github.com/jwagner/simplex-noise.js)
24. [glsl-canvas-js (repository)](https://github.com/actarian/glsl-canvas)
25. [roughjs (repository)](https://github.com/rough-stuff/rough)
26. [satori (repository)](https://github.com/vercel/satori)
27. [@takumi-rs/core (repository)](https://github.com/kane50613/takumi)
28. [Takumi renderer (Nuxt OG Image docs)](https://nuxtseo.com/og-image/renderers/takumi)
29. [html-to-image (repository)](https://github.com/bubkoo/html-to-image)
30. [p5 (repository)](https://github.com/processing/p5.js)
31. [two.js (repository)](https://github.com/jonobr1/two.js)
32. [paper (repository)](https://github.com/paperjs/paper.js)
33. [Unsplash API](https://unsplash.com/documentation)
34. [Unsplash API guidelines](https://help.unsplash.com/api-guidelines/unsplash-api-guidelines)
35. [Unsplash rate-limit help](https://help.unsplash.com/en/articles/3887917-when-should-i-apply-for-a-higher-rate-limit)
36. [Pexels API](https://www.pexels.com/api/documentation/)
37. [Pexels API rate-limit help](https://help.pexels.com/hc/en-us/articles/900005852323)
38. [sharp (repository)](https://github.com/lovell/sharp)
39. [@resvg/resvg-js (repository)](https://github.com/yisibl/resvg-js)
40. [stabilityai/sd-turbo](https://huggingface.co/stabilityai/sd-turbo)
41. [Stability AI licence](https://stability.ai/license)
42. [stabilityai/sdxl-turbo](https://huggingface.co/stabilityai/sdxl-turbo)
43. [luosiallen/latent-consistency-model (repository)](https://github.com/luosiallen/latent-consistency-model)
44. [LCM-LoRA SDXL model card (OpenRAIL++)](https://huggingface.co/latent-consistency/lcm-lora-sdxl)
45. [black-forest-labs/FLUX.2-klein-4B](https://huggingface.co/black-forest-labs/FLUX.2-klein-4B)
46. [FLUX.2 repository (licence table)](https://github.com/black-forest-labs/flux2)
47. [Vercel AI Gateway: FLUX.2 klein 4B](https://vercel.com/ai-gateway/models/flux-2-klein-4b.md)
48. [speridlabs/iris-3b](https://huggingface.co/speridlabs/iris-3b)
49. [prismml/bonsai-image](https://prismml.com/news/bonsai-image-4b)
50. [PrismML Bonsai Image docs](https://docs.prismml.com/models/bonsai-image)
51. [onnxruntime-web (repository)](https://github.com/microsoft/onnxruntime)
52. [@huggingface/transformers (repository)](https://github.com/huggingface/transformers.js)
53. [Xenova/all-MiniLM-L6-v2 model files](https://huggingface.co/Xenova/all-MiniLM-L6-v2/tree/main/onnx)
54. [web-txt2img (repository)](https://github.com/lacerbi/web-txt2img)
55. [onnxruntime-inference-examples js/sd-turbo](https://github.com/microsoft/onnxruntime-inference-examples/tree/main/js/sd-turbo)
56. [sigilsmith in-house + unicode-emoji-json (repository)](https://github.com/muan/unicode-emoji-json)
57. [Lucide (repository)](https://github.com/lucide-icons/lucide)
58. [Iconify (repository)](https://github.com/iconify/iconify)
59. [Iconify](https://iconify.design/)
60. [Phosphor Icons (repository)](https://github.com/phosphor-icons/core)
61. [Tabler Icons (repository)](https://github.com/tabler/tabler-icons)
62. [Chrome built-in AI](https://developer.chrome.com/docs/ai/prompt-api)
63. [Prompt API: Chrome Intent to Ship thread](https://groups.google.com/a/chromium.org/g/blink-dev/c/iR6R7-nQeHI)
64. [@mlc-ai/web-llm (repository)](https://github.com/mlc-ai/web-llm)
65. [WebGPU supported in major browsers (web.dev)](https://web.dev/blog/webgpu-supported-major-browsers)
66. [OpenAI Images API](https://developers.openai.com/api/docs/pricing)
67. [Gemini API](https://ai.google.dev/gemini-api/docs/pricing)
68. [Gemini API pricing](https://aistudio.google.com/docs/pricing)
69. [Migrate from Imagen to Gemini image (Firebase)](https://firebase.google.com/docs/ai-logic/imagen-models-migration)
70. [BFL API](https://bfl.ai/pricing)
71. [@fal-ai/client (repository)](https://github.com/fal-ai/fal-js)
72. [replicate (repository)](https://github.com/replicate/replicate-javascript)
73. [Recraft API](https://www.recraft.ai/docs/api-reference/pricing)
74. [recraft-ai/mcp-recraft-server (archived)](https://github.com/recraft-ai/mcp-recraft-server)
75. [Pollinations](https://pollinations.ai)
76. [culori (repository)](https://github.com/Evercoder/culori)
77. [chroma-js (repository)](https://github.com/gka/chroma.js)
78. [blurhash (repository)](https://github.com/woltapp/blurhash)
79. [thumbhash (repository)](https://github.com/evanw/thumbhash)
