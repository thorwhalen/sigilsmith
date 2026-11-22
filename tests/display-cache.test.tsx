import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DisplayUrlCache, displayCacheFor } from '../src/react/display-cache.js';
import { Sigil } from '../src/react/index.js';

afterEach(() => vi.restoreAllMocks());

describe('display-URL cache (#10)', () => {
  it('evicts the least recently used entry and revokes its blob URL', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const c = new DisplayUrlCache(2);
    c.set('a', 'blob:a', true);
    c.set('b', 'data:b', false);
    c.get('a'); // a is now the most recent
    c.set('c', 'blob:c', true);
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBe('blob:a');
    expect(revoke).not.toHaveBeenCalledWith('blob:a');
    c.set('d', 'data:d', false); // evicts c
    expect(revoke).toHaveBeenCalledWith('blob:c');
  });

  it('a remounted <Sigil> with an unchanged item is ready on the first render', () => {
    // A stand-in wiring: server rendering runs no effects, so this is the very first paint.
    const sigil = { subscribe: () => () => {}, getUser: () => undefined } as never;
    const item = { id: 'x', type: 'video' };
    const html0 = renderToStaticMarkup(<Sigil item={item} size={40} sigil={sigil} />);
    expect(html0).toContain('data-status="loading"');
    displayCacheFor(sigil).set(JSON.stringify([JSON.stringify(item), 40, null, null, false, null]), 'data:image/svg+xml,x', false);
    const html1 = renderToStaticMarkup(<Sigil item={item} size={40} sigil={sigil} />);
    expect(html1).toContain('data-status="ready"');
    expect(html1).toContain('src="data:image/svg+xml,x"');
  });
});
