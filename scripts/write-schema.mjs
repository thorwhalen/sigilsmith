/**
 * Write schema/config.schema.json from the zod ConfigSchema (the SSOT), so editors
 * validate sigilsmith.config.json through its `$schema` link. Run after `npm run build`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { ConfigSchema } from '../dist/node/index.js';

const schema = z.toJSONSchema(ConfigSchema, { io: 'input', unrepresentable: 'any' });
schema.title = 'sigilsmith config';
schema.description = 'Single source of truth for item keys, generator inputs, generator choices and params, policy, delivery, regeneration, budgets and targets.';
mkdirSync(new URL('../schema/', import.meta.url), { recursive: true });
writeFileSync(new URL('../schema/config.schema.json', import.meta.url), `${JSON.stringify(schema, null, 2)}\n`);
console.log('wrote schema/config.schema.json');
