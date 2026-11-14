/**
 * `targets`: list the integration targets, emit their files and registration
 * snippets, and validate a host's registration (B17).
 *
 * Site targets (favicon, touch icon, manifest icons) are drawn from the site sigil
 * (`targets.site` in the config); item targets (og:image, Media Session artwork) from
 * an item. PNGs need @resvg/resvg-js; the SVG favicon does not.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { contentIdOf } from '../ids.js';
import { getTarget, listTargets, snippet, TARGETS, type TargetSpec } from '../targets/index.js';
import type { Item } from '../types.js';
import type { LoadedConfig } from './config.js';
import { diag, envelope, type Diagnostic, type Envelope } from './diagnostics.js';
import { composeSvg, loadResvg, missingResvg, packIco, pngSize, svgToPng } from './raster.js';
import { nodeSigil } from './runtime.js';
import { PKG_NAME } from '../meta.js';

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
  opts: { ids?: string[]; item?: Item; outDir?: string } = {},
): Promise<Envelope<{ files: Array<{ path: string; bytes: number }>; snippets: Record<string, string> }>> {
  const cfg = loaded.config!;
  const diagnostics: Diagnostic[] = [];
  const ids = opts.ids?.length ? opts.ids : cfg.targets.ids;
  const outDir = resolve(loaded.dir, opts.outDir ?? cfg.targets.publicDir);
  const base = cfg.targets.baseUrl ? cfg.targets.baseUrl.replace(/\/?$/, '/') : '/';
  const sigil = await nodeSigil(loaded, { remote: false });
  const files: Array<{ path: string; bytes: number }> = [];
  const snippets: Record<string, string> = {};
  const hasResvg = Boolean(loadResvg(loaded.dir));
  if (!hasResvg) diagnostics.push(missingResvg());
  const siteItem: Item = { id: cfg.targets.site?.seed ?? PKG_NAME, title: cfg.targets.site?.seed ?? PKG_NAME };
  const siteRef = cfg.targets.site?.ref;
  const write = (rel: string, data: Uint8Array | string) => {
    const f = resolve(outDir, rel);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, data);
    files.push({ path: f, bytes: typeof data === 'string' ? Buffer.byteLength(data) : data.length });
  };
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
  return envelope('targets', { files: files.map((f) => ({ ...f, path: f.path })), snippets }, diagnostics, [{ command: `npx ${PKG_NAME} check`, why: 'validate that the tags are in your HTML and the files are the right size' }]);
}

/** Validate the host's registration: tags in the HTML head, manifest icons, file sizes. */
export function checkTargets(loaded: LoadedConfig): Diagnostic[] {
  const cfg = loaded.config!;
  const out: Diagnostic[] = [];
  if (!cfg.targets.ids.length) return out;
  const htmlFile = cfg.targets.html ? resolve(loaded.dir, cfg.targets.html) : null;
  const html = htmlFile && existsSync(htmlFile) ? readFileSync(htmlFile, 'utf8') : null;
  if (cfg.targets.html && !html) out.push(diag('SGS0602', 'error', `HTML file \`${cfg.targets.html}\` not found`, { where: { path: 'targets.html' } }));
  const pub = resolve(loaded.dir, cfg.targets.publicDir);
  const tagFor: Record<string, RegExp> = {
    'favicon-svg': /<link[^>]+rel=["']icon["'][^>]+type=["']image\/svg\+xml["']|<link[^>]+type=["']image\/svg\+xml["'][^>]+rel=["']icon["']/i,
    'favicon-ico': /<link[^>]+rel=["']icon["'][^>]+href=["'][^"']*\.ico["']|<link[^>]+href=["'][^"']*\.ico["'][^>]+rel=["']icon["']/i,
    'apple-touch-icon': /<link[^>]+rel=["']apple-touch-icon["']/i,
    'og-image': /<meta[^>]+property=["']og:image["']/i,
    'twitter-image': /<meta[^>]+name=["']twitter:image["']/i,
    'theme-color': /<meta[^>]+name=["']theme-color["']/i,
  };
  for (const id of cfg.targets.ids) {
    const t = TARGETS.find((x) => x.id === id);
    if (!t) {
      out.push(diag('SGS0601', 'error', `unknown target \`${id}\``, { where: { path: 'targets.ids' } }));
      continue;
    }
    if (html && tagFor[id] && !tagFor[id]!.test(html)) {
      out.push(diag('SGS0602', 'error', `\`${cfg.targets.html}\` has no tag for \`${id}\``, { where: { file: cfg.targets.html, target: id }, fix: { summary: `add: ${snippet(t, { base: '/', url: '<url>', alt: '', color: cfg.targets.background }).split('\n')[0]}`, applicability: 'has-placeholders', commands: [`npx ${PKG_NAME} targets --emit`] } }));
    }
    if (html && (id === 'og-image' || id === 'twitter-image')) {
      const m = html.match(id === 'og-image' ? /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i : /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
      if (m && !/^https?:\/\//.test(m[1]!)) out.push(diag('SGS0604', 'error', `\`${id}\` URL \`${m[1]}\` is not absolute`, { where: { file: cfg.targets.html, target: id } }));
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
