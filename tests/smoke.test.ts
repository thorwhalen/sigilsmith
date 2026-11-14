import { describe, expect, it } from 'vitest';
import { createSigil } from '../src/index.js';
import { baseConfig, loaders } from './fixtures.js';

describe('smoke: one item end to end', () => {
  it('renders a deterministic svg', async () => {
    const sigil = createSigil({ config: baseConfig, generators: loaders });
    const a = await sigil.render({ id: 'p1', title: 'Project One', type: 'project' });
    const b = await sigil.render({ id: 'p1', title: 'Renamed', type: 'project' });
    expect(a.type).toBe('svg');
    expect(a).toEqual(b);
    const plan = await sigil.plan({ id: 'u1', name: 'Ada Lovelace', type: 'user' });
    expect(plan.selection).toEqual({ ref: 'initials@1', via: 'preset:people' });
  });
});
