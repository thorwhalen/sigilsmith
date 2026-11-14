import { describe, expect, it } from 'vitest';
import { createSigil } from '../src/index.js';
import { deliver, memoryStore, onInputsChanged, storeCustom, type ImageStore } from '../src/delivery.js';
import { createRemoteGenerator, mockTransport, progressive, type RemoteRequest } from '../src/remote.js';
import type { ResolvedConfig } from '../src/types.js';
import { baseConfig, loaders } from './fixtures.js';

const countingStore = () => {
  const inner = memoryStore();
  let puts = 0;
  const store: ImageStore = { head: inner.head, put: async (...a) => (puts++, inner.put(...a)) };
  return { store, puts: () => puts, size: inner.size };
};

describe('delivery strategies (B18)', () => {
  const sigil = createSigil({ config: baseConfig, generators: loaders });
  const item = { id: 'p1', title: 'Alpha', type: 'project' };
  it('materialized stores once under a content id, and is idempotent', async () => {
    const s = countingStore();
    const a = await deliver(sigil, item, { strategy: 'materialized', store: s.store });
    const b = await deliver(sigil, item, { strategy: 'materialized', store: s.store });
    expect(a.record.contentId).toMatch(/^sg_[0-9a-f]{32}$/);
    expect(a.record.url).toBe(b.record.url);
    expect(s.puts()).toBe(1);
  });
  it('derived stores nothing', async () => {
    const s = countingStore();
    const d = await deliver(sigil, item, { strategy: 'derived', store: s.store });
    expect(d.record.url).toBeUndefined();
    expect(d.display).toMatch(/^data:image\/svg\+xml/);
    expect(s.size()).toBe(0);
  });
  it('hybrid shows a local render at once and stores in the background', async () => {
    const s = countingStore();
    const h = await deliver(sigil, item, { strategy: 'hybrid', store: s.store });
    expect(h.record.url).toBeUndefined();
    const stored = await h.stored!;
    expect(stored.url).toBeTruthy();
    expect(s.size()).toBe(1);
  });
  it('custom images go through the same store', async () => {
    const s = countingStore();
    const rec = await storeCustom(new Uint8Array([137, 80, 78, 71]), 'image/png', { store: s.store });
    expect(rec).toMatchObject({ source: 'custom', frozen: true });
    expect(s.size()).toBe(1);
  });
});

describe('regeneration policy (B19)', () => {
  const cfg: ResolvedConfig = { ...baseConfig, generators: { 'initials@1': {} }, policy: { ...baseConfig.policy, default: 'initials@1', rules: [] } };
  const sigil = createSigil({ config: cfg, generators: loaders });
  const before = { id: 'u1', name: 'Ada Lovelace', type: 'project' };
  const after = { ...before, name: 'Ada King' };
  const recordFor = async (it: typeof before) => (await deliver(sigil, it, { strategy: 'materialized', store: memoryStore() })).record;

  it('unchanged when inputs did not change', async () => {
    const r = await recordFor(before);
    expect((await onInputsChanged(sigil, { ...before, extra: 1 }, r, { policy: 'ask' })).decision).toBe('unchanged');
  });
  it('always / never', async () => {
    const r = await recordFor(before);
    expect((await onInputsChanged(sigil, after, r, { policy: 'always' })).decision).toBe('regenerate');
    expect((await onInputsChanged(sigil, after, r, { policy: 'never' })).decision).toBe('keep');
  });
  it('ask: follows the answer; no answer or timeout keeps and freezes', async () => {
    const r = await recordFor(before);
    expect((await onInputsChanged(sigil, after, r, { policy: 'ask', confirm: async () => 'update' })).decision).toBe('regenerate');
    const kept = await onInputsChanged(sigil, after, r, { policy: 'ask', confirm: async () => 'keep' });
    expect(kept).toMatchObject({ decision: 'keep', record: { frozen: true } });
    expect((await onInputsChanged(sigil, after, r, { policy: 'ask', confirm: () => new Promise(() => {}), timeoutMs: 20 })).decision).toBe('keep');
    expect((await onInputsChanged(sigil, after, kept.record, { policy: 'ask', confirm: async () => 'update' })).decision).toBe('keep');
  });
  it('never overwrites a custom image, even with policy always', async () => {
    const custom = { source: 'custom' as const, contentId: 'sg_x', inputsDigest: 'old', url: 'u' };
    expect((await onInputsChanged(sigil, after, custom, { policy: 'always' })).decision).toBe('keep');
  });
  it('identicons keyed on an immutable id never ask on rename', async () => {
    const s2 = createSigil({ config: baseConfig, generators: loaders });
    const r = (await deliver(s2, { id: 'p9', title: 'A', type: 'project' }, { store: memoryStore() })).record;
    expect((await onInputsChanged(s2, { id: 'p9', title: 'B', type: 'project' }, r, { policy: 'ask' })).decision).toBe('unchanged');
  });
});

describe('remote generators (B12, B3, B5)', () => {
  it('caches by content id: the same item never triggers a second call', async () => {
    const calls: RemoteRequest[] = [];
    const ai = createRemoteGenerator({ id: 'ai', major: 1, transport: mockTransport({ latencyMs: 5, calls }) });
    const cfg: ResolvedConfig = { ...baseConfig, policy: { ...baseConfig.policy, default: 'ai@1', rules: [] } };
    const sigil = createSigil({ config: cfg, generators: { ...loaders, 'ai@1': async () => ai } });
    const item = { id: 'a', title: 'Ocean', description: 'waves', type: 'x' };
    const one = await sigil.render(item);
    const two = await sigil.render(item);
    expect(one).toEqual(two);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.fields).toEqual({ title: 'Ocean', description: 'waves' });
  });
  it('progressive: instant placeholder, then the result; placeholder kept on failure or timeout', async () => {
    const mk = (t: ReturnType<typeof mockTransport>) => {
      const ai = createRemoteGenerator({ id: 'ai', major: 1, transport: t });
      const cfg: ResolvedConfig = { ...baseConfig, policy: { ...baseConfig.policy, default: 'ai@1', rules: [] } };
      return createSigil({ config: cfg, generators: { ...loaders, 'ai@1': async () => ai } });
    };
    const item = { id: 'b', title: 'T' };
    const ok = await progressive(mk(mockTransport({ latencyMs: 5 })), item);
    expect(ok.placeholder.type).toBe('svg');
    expect((await ok.final).status).toBe('ready');
    const failed = await progressive(mk(mockTransport({ latencyMs: 5, failWhen: () => true })), item);
    expect(await failed.final).toMatchObject({ status: 'failed', image: failed.placeholder });
    const slow = await progressive(mk(mockTransport({ latencyMs: 200 })), item, { timeoutMs: 20 });
    expect(await slow.final).toMatchObject({ status: 'timeout', image: slow.placeholder });
  });
});
