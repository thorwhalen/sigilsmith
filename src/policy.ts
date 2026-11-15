/**
 * Selection policy (A6, B3, B6): which generator draws a given item.
 *
 * Order: end-user preference (within the developer's allowed choices) → policy rules
 * in order → the first matching feature set's `use` → preset suggestions for the item type → `policy.default`. Custom images
 * are handled one level up (delivery), before any of this runs.
 *
 * Weighted choices are deterministic per item: the bucket is a hash of the salt and
 * the item key, so the same item always lands on the same generator, while items
 * spread across generators in proportion to the weights.
 */
import { getPath, normalizePart } from './key.js';
import { hash32 } from './hash.js';
import type { Item, Matcher, PolicyRule, ResolvedConfig, SelectionTrace, UserLayer } from './types.js';

export function matches(item: Item, when: Record<string, Matcher>): boolean {
  return Object.entries(when).every(([path, m]) => {
    const v = getPath(item, path);
    if (Array.isArray(m)) return m.some((x) => normalizePart(x) === normalizePart(v));
    if (m !== null && typeof m === 'object') {
      if ('includes' in m) return Array.isArray(v) && v.some((x) => normalizePart(x) === normalizePart(m.includes));
      if ('exists' in m) return (normalizePart(v) !== undefined) === m.exists;
      return false;
    }
    return normalizePart(v) === normalizePart(m);
  });
}

/**
 * Deterministic weighted pick by weighted rendezvous hashing (highest random weight):
 * each ref scores `-ln(u) / w` with `u` a hash of (salt, key, ref), and the lowest
 * score wins. Same item, same ref; items spread in proportion to the weights; and
 * adding, removing or reweighting one ref only moves the items that must move (a
 * cumulative-bucket scheme would reshuffle many unrelated items). `bucket` reports
 * the item's own hash in [0, 1) for explain.
 */
export function weightedPick(weights: Record<string, number>, key: string, salt: string): { ref: string; bucket: number } {
  let best: { ref: string; score: number } | undefined;
  for (const [ref, w] of Object.entries(weights)) {
    if (!(w > 0)) continue;
    const u = (hash32(`${salt}\u0000${key}\u0000${ref}`) + 0.5) / 4294967296;
    const score = -Math.log(u) / w;
    if (!best || score < best.score || (score === best.score && ref < best.ref)) best = { ref, score };
  }
  if (!best) throw new Error('weighted rule has no positive weights');
  return { ref: best.ref, bucket: hash32(`${salt}\u0000${key}`) / 4294967296 };
}

function resolveUse(use: PolicyRule['use'], key: string, salt: string): Omit<SelectionTrace, 'via'> {
  if (typeof use === 'string') return { ref: use };
  const { ref, bucket } = weightedPick(use, key, salt);
  return { ref, weights: use, bucket };
}

export function itemTypeOf(item: Item, cfg: ResolvedConfig): string | null {
  return cfg.itemTypeField ? normalizePart(getPath(item, cfg.itemTypeField)) ?? null : null;
}

export function select(item: Item, key: string, cfg: ResolvedConfig, user?: UserLayer): SelectionTrace & { ruleIndex?: number } {
  const type = itemTypeOf(item, cfg);
  const choices = new Set(cfg.userSettings.choices);
  const pref = user?.style?.[type ?? '*'] ?? user?.style?.['*'];
  if (pref && choices.has(pref)) return { ref: pref, via: 'user' };

  for (let i = 0; i < cfg.policy.rules.length; i++) {
    const rule = cfg.policy.rules[i]!;
    if (matches(item, rule.when)) return { ...resolveUse(rule.use, key, cfg.policy.salt), via: `rule:${i}`, ruleIndex: i };
  }
  // Feature sets choose their generator after explicit rules (inlined, not imported from
  // features.ts, which depends on this module).
  const fsIndex = cfg.features?.findIndex((s) => !s.when || matches(item, s.when)) ?? -1;
  if (fsIndex >= 0) return { ref: cfg.features![fsIndex]!.mapping.use, via: `features:${fsIndex}` };
  for (const preset of cfg.presets) {
    const entry = (type && preset.byType[type]) || preset.byType['*'];
    if (entry?.use) return { ref: entry.use, via: `preset:${preset.name}` };
  }
  return { ref: cfg.policy.default, via: 'default' };
}
