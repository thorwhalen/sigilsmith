# Feature-driven sigils: images that show what an item is

Hash generators (`grid@1`, `rings@1`, …) make every item look different and say nothing about it. A **feature set** makes the image carry meaning: similar items look related, different ones look distinct, and a user learns to read the list at a glance (all wind instruments teal, every percussive one with a pulse line, polyphonic ones with more satellites). Use it whenever the items of a list have characteristics a user would sort or choose by.

## Should this list have sigils at all?

Ask this for every list of items in a UI (frontend, music-app-ux and the UX reviewers route the question here):

1. **Do items lack a picture of their own?** A list of photos, album covers or user avatars already has one; a sigil is the fallback for items without it. Lists of instruments, presets, scenes, games, projects, documents, playlists usually have none.
2. **Do users scan or pick from the list?** Pickers, galleries, libraries, recents: yes. A settings list or a log: no, text is enough.
3. **Hash or features?** If items have characteristics worth seeing (a type, a family, a size, a mode), use a feature set. If they are interchangeable records (users, files), a hash generator is right and this page does not apply: see `choosing.md`.

A sigil sits next to the name and is decorative (`alt=""`); it never replaces the label.

## The three parts, all data

| Part | Holds | Maintained by |
|---|---|---|
| **Feature schema** (`*.features.schema.json`) | the dimensions: `numeric` (`min`, `max`), `ordinal` (`levels`, in order), `categorical` (`values`), `binary`; each may have a `default` and a `description` | whoever knows the domain; it is the vocabulary of the list |
| **Vectors** | one object per item, dimension → value: on the item itself (field `features` by default) or in a table keyed by item key (`vectors` file) | derived from the items' real definitions by a small function in the host (preferred), or hand-written for a fixed catalog |
| **Mapping** (`*.sigil-mapping.json`) | `use`: the generator; `encodings`: per generator ref, param → `{ from, map }`, `{ from, range, round? }` or `{ value }` | a designer or agent tuning the look, with `preview` |

Validate them in an editor with `$schema`: `node_modules/sigilsmith/schema/feature-schema.schema.json` and `feature-mapping.schema.json`.

```jsonc
// sigilsmith.config.json
"features": [
  { "when": { "kind": "instrument" },                  // optional: which items (same matcher as policy rules)
    "field": "features",                               // item field with the vector (checked first)
    "schema": "src/instruments/instrument.features.schema.json",
    "mapping": "src/instruments/instrument.sigil-mapping.json",
    "vectors": "src/instruments/instrument.features.json" }  // optional: key → vector; "$…" keys ignored
]
```

`build` inlines the three files into the wiring module (and imports `sigilsmith/features`, ~1.1 kB gzip, only when a config has feature sets); the config hash covers their content, so `check fresh` catches an edited mapping.

## Choosing encodings (the visual channels of `glyph@1`)

Map each dimension to one channel, matching the channel to the kind of data (Bertin's visual variables): the eye reads hue and shape as *kinds*, size, tone and counts as *amounts*.

| Dimension kind | Good channels | Encoding |
|---|---|---|
| categorical (the main grouping) | `hue` (0–359), `shape` (circle, triangle, square, diamond, pentagon, hexagon, star, flower, blob) | `{ "from": "family", "map": { "wind": 190, "string": 30 } }` |
| categorical (second grouping) | `shape`, `fill` (solid, outline, stripes, dots, half), `mark` (none, sine, zigzag, steps, pulse, noise) | `map` |
| ordinal | `size` (0.2–0.85), `rings` (0–3), `tone` (light/dark), `chroma` | `{ "from": "register", "range": [0.4, 0.75] }` or `map` |
| numeric | `orbit` (0–8, round), `size`, `rotation`, `chroma` | `{ "from": "voices", "range": [0, 6], "round": true }` |
| binary | `fill`, `mark`, `tone`, `rings` | `{ "from": "percussive", "map": { "true": "pulse", "false": "none" } }` |
| constant | anything (`tile`, the app's `tone`) | `{ "value": "circle" }` |

An encoding can also be a **list tried in order**; the first that yields a value wins (a `map` without a `default` yields nothing for an unlisted level). Use it when one channel should follow different facts for different items, without baking that choice into the vector: `"hue": [{ "from": "kind", "map": { "drum": 25, "chords": 280 } }, { "from": "sound", "map": { … } }]`. Encodings may be keyed by generator id (`"glyph"`) instead of a ref (`"glyph@1"`) to apply to any major. `glyph@1` also has `accentShift`, the hue offset of its second colour (rings, satellites, the split fill): 150 contrasts, 20–40 stays in the family.

Rules of thumb: put the dimension users group by most on **hue**, and the second on **shape**, and make sure hue varies *within* each group the list shows (a section of 17 items in one colour cannot be scanned); in lists drawn at 20–32 px only hue, shape, the tile and a solid-versus-outline fill survive, so give those the facts that matter most, and keep patterns, rings and satellites for the gallery; give each channel to at most one dimension; leave `jitter` (the item's own small rotation offset) low so siblings stay recognisably related; keep five or six channels at most, or 32 px images turn to noise. `check` reports any dimension that drives nothing (`SGS0803`, info), and any items whose features differ but whose params come out equal (`SGS0803`, warning).

## The light-API seam

The mapping is keyed by generator ref, so the same features can drive a remote generator with no code: declare `remote.<ref>` (for example DiceBear) and add an `encodings.<ref>` block whose params go under `options.*`; the DiceBear transport sends them as style options (`options.backgroundColor`, `options.shape1`). Options are sent in clear beside a hashed seed, so they disclose the features they encode; only scalar values are sent, and never a `seed` option. Computed images (`glyph@1`) stay the default: free, offline, instant and deterministic.

## The loop for a list

1. Write the schema: the 4–8 characteristics that tell items apart, from the items' real definitions (not their names).
2. Derive the vectors with a pure host function `featuresOf(item)` from the item definitions, so new and edited items get correct sigils; pass them on the item (`{ ...item, features: featuresOf(item) }`) or write a snapshot table for a fixed catalog and test that it matches the function.
3. Write the mapping (`use: "glyph@1"`), then `npx sigilsmith preview --generators glyph@1` and `npx sigilsmith explain --index 0 --json` (its `features` block shows the vector and which dimension set each param).
4. `npx sigilsmith build`, glue `<Sigil item={…} />` where the list shows its fallback tile, `npx sigilsmith check`.
5. Later: edit the mapping (the look) or the schema (the vocabulary) and rebuild. A mapping change changes images, so `build` asks for `--accept`.
