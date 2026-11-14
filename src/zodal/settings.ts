/**
 * `sigilsmith/zodal/settings`: end-user settings on zodal-dials (B15, B20).
 *
 * `defineSigilSettings` turns the config's `userSettings` into a zodal-dials definition:
 * the dials store, panels and persistence then work unchanged, and `toUserLayer` feeds
 * the result to the kernel as layer 5. This module imports zod and dials (~100 kB gzip
 * today): import it lazily from the settings screen, never from the list path.
 */
import { z } from 'zod';
import { defineDials } from '@zodal/dials-core';
import { createSettingsStore, toFieldStates, toSettingsForm, type SettingsStore } from '@zodal/dials-ui';
import type { ResolvedConfig, UserLayer } from '../types.js';
import { BUILTIN_BY_REF } from '../node/builtins.js';

export interface SigilSettings {
  /** The zodal-dials definition: render it with any dials panel, persist it with any LayerStore. */
  dials: ReturnType<typeof defineDials>;
  /** Item types that get their own style setting. */
  types: string[];
  /** Map dials effective values to the kernel's user layer. */
  toUserLayer(effective: Record<string, unknown>): UserLayer;
}

/** Item types the policy distinguishes, read from rules that match on the item-type field. */
export function typesFromConfig(config: ResolvedConfig): string[] {
  const f = config.itemTypeField;
  const out = new Set<string>();
  if (!f) return [];
  for (const r of config.policy.rules) {
    const m = r.when[f];
    if (typeof m === 'string') out.add(m);
    else if (Array.isArray(m)) m.forEach((x) => out.add(String(x)));
  }
  return [...out].sort();
}

/**
 * End-user settings as a zodal-dials definition. Keys: `sigil.enabled`, then either one
 * `sigil.style` or one `sigil.style.<type>` per item type; values are `auto` (follow the
 * developer's policy) or one of the refs the developer allowed in `userSettings.choices`.
 */
export function defineSigilSettings(config: ResolvedConfig, opts: { types?: string[]; labels?: Record<string, string> } = {}): SigilSettings {
  const choices = config.userSettings.choices;
  // Display labels come from the generator manifests, so app code never names a ref.
  const labels = { ...Object.fromEntries(choices.map((r) => [r, BUILTIN_BY_REF[r]?.manifest.name ?? r])), ...(opts.labels ?? {}) };
  const types = opts.types ?? (config.userSettings.perType ? typesFromConfig(config) : []);
  // `enumLabels` is honoured by newer dials renderers; the published @zodal/dials-ui 0.1.0
  // shows raw values (gap G14 in docs/design/proposal.md).
  const styleEnum = (title: string, description: string) =>
    z.enum(['auto', ...choices] as [string, ...string[]]).default('auto').meta({ title, description, enumLabels: { auto: 'Automatic', ...labels }, facets: ['thumbnails'] });
  const shape: Record<string, z.ZodType> = {
    'sigil.enabled': z.boolean().default(true).meta({ title: 'Show thumbnails', description: 'Generated identity images next to items', facets: ['thumbnails'] }),
  };
  if (choices.length) {
    if (types.length) for (const t of types) shape[`sigil.style.${t}`] = styleEnum(`${t[0]!.toUpperCase()}${t.slice(1)} style`, `Thumbnail style for ${t} items ("auto" follows the app's policy)`);
    else shape['sigil.style'] = styleEnum('Thumbnail style', '"auto" follows the app\'s policy');
  }
  const dials = defineDials(z.object(shape));
  return {
    dials,
    types,
    toUserLayer(effective) {
      const style: Record<string, string> = {};
      for (const [k, v] of Object.entries(effective)) {
        if (typeof v !== 'string' || v === 'auto') continue;
        if (k === 'sigil.style') style['*'] = v;
        else if (k.startsWith('sigil.style.')) style[k.slice('sigil.style.'.length)] = v;
      }
      return { enabled: effective['sigil.enabled'] !== false, style };
    },
  };
}

/** A dials settings store for the sigil settings, plus the form and field states to render. */
export function createSigilSettingsStore(settings: SigilSettings, opts: { layer?: Record<string, unknown> } = {}): {
  store: SettingsStore;
  view(): { form: ReturnType<typeof toSettingsForm>; states: ReturnType<typeof toFieldStates> };
} {
  const store = createSettingsStore(settings.dials, { ...(opts.layer ? { layer: opts.layer } : {}), scope: 'user' });
  return {
    store,
    view() {
      const s = store.getState();
      const result = { effective: s.effective, provenance: s.provenance, conflicts: s.conflicts };
      const form = toSettingsForm(settings.dials, { result });
      return { form, states: toFieldStates(form.fields, result, s.dirty) };
    },
  };
}

/** Keep a sigil's user layer in sync with a settings store; returns an unsubscribe. */
export function bindSettings(sigil: { setUser(u: UserLayer): void }, settings: SigilSettings, store: SettingsStore): () => void {
  const apply = () => sigil.setUser(settings.toUserLayer(store.getState().effective));
  apply();
  return store.subscribe(apply);
}
