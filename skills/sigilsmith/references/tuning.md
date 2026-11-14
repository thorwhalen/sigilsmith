# Tuning

Params resolve through five layers, lowest first: `generator` defaults → `preset:<name>` (by item type) → `project` (`generators.<ref>.params` / `.inputs`) → `rule:<n>` (the matching rule's `params.<ref>` / `inputs`) → `user` (end-user settings, only for keys listed in `userSettings.params.<ref>`). `explain` shows the winning layer and what it shadowed for every param.

- List a generator's params: `npx sigilsmith catalog --ref grid@1 --json` (`results[0].params`). Invalid params fail `check` with `SGS0302`.
- Inputs decide what the image *means*: `["$key"]` (default for hash generators) never changes on rename; `["title"]` follows the title; `["$label", "$key"]` (initials) changes letters on rename but keeps the colour. Long text: `{ "field": "lyrics", "maxChars": 2000 }`.
- After each change: `npx sigilsmith preview --generators <ref>` and look at the PNG, then `npx sigilsmith build`.
- Palette options (`chroma`, `lightness`, `backgroundLightness`, `spread`) can be passed as `params.palette` to any in-house generator.
