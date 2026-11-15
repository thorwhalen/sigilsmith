/**
 * Fixes from the first real integration (thorwhalen/sigilsmith#3, #4): the starter
 * budget passes the documented React path, SGS0401 offers a fix that can work, and
 * `init` reads the item type from samples, starts on `derived` delivery and points
 * at every step of the loop.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { STARTER_BUDGET_GZIP, init, starterConfig } from '../src/node/commands.js';
import { detectItemType } from '../src/node/detect.js';
import { catalog, check, loadConfig } from '../src/node/index.js';
import { makeProject } from './project.js';

const REACT_GLUE = "import { Sigil } from 'sigilsmith/react';\nexport const Row = () => null;\n";

describe('budget (#3)', () => {
  it('the starter config passes the budget on the React path with any one local generator', async () => {
    const refs = (await catalog({ implemented: true })).data.results.flatMap((r) => (r.ref && r.implemented ? [r.ref] : []));
    expect(refs.length).toBeGreaterThanOrEqual(5);
    for (const ref of refs) {
      const cfg = { ...starterConfig({}), policy: { default: ref, rules: [] } };
      const dir = makeProject(cfg);
      writeFileSync(join(dir, 'src/Row.tsx'), REACT_GLUE);
      const env = await check(await loadConfig(undefined, dir), { only: ['budget'] });
      expect(env.data.budget!.generators['(react adapter)'], ref).toBeGreaterThan(0);
      expect(env.diagnostics.filter((d) => d.code === 'SGS0401'), ref).toEqual([]);
      expect(env.data.budget!.totalGzip!).toBeLessThanOrEqual(STARTER_BUDGET_GZIP);
    }
  });

  it('over budget, the fix names the room left for the largest generator, and that room is real', async () => {
    const policy = { default: 'grid@1', rules: [{ when: { type: 'video' }, use: 'rings@1' }] };
    const probe = await check(await loadConfig(undefined, makeProject({ key: { field: 'id' }, policy, delivery: { strategy: 'derived' } })), { only: ['budget'] });
    const total = probe.data.budget!.totalGzip!;
    const max = total - 100;
    const env = await check(await loadConfig(undefined, makeProject({ key: { field: 'id' }, policy, delivery: { strategy: 'derived' }, budget: { maxGzipBytes: max } })), { only: ['budget'] });
    const d = env.diagnostics.find((x) => x.code === 'SGS0401')!;
    const room = Number(/--max-gzip (\d+)/.exec(d.fix!.commands![0]!)![1]);
    const gens = Object.entries(env.data.budget!.generators).filter(([r]) => !r.startsWith('('));
    const biggest = Math.max(...gens.map(([, g]) => g!));
    expect(room).toBe(max - (total - biggest));
    expect(room).toBeGreaterThan(0);
  });

  it('when the kernel alone exceeds the budget, the fix raises the budget instead of a catalog query that matches nothing', async () => {
    const env = await check(await loadConfig(undefined, makeProject({ key: { field: 'id' }, policy: { default: 'grid@1' }, budget: { maxGzipBytes: 1000 } })), { only: ['budget'] });
    const d = env.diagnostics.find((x) => x.code === 'SGS0401')!;
    expect(d.fix!.commands).toBeUndefined();
    expect(d.fix!.edits![0]).toMatchObject({ path: 'budget.maxGzipBytes', set: env.data.budget!.totalGzip });
  });
});

describe('init (#4)', () => {
  const media = Array.from({ length: 32 }, (_, i) => ({ id: `m${i}`, title: `Track ${i}`, source: ['local', 'youtube', 'radio'][i % 3], ...(i % 5 ? {} : { image_url: `https://x/${i}.jpg` }) }));

  it('detects the item-type field from samples, and says so when there is none', () => {
    expect(detectItemType(media)).toMatchObject({ field: 'source', values: ['local', 'youtube', 'radio'] });
    expect(detectItemType(media.map((m, i) => ({ ...m, type: i % 2 ? 'song' : 'video' }))).field).toBe('type');
    expect(detectItemType(media.map(({ id, title }) => ({ id, title }))).field).toBeNull();
    expect(detectItemType([]).field).toBeNull();
  });

  it('writes the detected key and item type, derived delivery, and a next list that walks the whole loop', () => {
    const dir = makeProject({}, media);
    const env = init(dir, { samples: 'items.json', force: true, agents: false });
    const cfg = JSON.parse(readFileSync(join(dir, 'sigilsmith.config.json'), 'utf8'));
    expect(cfg.itemType).toEqual({ field: 'source' });
    expect(cfg.key.field).toBe('id');
    expect(cfg.delivery.strategy).toBe('derived');
    expect(env.data.detected!.itemType.field).toBe('source');
    const steps = env.next.map((n) => n.command.split(' ')[2]);
    expect(steps).toEqual(['detect-key', 'catalog', 'preview', 'build']);
  });

  it('without samples, the first step is to detect the key on real items', () => {
    const dir = makeProject({});
    const env = init(dir, { force: true, agents: false });
    expect(env.next[0]!.command).toMatch(/detect-key sigilsmith\.samples\.json --write/);
  });
});
