/**
 * Diagnostics: stable codes, actionable fixes, and the JSON envelope every CLI command
 * prints (docs/research/agent-first-design.md §6–7).
 *
 * Codes are `SGS` + 4 digits, grouped by hundreds: 01xx config, 02xx key, 03xx
 * generator, 04xx budget, 05xx determinism and identity, 06xx targets, 07xx drift, 08xx features.
 * Every code has an offline page (`sigilsmith explain-code <code>`), built from
 * `CODES` below, which is the single source for those pages and the skill's errors list.
 */
import { DIAGNOSTIC_PREFIX, PKG_NAME } from '../meta.js';

export type Severity = 'error' | 'warning' | 'info';
export type Applicability = 'machine-applicable' | 'has-placeholders' | 'maybe-incorrect' | 'unspecified';

export interface Fix {
  summary: string;
  applicability: Applicability;
  commands?: string[];
  edits?: Array<{ file: string; path: string; set: unknown }>;
}

export interface Diagnostic {
  code: string;
  severity: Severity;
  message: string;
  where?: Record<string, unknown>;
  fix?: Fix;
}

export interface Envelope<T = unknown> {
  schema: string;
  ok: boolean;
  data: T;
  diagnostics: Diagnostic[];
  next: Array<{ command: string; why: string }>;
}

export const CODES: Record<string, { title: string; cause: string; fix: string }> = {
  SGS0101: { title: 'config file not found', cause: `No ${PKG_NAME}.config.json in the working directory (or the path given with --config).`, fix: `Run \`npx ${PKG_NAME} init\`, or pass --config <path>.` },
  SGS0102: { title: 'config does not match the schema', cause: 'A field has the wrong type, an unknown name, or a value out of range.', fix: 'Edit the field named in `where.path`; the JSON Schema linked by `$schema` gives editor hints.' },
  SGS0103: { title: 'unknown preset', cause: 'The `presets` list names a preset that does not exist.', fix: `Use one of the built-in presets listed by \`${PKG_NAME} catalog --presets\`.` },
  SGS0104: { title: 'unknown generator ref', cause: 'A ref is neither a built-in generator nor declared under `remote`.', fix: `Pick an implemented ref from \`${PKG_NAME} catalog --implemented\`, or declare a remote generator.` },
  SGS0105: { title: 'secret in config', cause: 'A value that looks like an API key is in the config, which is committed and may be bundled.', fix: 'Remove it. Use a proxy endpoint (`remote.<ref>.transport: "proxy"`) or a BYOK module transport that reads the key at call time.' },
  SGS0106: { title: 'no BYOK key', cause: 'A BYOK transport found no key for the current user.', fix: 'Ask the user to add their key in settings; the placeholder stays meanwhile.' },
  SGS0107: { title: 'service terms restrict use', cause: 'A remote service in the config has terms that limit how it may be used (the public DiceBear API is free for non-commercial use only; DiceBear styles carry their own licences).', fix: 'Commercial app: self-host the service and set its `baseUrl`. Non-commercial app: acknowledge the terms in the config (`"use": "non-commercial"`). Check the style\'s licence either way.' },
  SGS0112: { title: 'extension not loaded', cause: 'A module named in `extensions` is missing, failed to import, or does not default-export a generator module (id, major, kind, defaults, defaultInputs, determinism, render).', fix: 'Check the path (relative to the config) or the package name. The module default-exports the generator, with no zod or Node imports. TypeScript, TSX and path aliases load when esbuild is installed in the project; otherwise plain JS, or erasable TypeScript on Node 22.18+.' },
  SGS0113: { title: 'extension ref taken', cause: 'An extension declares an `id@major` that a built-in generator, another extension or a `remote` key already has, or an id without a hyphen (built-in ids never have one, so extension ids must).', fix: 'Give the extension its own hyphenated id (e.g. `app-orb`), then use that ref in the policy.' },
  SGS0114: { title: 'user settings on an extension', cause: '`userSettings.params` names an extension generator; the browser settings module knows only the built-in generators\' params, so the dials would silently not appear.', fix: 'Drop that `userSettings.params` entry (the extension can still be a `userSettings.choices` option).' },
  SGS0110: { title: 'upload rejected', cause: 'A user-supplied image is too large or is not a PNG, JPEG, GIF or WebP (checked by its bytes, not its claimed type). SVG is refused by default: a scripted SVG served from the app origin is stored XSS.', fix: 'Ask for a raster image, or raise maxBytes; accept SVG only with server-side sanitising (allowSvg).' },
  SGS0111: { title: 'image not adoptable', cause: '`adoptImage` takes an existing image by URL: http(s), root-relative or a raster data: URL. A javascript:, protocol-relative or SVG URL is refused, and with a store the fetched bytes must be a PNG, JPEG, GIF or WebP.', fix: 'Pass the URL of a raster image the app already serves; for an expiring or cross-origin URL pass `store` so the bytes are copied (the server must allow the fetch, or copy them server-side).' },
  SGS0201: { title: 'no stable key found', cause: 'No candidate field is complete, unique and stable across the samples.', fix: 'Add an id field to the data, or configure a composite key (`key.fields`).' },
  SGS0202: { title: 'key missing for some items', cause: 'Some items lack the configured key field, so they use the fallback key, which changes when those fields change.', fix: 'Fix the data, or choose a key that every item has (`detect-key`).' },
  SGS0203: { title: 'key missing and no fallback', cause: 'An item has no key value and no fallback is configured (or `onMissing` is `throw`).', fix: 'Set `key.fallback`, or fix the data.' },
  SGS0204: { title: 'key not unique', cause: 'Several sample items share a key, so they would share an image.', fix: 'Choose a unique key or a composite key (`detect-key` proposes one).' },
  SGS0205: { title: 'key looks unstable', cause: 'The key field looks like display text, a timestamp or a locator, which change over time and would change the image.', fix: 'Prefer an immutable id; keep this only if it never changes.' },
  SGS0301: { title: 'generator not wired', cause: 'The runtime was asked for a generator that is not in the wiring module.', fix: `Add it to the config and run \`${PKG_NAME} build\`.` },
  SGS0302: { title: 'invalid generator params', cause: "Params in the config don't match the generator's schema.", fix: 'Fix the param named in `where.path`; `catalog --ref <ref>` lists valid params.' },
  SGS0303: { title: 'derived delivery with a non-pure generator', cause: '`derived` renders on every view, which needs a pure, local generator; remote or cached-nondeterministic ones would re-run every time.', fix: 'Use `materialized` or `hybrid`, or a pure generator.' },
  SGS0304: { title: 'generator peer missing or mismatched', cause: 'An adapter generator needs its upstream library at the pinned version, because its output depends on it.', fix: 'Install the exact version named in `fix.commands`.' },
  SGS0305: { title: 'screenshot unusable', cause: 'The screenshot extra could not use an item\'s screenshot: the file failed to load (network, CORS, HTTP error), is not a PNG, JPEG, GIF or WebP, is over `maxBytes`, or its focus is malformed. A missing field or a 404 is not an error: the fallback sigil is drawn.', fix: 'Fix the URL or the focus; serve cross-origin files with CORS; ship a small key frame (a few hundred pixels, WebP).' },
  SGS0401: { title: 'over budget', cause: 'Everything sigilsmith adds to the bundle (kernel, delivery/React/remote modules in use, and every selectable generator) exceeds `budget.maxGzipBytes`, which is a total.', fix: 'Replace the largest generator with one that fits the room named in the fix (`catalog --max-gzip` filters per generator), drop one, or raise the budget.' },
  SGS0402: { title: 'rasterizer missing', cause: 'PNG output was requested but no rasterizer is available.', fix: 'In Node, `npm i -D @resvg/resvg-js`; in the browser, pass `rasterize`.' },
  SGS0501: { title: 'non-deterministic output', cause: 'Rendering the same item twice gave different bytes.', fix: 'A generator uses randomness or time; use ctx.rng only.' },
  SGS0502: { title: 'generator output changed', cause: "A pinned generator's fingerprint no longer matches the lock, so every image it draws has changed.", fix: 'Revert the dependency change, or accept with `build --accept` after review.' },
  SGS0503: { title: 'lock missing', cause: `No ${PKG_NAME}.lock.json, so identity cannot be checked.`, fix: `Run \`${PKG_NAME} build\`.` },
  SGS0504: { title: 'sample identities changed', cause: 'Some sample items would now get a different image (config edit, data edit or upgrade).', fix: 'If intended, `build --accept`; else revert. Stored images are unaffected until regenerated (B19).' },
  SGS0505: { title: 'lock is stale', cause: 'The lock was written for a different config, so new rules and items have no recorded identity.', fix: 'Run `sigilsmith build` and review what changes.' },
  SGS0601: { title: 'unknown target', cause: 'The target id is not in the registry.', fix: `\`${PKG_NAME} targets\` lists them.` },
  SGS0602: { title: 'target not registered', cause: 'The HTML head lacks the tag for a configured target.', fix: 'Paste the snippet from `targets --emit` into the head.' },
  SGS0603: { title: 'target file missing or wrong size', cause: 'A file a target needs is missing from the public dir, or its pixel size is wrong.', fix: `Run \`${PKG_NAME} targets --emit\`.` },
  SGS0604: { title: 'link-preview URL not absolute', cause: 'Crawlers resolve og:image/twitter:image only from absolute URLs.', fix: 'Set `targets.baseUrl` and use an absolute URL.' },
  SGS0606: { title: 'target file exists', cause: '`targets --emit` will not replace a file it did not write (the lock records what it wrote), such as a hand-made icon with the same name.', fix: 'Emit elsewhere with `--out <dir>` and pick what to keep, or replace it with `--force`.' },
  SGS0607: { title: 'page already has icons', cause: 'The page in `targets.html` declares its own favicon or touch icon; a site icon from sigilsmith would compete with it (browsers prefer SVG; hosts may derive icons from the page).', fix: 'Drop the site targets the page already covers from `targets.ids`, or replace its icons on purpose.' },
  SGS0605: { title: 'manifest icons incomplete', cause: 'The web app manifest lacks a 192, 512 or maskable icon.', fix: 'Merge the `icons` snippet from `targets --emit` into the manifest.' },
  SGS0701: { title: 'key field missing from data', cause: 'The configured key field is absent from the sample data: probably renamed.', fix: 'Point `key.field` at the new name (one line), or run `detect-key --write`.' },
  SGS0702: { title: 'input field missing from data', cause: 'An input, rule or item-type field named in the config appears in no sample item (or the samples are missing or too few).', fix: 'Rename it in the config to match the data. For `itemType`, set `"itemType": null` when items have no type field (only a warning unless a rule matches on it).' },
  SGS0703: { title: 'wiring module stale', cause: 'The config changed since the wiring module was generated.', fix: `Run \`${PKG_NAME} build\`.` },
  SGS0704: { title: 'wiring module missing', cause: 'The generated module the app imports does not exist.', fix: `Run \`${PKG_NAME} build\`.` },
  SGS0705: { title: 'generator imported directly', cause: 'App code imports a generator module or a generator library (e.g. minidenticons), bypassing the config.', fix: 'Import `sigil` from the wiring module instead.' },
  SGS0706: { title: 'generator ref hard-coded in app code', cause: 'App code names a generator ref, so changing the choice means editing code instead of the config.', fix: 'Choose generators in the config (policy rules, user settings); app code passes the item only.' },
  SGS0707: { title: 'Math.random near sigilsmith', cause: 'Randomness next to identity images makes them change between renders.', fix: 'Remove it; identity images are seeded from the item.' },
  SGS0708: { title: 'key field hard-coded in app code', cause: 'App code names the key field next to a sigilsmith call; renaming the field then needs a code change.', fix: 'Pass the whole item; the config owns the key.' },
  SGS0801: { title: 'feature set invalid', cause: 'A feature schema, mapping or vector file is missing, is not JSON, does not match its schema, or the mapping reads a dimension the schema lacks or leaves levels unmapped.', fix: 'Edit the file and path named in `where`; `explain` shows which dimension set each param.' },
  SGS0802: { title: 'feature vector does not fit', cause: 'A sample item has no vector, a value outside its dimension (unknown category, number out of range, wrong type), or a dimension the schema lacks.', fix: 'Fix the vector (or its derivation), or extend the schema; missing values fall back to the dimension `default`.' },
  SGS0803: { title: 'mapping loses features', cause: 'Items whose features differ are drawn with the same params, or a dimension drives no param: the image cannot show the difference.', fix: 'Map another dimension to a free visual channel (shape, fill, rings, orbit, mark, tone), or accept it if the difference does not matter visually.' },
  SGS0709: { title: 'regeneration not wired', cause: 'A selectable generator reads inputs that can change (titles, names) and images are stored, but the app never calls onInputsChanged, so stored images go stale silently.', fix: 'Call onInputsChanged(sigil, item, record, { confirm }) after edits, or set regeneration.policy to "never".' },
};

export function diag(code: keyof typeof CODES | string, severity: Severity, message: string, extra: { where?: Record<string, unknown>; fix?: Partial<Fix> } = {}): Diagnostic {
  const page = CODES[code];
  const fix: Fix | undefined = extra.fix || page ? { summary: extra.fix?.summary ?? page?.fix ?? '', applicability: extra.fix?.applicability ?? 'unspecified', ...(extra.fix?.commands ? { commands: extra.fix.commands } : {}), ...(extra.fix?.edits ? { edits: extra.fix.edits } : {}) } : undefined;
  return { code, severity, message, ...(extra.where ? { where: extra.where } : {}), ...(fix ? { fix } : {}) };
}

export function envelope<T>(command: string, data: T, diagnostics: Diagnostic[] = [], next: Envelope['next'] = []): Envelope<T> {
  return { schema: `${PKG_NAME}.${command}/1`, ok: !diagnostics.some((d) => d.severity === 'error'), data, diagnostics, next };
}

/** Rust-style human rendering of diagnostics. */
export function formatDiagnostic(d: Diagnostic): string {
  const lines = [`${d.severity}[${d.code}]: ${d.message}`];
  if (d.where) lines.push(`  --> ${Object.entries(d.where).map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ')}`);
  if (d.fix?.summary) lines.push(`  help: ${d.fix.summary}`);
  for (const c of d.fix?.commands ?? []) lines.push(`        $ ${c}`);
  for (const e of d.fix?.edits ?? []) lines.push(`        edit ${e.file}: ${e.path} = ${JSON.stringify(e.set)}`);
  return lines.join('\n');
}

export function explainCode(code: string): Envelope<{ code: string; title: string; cause: string; fix: string } | null> {
  const c = code.toUpperCase().startsWith(DIAGNOSTIC_PREFIX) ? code.toUpperCase() : `${DIAGNOSTIC_PREFIX}${code}`;
  const page = CODES[c];
  if (!page) return envelope('explain-code', null, [diag('SGS0000', 'error', `unknown code \`${code}\``, { fix: { summary: `codes are ${Object.keys(CODES).join(', ')}`, applicability: 'unspecified' } })]);
  return envelope('explain-code', { code: c, ...page });
}
