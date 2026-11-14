/**
 * Demo app state (zustand): the items, their stored image records, and the pending
 * "update the image?" prompt. Images are stored through a zodal DataProvider (an
 * in-memory blob provider here; swap in `createHttpBlobProvider` for a real server).
 */
import { create } from 'zustand';
import type { Item } from 'sigilsmith';
import { deliver, onInputsChanged, type SigilRecord } from 'sigilsmith/delivery';
import { createMemoryBlobProvider, fromDataProvider } from 'sigilsmith/zodal';
import { sigil } from './sigilsmith.gen';
import samples from '../sigilsmith.samples.json';

export const imageStore = fromDataProvider(createMemoryBlobProvider());

export interface Row {
  item: Item;
  record: SigilRecord | null;
}

export interface Prompt {
  id: string;
  title: string;
  resolve: (answer: 'update' | 'keep') => void;
}

interface State {
  rows: Row[];
  prompt: Prompt | null;
  materialize(): Promise<void>;
  rename(id: string, title: string): Promise<void>;
  answer(answer: 'update' | 'keep'): void;
}

const titleField = (it: Item) => ('name' in it ? 'name' : 'title');

export const useDemo = create<State>((set, get) => ({
  rows: (samples as Item[]).map((item) => ({ item, record: null })),
  prompt: null,
  async materialize() {
    // Generate once in the browser, store, keep the record with the item (B18 default).
    const rows = await Promise.all(get().rows.map(async (r) => ({ ...r, record: r.record ?? (await deliver(sigil, r.item, { store: imageStore })).record })));
    set({ rows });
  },
  async rename(id, title) {
    const row = get().rows.find((r) => r.item.id === id)!;
    const item = { ...row.item, [titleField(row.item)]: title };
    set({ rows: get().rows.map((r) => (r.item.id === id ? { ...r, item } : r)) });
    if (!row.record) return;
    // B19: ask (non-modal, default keep) only if the generator's inputs really changed.
    const { decision, record } = await onInputsChanged(sigil, item, row.record, {
      timeoutMs: 15000,
      confirm: () => new Promise((resolve) => set({ prompt: { id, title, resolve } })),
    });
    set({ prompt: null });
    const next = decision === 'regenerate' ? (await deliver(sigil, item, { store: imageStore })).record : record;
    set({ rows: get().rows.map((r) => (r.item.id === id ? { ...r, record: next } : r)) });
  },
  answer(answer) {
    get().prompt?.resolve(answer);
    set({ prompt: null });
  },
}));
