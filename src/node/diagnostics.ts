/**
 * Diagnostics: stable codes, actionable fixes, and the JSON envelope every CLI command
 * prints (docs/research/agent-first-design.md §6–7).
 *
 * Codes are `SGS` + 4 digits, grouped by hundreds: 01xx config, 02xx key, 03xx
 * generator, 04xx budget, 05xx determinism and identity, 06xx targets, 07xx drift.
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
  SGS0201: { title: 'no stable key found', cause: 'No candidate field is complete, unique and stable across the samples.', fix: 'Add an id field to the data, or configure a composite key (`key.fields`).' },
  SGS0202: { title: 'key missing for some items', cause: 'Some items lack the configured key field, so they use the fallback key, which changes when those fields change.', fix: 'Fix the data, or choose a key that every item has (`detect-key`).' },
  SGS0203: { title: 'key missing and no fallback', cause: 'An item has no key value and no fallback is configured (or `onMissing` is `throw`).', fix: 'Set `key.fallback`, or fix the data.' },
  SGS0204: { title: 'key not unique', cause: 'Several sample items share a key, so they would share an image.', fix: 'Choose a unique key or a composite key (`detect-key` proposes one).' },
  SGS0205: { title: 'key looks unstable', cause: 'The key field looks like display text, a timestamp or a locator, which change over time and would change the image.', fix: 'Prefer an immutable id; keep this only if it never changes.' },
  SGS0301: { title: 'generator not wired', cause: 'The runtime was asked for a generator that is not in the wiring module.', fix: `Add it to the config and run \`${PKG_NAME} build\`.` },
  SGS0302: { title: 'invalid generator params', cause: "Params in the config don't match the generator's schema.", fix: 'Fix the param named in `where.path`; `catalog --ref <ref>` lists valid params.' },
  SGS0303: { title: 'derived delivery with a non-pure generator', cause: '`derived` renders on every view, which needs a pure, local generator; remote or cached-nondeterministic ones would re-run every time.', fix: 'Use `materialized` or `hybrid`, or a pure generator.' },
  SGS0304: { title: 'generator peer missing or mismatched', cause: 'An adapter generator needs its upstream library at the pinned version, because its output depends on it.', fix: 'Install the exact version named in `fix.commands`.' },
  SGS0401: { title: 'over budget', cause: 'Kernel plus selected generators exceed `budget.maxGzipBytes`.', fix: 'Drop a generator, pick smaller ones (`catalog --max-gzip`), or raise the budget.' },
  SGS0402: { title: 'rasterizer missing', cause: 'PNG output was requested but no rasterizer is available.', fix: 'In Node, `npm i -D @resvg/resvg-js`; in the browser, pass `rasterize`.' },
  SGS0501: { title: 'non-deterministic output', cause: 'Rendering the same item twice gave different bytes.', fix: 'A generator uses randomness or time; use ctx.rng only.' },
  SGS0502: { title: 'generator output changed', cause: "A pinned generator's fingerprint no longer matches the lock, so every image it draws has changed.", fix: 'Revert the dependency change, or accept with `build --accept` after review.' },
  SGS0503: { title: 'lock missing', cause: `No ${PKG_NAME}.lock.json, so identity cannot be checked.`, fix: `Run \`${PKG_NAME} build\`.` },
  SGS0504: { title: 'sample identities changed', cause: 'Some sample items would now get a different image (config edit, data edit or upgrade).', fix: 'If intended, `build --accept`; else revert. Stored images are unaffected until regenerated (B19).' },
  SGS0601: { title: 'unknown target', cause: 'The target id is not in the registry.', fix: `\`${PKG_NAME} targets\` lists them.` },
  SGS0602: { title: 'target not registered', cause: 'The HTML head lacks the tag for a configured target.', fix: 'Paste the snippet from `targets --emit` into the head.' },
  SGS0603: { title: 'target file missing or wrong size', cause: 'A file a target needs is missing from the public dir, or its pixel size is wrong.', fix: `Run \`${PKG_NAME} targets --emit\`.` },
  SGS0604: { title: 'link-preview URL not absolute', cause: 'Crawlers resolve og:image/twitter:image only from absolute URLs.', fix: 'Set `targets.baseUrl` and use an absolute URL.' },
  SGS0605: { title: 'manifest icons incomplete', cause: 'The web app manifest lacks a 192, 512 or maskable icon.', fix: 'Merge the `icons` snippet from `targets --emit` into the manifest.' },
  SGS0701: { title: 'key field missing from data', cause: 'The configured key field is absent from the sample data: probably renamed.', fix: 'Point `key.field` at the new name (one line), or run `detect-key --write`.' },
  SGS0702: { title: 'input field missing from data', cause: 'An input or rule field named in the config appears in no sample item.', fix: 'Rename it in the config to match the data.' },
  SGS0703: { title: 'wiring module stale', cause: 'The config changed since the wiring module was generated.', fix: `Run \`${PKG_NAME} build\`.` },
  SGS0704: { title: 'wiring module missing', cause: 'The generated module the app imports does not exist.', fix: `Run \`${PKG_NAME} build\`.` },
  SGS0705: { title: 'generator imported directly', cause: 'App code imports a generator module, bypassing the config.', fix: 'Import `sigil` from the wiring module instead.' },
  SGS0706: { title: 'hard-coded choice in app code', cause: 'App code inlines a generator ref, calls Math.random next to sigilsmith, or hard-codes the key field.', fix: 'Read it from the config/wiring module; the config is the single source of truth.' },
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
