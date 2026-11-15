/**
 * `createSigil`: the runtime facade over the kernel.
 *
 * It receives a resolved config (validated and frozen by `sigilsmith build`) and a
 * table of lazy generator loaders (only the selected generators, so bundlers split
 * them into separate chunks). For any item it can `plan` (key, generator, inputs,
 * params, provenance, without drawing), `render`, and compute the content ids used
 * for storage and regeneration.
 */
import { cyrb128, seededRng } from './hash.js';
import { selectInputs } from './inputs.js';
import { keyOf, labelOf } from './key.js';
import type { FeaturePlanner } from './features.js';
import { foldLayers, type Layer } from './layers.js';
import { paletteFromHash } from './palette.js';
import { itemTypeOf, select } from './policy.js';
import type { GeneratorLoader, GeneratorModule, Item, Plan, ResolvedConfig, SigilImage, UserLayer } from './types.js';

export interface CreateSigilOptions {
  config: ResolvedConfig;
  /** Lazy loaders keyed by generator ref (`grid@1`), normally written by `sigilsmith build`. */
  generators: Record<string, GeneratorLoader>;
  /** Required when the config's key spec is `custom`. */
  keyFn?: (item: Item) => string;
  /**
   * Feature planner (`planFeatures` from `sigilsmith/features`), passed by the wiring
   * module when the config has feature sets; without it, feature mappings are ignored.
   */
  features?: FeaturePlanner;
  /** End-user settings (layer 5). */
  user?: UserLayer;
  /** Receives non-fatal warnings (fallback keys, missing inputs). Defaults to console.warn, once per message. */
  onWarn?: (message: string, detail?: unknown) => void;
}

export interface Sigil {
  readonly config: ResolvedConfig;
  plan(item: Item, opts?: { ref?: string }): Promise<Plan>;
  render(item: Item, opts?: { ref?: string; size?: number }): Promise<SigilImage>;
  /** Render an already computed plan (avoids planning twice). */
  renderPlan(plan: Plan, size?: number): Promise<SigilImage>;
  load(ref: string): Promise<GeneratorModule<any>>;
  setUser(user: UserLayer | undefined): void;
  getUser(): UserLayer | undefined;
  subscribe(fn: () => void): () => void;
}

export function createSigil(opts: CreateSigilOptions): Sigil {
  const { config, generators, keyFn } = opts;
  let user = opts.user;
  const listeners = new Set<() => void>();
  const warned = new Set<string>();
  const warn = opts.onWarn ?? ((m: string) => {
    if (!warned.has(m)) {
      warned.add(m);
      console.warn(`[sigilsmith] ${m}`);
    }
  });
  const loaded = new Map<string, Promise<GeneratorModule<any>>>();

  function load(ref: string): Promise<GeneratorModule<any>> {
    let p = loaded.get(ref);
    if (!p) {
      const loader = generators[ref];
      if (!loader) {
        return Promise.reject(new Error(`SGS0301: \`${ref}\` is not wired; add it to the config, run \`sigilsmith build\``));
      }
      p = loader().then((m) => ('default' in m && m.default ? m.default : (m as GeneratorModule<any>)));
      p.catch(() => loaded.delete(ref)); // a failed chunk load can be retried
      loaded.set(ref, p);
    }
    return p;
  }

  async function plan(item: Item, o: { ref?: string } = {}): Promise<Plan> {
    const k = keyOf(item, config.key.spec, { fallback: config.key.fallback, onMissing: config.key.onMissing, ...(keyFn ? { keyFn } : {}) });
    if (k.via === 'fallback') warn(`item is missing key field(s) ${k.missing.join(', ')}; using fallback key (SGS0202)`, { key: k.key });
    const itemType = itemTypeOf(item, config);
    const sel = o.ref ? { ref: o.ref, via: 'explicit' as const } : select(item, k.key, config, user);
    const mod = await load(sel.ref);
    const ruleIndex = 'ruleIndex' in sel ? sel.ruleIndex : undefined;
    const rule = ruleIndex !== undefined ? config.policy.rules[ruleIndex] : undefined;
    const ref = sel.ref;
    const layers: Layer[] = [{ name: 'generator', patch: { inputs: mod.defaultInputs, params: mod.defaults as Record<string, unknown> } }];
    for (const preset of config.presets) {
      const entry = (itemType && preset.byType[itemType]) || preset.byType['*'];
      if (!entry) continue;
      const inputs = mod.kind === 'semantic' ? entry.semanticInputs : entry.hashInputs;
      const params = entry.params?.[ref] ?? entry.params?.[mod.id];
      layers.push({ name: `preset:${preset.name}`, patch: { ...(inputs ? { inputs } : {}), ...(params ? { params } : {}) } });
    }
    const proj = config.generators[ref];
    if (proj) layers.push({ name: 'project', patch: { ...(proj.inputs ? { inputs: proj.inputs } : {}), ...(proj.params ? { params: proj.params } : {}) } });
    // Feature params sit above the project's and below a rule's, so the config can still
    // override one item's look with a rule.
    let feat: ReturnType<FeaturePlanner>;
    if (config.features) {
      if (!opts.features) warn('the config has feature sets but no feature planner was passed; rebuild the wiring module (`sigilsmith build`)');
      else feat = opts.features(item, k.key, ref, config);
      if (feat?.params) layers.push({ name: 'features', patch: { params: feat.params } });
      if (feat?.info.problems.length) warn(`features for \`${k.key}\`: ${feat.info.problems.join('; ')} (SGS0802)`);
    }
    if (rule && ruleIndex !== undefined) {
      const rp = rule.params?.[ref];
      layers.push({ name: `rule:${ruleIndex}`, patch: { ...(rule.inputs ? { inputs: rule.inputs } : {}), ...(rp ? { params: rp } : {}) } });
    }
    const allowed = config.userSettings.params[ref] ?? [];
    const up = user?.params?.[ref];
    if (up && allowed.length) {
      layers.push({ name: 'user', patch: { params: Object.fromEntries(Object.entries(up).filter(([kk]) => allowed.includes(kk))) } });
    }
    const { effective, provenance } = foldLayers(layers);
    const inputs = (effective.inputs as Plan['inputs']) ?? [];
    const sel2 = selectInputs(item, inputs, { key: k.key, label: labelOf(item, config.label.fields) });
    const selection = { ...sel } as Plan['selection'] & { ruleIndex?: number };
    delete selection.ruleIndex;
    const params = (effective.params as Record<string, unknown>) ?? {};
    return {
      key: k.key,
      keyVia: k.via,
      keyMissing: k.missing,
      itemType,
      selection,
      inputs,
      params,
      provenance,
      fields: sel2.fields,
      missingInputs: sel2.missing,
      seed: sel2.seed,
      ...(feat ? { features: feat.info } : {}),
    };
  }

  async function renderPlanned(p: Plan, size: number): Promise<SigilImage> {
    const mod = await load(p.selection.ref);
    const [h] = cyrb128(`${p.seed}\u0000${p.selection.ref}`);
    return mod.render({
      seed: p.seed,
      hash: h,
      rng: seededRng(`${p.seed}\u0000${p.selection.ref}`),
      palette: paletteFromHash(h, (p.params.palette as object | undefined) ?? {}),
      fields: p.fields,
      params: p.params,
      size,
    });
  }

  return {
    config,
    plan,
    load,
    async render(item, o = {}) {
      return renderPlanned(await plan(item, o), o.size ?? 64);
    },
    renderPlan: (p, size = 64) => renderPlanned(p, size),
    setUser(u) {
      user = u;
      listeners.forEach((fn) => fn());
    },
    getUser: () => user,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
