/**
 * Command functions shared by the CLI (and any future MCP or HTTP surface): plain
 * functions with JSON-able arguments that return a JSON envelope. Nothing here prints
 * or exits; `src/cli/main.ts` does that.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { CONFIG_FILE, PKG_NAME, SAMPLES_FILE } from '../meta.js';
import type { Item } from '../types.js';
import { loadSamples, type LoadedConfig } from './config.js';
import { detectItemType, detectKey, type ItemTypeReport, type KeyReport } from './detect.js';
import { diag, envelope, type Diagnostic, type Envelope } from './diagnostics.js';

export const AGENTS_BEGIN = `<!-- ${PKG_NAME}:begin (managed by \`${PKG_NAME} init\`; edit the config, not this block) -->`;
export const AGENTS_END = `<!-- ${PKG_NAME}:end -->`;

export function agentsBlock(genPath: string): string {
  return [
    AGENTS_BEGIN,
    `## Identity images (${PKG_NAME})`,
    '',
    `- \`${CONFIG_FILE}\` is the single source of truth for item keys, which fields feed each generator, generator choices, params and budgets. **Never inline a field name, generator ref or param in app code; read the config.**`,
    `- App code imports \`sigil\` from \`${genPath}\` (generated: never edit it; run \`npx ${PKG_NAME} build\` after changing the config).`,
    `- Choose and tune: \`npx ${PKG_NAME} catalog --json\`, \`npx ${PKG_NAME} preview\` (look at the PNG), \`npx ${PKG_NAME} explain --index 0 --json\`.`,
    `- Keys: \`npx ${PKG_NAME} detect-key <samples.json> --write\`.`,
    `- Done means \`npx ${PKG_NAME} check --json\` exits 0. Each diagnostic has a \`fix\`; \`npx ${PKG_NAME} explain-code <SGS…>\` explains it.`,
    `- Procedure (choose → preview → pin → build → glue → check): \`node_modules/${PKG_NAME}/skills/${PKG_NAME}/SKILL.md\`.`,
    AGENTS_END,
  ].join('\n');
}

/**
 * Starter total budget, in gzip bytes, for everything sigilsmith adds to the app's
 * bundle: kernel (~3.9 kB) + React adapter (~1.5 kB) + the largest local generator
 * (~1.4 kB) is ~6.8 kB, so the documented React path passes with any one generator and
 * leaves room for a second small one. It is a total, not a per-generator cap (that is
 * `catalog --max-gzip`).
 */
export const STARTER_BUDGET_GZIP = 8000;

/**
 * The config `init` writes. Delivery starts `derived`: the starter generator is pure,
 * so images are computed on read and the app needs no storage, upload route or
 * `deliver()` call. Switch to `materialized` (or `hybrid`) when images must survive a
 * change of their inputs (the rename prompt), when a remote generator is used, or when
 * other systems need a stored URL; `check` says when a choice requires it (SGS0303).
 */
export function starterConfig(opts: { key?: unknown; samples?: string; preset?: string[]; itemType?: string | null } = {}) {
  return {
    $schema: `./node_modules/${PKG_NAME}/schema/config.schema.json`,
    version: 1,
    itemType: opts.itemType === undefined ? { field: 'type' } : opts.itemType === null ? null : { field: opts.itemType },
    key: opts.key ?? { field: 'id', fallback: ['title', 'type'] },
    presets: opts.preset ?? [],
    generators: {},
    policy: { default: 'grid@1', rules: [] },
    delivery: { strategy: 'derived', format: 'svg' },
    regeneration: { policy: 'ask' },
    budget: { maxGzipBytes: STARTER_BUDGET_GZIP },
    userSettings: { choices: [] },
    ...(opts.samples ? { samples: opts.samples } : {}),
    output: { gen: `src/${PKG_NAME}.gen.ts` },
  };
}

export interface InitData {
  wrote: string[];
  skipped: string[];
  /** What was read from the samples, when given: the key and item-type choices written. */
  detected?: { key: KeyReport['chosen']; itemType: ItemTypeReport };
}

export function init(dir: string, opts: { samples?: string; force?: boolean; agents?: boolean } = {}): Envelope<InitData> {
  const wrote: string[] = [];
  const skipped: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const cfgFile = resolve(dir, CONFIG_FILE);
  let key: unknown;
  let detected: InitData['detected'];
  if (opts.samples) {
    const { items, error } = loadSamples(dir, opts.samples);
    if (error) diagnostics.push(diag('SGS0702', 'warning', error));
    const report = detectKey(items);
    if (report.chosen) key = { ...report.chosen.key, fallback: [] };
    for (const w of report.warnings) diagnostics.push(diag('SGS0205', 'warning', w));
    detected = { key: report.chosen, itemType: detectItemType(items) };
  }
  const itemType = detected ? detected.itemType.field : undefined;
  if (existsSync(cfgFile) && !opts.force) skipped.push(CONFIG_FILE);
  else {
    writeFileSync(cfgFile, `${JSON.stringify(starterConfig({ key, itemType, ...(opts.samples ? { samples: opts.samples } : {}) }), null, 2)}\n`);
    wrote.push(CONFIG_FILE);
  }
  if (opts.agents !== false) {
    const agents = resolve(dir, 'AGENTS.md');
    const block = agentsBlock(`src/${PKG_NAME}.gen.ts`);
    const text = existsSync(agents) ? readFileSync(agents, 'utf8') : '# Agent notes\n';
    const re = new RegExp(`${AGENTS_BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${AGENTS_END}`);
    writeFileSync(agents, re.test(text) ? text.replace(re, block) : `${text.trimEnd()}\n\n${block}\n`);
    wrote.push('AGENTS.md');
  }
  // The SKILL loop, in order: key → choose → look → build. With samples, init already
  // wrote the detected key (detect-key shows the full report); without, the key is a guess.
  const keyStep = opts.samples
    ? { command: `npx ${PKG_NAME} detect-key ${opts.samples}`, why: 'review the key init wrote (candidates, uniqueness, suspects)' }
    : { command: `npx ${PKG_NAME} detect-key ${SAMPLES_FILE} --write`, why: `the key is a guess (\`id\`): save 20+ real items to ${SAMPLES_FILE} and detect it` };
  return envelope('init', { wrote, skipped, ...(detected ? { detected } : {}) }, diagnostics, [
    keyStep,
    { command: `npx ${PKG_NAME} catalog --implemented`, why: 'see what generators exist' },
    { command: `npx ${PKG_NAME} preview`, why: 'look at the candidates drawn for your items' },
    { command: `npx ${PKG_NAME} build`, why: 'write the wiring module and lock' },
  ]);
}

/** Detect the key on sample data; with `write`, put the choice in the config. */
export function detectKeyCmd(loaded: LoadedConfig | null, samplesPath: string, opts: { write?: boolean; cwd?: string } = {}): Envelope<KeyReport & { written: boolean; samples: string }> {
  const dir = loaded?.dir ?? opts.cwd ?? process.cwd();
  const { items, error, file } = loadSamples(dir, samplesPath);
  const diagnostics: Diagnostic[] = [];
  if (error) return envelope('detect-key', { total: 0, candidates: [], chosen: null, warnings: [error], written: false, samples: samplesPath }, [diag('SGS0702', 'error', error)]);
  const report = detectKey(items as Item[]);
  if (!report.chosen) diagnostics.push(diag('SGS0201', 'error', 'no stable key found in the samples', { fix: { summary: 'add an id field to the data, or configure `key.fields`', applicability: 'has-placeholders' } }));
  else {
    if (report.chosen.duplicates.length) diagnostics.push(diag('SGS0204', 'error', 'chosen key is not unique'));
    for (const s of report.chosen.suspects) diagnostics.push(diag('SGS0205', 'warning', s.detail));
  }
  let written = false;
  if (opts.write && report.chosen && loaded?.raw) {
    const raw = loaded.raw as Record<string, unknown>;
    const prev = (raw.key ?? {}) as Record<string, unknown>;
    const { field: _f, fields: _fs, custom: _c, ...rest } = prev;
    raw.key = { ...report.chosen.key, ...rest };
    raw.samples ??= relative(dir, file ?? samplesPath);
    writeFileSync(loaded.path, `${JSON.stringify(raw, null, 2)}\n`);
    written = true;
  } else if (opts.write && !loaded?.raw) diagnostics.push(diag('SGS0101', 'error', 'no config to write into', { fix: { summary: 'create one first', applicability: 'machine-applicable', commands: [`npx ${PKG_NAME} init --samples ${samplesPath}`] } }));
  return envelope('detect-key', { ...report, written, samples: samplesPath }, diagnostics, written ? [{ command: `npx ${PKG_NAME} build`, why: 'the key changed; regenerate the wiring module' }] : report.chosen ? [{ command: `npx ${PKG_NAME} detect-key ${samplesPath} --write`, why: 'record this choice in the config' }] : []);
}

export { SAMPLES_FILE };
