/**
 * Write schema/config.schema.json from the zod ConfigSchema (the SSOT), so editors
 * validate sigilsmith.config.json through its `$schema` link. Run after `npm run build`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { ConfigSchema, FeatureSchemaSchema, FeatureMappingSchema } from '../dist/node/index.js';

const schema = z.toJSONSchema(ConfigSchema, { io: 'input', unrepresentable: 'any' });
schema.title = 'sigilsmith config';
schema.description = 'Single source of truth for item keys, generator inputs, generator choices and params, policy, delivery, regeneration, budgets and targets.';
mkdirSync(new URL('../schema/', import.meta.url), { recursive: true });
writeFileSync(new URL('../schema/config.schema.json', import.meta.url), `${JSON.stringify(schema, null, 2)}\n`);
console.log('wrote schema/config.schema.json');

// Feature-set files: the dimensions of a feature vector, and the mapping to generator params.
for (const [file, zs, title, description] of [
  ['feature-schema.schema.json', FeatureSchemaSchema, 'sigilsmith feature schema', 'The dimensions of an item feature vector: numeric (min/max), ordinal (levels), categorical (values) or binary.'],
  ['feature-mapping.schema.json', FeatureMappingSchema, 'sigilsmith feature mapping', 'Which generator draws the items of a feature set, and how each of its params is computed from one feature dimension.'],
]) {
  const s = z.toJSONSchema(zs, { io: 'input', unrepresentable: 'any' });
  s.title = title;
  s.description = description;
  writeFileSync(new URL(`../schema/${file}`, import.meta.url), `${JSON.stringify(s, null, 2)}\n`);
  console.log(`wrote schema/${file}`);
}
