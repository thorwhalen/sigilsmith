/**
 * The catalog: implemented generators plus the survey drafts in `catalog/*.json`,
 * validated by one manifest schema, filterable by the A4 criteria.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PKG_NAME } from '../meta.js';
import { BUILTINS } from './builtins.js';
import { ManifestSchema, type Manifest } from './schema.js';
import { diag, envelope, type Diagnostic, type Envelope } from './diagnostics.js';

/** Package root, found by walking up to our own package.json (code may sit in `src/node`, `dist/` or a `dist/` chunk). */
function findPackageRoot(): string {
  let d = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    const f = join(d, 'package.json');
    if (existsSync(f) && (JSON.parse(readFileSync(f, 'utf8')) as { name?: string }).name === PKG_NAME) return `${d}/`;
    const up = dirname(d);
    if (up === d) throw new Error(`cannot find the ${PKG_NAME} package root from ${import.meta.url}`);
    d = up;
  }
}
export const PACKAGE_ROOT = findPackageRoot();

export interface Sizes {
  kernel?: { minBytes: number; gzipBytes: number; brotliBytes: number };
  generators: Record<string, { minBytes: number; gzipBytes: number; brotliBytes: number }>;
  measuredAt?: string;
}

export function readSizes(): Sizes {
  const file = `${PACKAGE_ROOT}catalog/_sizes.json`;
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Sizes) : { generators: {} };
}

export function loadCatalog(): { entries: Manifest[]; diagnostics: Diagnostic[] } {
  const sizes = readSizes();
  const diagnostics: Diagnostic[] = [];
  const implemented = BUILTINS.map(({ manifest }) => {
    const s = sizes.generators[manifest.ref!];
    return s ? { ...manifest, bundleSize: { minBytes: s.minBytes, minGzipBytes: s.gzipBytes, brotliBytes: s.brotliBytes, measured: true, source: `npm run measure (${sizes.measuredAt ?? 'unknown date'})` } } : manifest;
  });
  const dir = `${PACKAGE_ROOT}catalog/`;
  const drafts: Manifest[] = [];
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json') && !x.startsWith('_')).sort()) {
      const r = ManifestSchema.safeParse(JSON.parse(readFileSync(dir + f, 'utf8')));
      if (r.success) {
        if (!(r.data as { implementedAs?: unknown }).implementedAs) drafts.push(r.data);
      } else diagnostics.push(diag('SGS0102', 'warning', `catalog/${f}: ${r.error.issues[0]?.message}`, { where: { file: `catalog/${f}`, path: r.error.issues[0]?.path.join('.') } }));
    }
  }
  const ids = new Set(implemented.map((m) => m.id));
  return { entries: [...implemented, ...drafts.filter((d) => !ids.has(d.id))], diagnostics };
}

export interface CatalogQuery {
  style?: string[];
  semantic?: string[];
  maxGzip?: number;
  noNetwork?: boolean;
  noSecret?: boolean;
  minPx?: number;
  implemented?: boolean;
  roles?: string[];
  mitOnly?: boolean;
  ref?: string;
}

export interface CatalogRow {
  id: string;
  ref?: string;
  name: string;
  implemented: boolean;
  style: string;
  semanticLevel: string;
  gzipBytes: number | null;
  measured: boolean;
  network: boolean | null;
  cost: string;
  license: string | null;
  mitCompatible: boolean | null;
  determinism: string;
  sizeRange: [number | null, number | null];
  verdict: string;
  importPath?: string;
  /** `extra`: outside the generator set, imported from `sigilsmith/extras/*`. */
  tier?: 'extra';
  /** Licence and service-terms restrictions a developer must know before choosing this. */
  terms?: string[];
  /** How to wire it, for entries used through `remote` rather than a generator module. */
  usage?: string;
  params?: Manifest['params'];
  description: string;
}

function row(m: Manifest, full: boolean): CatalogRow {
  return {
    id: m.id,
    ...(m.ref ? { ref: m.ref } : {}),
    name: m.name,
    implemented: m.implemented,
    style: m.style,
    semanticLevel: m.semanticLevel,
    gzipBytes: m.bundleSize.minGzipBytes,
    measured: m.bundleSize.measured,
    network: m.runtime.network,
    cost: m.cost.model,
    license: m.license.spdx,
    mitCompatible: m.license.mitCompatible,
    determinism: m.determinism,
    sizeRange: [m.sizeRange.minPx, m.sizeRange.maxPx],
    verdict: m.verdict,
    ...(m.importPath ? { importPath: m.importPath } : {}),
    ...(m.tier === 'extra' ? { tier: 'extra' as const } : {}),
    ...(m.license.restrictions.length ? { terms: m.license.restrictions } : {}),
    ...((m as { usage?: string }).usage ? { usage: (m as { usage?: string }).usage } : {}),
    ...(full ? { params: m.params } : {}),
    description: m.description,
  };
}

export function catalog(q: CatalogQuery = {}): Envelope<{ query: CatalogQuery; total: number; matched: number; results: CatalogRow[]; excluded: Array<{ id: string; because: string }> }> {
  const { entries, diagnostics } = loadCatalog();
  const results: CatalogRow[] = [];
  const excluded: Array<{ id: string; because: string }> = [];
  const roles = q.roles ?? ['generator'];
  for (const m of entries) {
    const why: string[] = [];
    if (q.ref && m.ref !== q.ref && m.id !== q.ref) continue;
    if (!roles.includes(m.role)) continue;
    if (q.implemented && !m.implemented && !(m as { usage?: string }).usage) why.push('not implemented yet (survey draft)');
    if (q.style?.length && !q.style.includes(m.style)) why.push(`style ${m.style} not in ${q.style.join('/')}`);
    if (q.semantic?.length && !q.semantic.includes(m.semanticLevel)) why.push(`semantic level ${m.semanticLevel} not in ${q.semantic.join('/')}`);
    if (q.maxGzip !== undefined) {
      const g = m.bundleSize.minGzipBytes;
      if (g === null) why.push('bundle size unknown');
      else if (g > q.maxGzip) why.push(`gzip ${g} B > ${q.maxGzip} B`);
    }
    if (q.noNetwork && m.runtime.network !== false) why.push('needs the network');
    if (q.noSecret && m.requiresSecret) why.push('needs a secret');
    if (q.minPx !== undefined && (m.sizeRange.minPx ?? Infinity) > q.minPx) why.push(`smallest legible size ${m.sizeRange.minPx ?? '?'} px > ${q.minPx} px`);
    if (q.mitOnly && m.license.mitCompatible !== true) why.push(`licence ${m.license.spdx ?? 'unknown'} not MIT-compatible`);
    if (why.length) excluded.push({ id: m.ref ?? m.id, because: why.join('; ') });
    else results.push(row(m, Boolean(q.ref)));
  }
  results.sort((a, b) => Number(b.implemented) - Number(a.implemented) || (a.gzipBytes ?? 1e9) - (b.gzipBytes ?? 1e9));
  const next = results.some((r) => r.implemented)
    ? [{ command: `npx sigilsmith preview --generators ${results.filter((r) => r.implemented).map((r) => r.ref).slice(0, 4).join(',')}`, why: 'see the candidates on your sample items' }]
    : [{ command: 'npx sigilsmith catalog --implemented', why: 'only implemented generators can be wired today' }];
  return envelope('catalog', { query: q, total: entries.length, matched: results.length, results, excluded }, diagnostics, next);
}
