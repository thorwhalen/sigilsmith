/**
 * `targets`: list the integration targets, emit their files and registration
 * snippets, and validate a host's registration (B17).
 *
 * Site targets (favicon, touch icon, manifest icons) are drawn from the site sigil
 * (`targets.site` in the config); item targets (og:image, Media Session artwork) from
 * an item. PNGs need @resvg/resvg-js; the SVG favicon does not.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { contentIdOf } from '../ids.js';
import { getTarget, listTargets, snippet, TARGETS, type TargetSpec } from '../targets/index.js';
import type { Item } from '../types.js';
import type { LoadedConfig } from './config.js';
import { diag, envelope, type Diagnostic, type Envelope } from './diagnostics.js';
import { composeSvg, loadResvg, missingResvg, packIco, pngSize, svgToPng } from './raster.js';
import { nodeSigil } from './runtime.js';
import { CONFIG_FILE, LOCK_FILE, PKG_NAME } from '../meta.js';
import type { Lock } from './build.js';

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

/** Prefix for printed hrefs: the absolute site URL, else `targets.basePath` ("" = relative), else "/". */
function hrefBase(targets: { baseUrl?: string | undefined; basePath?: string | undefined }): string {
  if (targets.baseUrl) return targets.baseUrl.replace(/\/?$/, '/');
  if (targets.basePath === undefined) return '/';
  return targets.basePath === '' ? '' : targets.basePath.replace(/\/?$/, '/');
}

type HeadTag = { tag: string; attrs: Record<string, string> };

/** `<link>` and `<meta>` tags with their attributes (in any order). */
function headTags(html: string): HeadTag[] {
  return [...html.matchAll(/<(link|meta)\b([^>]*)>/gi)].map((m) => ({ tag: m[1]!.toLowerCase(), attrs: Object.fromEntries([...m[2]!.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map((a) => [a[1]!.toLowerCase(), a[2]!])) }));
}

const relsOf = (a: Record<string, string>) => (a.rel ?? '').toLowerCase().split(/\s+/);
const ICON_RELS = ['icon', 'apple-touch-icon', 'mask-icon'];

/**
 * Icon links the page (`targets.html`) already declares that sigilsmith did not emit.
 * Browsers and hosting platforms pick one icon among several (often SVG first, or the
 * largest), so a new site icon can displace the app's own.
 */
function existingIcons(loaded: LoadedConfig, ours: Set<string>): string[] {
  const cfg = loaded.config!;
  const file = cfg.targets.html ? resolve(loaded.dir, cfg.targets.html) : null;
  if (!file || !existsSync(file)) return [];
  return headTags(readFileSync(file, 'utf8'))
    .filter((t) => t.tag === 'link' && relsOf(t.attrs).some((r) => ICON_RELS.includes(r)) && t.attrs.href)
    .filter((t) => !ours.has(t.attrs.href!.replace(/^(\.?\/)+/, '').split('/').pop()!))
    .map((t) => `<link rel="${t.attrs.rel}" href="${t.attrs.href}"${t.attrs.sizes ? ` sizes="${t.attrs.sizes}"` : ''}${t.attrs.type ? ` type="${t.attrs.type}"` : ''}>`);
}

export function listTargetsCmd(opts: { includeLegacy?: boolean } = {}): Envelope<{ targets: Array<Pick<TargetSpec, 'id' | 'title' | 'status' | 'scope' | 'requiresStoredUrl' | 'absoluteUrl' | 'notes'> & { files: string[]; svgAccepted: boolean }> }> {
  return envelope('targets', {
    targets: listTargets(opts).map((t) => ({
      id: t.id, title: t.title, status: t.status, scope: t.scope, requiresStoredUrl: t.requiresStoredUrl, absoluteUrl: t.absoluteUrl, notes: t.notes,
      files: t.files.map((f) => `${f.path} (${f.format}${f.width ? ` ${f.width}x${f.height}` : ''})`),
      svgAccepted: t.files.some((f) => f.format === 'svg'),
    })),
  });
}

export async function emitTargets(
  loaded: LoadedConfig,
  opts: { ids?: string[]; item?: Item; outDir?: string; force?: boolean } = {},
): Promise<Envelope<{ files: Array<{ path: string; bytes: number }>; kept: string[]; snippets: Record<string, string> }>> {
  const cfg = loaded.config!;
  const diagnostics: Diagnostic[] = [];
  const ids = opts.ids?.length ? opts.ids : cfg.targets.ids;
  const outDir = resolve(loaded.dir, opts.outDir ?? cfg.targets.publicDir);
  const base = hrefBase(cfg.targets);
  const sigil = await nodeSigil(loaded, { remote: false });
  const files: Array<{ path: string; bytes: number }> = [];
  const snippets: Record<string, string> = {};
  const hasResvg = Boolean(loadResvg(loaded.dir));
  if (!hasResvg) diagnostics.push(missingResvg());
  const siteItem: Item = { id: cfg.targets.site?.seed ?? PKG_NAME, title: cfg.targets.site?.seed ?? PKG_NAME };
  const siteRef = cfg.targets.site?.ref;
  // Replace only files this command wrote before (recorded in the lock), or identical ones.
  const lockFile = resolve(loaded.dir, LOCK_FILE);
  const lock = existsSync(lockFile) ? (JSON.parse(readFileSync(lockFile, 'utf8')) as Lock) : null;
  const emitted: Record<string, string> = { ...(lock?.emitted ?? {}) };
  const kept: string[] = [];
  const write = (rel: string, data: Uint8Array | string) => {
    const f = resolve(outDir, rel);
    const key = relative(loaded.dir, f);
    if (existsSync(f) && !opts.force) {
      const now = sha256(readFileSync(f));
      if (now !== sha256(data) && now !== emitted[key]) {
        kept.push(key);
        diagnostics.push(diag('SGS0606', 'error', `\`${key}\` exists and was not written by sigilsmith; left as is`, { where: { file: key }, fix: { summary: 'emit to another directory and compare, or replace it', applicability: 'maybe-incorrect', commands: [`npx ${PKG_NAME} targets --emit --out .sigilsmith/targets`, `npx ${PKG_NAME} targets --emit --force`] } }));
        return;
      }
    }
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, data);
    emitted[key] = sha256(data);
    files.push({ path: f, bytes: typeof data === 'string' ? Buffer.byteLength(data) : data.length });
  };
  const specOf = (id: string) => TARGETS.find((t) => t.id === id);
  const siteIds = ids.filter((id) => specOf(id)?.scope === 'site' && specOf(id)!.files.length);
  if (siteIds.length) {
    const ours = new Set(siteIds.flatMap((id) => specOf(id)!.files.map((f) => f.path.split('/').pop()!)));
    const theirs = existingIcons(loaded, ours);
    if (theirs.length)
      diagnostics.push(
        diag('SGS0607', 'warning', `${cfg.targets.html} already declares ${theirs.length} icon(s): ${theirs.join(' ')}. Site icons from sigilsmith (${siteIds.join(', ')}) would compete with them: an SVG favicon outranks PNG icons in most browsers, and hosts that derive icons from the page may pick the wrong one`, {
          where: { file: cfg.targets.html, targets: siteIds },
          fix: { summary: 'keep the app\'s icons and drop the site targets they cover from targets.ids, or replace them on purpose', applicability: 'maybe-incorrect', edits: [{ file: CONFIG_FILE, path: 'targets.ids', set: ids.filter((id) => !siteIds.includes(id)) }] },
        }),
      );
  }
  for (const id of ids) {
    let t: TargetSpec;
    try {
      t = getTarget(id);
    } catch (e) {
      diagnostics.push(diag('SGS0601', 'error', (e as Error).message));
      continue;
    }
    const item = t.scope === 'site' ? siteItem : opts.item;
    if (!item && t.files.length) {
      diagnostics.push(diag('SGS0601', 'info', `\`${id}\` is per item; pass --item to emit an example`, { where: { target: id } }));
      snippets[id] = snippet(t, { base, url: `${base}og/<content-id>.png`, alt: '' });
      continue;
    }
    const img = item ? await sigil.render(item, siteRef && t.scope === 'site' ? { ref: siteRef } : {}) : null;
    const svg = img?.type === 'svg' ? img.svg : null;
    const plan = item ? await sigil.plan(item) : null;
    const key = plan ? await contentIdOf(plan.selection.ref, plan.seed, plan.params) : 'item';
    const vars: Record<string, string> = { base, alt: '', color: cfg.targets.background };
    for (const f of t.files) {
      const rel = f.path.replace('{key}', key);
      if (!svg) continue;
      if (f.format === 'svg') write(rel, svg);
      else if (!hasResvg) continue;
      else if (f.format === 'ico') write(rel, packIco([svgToPng(svg, 16), svgToPng(svg, 32), svgToPng(svg, 48)]));
      else {
        const zone = f.safeZone ?? (f.opaque ? 0.86 : 1);
        const isCard = f.width !== f.height;
        const composed = composeSvg(svg, { width: f.width, height: f.height, background: f.opaque ? cfg.targets.background : 'none', artSize: Math.round(Math.min(f.width, f.height) * (isCard ? 0.62 : zone)), ...(isCard && item ? { title: String(item.title ?? item.name ?? '') } : {}) });
        const png = svgToPng(composed.replace('fill="none"', 'fill-opacity="0" fill="#000"'), f.width);
        write(rel, png);
        if (t.maxBytes && png.length > t.maxBytes) diagnostics.push(diag('SGS0603', 'warning', `${rel} is ${png.length} bytes, over ${t.maxBytes}`, { where: { target: id } }));
      }
      vars.url = t.absoluteUrl && !cfg.targets.baseUrl ? `<absolute-url>/${rel}` : `${base}${rel}`;
      if (rel.includes('-256')) vars.url256 = `${base}${rel}`;
      if (rel.includes('-512')) vars.url512 = `${base}${rel}`;
    }
    if (t.absoluteUrl && !cfg.targets.baseUrl) diagnostics.push(diag('SGS0604', 'warning', `\`${id}\` needs an absolute URL; set \`targets.baseUrl\``, { fix: { summary: 'set the site URL', applicability: 'has-placeholders', edits: [{ file: 'sigilsmith.config.json', path: 'targets.baseUrl', set: 'https://<your-site>' }] } }));
    snippets[id] = snippet(t, vars);
  }
  if (lock && files.length) writeFileSync(lockFile, `${JSON.stringify({ ...lock, emitted }, null, 2)}\n`);
  else if (!lock && files.length) diagnostics.push(diag('SGS0503', 'info', `no ${LOCK_FILE} to record the emitted files in; a later \`targets --emit\` will treat them as hand-made`, { fix: { summary: 'build first, then emit', applicability: 'machine-applicable', commands: [`npx ${PKG_NAME} build`, `npx ${PKG_NAME} targets --emit`] } }));
  if (cfg.targets.basePath === undefined && !cfg.targets.baseUrl && Object.keys(snippets).length)
    diagnostics.push(diag('SGS0601', 'info', 'hrefs are root-absolute ("/icon.svg"); if the app is served under a sub-path, set `targets.basePath` ("/myapp/", or "" for relative hrefs) and emit again', { fix: { summary: 'set the base path', applicability: 'has-placeholders', edits: [{ file: CONFIG_FILE, path: 'targets.basePath', set: '' }] } }));
  return envelope('targets', { files: files.map((f) => ({ ...f, path: f.path })), kept, snippets }, diagnostics, [{ command: `npx ${PKG_NAME} check`, why: 'validate that the tags are in your HTML and the files are the right size' }]);
}

/** Validate the host's registration: tags in the HTML head, manifest icons, file sizes. */
export function checkTargets(loaded: LoadedConfig): Diagnostic[] {
  const cfg = loaded.config!;
  const out: Diagnostic[] = [];
  if (!cfg.targets.ids.length) return out;
  const htmlFile = cfg.targets.html ? resolve(loaded.dir, cfg.targets.html) : null;
  const html = htmlFile && existsSync(htmlFile) ? readFileSync(htmlFile, 'utf8') : null;
  if (cfg.targets.html && !html) out.push(diag('SGS0602', 'error', `HTML file \`${cfg.targets.html}\` not found`, { where: { path: 'targets.html' } }));
  if (!cfg.targets.html) out.push(diag('SGS0602', 'info', 'tag registration not checked: set `targets.html` to the page whose <head> holds the tags', { where: { path: 'targets.html' } }));
  // Attributes in any order: collect each tag's attributes into a map.
  const tags = html ? headTags(html) : [];
  const has = (pred: (a: Record<string, string>, tag: string) => boolean) => tags.some((t) => pred(t.attrs, t.tag));
  const rels = relsOf;
  const pub = resolve(loaded.dir, cfg.targets.publicDir);
  const tagFor: Record<string, (a: Record<string, string>, tag: string) => boolean> = {
    'favicon-svg': (a, t) => t === 'link' && rels(a).includes('icon') && (a.type === 'image/svg+xml' || /\.svg($|\?)/.test(a.href ?? '')),
    'favicon-ico': (a, t) => t === 'link' && rels(a).includes('icon') && /\.ico($|\?)/.test(a.href ?? ''),
    'apple-touch-icon': (a, t) => t === 'link' && rels(a).includes('apple-touch-icon'),
    'og-image': (a, t) => t === 'meta' && a.property === 'og:image',
    'twitter-image': (a, t) => t === 'meta' && a.name === 'twitter:image',
    'theme-color': (a, t) => t === 'meta' && a.name === 'theme-color',
  };
  for (const id of cfg.targets.ids) {
    const t = TARGETS.find((x) => x.id === id);
    if (!t) {
      out.push(diag('SGS0601', 'error', `unknown target \`${id}\``, { where: { path: 'targets.ids' } }));
      continue;
    }
    if (html && tagFor[id] && !has(tagFor[id]!)) {
      out.push(diag('SGS0602', 'error', `\`${cfg.targets.html}\` has no tag for \`${id}\``, { where: { file: cfg.targets.html, target: id }, fix: { summary: `add: ${snippet(t, { base: '/', url: '<url>', alt: '', color: cfg.targets.background }).split('\n')[0]}`, applicability: 'has-placeholders', commands: [`npx ${PKG_NAME} targets --emit`] } }));
    }
    if (html && (id === 'og-image' || id === 'twitter-image')) {
      const tag = tags.find((x) => (id === 'og-image' ? x.attrs.property === 'og:image' : x.attrs.name === 'twitter:image'));
      const url = tag?.attrs.content;
      if (url && !/^https?:\/\//.test(url)) out.push(diag('SGS0604', 'error', `\`${id}\` URL \`${url}\` is not absolute`, { where: { file: cfg.targets.html, target: id } }));
    }
    if (t.scope === 'site') {
      for (const f of t.files) {
        const file = resolve(pub, f.path);
        if (!existsSync(file)) {
          out.push(diag('SGS0603', 'error', `\`${cfg.targets.publicDir}/${f.path}\` is missing (needed by \`${id}\`)`, { where: { target: id }, fix: { summary: 'emit it', applicability: 'machine-applicable', commands: [`npx ${PKG_NAME} targets --emit`] } }));
          continue;
        }
        if (f.format === 'png') {
          const size = pngSize(new Uint8Array(readFileSync(file)));
          if (!size || size.width !== f.width || size.height !== f.height) out.push(diag('SGS0603', 'error', `\`${f.path}\` is ${size ? `${size.width}x${size.height}` : 'not a PNG'}, expected ${f.width}x${f.height}`, { where: { target: id } }));
        }
      }
    }
    if (id === 'manifest-icons' && cfg.targets.manifest) {
      const mf = resolve(loaded.dir, cfg.targets.manifest);
      if (!existsSync(mf)) out.push(diag('SGS0605', 'error', `manifest \`${cfg.targets.manifest}\` not found`));
      else {
        const icons = ((JSON.parse(readFileSync(mf, 'utf8')) as { icons?: Array<{ sizes?: string; purpose?: string }> }).icons ?? []);
        for (const need of ['192x192', '512x512']) if (!icons.some((i) => i.sizes === need && (i.purpose ?? 'any').includes('any'))) out.push(diag('SGS0605', 'error', `manifest has no ${need} icon`, { where: { file: cfg.targets.manifest } }));
        if (!icons.some((i) => i.purpose === 'maskable')) out.push(diag('SGS0605', 'warning', 'manifest has no maskable icon', { where: { file: cfg.targets.manifest } }));
      }
    }
  }
  return out;
}
