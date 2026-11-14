---
title: "Agent-first package design (AX) for sigilsmith: surfaces, evidence and primitive shapes"
author: Thor Whalen
date: 2026-11-14
---

# Agent-first package design (AX) for sigilsmith

## Summary

Agent experience (AX) is a young field. As of November 2026 the conventions are real (AGENTS.md, Agent Skills, MCP, llms.txt) but the controlled evidence is thin, mostly vendor-run, and in places contradictory. This report separates what is measured from what is opinion, and labels speculation as such.

Findings that matter most for sigilsmith:

- A repository context file (AGENTS.md) is followed by agents, but an ETH Zurich study found that context files did not generally improve task success and raised cost by over 20% on average; developer-written files did better than LLM-generated ones, and repository overviews did not help [5][6]. The lesson is a short file with only non-inferable, non-obvious facts (commands, boundaries, definition of done) [6].
- Skills that must be invoked by the agent are invoked unreliably. In Vercel's Next.js 16 evals, a skill was never invoked in 56% of cases and scored the same as no docs (53%); adding explicit invocation instructions raised it to 79%, and a compressed docs index in AGENTS.md reached 100%. The vendor itself calls its explanation a working theory, gives no case count, and the evals are Next.js-specific [11]. Implication: put the few decisive facts in always-loaded context, and keep the skill for procedures.
- MCP tool definitions are loaded upfront by most clients and that costs context [9]; Claude Code mitigates this with on-demand tool search, on by default [10]. A CLI that the agent discovers through `--help` is a progressive-disclosure surface for free. Specific CLI-versus-MCP token numbers circulating in blogs are vendor benchmarks of widely varying quality [23].
- llms.txt: the spec exists [2], but a 137K-site log study found 97% of files received no requests in May 2026, with Claude Code the second-largest named AI fetcher; the study counts fetches, not reads, and is vendor-run [7]. It is cheap to emit and low priority for a builder package whose agent is already inside the repo.
- Errors should carry a stable code, a fix, and an applicability level; Rust's diagnostics design is the best-documented precedent [18]. Anthropic's tool-design guidance says the same in prose: errors should steer the agent toward correct inputs, not return opaque codes or tracebacks [4].
- Agents that read images can judge a generator, but there is no study I could find comparing contact-sheet grids with individual images for model judging; the multi-image judging literature suggests it is harder [21]. Treat grid design as an experiment sigilsmith should run itself.

## Recommendation

Ship in this order. Every step is a facade over the same typed core, so each later surface adds at an existing seam.

1. **Typed core with zod schemas for every primitive's input and output** (already B8). The JSON Schemas are generated from them and are the contract for all surfaces.
2. **CLI with `--json`** for the seven primitives: `catalog`, `preview`, `detect-key`, `tune`, `explain`, `targets`, `check`, plus `init`. Stable envelope, stable exit codes, stable diagnostic codes with fixes (section 7).
3. **A short AGENTS.md**, in two places: the sigilsmith repo itself, and a generated block that `sigilsmith init` appends to the host project's AGENTS.md (or CLAUDE.md). It carries only: the SSOT config path, the one rule "never inline field names or generator choices; read the config", the commands to run, and the definition of done (`sigilsmith check --json` exits 0) [6].
4. **One skill, `sigilsmith`, in the open Agent Skills format**, shipped inside the npm package at `skills/sigilsmith/` and installed into the host repo by `sigilsmith skill install` (section 8). It holds the choose, tune, integrate procedure and links to reference files loaded on demand.
5. **Register with Context7** and publish docs as clean Markdown (cheap). Emit `llms.txt` and `llms-full.txt` only as a by-product of the docs build (cheap, low expected value).
6. **MCP server later**, generated from the same zod schemas, only if one of these becomes true: a target agent has no shell; the agent must hold state across calls (a preview session); or the image-return ergonomics of MCP beat writing PNG files to disk (to be tested, not assumed).

Do not build a custom doc-retrieval service, and do not rely on `postinstall` scripts for skill installation (speculation: many setups disable lifecycle scripts, so an explicit command is more predictable).

## 1. AGENTS.md

**Spec and stewardship.** AGENTS.md is a plain-Markdown "README for agents" with no required fields. As of the site's current text it is maintained under the Agentic AI Foundation (Linux Foundation), claims use in over 60k open-source projects, and lists Codex, Jules, Aider, Cursor, VS Code and GitHub Copilot's agent among supporting tools. The nearest file to the edited file wins; an explicit user prompt overrides everything [1]. Adoption numbers are self-reported by the project.

**Relationship to CLAUDE.md.** Claude Code's memory docs state that it can read a repository's AGENTS.md in place of CLAUDE.md, and document a section on using an existing AGENTS.md. They recommend under 200 lines per CLAUDE.md, note that imports do not reduce context cost, and say to move multi-step procedures into skills [20]. Practical consequence: write AGENTS.md as the canonical file; do not maintain two copies.

**What goes in it.** The AAIF guidance: structure with meaning, exact commands, boundaries and generated paths, definition of done; test each line with "would knowing this change the agent's action?"; leave out obvious facts, generic advice, directory listings, duplicated docs, and rules enforceable by tooling [6].

**Evidence.**

- Gloaguen et al., arXiv 2602.11988 (February 2026): across several LLMs and agents, context files did not generally improve success and raised inference cost by over 20% on average; agents follow the instructions; repository overviews are not helpful [5]. The AAIF summary adds that developer-written files beat LLM-generated ones, and that LLM-generated files helped by 2.7% when other documentation was removed [6].
- Lulla et al. (124 PR tasks, 10 repositories), as summarized in [6]: median runtime 28.64% lower and output tokens 16.58% lower with an AGENTS.md; efficiency only, not correctness. I did not read the primary paper; this is second-hand.
- Vercel evals [11]: see Summary. Passive always-loaded context beat on-demand skills on Next.js 16 APIs absent from model training data. This is the strongest argument for putting sigilsmith's decisive, version-specific facts (the config path, the `check` command, the generator-pin rule) in AGENTS.md rather than only in a skill. Caveats: vendor-run, one framework, no case count [11].

**Implication for sigilsmith.** Keep the host-facing block under roughly 30 lines, generated from the same source as `--help` so it cannot drift (SSOT). Opinion: because sigilsmith's product is "the agent must not hardcode choices", the one load-bearing line is the rule that downstream code reads the config; put it first.

## 2. llms.txt and llms-full.txt

**Spec.** `llms.txt` is Markdown at a site root: required H1, a blockquote summary, optional body, then H2 sections of `[name](url): notes` link lists, with an "Optional" section for skippable links. It recommends a clean `.md` version of each page. Author Jeremy Howard, published 3 September 2024, page last modified 10 August 2026 [2]. The spec page I fetched does not mention `llms-full.txt`; that file is a convention (the full docs concatenated), not part of the spec as published there [2].

**Use by agents.** Ahrefs (137K sites, May 2026): about 38K domains had a valid file; 97% saw no requests; Claude Code was the second-largest named AI bot among fetchers; fetches rather than reads are counted; the study is vendor-run and its sample skews technical [7]. A separate Otterly 90-day test cited by Optimizely found 84 of more than 62,100 AI bot visits touched llms.txt [22]. Evil Martians reports Google's John Mueller saying no AI system uses it, and Ahrefs quotes him calling it a "temporary crutch" for coding tools [7][8]; I could not verify the original statement.

**Interpretation (speculation).** Coding agents are "the closest thing to an intended audience" per [7], but sigilsmith's agent is already in a repo with the package installed; the information it needs is in `node_modules` and `--help`. llms.txt helps mainly agents browsing the web before the package is installed (choosing it). Low cost, low priority.

## 3. Agent Skills (SKILL.md)

**Standard.** A skill is a directory with `SKILL.md` (YAML frontmatter plus Markdown) and optional `scripts/`, `references/`, `assets/`. Required fields: `name` (max 64 chars, lowercase letters, digits and hyphens, must match the directory name) and `description` (max 1024 chars, say what it does and when to use it). Optional: `license`, `compatibility` (max 500), `metadata`, `allowed-tools` (experimental). Progressive disclosure in three tiers: about 100 tokens of metadata at startup, the body (recommended under 5000 tokens, under 500 lines) on activation, resources on demand; keep file references one level deep; validate with `skills-ref validate` [3].

**Origin.** Anthropic introduced Skills on 16 October 2025 and, per an update dated 18 December 2025, released them as an open standard; the post stresses that the name and description decide triggering, that scripts can run without loading into context, and to start from evaluations [13].

**Claude Code specifics.** The listing of descriptions is truncated at 1,536 characters of `description` plus `when_to_use`, so put the key use first; Claude Code accepts extension fields beyond the six standard ones (`when_to_use`, `disable-model-invocation`, `paths`, `hooks` and others) but packaging for claude.ai or the Skills API fails on unknown keys, so a portable skill should keep to the six [12]. Locations include personal `~/.claude/skills/`, project `.claude/skills/`, nested subdirectory skills, and plugin `skills/` directories; plugin skills are namespaced [12]. Once invoked, a skill body stays in context, so each line is a recurring cost [12].

**Shipping skills with an npm package.** TanStack Intent is the most developed precedent I found: skills live in the package at `skills/<skill-name>/SKILL.md`, appear under `node_modules/<package>/skills/` after install, update when the package version bumps, and an `@tanstack/intent` CLI scaffolds, validates, checks staleness and loads the version-matched skill; it can write a skill-mapping block into AGENTS.md or CLAUDE.md [14]. Vercel's guide pairs this with user-level "discovery" skills installed via `npx skills add` that point to the package's own skill [14]. I did not confirm that `npx skills add` installs package-bundled skills directly [14].

**Implication.** Version-matched skills inside the package solve the staleness problem that a global skill has. Section 8 proposes a minimal version of this.

## 4. MCP servers for libraries versus CLIs

**Evidence.**

- Anthropic: most MCP clients load all tool definitions upfront; presenting tools as code on a filesystem lets the model read definitions on demand; the post gives 150,000 to 2,000 tokens (98.7%) for one scenario without describing the workload [9]. Treat as an illustrative example, not a benchmark.
- Claude Code has MCP tool search on by default, loading tool definitions on demand, with an opt-out; MCP tool output warns above 10,000 tokens and is limited to 25,000 by default [10]. So the upfront-cost argument is weaker in Claude Code than in clients without tool search (date-stamp: Claude Code docs as read 14 November 2026).
- Third-party comparisons (Checkly, Apideck, others) report CLIs using far fewer tokens than some MCP servers, with figures ranging widely, and a Stripe-task benchmark in which a code-mode MCP beat both raw MCP and CLI [23]. These are vendor or blog benchmarks; I did not verify methodology.
- Anthropic's tool-design post: build few, high-impact tools; offer a `response_format` (concise 72 tokens versus detailed 206 in their Slack example); return natural-language names rather than opaque IDs; paginate with sensible defaults; write actionable errors; evaluate on realistic multi-call tasks [4].

**When an MCP server is worth it (opinion, supported by the above).** When the agent has no shell; when state must persist across calls; when tools return rich content the protocol carries better than files; when the vendor hosts a remote service. sigilsmith is a local, stateless, file-producing builder tool used from a shell, so a CLI is the better first surface. The same schemas can later generate an MCP wrapper at near zero design cost, which is exactly the "surface is a seam" principle.

## 5. Typed schemas as the contract

Zod 4 can emit JSON Schema (speculation: I did not re-verify the current API name in this session; check `z.toJSONSchema` in the zod docs before relying on it). The brief already makes zod the SSOT (B8). For agent use this yields four artifacts from one source: `--help` text, `sigilsmith schema <command>` printing JSON Schema for each command's output, MCP tool definitions later, and the config JSON Schema for editor and agent validation. Anthropic's guidance supports keeping parameters unambiguous and names meaningful [4]. Opinion: expose `sigilsmith schema` early; an agent can fetch exactly one schema instead of reading prose.

## 6. Actionable errors

**Rust.** Diagnostics get a stable error code with a long-form explanation readable via `--explain`; suggestions are attached to source spans with an applicability level (`MachineApplicable`, `HasPlaceholders`, `MaybeIncorrect`, `Unspecified`); `help` is what the user can change, `note` is context; messages are lowercase, no trailing period, identifiers in backticks; `--error-format json` emits one JSON diagnostic per line [18]. Elm is the usual cited human-facing precedent; I could not fetch its article in this session, so I make no claims about it here.

**CLI guidelines.** Machine-readable output on stdout and messages on stderr; non-zero exit mapped to the important failure modes; `--json` for structured output; suggest next commands in workflows; catch expected errors and rewrite them with a fix [17].

**Anthropic.** Errors should steer toward correct inputs rather than opaque codes or tracebacks [4].

**Design for sigilsmith.** Adopt the Rust model almost whole: code, severity, message, location, fix with applicability, and an explain command (`sigilsmith explain-code SGS0201`).

## 7. Concrete shapes

All commands accept `--json`, print exactly one JSON document to stdout (no NDJSON, so a single `JSON.parse` suffices; speculation: Rust uses NDJSON because it streams, sigilsmith does not need to), and send logs to stderr. In `--json` mode stdout is never mixed with text.

### Envelope

```json
{
  "schema": "sigilsmith.check/1",
  "ok": false,
  "data": { },
  "diagnostics": [
    {
      "code": "SGS0201",
      "severity": "error",
      "message": "key field `id` is missing from 3 of 40 sample items",
      "where": { "config": "key.field", "data": "samples/items.json", "items": [4, 9, 17] },
      "fix": {
        "summary": "use `slug` as the key (present in 40 of 40, unique)",
        "applicability": "maybe-incorrect",
        "commands": ["sigilsmith detect-key samples/items.json --write"],
        "edits": [{ "file": "sigilsmith.config.ts", "path": "key.field", "set": "slug" }]
      },
      "explain": "sigilsmith explain-code SGS0201"
    }
  ],
  "next": [
    { "command": "sigilsmith check --json", "why": "re-run after applying the fix" }
  ]
}
```

- `schema` is versioned per command so a client can pin; breaking changes bump the integer. The JSON Schema is available via `sigilsmith schema check`.
- `fix.applicability` reuses the Rust vocabulary: `machine-applicable | has-placeholders | maybe-incorrect | unspecified` [18]. An agent may apply `machine-applicable` edits without asking.
- `next` follows the CLI guideline to suggest following commands [17].
- Exit codes (proposal): 0 ok; 1 completed with error diagnostics (for example `check` failed); 2 usage error; 3 config invalid; 4 internal error. Warnings alone exit 0 unless `--strict`. Anthropic and clig both recommend meaningful non-zero codes [4][17].
- `--format concise|detailed` (default concise) applies Anthropic's `response_format` idea [4]: concise omits examples and long descriptions.

### Primitive output shapes (`data` field)

- **`catalog`** (query by constraints: `--style abstract --max-gzip 3000 --no-network --runtime browser --min-size 24`): `{ "query": {...}, "total": 41, "matched": 6, "results": [ { "id": "minidenticons", "version": "1.0.0", "style": "geometric", "semanticLevel": "hash-only", "bundleGzipBytes": 1480, "runtime": ["browser","node","edge"], "network": false, "cost": "free", "license": "MIT", "determinism": "pure", "sizeRange": [16, 256], "why": "matches: style, budget, no-network" } ], "excluded": [ { "id": "dicebear-x", "because": "bundleGzipBytes 5200 > 3000" } ] }`. Returning `excluded` with reasons lets the agent relax constraints instead of guessing. Cap results by default with a `truncated` flag and a hint to narrow.
- **`preview`**: `{ "files": { "sheet": "out/preview/sheet.png", "html": "out/preview/sheet.html", "manifest": "out/preview/sheet.json" }, "grid": { "generators": ["a","b"], "items": 12, "sizes": [16,32,64,128], "backgrounds": ["light","dark"] }, "metrics": { "a": { "collisionRate": 0.0, "minPairwiseDistance": 0.21, "distinctAt16px": 0.92 } }, "legend": "row=generator, column=item, see sheet.json for cell coordinates" }`. See section 9.
- **`detect-key`**: `{ "candidates": [ { "field": "slug", "completeness": 1.0, "uniqueness": 1.0, "stability": "likely-stable", "reason": "priority-list match; no timestamp or display-title pattern" } ], "chosen": "slug", "written": false, "warnings": ["`title` looks like a display field"] }`. Matches B4.1: detect once, then write to config only with `--write`.
- **`explain`** (`sigilsmith explain --item item.json`): `{ "key": { "value": "slug:abc", "from": "key.field", "layer": "project" }, "inputs": [ { "field": "title", "layer": "preset:media" } ], "generator": { "id": "boring-avatars", "version": "2.0.1", "pinned": true, "layer": "policy-rule:type=audio" }, "params": { "palette": { "value": [...], "layer": "generator-default" } }, "determinism": "pure", "regeneration": { "policy": "ask", "layer": "project" }, "missingOptionalFields": ["lyrics"] }`. Every leaf carries `layer`, as in B0.6.
- **`targets`**: `{ "targets": [ { "id": "og-image", "sizes": [[1200,630]], "formats": ["png","jpeg"], "needsStoredUrl": true, "svgAccepted": false, "snippet": "<meta property=\"og:image\" content=\"...\">" } ] }` plus `--emit` writing files and printing their paths. The per-platform facts belong in the integration report; do not hardcode them in this document.
- **`check`**: `data` holds `{ "budget": {...}, "determinism": { "runs": 2, "identical": true }, "config": { "valid": true }, "drift": { "keyFieldMissing": [], "pinnedVersionChanged": [], "bypass": [ { "file": "src/Card.tsx", "line": 12, "found": "item.id" } ] }, "targets": { "missingTags": [...] } }` and failures appear as diagnostics with fixes.

### Error code format

`SGS` plus four digits, grouped by hundreds (01xx config, 02xx key, 03xx generator, 04xx budget, 05xx determinism, 06xx targets, 07xx drift). Message text: lowercase, no trailing period, identifiers in backticks, one sentence, per [18]. Every code has a page reachable offline via `sigilsmith explain-code <code>`, containing cause, a before/after example, and the fix; these pages double as golden examples (section 10).

Human mode prints the same diagnostics in a Rust-like block: `error[SGS0201]: ...`, a `where` line, `help: ...` for the fix.

## 8. Skill structure and distribution (proposal)

```
sigilsmith/                  (npm package)
  skills/
    sigilsmith/
      SKILL.md               < 150 lines: when to use, the 6-step loop, stop conditions
      references/
        choosing.md          how to read catalog output; trade-offs
        tuning.md            palette/params workflow with preview
        integrating.md       delivery strategies, regeneration policy
        targets.md           generated from the target registry
        errors.md            generated index of SGS codes
      scripts/               (none at first; the CLI is the script)
  package.json               "files": ["dist","skills"]
```

- **Frontmatter**: only the six standard fields so it stays portable to claude.ai and the Skills API [12][3]. `name: sigilsmith`; `description` under 1024 characters, key use first (the listing truncates at 1,536 combined in Claude Code [12]): what it does (choose, tune and integrate identity-image generators for item lists), and when (user mentions avatars, thumbnails, identicons, favicons, link previews, `sigilsmith.config`). Add `compatibility: Requires Node 20+ and the sigilsmith CLI` (the Node floor is a placeholder; pick it from the package's real engines field).
- **Body** is a procedure, not documentation: (1) `sigilsmith init --json` and read the result; (2) `detect-key` on sample data; (3) `catalog` with the user's constraints; (4) `preview`, look at the PNG, iterate with `tune`; (5) `integrate` into the app, reading the config only; (6) `check --json` until exit 0. Each step names the command and what to do with each diagnostic. This follows the guidance to structure for progressive disclosure and put detail in referenced files [3][13].
- **`references/errors.md` and `targets.md` are generated** from the registries at build time so they cannot drift (SSOT). A test fails the build if the skill mentions a command or code that does not exist.
- **Distribution.** `sigilsmith skill install [--dir .claude/skills]` copies (not symlinks, so it survives `node_modules` cleanup and works on every OS) `node_modules/sigilsmith/skills/sigilsmith` into the host repo's skills directory and records the version in `metadata`. `sigilsmith check` reports `SGS0801 skill is older than the installed package` with the one-line fix; this is the staleness check TanStack Intent offers [14]. `sigilsmith init` also writes the AGENTS.md block. Since AGENTS.md is read in every session while skills are loaded on invocation [11][12], the AGENTS.md block should say "for the choose/tune/integrate procedure, use the `sigilsmith` skill, or run `sigilsmith guide`", where `sigilsmith guide` prints the same procedure. This covers agents that never invoke the skill, the failure measured in [11].
- **Also publish as a Claude Code plugin** (speculation about value): plugin skills are namespaced and installable across projects [12], useful for the choosing stage before the package is installed. Defer until the skill is stable.

## 9. Visual feedback

**What is established.**

- Claude's vision API: token cost is approximately width times height divided by 750; the per-image dimension cap is 8000 px, reduced for requests with many images (docs state 2000 px, and another current page 3000 px, so stay under 2000 px to be safe on all platforms); images beyond limits are downscaled; high-resolution tiers on newer models cost roughly 3x more tokens per image [19]. These limits change; the documentation fetched on 14 November 2026 is the source.
- I found no study comparing grids with individual images for model judgments. The literature on multimodal judges reports 70 to 76% accuracy on a reward benchmark and extra difficulty when judging several images at once, plus calibration problems [21]. So whether a grid or separate images lets an agent judge distinctiveness better is open.

**Recommendation (opinion, to validate with a spike).**

- Emit **PNG** as the primary artifact for the agent, plus a **JSON sidecar** mapping each cell to generator id, item id and size, so the agent can refer to cells by name rather than by position; plus **HTML** for humans (interactive, with light/dark toggle). Agents with file-reading tools can open PNGs; HTML needs a browser or a screenshot step, which is more tooling for the agent (speculation).
- Keep each sheet under roughly 2000 px on both sides and about 5,000 tokens; one sheet per question ("which generator?") rather than one giant sheet.
- Render **labels as pixels inside the image** (generator id, item id, size), because the model reads text in images, and mirror them in the sidecar.
- Show small sizes **at native pixel size and also enlarged with nearest-neighbor scaling**, since the B14 question is whether items are distinguishable at 16 and 32 px; a downscaled grid hides exactly that. Separate light and dark rows.
- Include the **numeric metrics** from `preview` (collision rate, minimum pairwise distance) so the agent does not rely on its vision alone; vision is for taste and sanity, metrics for distinctness. This is a design stance, not measured.
- Run one spike: give an agent a 12-item by 4-generator sheet with a seeded defect (a generator that collapses to one color at 16 px) and see whether it notices, with and without the metrics sidecar. That is the cheapest way to settle the open grid question.

## 10. Examples as tests, docs retrieval and AX writing

**Examples as tests.** The skill and AGENTS.md code samples should be executed in CI: each `sigilsmith explain-code` page has a failing config and its fixed version; a test runs `check` on both and asserts the diagnostic appears and then disappears. Golden outputs for `catalog`, `explain` and `preview` metrics are snapshot-tested against the zod output schemas. Opinion: this keeps the docs agents learn from truthful; Anthropic's guidance on iterating tools with realistic evaluation tasks supports building an eval suite of whole agent tasks (for example the B-walkthrough "abstract thumbnails at most 5 kB, no network, type-based policy") with verifiable outcomes [4]. The suite should include a run without the skill and without AGENTS.md as the baseline, because evidence that these files help is mixed [5][11].

**Context7.** Upstash's service serves version-specific docs and examples through an MCP server (`resolve-library-id`, `query-docs`) and a `ctx7` CLI plus skill; library IDs look like `/vercel/next.js`; users can name a version in the prompt [15]. The page I fetched only links a guide for adding libraries; a `context7.json` in the repo root is mentioned but not explained [15]. Action: register sigilsmith and keep docs as clean Markdown; do not depend on it (it is a third-party hosted service).

**AX writing by vendors.** Netlify coined "agent experience" in 2025 and frames it as extending, not replacing, DX; its knowledge-base definition is how well an agent can discover your API, call it reliably and recover when something fails; it released AXIS, an open-source index scoring how well APIs work for agents [16]. Anthropic's engineering posts supply the most concrete guidance [4][9][13]. I did not find primary Stripe or Vercel AX posts in this session beyond Vercel's evals [11]; no claims are made about them.

## Open items

- Verify the zod 4 JSON Schema emission API and its limits (transforms, refinements) before committing to `sigilsmith schema`.
- Run the contact-sheet spike (section 9).
- Decide whether `sigilsmith guide` (print the procedure) duplicates the skill enough to generate both from one file; recommended, to keep a single source.
- Check whether hosts other than Claude Code (Cursor, Codex, Copilot) pick up `.claude/skills/` or need `.agents/skills/`; I did not verify, so `skill install --dir` is a parameter.

## REFERENCES

1. [AGENTS.md (agents.md)](https://agents.md)
2. [The /llms.txt file (llmstxt.org)](https://llmstxt.org)
3. [Agent Skills specification](https://agentskills.io/specification)
4. [Writing effective tools for agents, Anthropic Engineering](https://www.anthropic.com/engineering/writing-tools-for-agents)
5. [Gloaguen T, Mündler N, Müller M, Raychev V, Vechev M. Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents? arXiv 2602.11988](https://arxiv.org/abs/2602.11988)
6. [Writing an effective AGENTS.md, Agentic AI Foundation](https://aaif.io/blog/writing-an-effective-agents-md)
7. [We Analyzed 137K Sites: 97% of llms.txt Files Never Get Read, Ahrefs](https://ahrefs.com/blog/llmstxt-study/)
8. [Which AI actually reads your site? Two months of LLM traffic, measured, Evil Martians](https://evilmartians.com/chronicles/which-ai-actually-reads-your-site-two-months-of-llm-traffic-measured)
9. [Code execution with MCP, Anthropic Engineering](https://www.anthropic.com/engineering/code-execution-with-mcp)
10. [Connect Claude Code to tools via MCP, Claude Code docs](https://code.claude.com/docs/en/mcp)
11. [AGENTS.md outperforms skills in our agent evals, Vercel](https://vercel.com/blog/agents-md-outperforms-skills-in-our-agent-evals)
12. [Extend Claude with skills, Claude Code docs](https://code.claude.com/docs/en/skills)
13. [Equipping agents for the real world with Agent Skills, Anthropic Engineering](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
14. [Agent Skills (TanStack Intent) and Vercel's guide to shipping and consuming agent skills](https://vercel.com/kb/guide/using-tanstack-intent-to-ship-and-consume-agent-skills)
15. [Context7, Upstash](https://github.com/upstash/context7)
16. [Agent Experience, Netlify](https://www.netlify.com/agent-experience/)
17. [Command Line Interface Guidelines](https://clig.dev)
18. [Diagnostics, Rust compiler development guide](https://rustc-dev-guide.rust-lang.org/diagnostics.html)
19. [Vision, Claude Platform docs](https://platform.claude.com/docs/en/build-with-claude/vision)
20. [How Claude remembers your project, Claude Code docs](https://code.claude.com/docs/en/memory)
21. [Multimodal judging benchmark paper, arXiv 2603.07990](https://arxiv.org/pdf/2603.07990v2)
22. [Does llms.txt work? The honest answer, with receipts, Optimizely](https://www.optimizely.com/field-notes/articles/does-llms-txt-work/)
23. [CLIs are more token-efficient than MCP. Or are they?, Checkly](https://www.checklyhq.com/blog/mcp-vs-cli-token-efficiency/)
