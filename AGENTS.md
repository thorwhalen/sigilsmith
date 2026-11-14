# Agent notes for developing sigilsmith

You are working on the package itself. Agents *using* sigilsmith in an app read `skills/sigilsmith/SKILL.md` instead.

- Design SSOT: `docs/design/proposal.md` (decisions, seams, the layer model, codes). Research behind it: `docs/research/`. Keep the MVP consistent with the proposal; record deviations in its §12.
- Commands: `npm test` (Vitest), `npm run typecheck`, `npm run build` (tsup), then `npm run measure` (sizes → `catalog/_sizes.json`), `npm run schema` (config JSON Schema), `npm run docs` (skill references generated from code). CLI tests run `dist/cli/main.js`, so build before `npm test` after CLI changes.
- **Never change a released generator's output.** `src/generators/<id>/v<N>.ts` is frozen once released; `tests/golden/*.json` enforce it. An output change is a new file `v<N+1>.ts`, a new manifest entry, a new export subpath. Never regenerate golden files for an existing major. The hash/PRNG/palette code in `src/hash.ts` and `src/palette.ts` is part of every generator's output: same rule.
- The browser kernel (`src/index.ts` and what it imports) must not import zod, Node APIs or `src/node/*`. zod lives in `src/node/` and `src/zodal/settings.ts`. Check with `npm run measure` (kernel ≈ 3.8 kB gzip today).
- Adding a generator: `src/generators/<id>/v1.ts` (module) + `manifest.ts` (zod params whose defaults come from the module) + one line in `src/node/builtins.ts` + one entry in `tsup.config.ts`. No core edits.
- Diagnostics: add codes to `CODES` in `src/node/diagnostics.ts` (they feed `explain-code` and `skills/sigilsmith/references/errors.md`); every error carries a fix.
- zodal workarounds live in `src/zodal/shims/` (and `src/layers.ts`), each headed `SHIM: upstream …`. Do not add silent workarounds elsewhere.
- The package name lives only in `package.json` and `src/meta.ts`.
- Definition of done: `npm run typecheck && npm run build && npm test` green, and in `examples/demo`: `npx sigilsmith check` all ✓.
