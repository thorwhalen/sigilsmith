/** Helpers to create throwaway host projects for CLI-level tests. */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const SAMPLE_ITEMS = [
  { id: 'trk_1', title: 'Blue Monday', type: 'audio', artist: 'New Order' },
  { id: 'trk_2', title: 'Ocean Drive', type: 'audio', artist: 'Lighthouse Family' },
  { id: 'vid_1', title: 'Launch keynote', type: 'video' },
  { id: 'vid_2', title: 'Tutorial', type: 'video' },
  { id: 'prj_1', title: 'Alpha', type: 'project' },
];

export function makeProject(config: Record<string, unknown>, items: unknown[] = SAMPLE_ITEMS): string {
  const dir = mkdtempSync(join(tmpdir(), 'sigilsmith-test-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'items.json'), JSON.stringify(items, null, 2));
  writeFileSync(join(dir, 'sigilsmith.config.json'), JSON.stringify({ version: 1, samples: 'items.json', ...config }, null, 2));
  return dir;
}

export const BASIC = {
  key: { field: 'id' },
  policy: { default: 'grid@1', rules: [{ when: { type: 'video' }, use: 'rings@1' }, { when: { type: 'audio' }, use: 'shapes@1' }] },
  budget: { maxGzipBytes: 8000 },
};
