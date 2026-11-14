/**
 * Input selection (B4.2): which item fields feed a generator.
 *
 * An input is a field path, `$key` (the resolved item key) or `$label` (the first
 * present label field). Long text can be truncated with `maxChars`; `as` names the
 * value for the generator independently of where it comes from. Missing fields
 * degrade gracefully: the generator gets what is present and the plan records what
 * was missing. If nothing at all is present, the key is used so the image stays stable.
 *
 * The seed is built from the input *values* in order, never from field names, so
 * renaming a field in the data and in the config (A9) leaves every image unchanged.
 */
import { getPath, normalizePart } from './key.js';
import type { InputSpec, Item } from './types.js';

export interface SelectedInputs {
  fields: Record<string, string>;
  seed: string;
  missing: string[];
}

/** Name the generator sees: `as` when given, else the field path (without a leading `$`). */
export function inputName(spec: InputSpec): string {
  if (typeof spec !== 'string' && spec.as) return spec.as;
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
  const values: Array<string | null> = [];
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
      values.push(null);
      continue;
    }
    if (!(name in fields)) fields[name] = value;
    values.push(value);
  }
  if (values.every((v) => v === null)) {
    fields.key = ctx.key;
    return { fields, seed: ctx.key, missing };
  }
  // One input: its value is the seed. Several: a JSON array (missing ones as null), unambiguous.
  return { fields, seed: values.length === 1 ? values[0]! : JSON.stringify(values), missing };
}
