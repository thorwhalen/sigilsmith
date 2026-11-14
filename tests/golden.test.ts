/**
 * Golden vectors (B3): every released generator major must keep drawing exactly the
 * same bytes. `tests/golden/<ref>.json` holds the SHA-256 of each golden input's SVG;
 * a missing file is written on first run (commit it). To change one deliberately, ship
 * a new major instead: never edit these files for an existing major.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/hash.js';
import { BUILTINS } from '../src/node/builtins.js';
import { fingerprint, GOLDEN_SEEDS, renderModule } from '../src/node/build.js';

for (const { module } of BUILTINS) {
  const ref = `${module.id}@${module.major}`;
  describe(`golden ${ref}`, () => {
    it('renders the same bytes twice (determinism)', async () => {
      for (const s of GOLDEN_SEEDS) expect(await renderModule(module, s)).toEqual(await renderModule(module, s));
    });
    it('matches its golden vectors', async () => {
      const hashes: Record<string, string> = {};
      for (const s of GOLDEN_SEEDS) {
        const img = await renderModule(module, s);
        hashes[s] = await sha256Hex(img.type === 'svg' ? img.svg : img.type);
      }
      const golden = { ref, fingerprint: await fingerprint(module), hashes };
      const file = new URL(`./golden/${ref.replace('@', '-v')}.json`, import.meta.url);
      if (!existsSync(file)) writeFileSync(file, `${JSON.stringify(golden, null, 2)}\n`);
      expect(golden).toEqual(JSON.parse(readFileSync(file, 'utf8')));
    });
  });
}
