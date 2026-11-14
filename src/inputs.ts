/**
 * Input selection (B4.2): which item fields feed a generator.
 *
 * An input is a field path, `$key` (the resolved item key) or `$label` (the first
 * present label field). Long text can be truncated with `maxChars`. Missing fields
 * degrade gracefully: the generator gets what is present and the plan records what
 * was missing. If nothing at all is present, the key is used so the image stays stable.
 */
import { canonicalKey, getPath, normalizePart } from './key.js';
import type { InputSpec, Item } from './types.js';

export interface SelectedInputs {
  fields: Record<string, string>;
  seed: string;
  missing: string[];
}

export function inputName(spec: InputSpec): string {
  const f = typeof spec === 'string' ? spec : spec.field;
  return f.startsWith('$') ? f.slice(1) : f;
}

export function selectInputs(
  item: Item,
  specs: readonly InputSpec[],
  ctx: { key: string; label?: string | undefined },
): SelectedInputs {
  const fields: Record<string, string> = {};
  const missing: string[] = [];
  const ordered: string[] = [];
  for (const spec of specs) {
    const field = typeof spec === 'string' ? spec : spec.field;
    const maxChars = typeof spec === 'string' ? undefined : spec.maxChars;
    let value: string | undefined;
    if (field === '$key') value = ctx.key;
    else if (field === '$label') value = ctx.label;
    else value = normalizePart(getPath(item, field));
    if (value !== undefined && maxChars !== undefined) value = Array.from(value).slice(0, maxChars).join('');
    const name = inputName(spec);
    if (value === undefined) {
      missing.push(field);
      continue;
    }
    fields[name] = value;
    ordered.push(name, value);
  }
  if (ordered.length === 0) {
    fields.key = ctx.key;
    ordered.push('key', ctx.key);
  }
  return { fields, seed: canonicalKey(ordered), missing };
}
