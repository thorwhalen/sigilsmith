/**
 * `adopt`: find an app's own thumbnail machinery and say how to move it to sigilsmith
 * with minimum disruption. Read-only: it scans source files and sample items, and
 * returns findings (each with file, line and a suggestion) plus an ordered recipe.
 *
 * What it looks for, cheapest signal first:
 * - `library`: imports of avatar / identicon packages (jdenticon, boring-avatars,
 *   DiceBear, blockies, jazzicon...), each mapped to the closest catalog generator;
 * - `home-grown`: a module that exports something named like a thumbnail (Orb, Avatar,
 *   Identicon, Cover, Artwork, Gradient...) and both hashes strings and builds colours:
 *   the hand-rolled identicon. Its call sites are counted, so the size of the swap is known;
 * - `media-session`: hand-set lock-screen artwork (`new MediaMetadata({ artwork })`);
 * - `image-field`: per-item image URLs in the sample items (cover art, avatars): images
 *   the app already has, which `adoptImage` keeps showing;
 * - `sigilsmith`: what is already wired (config, `<Sigil>` call sites).
 *
 * The recipe is the short form of skills/sigilsmith/references/migrating.md.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { CONFIG_FILE } from '../meta.js';
import { envelope, type Envelope } from './diagnostics.js';

export type FindingKind = 'library' | 'home-grown' | 'media-session' | 'image-field' | 'sigilsmith';

export interface AdoptFinding {
  kind: FindingKind;
  file?: string;
  line?: number;
  /** Exported names (home-grown), the package (library), or the field (image-field). */
  name: string;
  detail: string;
  /** Call sites of the names elsewhere in the scanned code (home-grown, sigilsmith). */
  uses?: Array<{ file: string; line: number }>;
  suggestion: string;
}

export interface AdoptResult {
  scanned: { dirs: string[]; files: number; samples: number };
  usesSigilsmith: boolean;
  findings: AdoptFinding[];
  recipe: string[];
}

/** Avatar / identicon packages and the catalog generator closest to each. */
export const KNOWN_LIBRARIES: Record<string, string> = {
  jdenticon: 'grid@1 (symmetric identicon) or shapes@1',
  'boring-avatars': 'aura@1 (its "marble"/"sunset" variants) or rings@1 ("ring") or shapes@1 ("bauhaus")',
  minidenticons: 'minidenticons@1 (the same library, wrapped)',
  '@dicebear/core': 'initials@1 (initials style), grid@1 (identicon), shapes@1 (shapes)',
  '@dicebear/collection': 'initials@1, grid@1 or shapes@1, per style used',
  blockies: 'grid@1', 'ethereum-blockies': 'grid@1', 'ethereum-blockies-base64': 'grid@1', 'react-blockies': 'grid@1', '@download/blockies': 'grid@1',
  jazzicon: 'aura@1 or shapes@1', '@metamask/jazzicon': 'aura@1 or shapes@1', 'react-jazzicon': 'aura@1 or shapes@1',
  'identicon.js': 'grid@1', 'react-identicons': 'grid@1',
  'react-avatar': 'initials@1', 'avvvatars-react': 'initials@1 or shapes@1', 'react-nice-avatar': 'emoji@1 or initials@1',
  multiavatar: 'emoji@1 or shapes@1', '@multiavatar/multiavatar': 'emoji@1 or shapes@1',
  'gradient-avatar': 'aura@1', 'random-gradient': 'aura@1',
};

const CODE_EXT = /\.(m?[jt]sx?|vue|svelte)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', '.git', '.next', '.svelte-kit', 'vendor']);
const SKIP_FILE = /(\.gen\.[jt]s|\.(test|spec)\.[jt]sx?|\.d\.ts)$/;
const THUMB_NAME = /(orb|avatar|identicon|thumb|cover|artwork|gradient|swatch|sigil|glyph|monogram|initials|blockie|jazzicon|blob)/i;
const HASH_SIGNAL = /charCodeAt|codePointAt|Math\.imul|hashCode|\bcyrb|\bfnv|\bmurmur|\bhash\w*\s*\(/;
const COLOUR_SIGNAL = /hsla?\(|oklch\(|rgba?\(|#\$\{|radial-gradient|linear-gradient|fillStyle|\bhue\b/;
const IMAGE_FIELD = /^(image|img|thumb|thumbnail|cover|coverart|cover_art|artwork|art|avatar|picture|photo|icon|poster|logo)([_-]?(url|uri|src|href|large|small))?$/i;
const URLISH = /^(https?:\/\/|\/(?!\/)|data:image\/)/;

function walk(root: string, out: string[] = []): string[] {
  if (!existsSync(root)) return out;
  if (statSync(root).isFile()) return CODE_EXT.test(root) && !SKIP_FILE.test(root) ? [...out, root] : out;
  for (const e of readdirSync(root, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (!SKIP_DIR.has(e.name) && !e.name.startsWith('.')) walk(join(root, e.name), out);
    } else if (CODE_EXT.test(e.name) && !SKIP_FILE.test(e.name)) out.push(join(root, e.name));
  }
  return out;
}

const lineOf = (text: string, index: number) => text.slice(0, index).split('\n').length;

/** Scan `dirs` (relative to `cwd`) and the sample items for thumbnail code and images; see the module doc. */
export function scanAdoption(cwd: string, o: { dirs?: string[]; samples?: Array<Record<string, unknown>> } = {}): AdoptResult {
  const dirs = o.dirs?.length ? o.dirs : ['src'];
  const files = dirs.flatMap((d) => walk(join(cwd, d)));
  const texts = new Map(files.map((f) => [f, readFileSync(f, 'utf8')]));
  const rel = (f: string) => relative(cwd, f);
  const findings: AdoptFinding[] = [];
  const usesOf = (names: string[], definedIn: string) => {
    const uses: Array<{ file: string; line: number }> = [];
    const re = new RegExp(`<(${names.join('|')})\\b|\\b(${names.join('|')})\\s*\\(`, 'g');
    for (const [f, t] of texts) {
      if (f === definedIn) continue;
      for (const m of t.matchAll(re)) uses.push({ file: rel(f), line: lineOf(t, m.index!) });
    }
    return uses;
  };
  for (const [f, t] of texts) {
    // Libraries.
    for (const m of t.matchAll(/(?:from\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
      const pkg = m[1]!.startsWith('@') ? m[1]!.split('/').slice(0, 2).join('/') : m[1]!.split('/')[0]!;
      if (pkg in KNOWN_LIBRARIES) findings.push({ kind: 'library', file: rel(f), line: lineOf(t, m.index!), name: pkg, detail: `imports ${m[1]}`, suggestion: `replace with ${KNOWN_LIBRARIES[pkg]}; preview both side by side before switching` });
    }
    // Hand-rolled identicons.
    const exported = [...t.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/g)].filter((m) => THUMB_NAME.test(m[1]!));
    if (exported.length && HASH_SIGNAL.test(t) && COLOUR_SIGNAL.test(t)) {
      const names = exported.map((m) => m[1]!);
      const gradient = /radial-gradient|blur\(|createRadialGradient/.test(t);
      findings.push({
        kind: 'home-grown',
        file: rel(f),
        line: lineOf(t, exported[0]!.index!),
        name: names.join(', '),
        detail: `exports ${names.join(', ')}; hashes strings into colours${gradient ? ' (blurred gradient fields)' : ''}${/toDataURL\(/.test(t) ? '; paints a canvas' : ''}`,
        uses: usesOf(names, f),
        suggestion: gradient
          ? 'aura@1 is this look (and, if this file hashes with cyrb53, the same colours per item): pin its `hues` to the palette here, in the same order, preview, then swap each call site for <Sigil item={…} record={….sigil} />'
          : 'pick the catalog generator closest in look (`sigilsmith catalog --implemented`), preview side by side, then swap each call site for <Sigil item={…} record={….sigil} />',
      });
    }
    // Hand-set lock-screen artwork.
    for (const m of t.matchAll(/new\s+MediaMetadata\s*\(/g)) {
      const around = t.slice(m.index!, m.index! + 600);
      if (/artwork/.test(around)) findings.push({ kind: 'media-session', file: rel(f), line: lineOf(t, m.index!), name: 'MediaMetadata', detail: 'sets lock-screen artwork by hand', suggestion: 'artwork: await mediaArtwork(sigil, item, { record: item.sigil }) (sigilsmith/targets): the stored image, else a PNG of the same sigil the list shows' });
    }
  }
  // Images the items already have.
  const samples = o.samples ?? [];
  const fieldHits = new Map<string, number>();
  for (const it of samples) for (const [k, val] of Object.entries(it ?? {})) if (IMAGE_FIELD.test(k) && typeof val === 'string' && URLISH.test(val)) fieldHits.set(k, (fieldHits.get(k) ?? 0) + 1);
  for (const [k, n] of fieldHits) findings.push({ kind: 'image-field', name: k, detail: `${n} of ${samples.length} sample items have an image URL in \`${k}\``, suggestion: `keep them: record = await adoptImage(item.${k}, { store }) copies each into your store (drop \`store\` for URLs you own and keep); or offer it as a candidate in useSigilPicker; or show it by rule with screenshot@1 (field: "${k}")` });
  // What is already wired.
  const configured = existsSync(join(cwd, CONFIG_FILE));
  const sigilUses: Array<{ file: string; line: number }> = [];
  for (const [f, t] of texts) for (const m of t.matchAll(/<Sigil\b|\bsigil\.render\(|\buseSigil\(/g)) sigilUses.push({ file: rel(f), line: lineOf(t, m.index!) });
  if (configured || sigilUses.length) findings.push({ kind: 'sigilsmith', name: 'sigilsmith', detail: configured ? `${CONFIG_FILE} present` : `no ${CONFIG_FILE}, but sigilsmith is used in code`, uses: sigilUses, suggestion: 'extend the existing config: add the generator as a rule or the default; no second wiring' });
  return { scanned: { dirs, files: files.length, samples: samples.length }, usesSigilsmith: configured || sigilUses.length > 0, findings, recipe: recipeFor(findings, configured) };
}

function recipeFor(findings: AdoptFinding[], configured: boolean): string[] {
  const has = (k: FindingKind) => findings.some((f) => f.kind === k);
  const steps: string[] = [];
  if (!configured) steps.push('npx sigilsmith init --samples <items.json> (key: an immutable id)');
  if (has('home-grown') || has('library')) {
    steps.push('choose the generator with the same look (aura@1 for blurred gradients; see each finding), pin the old palette in `generators.<ref>.params`, and make it `policy.default` or a rule for the item type');
    steps.push('npx sigilsmith preview --generators <ref> and compare with the old thumbnails; then npx sigilsmith build');
    const sites = findings.filter((f) => f.kind === 'home-grown' || f.kind === 'library').reduce((n, f) => n + (f.uses?.length ?? 1), 0);
    steps.push(`swap the ${sites} call site(s) for <Sigil item={item} size={…} record={item.sigil} /> (keep wrappers that add motion or overlays around it), then remove the old module`);
  }
  if (has('media-session')) steps.push('replace hand-made lock-screen art with mediaArtwork(sigil, item, { record }) from sigilsmith/targets');
  steps.push('per-item choice: add an optional `sigil` field (SigilRecord) to the item schema and its PATCH; store images through a zodal blob provider (fromDataProvider(createHttpBlobProvider({ baseUrl, contentFields: ["image"] })), the server checking size and magic bytes); offer useSigilPicker / <SigilPicker> from sigilsmith/react');
  if (has('image-field')) steps.push('existing per-item images: offer them as picker candidates, or adopt them up front (adoptImage(url, { store }) copies expiring URLs); adopted and uploaded images are frozen and never regenerated');
  steps.push('npx sigilsmith check (all ✓), and note in the PR which images changed (`check identity`)');
  return steps;
}

/** The `adopt` operation: `scanAdoption` in an envelope, with samples read from the config or a file. */
export function adoptCmd(cwd: string, o: { dirs?: string[]; samples?: Array<Record<string, unknown>> } = {}): Envelope<AdoptResult> {
  const result = scanAdoption(cwd, o);
  const next = result.usesSigilsmith ? [{ command: 'npx sigilsmith check', why: 'see what the existing wiring still needs' }] : [{ command: 'npx sigilsmith init --samples <items.json>', why: 'start the config' }];
  return envelope('adopt', result, [], next);
}
