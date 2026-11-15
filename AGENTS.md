# Agent notes for developing sigilsmith

You are working on the package itself. Agents *using* sigilsmith in an app read `skills/sigilsmith/SKILL.md` instead.

- Design SSOT: `docs/design/proposal.md` (decisions, seams, the layer model, codes). Research behind it: `docs/research/`. Keep the MVP consistent with the proposal; record deviations in its §12.
- Operations: `src/node/operations.ts` is the one list behind the CLI and the MCP server; add an operation there, never in one surface only.
- Commands: `npm test` (Vitest), `npm run typecheck`, `npm run build` (tsup), then `npm run measure` (sizes → `catalog/_sizes.json`), `npm run schema` (config JSON Schema), `npm run docs` (skill references generated from code). CLI tests run `dist/cli/main.js`, so build before `npm test` after CLI changes.
- **Never change a released generator's output.** `src/generators/<id>/meta.ts` and `v<N>.ts` are frozen once released; `tests/golden/*.json` enforce it (per generator, and end to end through `createSigil` in `kernel-v1.json`). An output change is a new `v<N+1>.ts`, a new manifest entry, a new export subpath. Never regenerate golden files for an existing major (`UPDATE_GOLDEN=1` only writes missing files). The shared helpers `src/hash.ts`, `src/palette.ts`, `src/svg.ts`, and the seed and key logic in `src/inputs.ts` and `src/key.ts`, are part of every generator's output: same rule.
- The browser kernel (`src/index.ts` and what it imports) must not import zod, Node APIs or `src/node/*`. zod lives in `src/node/` and `src/zodal/settings.ts`. Check with `npm run measure` (kernel ≈ 3.8 kB gzip today).
- Adding a generator: `src/generators/<id>/meta.ts` (id, major, kind, defaults, default inputs: plain data) + `v1.ts` (`{ ...meta, render }`) + `manifest.ts` (zod params whose defaults come from `meta`, and a lazy `import('./v1.js')`) + one line in `src/node/builtins.ts` + one entry in `tsup.config.ts`. No core edits. Never import a `v<N>.ts` statically from Node tooling: it may need an optional peer.
- Diagnostics: add codes to `CODES` in `src/node/diagnostics.ts` (they feed `explain-code` and `skills/sigilsmith/references/errors.md`); every error carries a fix.
- zodal workarounds live in `src/zodal/shims/` (and `src/layers.ts`), each headed `SHIM: upstream …`. Do not add silent workarounds elsewhere.
- Feature sets: kernel-side code is `src/features.ts` (its own subpath, `sigilsmith/features`, passed to `createSigil` as `features`; never import it from `src/sigil.ts`, which keeps the kernel small); Node-side reading and checks are `src/node/features.ts`; the user guide is `skills/sigilsmith/references/features.md`.
- The package name lives only in `package.json` and `src/meta.ts`.
- Definition of done: `npm run typecheck && npm run build && npm test` green, and in `examples/demo`: `npx sigilsmith check` all ✓.
