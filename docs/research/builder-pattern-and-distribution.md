---
title: "The builder-package pattern and sigilsmith's distribution model"
author: Thor Whalen
date: 2026-11-14
---

# The builder-package pattern and sigilsmith's distribution model

This report covers items C2 and C3 of the brief (`docs/brief.md`) and ends with a recommendation on the open question B9 (distribution model). Facts about tooling that changes fast are stamped "as of 2026-11-14", the date the sources were read. Statements marked **(analysis)** are my reasoning from the cited facts; **(estimate)** marks numbers that have not been measured yet and must be confirmed by the bundle-size spike (D8).

## Summary

**The pattern has no single standard name.** What the brief calls a "builder package" combines several named practices: a *code generator / scaffolder* that also ships *migrations* for the code it generated (Angular schematics, `nx migrate`) [1], [2]; the *open code* copy-in registry popularised by shadcn/ui [3]; *compile-time or zero-runtime libraries* (Svelte, vanilla-extract, Panda CSS, StyleX, Tailwind) [4], [5], [6], [7], [8]; and *continuous generation from config*, which Expo adopted in place of "ejecting" [9]. The rule that generated code and handwritten code must live apart so that regeneration never clobbers edits is an old named pattern, **Generation Gap** (Vlissides) [10].

**Best practice as of late 2026 converges on hybrids, not on any pure mode.** The clearest evidence is shadcn/ui itself, the flagship of copy-in code. In 2026 it moved shared code back into npm packages: a `shadcn/tailwind.css` file because RTL bugs "were easier to fix in one shared place" (May 2026) [11], and a `cn` package with a `migrate cn` codemod replacing the helper that had been "copied into every project and registry" (September 2026) [12]. Its recommended way to update copied components is `add --diff`, and its changelog suggests asking an agent to "check for updates from @shadcn and merge with my local changes" [13]. Chakra UI v3's CLI "composes the components in Chakra and puts it in your project" as snippets layered on its runtime package, and leaves updating them "up to you" [14], [15]. Iconify ships the same icon data as a runtime API client, as per-icon packages, and as a compile-time plugin [16], [17]. DiceBear 10 ships seven language cores held to byte-identical output by a language-neutral parity test suite [18].

**Bytes are not a reason to copy code.** With `"sideEffects": false`, one `exports` subpath per generator, and dynamic `import()`, a runtime library delivers the same algorithm bytes as copied-in code, plus a facade of well under a kilobyte **(estimate)** [19], [20], [21]. What a build step really buys is (a) a *static* table of lazy loaders for only the selected generators, which bundlers can split, and (b) keeping config validation (zod costs about 4–13 kB gzipped for an object schema [22]) out of the browser **(analysis)**.

**Agents are least reliable exactly where sigilsmith would need them.** A new package is by definition absent from model training data. Vercel measured a 53% pass rate on Next.js APIs not in training data with no docs, against 100% with an 8 kB docs index always in context, and skills were not invoked in 56% of cases [23]. GPT-4o produced valid invocations for only 38.58% of low-frequency cloud APIs [24]; code LLMs hallucinate package names (at least 5.2% for commercial and 21.7% for open-source models) [25]; and they keep using deprecated APIs [26], [27]. Anthropic's own guidance for agent skills says pre-made scripts "are more reliable than generated code" and that fragile operations deserve "low freedom" [28].

**So the line falls at identity.** Everything whose output *is* an item's identity, or that decides whether the integration is correct, stays in shipped, tested, versioned library code: canonical key serialization, hashing, seeded PRNG, palette, deterministic weighted selection, generator algorithms, golden vectors, budget/drift checks and schema validation. The consumer's agent writes only glue: where the image is placed, which storage provider is wired in, the upload endpoint, where the settings panel goes, and inserting registration tags. That glue is held honest by a `check` command and a conformance suite, not by trust.

## Recommendation for B9

**Choose option 5, a specific hybrid: a pinned runtime kernel, a generated wiring module, and agent-written glue under a conformance contract.** ("Pinned kernel + generated wiring + agent glue" is my label, not an established term.)

| Layer | Who writes it | Where it lives | How it is updated | How it is verified |
|---|---|---|---|---|
| **Kernel + generators** | sigilsmith (tested) | npm `sigilsmith`, one subpath per generator *major* | `npm update` (semver); identity never changes without a config edit | CI golden vectors on 3 JS engines; `check vectors` in the host |
| **Wiring module** `sigilsmith.gen.ts` | `sigilsmith build`, from the SSOT config | host repo, committed, "do not edit" header | re-run `sigilsmith build` | `check fresh` (header hash = config hash) |
| **Glue** | the host's agent (or human) | host repo, ordinary code | `sigilsmith migrate` codemods; agent-guided upgrade skill | `sigilsmith/testing` conformance suite; `check bypass`, `check identity` |
| **Vendored generator** (opt-in only) | `sigilsmith vendor <id>` | host repo, hash-locked | re-vendor | `check vendored` (content hash in lock) |

**1. What ships as the npm runtime, and how small.** One MIT, ESM-only package `sigilsmith` with `"sideEffects": false` and an `exports` map that exposes each generator major as its own subpath, so bundlers can only ever pull in what is imported [20], [19]:

```json
{
  "name": "sigilsmith",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": "./dist/core.js",
    "./generators/rings/v1": "./dist/generators/rings/v1.js",
    "./generators/rings/v2": "./dist/generators/rings/v2.js",
    "./adapters/jdenticon/v1": "./dist/adapters/jdenticon/v1.js",
    "./remote": "./dist/remote.js",
    "./react": "./dist/react.js",
    "./testing": "./dist/testing.js",
    "./node": "./dist/node/index.js"
  }
}
```

- `sigilsmith` (core, browser path): canonical composite-key serialization, a small non-cryptographic hash, a seeded PRNG, the hash→OKLCH palette helper, deterministic weighted selection by hash bucketing, the B6 resolver, the lazy-loader registry, the injected cache interface, and the placeholder/fallback orchestration. **No zod on this path**: the config arrives pre-validated from the wiring module. Budget: **≤ 1.5 kB min+brotli (estimate)**, enforced in CI with size-limit, which "throws an error if the cost exceeds the limit" and can measure a single tree-shaken import [29]. For scale, nanoid ships a complete ID generator in 117 bytes under the same tool [30].
- `sigilsmith/generators/<id>/v<major>`: in-house generators, each **≤ 2 kB min+brotli (estimate)**, loaded with dynamic `import()` [21].
- `sigilsmith/adapters/<lib>/v<major>`: thin facades over third-party libraries, which stay *optional peer dependencies* the host installs itself, so their licenses and bytes are the host's explicit choice (B13).
- `sigilsmith/remote`: the secret-safe proxy/BYOK client with result caching (B12, B3).
- `sigilsmith/react`: the optional adapter (B8).
- `sigilsmith/node` (CLI side, never bundled into the browser): zod schemas, catalog, preview, detect-key, explain, build, check, vendor, migrate.
- `sigilsmith/testing`: the conformance suite and golden vectors.

**2. Frozen generator majors: the answer to version pinning (B3).** A generator's output is part of its public API. Any change that alters output bytes for any input ships as a *new subpath* (`rings/v2`), and released subpaths are never modified, only eventually removed in a package major after a long deprecation window. DiceBear does the equivalent for its HTTP API, still serving 5.x–9.x URLs and announcing end-of-life for 5.x–8.x years ahead (30 April 2028) [31]. This decouples two things that npm semver ties together: hosts get kernel bug fixes through ordinary `npm update`, and their identity images change only when someone edits the generator pin in the config **(analysis)**.

**3. What is generated.** `sigilsmith build` reads the SSOT config (`sigilsmith.config.ts`, zod-validated in Node, B0.2) and writes `sigilsmith.gen.ts` into the host's source tree, committed and marked "do not edit". It contains the resolved config as a frozen literal, the compiled policy, and a static loader table for only the selected generators:

```ts
// sigilsmith.gen.ts: GENERATED by `sigilsmith build`. Do not edit.
// Edit sigilsmith.config.ts, then run `sigilsmith build`.
// sigilsmith@0.4.2 · config sha256:9f2c…e1
import { createSigil } from 'sigilsmith';

export const sigil = createSigil({
  config: Object.freeze({ /* resolved key, inputs, policy, budgets */ }),
  generators: {
    'rings@1': () => import('sigilsmith/generators/rings/v1'),
    'jdenticon@1': () => import('sigilsmith/adapters/jdenticon/v1'),
  },
});
```

This is the Generation Gap split [10] and the same contract Expo uses for native folders ("you risk losing your changes the next time you run" prebuild) [9] and Prisma uses for its client generated into the application's codebase [32]. A Vite/unplugin virtual module (`virtual:sigilsmith`) is offered as an option for hosts that want no generated file [33], [34], but the **file is the default** because an agent can read, diff and grep a file, and cannot see a virtual module without running the bundler **(analysis)**.

**4. What is agent-written.** Placement of `<Sigil item={…} />` (or the vanilla call) in the app's lists and cards; wiring the injected zodal `DataProvider` for stored images (B18, B20); the server endpoint that receives uploads, with its validation (B18); where the end-user settings panel and the regeneration prompt (B19) appear; and pasting the target registration snippets that `sigilsmith targets` emits into the app's head and manifest (B17). The agent works from a managed block in the host's `AGENTS.md` that points at version-matched docs shipped inside the package, the pattern Next.js adopted in 16.2/16.3 [35], plus a skill for multi-step workflows (integrate, upgrade) [36] and golden examples.

**5. The contract that keeps the glue honest.** `sigilsmith check --json` runs: `config` (schema), `fresh` (wiring module matches config and package version), `vectors` (golden vectors for every pinned generator major reproduce byte-for-byte in this environment), `identity` (sample items' images match `sigilsmith.lock.json`), `vendored` (vendored files unchanged), `budget` (entry and per-generator chunks under budget), `bypass` (no direct generator imports outside the wiring module, no `Math.random` near sigilsmith calls, no inlined field names), `targets` (registration correct), and `conformance` (the host's adapters pass `sigilsmith/testing`). Every failure prints the fix, per B0.5 and B11.

**6. The byte-stability subtlety: what happens to copied code a host edits.** Copied generator code that a host edits silently changes every identity derived from it, and nothing in a copy-in workflow notices (shadcn's registry schema has no notion of a pinned output or even of a license [37]). The recommendation handles it in four ways: (a) generators are *not* copied by default: they are imported from frozen npm subpaths; (b) customisation goes through **params in the config** or by **forking under a new generator id** (`acme/rings@1`), never by editing a pinned one; (c) when a host does opt into vendoring, the file carries its id, version, license header and content hash, the hash is recorded in `sigilsmith.lock.json`, and `check vendored` fails on any byte change, the way Go refuses a `vendor/` directory inconsistent with `go.mod` [38] and npm records an SRI integrity string per package [39], [40]; (d) `check identity` renders the host's sample items and compares them to the lock, so *any* cause of drift (an edit, a pin change, an upstream library update, a JavaScript engine difference) fails CI with the list of items whose image would change. Accepting a change is an explicit, reviewed act, like updating a committed snapshot [41].

## 1. C2: what the pattern is called, and current practice

### 1.1 Names for the pieces

| Name | What it means | Primary example | Relevance to sigilsmith |
|---|---|---|---|
| Open code / copy-in registry | A CLI copies component source into the host, which then owns it. "This is not a component library. It is how you build your component library." [3] | shadcn/ui, Chakra snippets | Option 2; ownership conflicts with pinned identity |
| Code generator / scaffolder with migrations | Generation schematics tell `ng generate` what to create; update schematics let `ng update` "adjust for breaking changes" in user code [1] | Angular, Nx [2] | The upgrade path for generated and agent-written code |
| Compile-time / zero-runtime library | Work moves to build time; the browser receives only output. Svelte compiles components "into lean, tightly optimized JavaScript" [4] | Svelte, vanilla-extract, Panda, StyleX, Tailwind | Option 3 |
| Bundler plugin / virtual module | Build-time information delivered "using normal ESM import syntax" [33] | unplugin, unplugin-icons | Optional delivery of the wiring module |
| Headless library | Logic, state and API without "markup, styles, or pre-built implementations" [42] | TanStack Table | The core and settings model (B15) |
| Eject | One-way copy of a tool's internals into the project; "you're on your own" [43] | Create React App | Anti-pattern for identity code |
| Continuous generation | Generated artefacts are recreated from config whenever needed and never hand-edited [9] | Expo CNG / prebuild | Model for `sigilsmith.gen.ts` |
| Generation Gap | Separate generated from handwritten code so regeneration is safe [10] | Vlissides (via Fowler) | The rule behind the wiring/glue split |
| Vendoring | Keeping copies of dependencies in the repo, with a manifest the tool checks [38] | `go mod vendor` | Model for opt-in, hash-locked vendoring |

### 1.2 Copy-in registries: shadcn/ui as of 2026-11-14

**The model.** shadcn/ui's stated principles are Open Code ("The top layer of your component code is open for modification"), Composition, Distribution ("A flat-file schema and command-line tool"), Beautiful Defaults, and AI-Ready ("Open code for LLMs to read, understand, and improve") [3].

**The schema.** A `registry-item.json` has `name`, `title`, `description`, `type` (e.g. `registry:lib`, `registry:component`, `registry:file`, `registry:item`), `author`, `dependencies` (npm packages, optionally `@version`), `devDependencies`, `registryDependencies`, `files` (with `path`, `type`, optional `target`), `cssVars`, `css`, `envVars`, `docs`, `categories` and free-form `meta`. It has **no license field** [37]. A third-party registry is any HTTP endpoint or public GitHub repository serving `registry.json` and item files; consumers install by URL or by namespace (`shadcn add @acme/button` after registering `@acme=https://acme.com/r/{name}.json`), and public registries can be listed in the official Registry Index [44], [45].

**The CLI.** As of 2026-11-14 it offers `init`, `add` (with `--overwrite`, `--dry-run`, `--diff`, `--view`), `apply`, `preset`, `view`, `search`, `build`, `docs`, `info --json`, `migrate` (`cn`, `icons`, `base-color`, `rtl`, `radix`) and `eject` [46]. The changelog lists CLI 3.0 with namespaced registries and an MCP server (August 2025), CLI v4 (March 2026), GitHub registries (June 2026), private GitHub registries (August 2026), and React Aria as a third component base (July 2026) [45], [47].

**How upstream fixes reach copied code.** This is the model's known weak point. The original 2023 CLI introduced an experimental `diff` command "to help you keep track of upstream updates" [48]. In 2026 the documented route is `add --diff` / `--dry-run`, and the CLI v4 notes suggest asking an agent to "check for updates from @shadcn and merge with my local changes" [13]. Chakra's guide says snippet updates are announced in the changelog and "it's up to you to decide whether to update the snippets or not"; `snippet add --force` overwrites [15]. jsrepo, a general-purpose registry tool, has an `update` command that shows diffs before overwriting [49].

**The 2026 retreat toward packages.** Two shadcn changes matter most for B9. In May 2026 the init step began importing a shared `shadcn/tailwind.css` because bugs found during RTL work "were easier to fix in one shared place", and `shadcn eject` was added to inline it for those who want no dependency [11]. In September 2026 the `cn` helper, previously "copied into every project and registry", became a package, with `shadcn migrate cn` rewriting imports [12]. The flagship copy-in project now keeps the parts every copy must agree on in a package, delivers them by `npm update`, and uses codemods to move existing copies over. That is the hybrid this report recommends **(analysis)**.

**Agents.** shadcn ships an official skill (`npx skills add shadcn/ui`) that runs `shadcn info --json` "on every interaction" to give the agent the framework, aliases, installed components and base library, and tells it to use `shadcn docs`, `shadcn search` or MCP tools "before generating code" [50].

### 1.3 Compile-time and zero-runtime libraries

These tools share one shape: read declarative input statically, emit plain output, keep at most a tiny runtime. vanilla-extract generates "static CSS files at build time" [5]. Panda CSS uses static analysis, and its "Codegen reads your config and writes the `styled-system` package you import from", so "there's no runtime style engine shipped to the browser" [6]. StyleX compiles to atomic CSS but keeps a "Tiny and fast runtime for merging class names" [7]. Tailwind scans templates for class names and writes "a static CSS file", "with zero-runtime" [8]. Svelte compiles components to JavaScript [4].

Lesson for sigilsmith **(analysis)**: "zero-runtime" in practice means "a minimal runtime plus generated code from config" (StyleX's merger, Panda's generated `styled-system`). Unlike CSS, an identity image still needs code at runtime whenever images are rendered on the fly (B18), so sigilsmith cannot be literally zero-runtime; the realistic target is a tiny kernel plus generated wiring.

### 1.4 Bundler plugins and virtual modules

unplugin is "a unified plugin system for various build tools", covering Vite, Rollup, webpack, esbuild, Rspack, Rsbuild, Rolldown, Farm and Bun, with uneven hook support (for example, esbuild and Bun lack `watchChange`) [34]. Vite's convention is a `virtual:` import id resolved to a `\0`-prefixed id, so build-time information arrives "using normal ESM import syntax" [33]. unplugin-icons is a good precedent: icons as components "on-demand", bundling "the icons you really use" [17]. TanStack Router's bundler plugin likewise generates route configuration "through your bundler's dev and build processes" [51].

### 1.5 Tree-shaking, entry points, code-splitting and budgets

Tree-shaking is "dead-code elimination"; `"sideEffects": false` tells webpack it "can safely prune unused exports", and `/*#__PURE__*/` marks calls as side-effect free [19]. The `exports` field defines subpath and conditional exports and encapsulates everything else: unlisted subpaths throw `ERR_PACKAGE_PATH_NOT_EXPORTED` [20]. That encapsulation is what makes "one subpath per generator major" enforceable: a host physically cannot deep-import a private module whose output is not pinned **(analysis)**. Dynamic `import()` loads a module "conditionally or on demand", but MDN notes static imports benefit more from static analysis and tree-shaking [21], which is why the loader table in the wiring module must use literal specifiers. Budgets: size-limit measures Brotli (default) or gzip size, can measure a single named import after tree-shaking, and fails CI when over [29]; bundlewatch compares each file with the target branch on pull requests [52]. Zod's own measurements show why validation should stay off the browser path: an object schema costs 13.1 kB gzipped with regular Zod and 4.0 kB with Zod Mini [22].

### 1.6 Headless components

TanStack defines headless UI as providing "the logic, state, processing and API" without "markup, styles, or pre-built implementations", trading "More setup required" for "Full control over markup and styles" and "Smaller bundle-sizes" [42]. For sigilsmith this argues that the settings model and regeneration prompt (B15, B19) are headless hooks in the library, and that their placement in the UI is agent glue **(analysis)**.

### 1.7 Eject versus continuous generation

Create React App's `eject` is "a one-way operation", copying configuration and transitive dependencies into the project, after which "you're on your own" [43]. Expo has deprecated ejecting: "All Expo projects now use Continuous Native Generation", where native projects are generated from the app config and config plugins, regenerated with `npx expo prebuild --clean`, and manual edits risk being lost; upgrading becomes "much closer to upgrading a pure JavaScript application" [9]. shadcn's 2026 `eject` is narrow: it inlines one shared CSS file and is documented as irreversible [46], [11]. The trend is away from eject as a way of life and toward regenerating from config, keeping eject as a rare escape hatch **(analysis)**.

### 1.8 Code generation with an upgrade path

Angular separates generation schematics from update schematics that `ng update` runs "to automatically resolve any such changes in the project being updated" [1]. `nx migrate` writes a `migrations.json` and `--run-migrations` applies generators that update source code "to match the new versions of packages" [2]. Prisma's `prisma-client` generator writes the client "into a custom directory in your application's codebase", with a required `output`, giving "full visibility and control over the generated code" [32]. jscodeshift, "a toolkit for running codemods", ships fixture-based test helpers (`defineTest`, `applyTransform`), so codemods are themselves tested [53].

### 1.9 Libraries that offer more than one mode at once

| Library | Modes offered together | Source |
|---|---|---|
| shadcn/ui | Copy-in registry + npm packages for shared code (`shadcn/tailwind.css`, `cn`) + codemods (`migrate`) + skill + MCP | [46], [11], [12], [50] |
| Chakra UI v3 | npm runtime + copy-in snippets composed from it by the CLI | [14], [15] |
| Iconify | Runtime component fetching icon data from an API + per-icon data packages + compile-time via unplugin-icons | [16], [17] |
| DiceBear 10 | JS library + six more language cores + HTTP API (versioned URLs) + CLI + `llms.txt` | [54], [55], [31] |
| Panda CSS | Build-time extraction + generated `styled-system` package in the project | [6] |
| Prisma | Runtime + generated client in the source tree | [32] |
| Next.js | Runtime framework + docs bundled in `node_modules` + managed `AGENTS.md` block + codemods + skills + `next upgrade --agent` | [35] |

DiceBear deserves a closer look because it is sigilsmith's nearest neighbour. Styles are JSON definitions documented by a definition schema, and the core spec says "The PRNG is the interoperability surface": the repository "ships a language-neutral parity test suite" with fixtures for FNV-1a hashes, Mulberry32 sequences, number formatting, colours and full avatar SVGs that must match byte for byte [18], [55]. Its HTTP API documentation concedes the identity-drift risk directly: "Even though we try to always return the same avatar, the design and especially the source code may change" [31]. Its 10.5 release notes flag a default that will change in 11 [56]. Its agent page lists outdated v9 patterns an assistant must not use and warns that the HTTP API ignores unknown parameters, so a stale call "runs and silently does the wrong thing" [54]. And its avatar styles carry their own licenses, separate from the MIT code [54].

## 2. C3: framework versus agent-written code

### 2.1 What the evidence says about agents and library APIs

- **Unfamiliar APIs fail without docs in context.** Vercel's January 2026 eval targeted Next.js 16 APIs "that aren't in current model training data": no docs 53%, a skill 53%, a skill with explicit instructions 79%, an always-present 8 kB docs index in `AGENTS.md` 100%; "In 56% of eval cases, the skill was never invoked" [23]. This is a vendor's own eval on a narrow API set; I found no independent replication.
- **Low-frequency APIs are the worst case.** On CloudAPIBench, GPT-4o "achieves only 38.58% valid low frequency API invocations"; documentation-augmented generation raised that to 47.94% but cost high-frequency APIs a 39.02% absolute drop when retrieval was poor [24].
- **Packages are hallucinated.** Across 16 code LLMs and 576,000 samples, hallucinated packages averaged at least 5.2% for commercial and 21.7% for open-source models, with 205,474 unique invented names [25].
- **Deprecated and version-mismatched APIs persist.** Wang et al. attribute deprecated-API use to deprecated usages in training data and missing deprecation knowledge at inference time [26]; VersiCode finds version-specific generation hard even for strong models, especially for the latest library versions [27].
- **The industry response.** llms.txt (Jeremy Howard, September 2024) exists because "Context windows ... are still too small for most websites" and HTML conversion is "difficult and imprecise" [57]. Context7 exists because models produce "Hallucinated APIs that don't even exist" and "Generic answers for old package versions" [58]. Next.js 16.2+ bundles version-matched docs in `node_modules/next/dist/docs/`, and 16.3+ writes a managed `AGENTS.md` block opening "This is NOT the Next.js you know"; Next.js states that "Framework knowledge comes from the bundled docs, not from Skills", with skills reserved for workflows [35]. AGENTS.md is now stewarded by the Agentic AI Foundation under the Linux Foundation [59]; Agent Skills is an open format originally developed by Anthropic [36].
- **Scripts beat generated code for deterministic work.** Anthropic's skill guidance: pre-made scripts "Are more reliable than generated code" and "Ensure consistency across uses"; "Prefer scripts for deterministic operations"; give "Low freedom" where "Consistency is critical"; and build validators into a "Run validator → fix errors → repeat" loop with specific error messages [28].

**Implication (analysis).** sigilsmith will be a low-frequency, post-training-cutoff API for every agent that meets it. The safest design minimises the API surface an agent must write against, gives it a CLI that *emits* the identity-critical code rather than asking it to write any, ships version-matched docs in the package with an always-loaded pointer, and closes the loop with a validator that names the fix.

### 2.2 What must stay in shipped, tested code

| Component | Why it cannot be agent-written | How it is verified |
|---|---|---|
| Canonical composite-key serialization (B4.1) | Any variation in field order, normalisation or escaping changes the key, so changes every image | Property tests + fixtures shipped in `sigilsmith/testing` |
| Hash and seeded PRNG | They *are* the identity function; DiceBear calls the PRNG "the interoperability surface" [18] | Parity fixtures (hash values, PRNG sequences) |
| Palette (hash→OKLCH) and number formatting | Small numeric differences change bytes; DiceBear tests "number formatting" and "colors" explicitly [18] | Fixtures; fixed-precision formatting |
| Deterministic weighted selection (A6, B3) | Must be stable per item across deploys and devices | Fixtures over bucket boundaries |
| Generator algorithms, per major | Output is identity; pinned by version (B3) | Golden vectors (SHA-256 of SVG bytes) per generator major |
| Third-party adapters | Upstream libraries may change output ([31]) | Golden vectors recorded against the tested upstream version |
| Resolver order (B6), regeneration policy logic (B19), placeholder/fallback (B5) | Subtle ordering and consent rules (custom images never overwritten) | Unit tests + conformance suite |
| Remote/BYOK client and result caching (B12) | Secrets and cost; cache key must follow B3 | Unit tests; `check` scans built output for secret names |
| Config schemas, budget, drift and target checks | They are the contract itself | Tested CLI; snapshot tests of `--json` output |

A JavaScript-specific hazard belongs here: ECMAScript lets `Math.sin` and other transcendental functions return "an implementation-approximated Number value" [60], so a generator that feeds trigonometry straight into SVG coordinates may emit different bytes on V8, SpiderMonkey and JavaScriptCore. Generators should round coordinates to a fixed precision before formatting, and CI should run the golden vectors on all three engines **(analysis)**.

### 2.3 What can safely be agent-written glue

| Glue | Why it is safe for an agent | Guardrail |
|---|---|---|
| Placing the thumbnail component or call in lists and cards | Varies per app; no identity logic | Conformance: decorative `alt=""` rule (B14) |
| Wiring a zodal `DataProvider` for stored images (B18, B20) | Standard zodal API, documented in zodal | Conformance: stored bytes equal on-the-fly bytes |
| Server upload endpoint and validation (B18) | Framework-specific | Conformance cases: type, size, SVG sanitisation checklist |
| Settings panel and regeneration-prompt placement (B15, B19) | Headless hooks in the library; only layout is local | Conformance: prompt fires on input-field change under `ask` |
| Inserting registration snippets (B17) | Snippets are emitted by `sigilsmith targets`; the agent only places them | `check targets` |
| Choosing generators and params | Done by editing the config, not code | `check config`, `check budget`, preview contact sheets |

The rule underneath **(analysis)**: the agent may decide *where* and *when*; the library decides *what bytes*. Anthropic's "narrow bridge with cliffs on both sides" versus "open field" analogy maps exactly onto this split [28].

### 2.4 Keeping agent-written integrations upgradeable

1. **A narrow, stable facade.** Glue talks only to `sigil` (from the wiring module), `sigilsmith/react`, and the hook types. Everything else is behind `exports` encapsulation [20].
2. **The wiring module as the Generation Gap boundary.** Regenerating it never touches glue, and glue never edits it [10], [9].
3. **Docs inside the package and a managed `AGENTS.md` block.** Copy the Next.js mechanism: a marker-delimited block that `sigilsmith build` writes and refreshes, pointing to `node_modules/sigilsmith/docs/` for the installed version [35]. Add `llms.txt` for agents that fetch docs over the network [57].
4. **Codemods for glue, tested with fixtures.** `sigilsmith migrate <from> <to>` runs jscodeshift transforms tested with `defineTest` [53], as Angular and Nx do for user code [1], [2] and shadcn does with `migrate cn` [12].
5. **An agent-guided upgrade skill** for what codemods cannot do, modelled on `next upgrade --agent` and Next.js's workflow skills [35].
6. **Deprecations that fail loudly.** DiceBear's warning that a stale HTTP call "runs and silently does the wrong thing" [54] argues for rejecting unknown config keys and params with a fix hint, never dropping them.

### 2.5 Conformance tests as the contract

Precedents for "a test suite is the spec an implementation must pass": web-platform-tests, "a cross-browser test suite for the Web-platform stack" [61]; the Promises/A+ compliance suite, which an implementation runs by exposing a three-function adapter (`resolved`, `rejected`, `deferred`) [62]; Pact's contract testing, "checking each application in isolation" against a shared contract [63]; DiceBear's language-neutral parity fixtures [18]; and Standard Schema, a types-only interface that schema libraries can "copy/paste" so tools accept them with "no library-specific adapters, no extra dependencies" [64]. Snapshot tests are the per-project counterpart: Vitest compares output to a committed reference, and snapshots "should be committed alongside code changes, and reviewed as part of your code review process" [41].

Applied to sigilsmith **(analysis)**:

- **Generator conformance** (`sigilsmith conform <module>`): any generator, in-house or third-party, must pass determinism (same inputs, same bytes, over N runs and 3 engines), manifest validity (B10), size measured against the declared `bundleSize`, no `Math.random`, no network unless declared, SVG well-formedness, and its own golden vectors. This is what makes third-party generators safe to list in the catalog.
- **Integration conformance** (`sigilsmith/testing`): the host exports an adapter (Promises/A+ style) with its storage provider, upload handler and render entry point; the suite checks identity stability, B6 resolver order, B19 policies, stored-equals-rendered bytes, decorative `alt`, and that no configured secret name appears in the client build.
- **Identity snapshot** (`sigilsmith.lock.json`): hashes of rendered images for sample items, reviewed like any snapshot.

### 2.6 Golden examples, recipes and skills

Golden examples should be runnable and tested in sigilsmith's own CI (a vanilla example and a React example), so the docs an agent copies are known to pass `check` **(analysis)**. Per Vercel's and Next.js's findings, reference knowledge goes in always-loaded docs pointers, and skills cover workflows (integrate, add a generator, upgrade) [23], [35]. Anthropic's guidance favours one default with an escape hatch over a menu of options, and validators with specific error messages [28].

## 3. Comparison of the five B9 options

Ratings are my judgement from the evidence above **(analysis)**; byte figures are **(estimates)** pending the D8 spike.

| Criterion | 1. Runtime library | 2. Copy-in registry | 3. Build-time codegen / virtual module | 4. Agent-authored code | 5. Hybrid (recommended) |
|---|---|---|---|---|---|
| **Bytes shipped** | Good: core + chosen generators after tree-shaking [19], [20]; risk of pulling validation code into the browser | Good: same algorithm bytes; hand-trimming saves little | Best: only selected loaders referenced statically [21]; config pre-validated, no zod [22] | Unbounded: could be minimal or bloated; unknown without a budget check | Best: codegen's static table over a ≤ 1.5 kB kernel (estimate), enforced by size-limit [29] |
| **How fixes and upgrades reach integrations** | Best: `npm update`, semver | Poor: diff and merge by hand or by agent [13], [15]; shadcn moved shared code to packages for this reason [11], [12] | Good: re-run the generator, if output is never edited [9] | Poor: nothing automatic; codemods or a fresh agent pass | Good: kernel by `npm update`, wiring by rebuild, glue by codemods [53] + upgrade skill [35] |
| **Version pinning and determinism (B3)** | Fair: pinning the package also blocks fixes, unless generator majors are separate subpaths | Poor: frozen by copying, but silently mutable by edits | Good: pins recorded in config and header | Poor: an agent re-implementing a hash or PRNG creates a new identity function | Best: frozen generator subpaths + golden vectors + identity lock |
| **Agent ergonomics** | Fair: must know a post-cutoff API [23], [24]; mitigated by bundled docs | Good: the agent can read the code [3]; poor at merging upgrades | Good: edit one config, run one command; a virtual module is invisible to the agent | Fair: maximum freedom, maximum hallucination risk [25], [26] | Best: config edits + a small facade + `check` with fix hints |
| **Maintenance burden (sigilsmith maintainers)** | Moderate: semver discipline, keep old majors | Low for maintainers, high for every host | Moderate: generator and plugin, though unplugin covers many bundlers [34] | Low code, high docs/eval burden; support for divergent integrations | Highest at first, lowest per host over time |
| **Testability** | Best: all in CI | Upstream only; host copies diverge | Good: deterministic output, snapshot-testable | Only through a host-side conformance suite | Best: kernel CI + snapshot of generated output + host conformance |
| **License compliance (B13)** | Good: notices stay in `node_modules`; non-MIT libraries as optional peer dependencies | Risky: MIT requires the notice in "all copies or substantial portions" [65]; registry schema has no license field [37]; style packs may be non-MIT [54] | Fair: inlined code must carry notices; importing avoids it | Risky: provenance of agent-pasted code is unknown | Good: wiring imports, never inlines; `vendor` refuses non-MIT code and writes headers |
| **Ease of adding third-party generators** | Good: publish an npm package implementing a plugin interface | Best for publishing: any URL or GitHub repo is a registry [44]; no quality gate | Good: config names the package | Ad hoc wrappers, no manifest or catalog | Good: types-only spec + `conform` + manifest; registry distribution optional |

## 4. The recommended design in more detail

### 4.1 End-to-end flow (analysis)

1. The agent runs `sigilsmith catalog --json --max-kb 3 --no-network --style abstract` and `sigilsmith preview` to see contact sheets.
2. It runs `sigilsmith detect-key samples.json`, which writes the key choice into `sigilsmith.config.ts` (B4.1).
3. It edits the config (generators with pinned majors, policy, budgets, targets) and runs `sigilsmith build`, which writes `sigilsmith.gen.ts`, refreshes the managed `AGENTS.md` block, and seeds `sigilsmith.lock.json`.
4. It writes the glue, guided by the bundled docs and the integrate skill.
5. It runs `sigilsmith check --json` until green; the same command runs in the host's CI.
6. Later, `npm update sigilsmith` brings kernel fixes; images stay identical because pins did not change. Moving to `rings@2` is an explicit config edit whose `check identity` diff lists the affected items, combined with the B19 policy for already-stored images.

### 4.2 Third-party generators

Publish a types-only `GeneratorModule` interface (a separate tiny package or a types export), in the spirit of Standard Schema [64], so a third party can implement a generator without depending on sigilsmith's runtime. Listing in the catalog requires passing `sigilsmith conform`. Distribution is primarily npm. A shadcn-compatible registry item (type `registry:lib`, with the sigilsmith manifest, license and golden-vector hashes in `meta`) can be offered for the vendoring path, since that schema has no license field of its own [37].

### 4.3 When copy-in is still the right call

Vendoring is legitimate when a host forbids runtime dependencies, or wants to fork a generator into its own design language. In both cases `sigilsmith vendor <id>` writes the file under a new id if it will be edited, adds the MIT notice [65], and records its hash; editing a vendored file under its original id fails `check` with the message "fork it as a new generator id". Non-MIT code is never vendored (B13).

### 4.4 Risks and open questions for the author

- **Old-major accumulation.** Keeping every generator major in one package grows the tarball, though not anyone's bundle. When should old majors move to a legacy package? DiceBear's multi-year end-of-life notice is one reference point [31].
- **Third-party drift.** An adapter's output depends on the upstream library version. Should `sigilsmith build` recommend an exact pin of each upstream library in the host's `package.json`?
- **Virtual module as default for Vite users?** This report recommends the file for agent visibility; a measurement of agent success with each would settle it.
- **Raster generators.** Canvas and font rendering differ across browsers (B18), so golden vectors cannot be byte-exact for raster output; they may need perceptual hashes, or a rule that raster images are always stored (B18 strategy 1).
- **Name of the pattern.** "Pinned kernel + generated wiring + agent glue" is descriptive but not established; the docs could simply say "a tiny runtime, a generated config module, and your own glue code".

## 5. What could not be verified

- The 2026 shadcn changelog entries were read from the official changelog index; several entries are titles only there, and I did not read every entry's detail page [45].
- I did not find the official Chakra CLI reference page for `snippet add`; the update behaviour is from Chakra's own update guide [15].
- jsrepo's `update` behaviour is from its docs as summarised by search, not from a full read [49].
- I could not confirm a formal DiceBear policy that output changes only in major versions; the documentation says only that they "try to always return the same avatar" [31].
- The Vercel eval is a vendor's own benchmark on one framework; no independent replication was found [23].
- All byte sizes for sigilsmith itself are estimates until the D8 spike measures them.

## REFERENCES

1. [Angular. Generating code using schematics.](https://angular.dev/tools/cli/schematics)
2. [Nx. Automate updating dependencies (`nx migrate`).](https://nx.dev/docs/features/automate-updating-dependencies)
3. [shadcn/ui. Introduction (principles: Open Code, Composition, Distribution, Beautiful Defaults, AI-Ready). Accessed 2026-11-14.](https://ui.shadcn.com/docs)
4. [Svelte. Overview (Svelte docs).](https://svelte.dev/docs/svelte/overview)
5. [vanilla-extract. Zero-runtime Stylesheets in TypeScript (home page).](https://vanilla-extract.style/)
6. [Panda CSS. Why Panda.](https://panda-css.com/docs/overview/why-panda)
7. [StyleX. Learn (introduction).](https://stylexjs.com/docs/learn/)
8. [Tailwind CSS. Installation: Using Vite.](https://tailwindcss.com/docs/installation/using-vite)
9. [Expo. Continuous Native Generation (CNG).](https://docs.expo.dev/workflow/continuous-native-generation/)
10. [Fowler M. Generation Gap (DSL pattern catalog; after J. Vlissides).](https://martinfowler.com/dslCatalog/generationGap.html)
11. [shadcn/ui. Changelog, May 2026: shadcn eject (and the shared `shadcn/tailwind.css`).](https://ui.shadcn.com/docs/changelog/2026-05-shadcn-eject)
12. [shadcn/ui. Changelog, September 2026: cn (package and `migrate cn`).](https://ui.shadcn.com/docs/changelog/2026-09-cn)
13. [shadcn/ui. Changelog, March 2026: shadcn/cli v4.](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4)
14. [Chakra UI. Announcing Chakra UI v3 (snippets).](https://chakra-ui.com/blog/announcing-v3)
15. [Chakra UI. Guide: how to manage snippet updates.](https://next.chakra-ui.com/guides/snippet-how-to-manage-updates)
16. [Iconify. Iconify for React (icon component loading data from the Iconify API).](https://docs.iconify.design/icon-components/react/)
17. [unplugin-icons. README (GitHub).](https://github.com/unplugin/unplugin-icons)
18. [DiceBear. Specification: Implement DiceBear Core (PRNG contract and parity test suite).](https://www.dicebear.com/specification/implement-dicebear-core/index.md)
19. [webpack. Guide: Tree Shaking.](https://webpack.js.org/guides/tree-shaking/)
20. [Node.js. Modules: Packages (`exports`, subpath and conditional exports).](https://nodejs.org/api/packages.html)
21. [MDN Web Docs. import() (dynamic import).](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import)
22. [Zod. Zod Mini (bundle-size comparison).](https://zod.dev/packages/mini)
23. [Vercel. AGENTS.md outperforms skills in our agent evals. 27 January 2026.](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
24. [Jain N, Kwiatkowski R, Ray B, Ramanathan MK, Kumar V. On Mitigating Code LLM Hallucinations with API Documentation. arXiv:2407.09726; ICSE-SEIP 2025.](https://arxiv.org/abs/2407.09726)
25. [Spracklen J, et al. We Have a Package for You! A Comprehensive Analysis of Package Hallucinations by Code Generating LLMs. USENIX Security 2025; arXiv:2406.10279.](https://arxiv.org/abs/2406.10279)
26. [Wang C, et al. How and Why LLMs Use Deprecated APIs in Code Completion? An Empirical Study (later: LLMs Meet Library Evolution). arXiv:2406.09834.](https://arxiv.org/abs/2406.09834)
27. [Wu T, et al. VersiCode: Towards Version-controllable Code Generation. arXiv:2406.07411.](https://arxiv.org/abs/2406.07411)
28. [Anthropic. Skill authoring best practices (Claude platform docs).](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
29. [Sitnik A, et al. Size Limit (GitHub README).](https://github.com/ai/size-limit)
30. [Sitnik A, et al. Nano ID (GitHub README).](https://github.com/ai/nanoid)
31. [DiceBear. HTTP API (version table and end-of-life dates).](https://www.dicebear.com/how-to-use/http-api/)
32. [Prisma. Generators (`prisma-client` and `prisma-client-js`).](https://www.prisma.io/docs/orm/prisma-schema/overview/generators)
33. [Vite. Plugin API (virtual modules).](https://vite.dev/guide/api-plugin.html)
34. [unplugin. Guide.](https://unplugin.unjs.io/guide/)
35. [Next.js. How Next.js supports AI coding agents (last updated 2026-10-15).](https://nextjs.org/docs/app/guides/ai-agents)
36. [Agent Skills. Overview (open format).](https://agentskills.io/)
37. [shadcn/ui. registry-item.json schema reference. Accessed 2026-11-14.](https://ui.shadcn.com/docs/registry/registry-item-json)
38. [Go. Go Modules Reference: Vendoring.](https://go.dev/ref/mod#vendoring)
39. [npm Docs. package-lock.json (`integrity`).](https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json)
40. [W3C. Subresource Integrity.](https://www.w3.org/TR/SRI/)
41. [Vitest. Snapshot testing guide.](https://vitest.dev/guide/snapshot.html)
42. [TanStack Table v8. Introduction ("What is headless UI?").](https://tanstack.com/table/v8/docs/introduction)
43. [Create React App. Available Scripts (`npm run eject`).](https://create-react-app.dev/docs/available-scripts/)
44. [shadcn/ui. Registry: Getting Started. Accessed 2026-11-14.](https://ui.shadcn.com/docs/registry/getting-started)
45. [shadcn/ui. Changelog (2023–2026 entries). Accessed 2026-11-14.](https://ui.shadcn.com/docs/changelog)
46. [shadcn/ui. CLI reference. Accessed 2026-11-14.](https://ui.shadcn.com/docs/cli)
47. [shadcn/ui. Changelog, July 2026: React Aria.](https://ui.shadcn.com/docs/changelog/2026-07-react-aria)
48. [shadcn/ui. Changelog, June 2023: New CLI (experimental `diff` command).](https://ui.shadcn.com/docs/changelog/2023-06-new-cli)
49. [jsrepo. CLI: update.](https://jsrepo.dev/docs/cli/update)
50. [shadcn/ui. Skills (agent skill documentation). Accessed 2026-11-14.](https://ui.shadcn.com/docs/skills)
51. [TanStack Router. File-based routing.](https://tanstack.com/router/latest/docs/framework/react/routing/file-based-routing)
52. [BundleWatch. README (GitHub).](https://github.com/bundlewatch/bundlewatch)
53. [Meta. jscodeshift (GitHub README).](https://github.com/facebook/jscodeshift)
54. [DiceBear. DiceBear for AI assistants.](https://www.dicebear.com/guides/dicebear-for-ai-assistants/)
55. [DiceBear. llms.txt.](https://www.dicebear.com/llms.txt)
56. [DiceBear. Releases (GitHub), incl. 10.5 release notes.](https://github.com/dicebear/dicebear/releases)
57. [Howard J. The /llms.txt file (proposal, 3 September 2024).](https://llmstxt.org/)
58. [Upstash. Context7 (GitHub README).](https://github.com/upstash/context7)
59. [AGENTS.md. A simple, open format for guiding coding agents.](https://agents.md/)
60. [ECMA-262. Math.sin (§21.3.2.30), via read262.](https://read262.netlify.app/numbers-and-dates/math-object)
61. [web-platform-tests project.](https://web-platform-tests.org/)
62. [Promises/A+. Compliance test suite (promises-tests).](https://github.com/promises-aplus/promises-tests)
63. [Pact. Introduction to contract testing.](https://docs.pact.io/)
64. [Standard Schema. Specification.](https://standardschema.dev/)
65. [Open Source Initiative. The MIT License.](https://opensource.org/license/mit)
