---
author: Thor Whalen
date: 2026-11-14
---

# sigilsmith spike: bundle sizes and distinguishability of lightweight identity-image generators

Throwaway spike for brief B10 (bundle size measured from a minimal real import) and B14 (quality criteria). Everything here is reproducible, nothing is published.

## Rerun

```bash
cd spikes && npm install && npm run spike
```

`npm run spike` (`node run.mjs`) bundles each entry in `entries/` with esbuild (`--bundle --minify --format=esm --platform=browser`, tree-shaking on), measures min, gzip -9 and brotli (quality 11), renders the keys, computes the metrics, writes `contact-sheets/`, `results.json`, and refreshes the table below. `node run.mjs <id> [<id>...]` reruns only some libraries and merges them into the existing `results.json`. Library list and notes: `libs.mjs`. Takes about 8 minutes (the contact sheets dominate).

## Method

- **Size**: one entry file per library (`entries/<id>.mjs`) that imports what a real integration imports and returns an SVG (or data URL) for a string. Sizes are the esbuild output of that entry, so the multi-package DiceBear numbers are core + that one style. The in-house hash + PRNG are part of the `simplex-noise` and `roughjs` entries (they need a seed) and so counted.
- **Metrics**: 300 synthetic keys (a third UUIDs, a third `word-word-N` slugs, a third `First Last N` names), each rasterized at 32x32 with resvg, composited on white. Pairwise RGB L2 distance normalised to 0-1 (44,850 pairs); "near-dup" means distance < 0.05. Contrast is the mean WCAG contrast ratio of opaque pixels (alpha >= 128) against `#ffffff` and `#111111`; an image "vanishes" below 1.5, and a library is flagged VANISHES when more than 5% of its images do. Render time is the median of one call per key in Node after a 20-call warm-up (SVG string production only, not rasterization). Determinism: every key rendered twice, outputs compared for exact equality.
- **Contact sheets**: 24 names (song titles, people, project slugs, UUIDs, a one-letter string, an email) at 128/64/32/16 px on light and dark. Each library has an `.html` (vector, scales in a browser) and a `.png` (resvg raster, under 300 KB; large sheets were downscaled, see `sheet.pngScale` in `results.json`).

## Results

All sizes in kB (1 kB = 1024 bytes), sorted by gzip. Machine-readable version with raw bytes, percentiles and per-library notes: `results.json`.

<!-- table:start -->
| library | version | licence | min kB | gzip kB | brotli kB | near-dup pairs | min dist | light / dark contrast | ms/image | deterministic |
|---|---|---|---|---|---|---|---|---|---|---|
| [in-house-baseline](contact-sheets/in-house-baseline.html) | in-house | MIT (ours) | 0.5 | 0.4 | 0.3 | 1 | 0.0059 | ok (4.1) / ok (6.06) | 0.001 | y |
| [minidenticons](contact-sheets/minidenticons.html) | 4.2.1 | MIT | 0.8 | 0.5 | 0.4 | 0 | 0.1091 | ok (3.72) / ok (7.16) | 0.001 | y |
| [download-blockies](contact-sheets/download-blockies.html) | 1.0.3 | MIT | 1.3 | 0.7 | 0.6 | 0 | 0.137 | ok (5.05) / ok (6.01) | 0.02 | y |
| [simplex-noise](contact-sheets/simplex-noise.html) | 4.0.3 | MIT | 1.5 | 0.9 | 0.8 | 0 | 0.1091 | ok (4.1) / ok (6.3) | 0.057 | y |
| [blurhash](contact-sheets/blurhash.html) | 2.0.5 | MIT | 2.2 | 1.2 | 1.1 | 1 | 0.0432 | VANISHES (3.04) / ok (8.82) | 0.289 | y |
| [thumbhash](contact-sheets/thumbhash.html) | 0.1.1 | MIT | 2.5 | 1.5 | 1.3 | 780 | 0 | VANISHES (6.28) / VANISHES (7.82) | 0.108 | y |
| [blockies-base64](contact-sheets/blockies-base64.html) | 1.0.2 | MIT | 6.2 | 2.8 | 2.5 | 0 | 0.1449 | ok (5.01) / ok (6.05) | 0.563 | y |
| [jdenticon](contact-sheets/jdenticon.html) | 3.3.0 | MIT | 5.4 | 2.8 | 2.5 | 3 | 0.0229 | ok (4.65) / ok (6.56) | 0.015 | y |
| [boring-avatars](contact-sheets/boring-avatars.html) | 2.0.4 | MIT | 10.9 | 2.8 | 2.4 | 38 | 0 | ok (4.33) / ok (5.59) | 0.145 | y |
| [dicebear-initials](contact-sheets/dicebear-initials.html) | 9.4.3 | MIT | 9.8 | 3.9 | 3.5 | 34 | 0 | ok (3.63) / ok (6.97) | 0.011 | y |
| [dicebear-identicon](contact-sheets/dicebear-identicon.html) | 9.4.3 | MIT | 12.7 | 4.2 | 3.6 | 0 | 0.1435 | ok (4.06) / ok (5.88) | 0.011 | y |
| [dicebear-shapes](contact-sheets/dicebear-shapes.html) | 9.4.3 | MIT | 15.3 | 4.5 | 4.0 | 0 | 0.1473 | ok (3.34) / ok (8.56) | 0.014 | y |
| [dicebear-glass](contact-sheets/dicebear-glass.html) | 9.4.3 | MIT | 14.5 | 5.1 | 4.4 | 6 | 0.0345 | VANISHES (1.91) / ok (11.32) | 0.014 | y |
| [geopattern](contact-sheets/geopattern.html) | 1.2.3 | MIT | 19.1 | 5.7 | 5.1 | 284 | 0.0191 | ok (5.43) / ok (3.67) | 0.114 | y |
| [roughjs](contact-sheets/roughjs.html) | 4.6.6 | MIT | 27.6 | 9.3 | 8.3 | 0 | 0.1363 | ok (12.74) / VANISHES (1.58) | 0.15 | y |
| [hashicon](#) | 0.5.2 | Apache-2.0 | 50.2 | 11.5 | 9.1 | n/a | n/a | n/a | n/a | n/a |
| [trianglify](contact-sheets/trianglify.html) | 4.1.1 | GPL-3.0 | 60.5 | 21.9 | 19.1 | 0 | 0.0558 | ok (3.21) / ok (7.96) | 0.319 | y |
| [multiavatar](contact-sheets/multiavatar.html) | 1.0.7 | SEE LICENSE IN LICENSE | 67.4 | 26.3 | 22.5 | 0 | 0.1007 | ok (4.9) / ok (7.3) | 0.06 | y |
<!-- table:end -->

## Commentary

**The floor is tiny.** A hand-written FNV-1a + mulberry32 5x5 mirrored identicon is 0.4 kB gzipped. Anything above roughly 1 kB has to earn it with a richer visual vocabulary. Its weakness is the key space: 15 free bits plus a hue gives 1 near-duplicate pair in 300 keys (minimum distance 0.006), so a real v1 needs more cells or more colour/shape channels, not a library.

**Smallest credible libraries.** `minidenticons` (0.5 kB gz, MIT, zero near-duplicates, minimum distance 0.11) is the standout: nearly the price of the baseline, more distinct, and fine on both themes. `@download/blockies` is 0.7 kB but needs a canvas (`createIcon(...).toDataURL()`), so it is a browser-only data-URL source; `ethereum-blockies-base64` is pure JS but 2.8 kB because of the bundled PNG encoder. Both blockies variants are distinct (zero near-duplicates) but are pixel art with a fixed look.

**Mid range (2.8 to 6 kB gz).** `jdenticon` (2.8 kB, 3 near-duplicates, looks the most polished) is the best general-purpose identicon. `boring-avatars` is 2.8 kB only because React and the JSX runtime are excluded; it is React-only and its 5-colour palettes plus a few faces give 38 near-duplicate pairs. DiceBear is 4 to 5 kB per style (core is most of it); `identicon` and `shapes` are fully distinct (min distance about 0.14), `initials` collides by design (34 near-duplicate pairs, depends on fonts) and `glass` is semi-transparent so it nearly vanishes on white (129 of 300 images below contrast 1.5). `geopattern` (5.7 kB) makes attractive tiling backgrounds but at 32 px most look alike (284 near-duplicate pairs).

**Large or unsuitable.** `multiavatar` (26 kB gz, embedded art) is distinct and pretty but carries a custom licence ("COPYRIGHTS 2020-2021 (c) Gie Katon", see its LICENSE; not an OSI licence), so treat it as non-compatible with an MIT package until a lawyer says otherwise. `trianglify` (22 kB gz) is GPL-3.0, which cannot be bundled into an MIT package; measured for reference only. `hashicon` (11.5 kB gz, Apache-2.0) needs a real canvas, so it was sized but not rendered. `roughjs` (9.3 kB) is a drawing library rather than a generator; the sketchy circle I built from it vanishes on the dark theme (77 of 300 images) because strokes are hard-coded `#333`, which is the kind of mistake a theme-aware generator has to avoid.

**Primitives, not generators.** `thumbhash` (1.5 kB) and `blurhash` (1.2 kB, decoder only, canvas output excluded) decode compact hashes into blurry colour fields. Fed pseudo-random bytes derived from a key they produce clipped, saturated blobs and near-duplicates (the thumbhash numbers mostly measure my synthetic key-to-hash mapping, not the library), so a key-to-hash mapper would have to be designed before they are useful. `simplex-noise` (0.9 kB with in-house PRNG) works well as a texture primitive: 16x16 hue-shifted noise cells, zero near-duplicates.

**Common to all.** Every library is deterministic (byte-identical output twice) and renders in well under a millisecond per image in Node, so speed is not a selection criterion; PNG-based blockies and blurhash are the slowest at 0.3 to 0.6 ms.

**Takeaways for sigilsmith.** Ship the in-house identicon as the zero-dependency default (grow its key space), treat `minidenticons`, `jdenticon` and the `@dicebear/identicon`/`shapes` styles as the reference outputs to beat on distinguishability, build any texture-style generator on `simplex-noise`-class primitives, and keep GPL (`trianglify`) and custom-licence (`multiavatar`) code out of the dependency tree. Light/dark behaviour needs an explicit check in the harness for any generator that uses transparency or fixed greys.

## Caveats

- `boring-avatars`: React and `react/jsx-runtime` are external and not counted; it is rendered with `react-dom/server`.
- `@dicebear/*`: `import * as style` is the documented usage and is not tree-shakeable, so each style counts fully.
- `blurhash`: size excludes the canvas or PNG code needed to show the pixels; `hashicon`: sized only (canvas). `@download/blockies` is rendered through a fake canvas that records `fillRect` calls.
- `thumbhash` and `blurhash` rely on my own key-to-hash mapping; `simplex-noise` and `roughjs` entries are my compositions, not the libraries' own generators.
- `dicebear-initials` text uses whatever fonts resvg finds on this Mac; absolute numbers there are indicative.
- resvg (the Node rasterizer) panics on `geopattern` wave paths translated far outside the canvas and on `preserveAspectRatio="slice"` with a non-square viewBox, so the harness centre-crops by viewBox and drops invisible out-of-window wave paths before rasterizing. The visible output is unchanged.
- Metrics use 300 synthetic keys and one 32 px raster; they rank libraries, they do not prove uniqueness at scale.

## Candidates not measured

- `@dicebear/*` illustration styles (avataaars, lorelei and similar): large embedded art, while identicon, shapes, initials and glass cover the geometric end.
- `react-blockies`, jazzicon variants: React or canvas wrappers around algorithms already represented by the two blockies packages.
- Small unmaintained identicon forks: represented by `minidenticons` and `jdenticon`.

## Contact sheets

Each links to the vector HTML sheet; the PNG sits next to it.

- [in-house-baseline](contact-sheets/in-house-baseline.html) ([png](contact-sheets/in-house-baseline.png))
- [minidenticons](contact-sheets/minidenticons.html) ([png](contact-sheets/minidenticons.png))
- [jdenticon](contact-sheets/jdenticon.html) ([png](contact-sheets/jdenticon.png))
- [dicebear-identicon](contact-sheets/dicebear-identicon.html) ([png](contact-sheets/dicebear-identicon.png))
- [dicebear-shapes](contact-sheets/dicebear-shapes.html) ([png](contact-sheets/dicebear-shapes.png))
- [dicebear-initials](contact-sheets/dicebear-initials.html) ([png](contact-sheets/dicebear-initials.png))
- [dicebear-glass](contact-sheets/dicebear-glass.html) ([png](contact-sheets/dicebear-glass.png))
- [boring-avatars](contact-sheets/boring-avatars.html) ([png](contact-sheets/boring-avatars.png))
- [geopattern](contact-sheets/geopattern.html) ([png](contact-sheets/geopattern.png))
- [trianglify](contact-sheets/trianglify.html) ([png](contact-sheets/trianglify.png))
- [blockies-base64](contact-sheets/blockies-base64.html) ([png](contact-sheets/blockies-base64.png))
- [download-blockies](contact-sheets/download-blockies.html) ([png](contact-sheets/download-blockies.png))
- [multiavatar](contact-sheets/multiavatar.html) ([png](contact-sheets/multiavatar.png))
- [thumbhash](contact-sheets/thumbhash.html) ([png](contact-sheets/thumbhash.png))
- [blurhash](contact-sheets/blurhash.html) ([png](contact-sheets/blurhash.png))
- [simplex-noise](contact-sheets/simplex-noise.html) ([png](contact-sheets/simplex-noise.png))
- [roughjs](contact-sheets/roughjs.html) ([png](contact-sheets/roughjs.png))
