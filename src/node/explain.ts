/**
 * `explain` (B0.6): for an item, what will happen and why — the key and where it came
 * from, the generator and the rule that chose it, the inputs, every param with the
 * layer that supplied it, and what delivery and regeneration will do.
 */
import { BUILTIN_BY_REF } from './builtins.js';
import type { LoadedConfig } from './config.js';
import { diag, envelope, type Diagnostic, type Envelope } from './diagnostics.js';
import { nodeSigil } from './runtime.js';
import type { Item, Plan } from '../types.js';

export interface Explanation {
  item: Item;
  key: { value: string; via: Plan['keyVia']; spec: unknown; missing: string[]; layer: 'project' };
  generator: { ref: string; via: Plan['selection']['via']; weights?: Record<string, number>; bucket?: number; determinism: string };
  inputs: { specs: Plan['inputs']; values: Record<string, string>; missing: string[] };
  params: Array<{ path: string; value: unknown; layer: string; shadowed: Array<{ layer: string; value: unknown }> }>;
  delivery: { strategy: string; note: string };
  regeneration: { policy: string; note: string };
}

export async function explainItems(loaded: LoadedConfig, items: Item[]): Promise<Envelope<{ explanations: Explanation[] }>> {
  const sigil = await nodeSigil(loaded, { remote: true });
  const cfg = loaded.config!;
  const diagnostics: Diagnostic[] = [];
  const explanations: Explanation[] = [];
  for (const item of items) {
    let plan: Plan;
    try {
      plan = await sigil.plan(item);
    } catch (e) {
      diagnostics.push(diag((e as { code?: string }).code ?? 'SGS0203', 'error', (e as Error).message, { where: { item } }));
      continue;
    }
    const ref = plan.selection.ref;
    const determinism = BUILTIN_BY_REF[ref]?.meta.determinism ?? (cfg.remote[ref] ? 'cached-nondeterministic' : 'unknown');
    const onlyKey = plan.inputs.every((i) => ['$key'].includes(typeof i === 'string' ? i : i.field));
    const strategy = cfg.delivery.strategy;
    if (plan.keyVia === 'fallback') diagnostics.push(diag('SGS0202', 'warning', `item uses the fallback key; missing ${plan.keyMissing.join(', ')}`, { where: { key: plan.key } }));
    explanations.push({
      item,
      key: { value: plan.key, via: plan.keyVia, spec: cfg.key, missing: plan.keyMissing, layer: 'project' },
      generator: { ref, via: plan.selection.via, ...(plan.selection.weights ? { weights: plan.selection.weights, bucket: plan.selection.bucket! } : {}), determinism },
      inputs: { specs: plan.inputs, values: plan.fields, missing: plan.missingInputs },
      params: plan.provenance.filter((p) => p.path.startsWith('params.')).map((p) => ({ ...p, path: p.path.slice(7) })),
      delivery: {
        strategy,
        note:
          strategy === 'derived'
            ? 'Rendered on every view and never stored: the image follows its inputs automatically, and a generator major change would change it everywhere (pins prevent that).'
            : strategy === 'hybrid'
              ? 'Shown at once from a local render; a stored copy (content-addressed) is uploaded in the background for crawlers and the OS.'
              : 'Rendered once in the browser at creation, stored under a content-addressed id, served from storage afterwards.',
      },
      regeneration: {
        policy: cfg.regeneration.policy,
        note: onlyKey
          ? 'Inputs are the key only: renames never change this image, so the regeneration policy never fires.'
          : `Inputs include ${plan.inputs.map((i) => (typeof i === 'string' ? i : i.field)).filter((f) => f !== '$key').join(', ')}: editing them changes the inputs digest, and the \`${cfg.regeneration.policy}\` policy decides. Custom images are never replaced.`,
      },
    });
  }
  return envelope('explain', { explanations }, diagnostics);
}
