import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SigilFailure } from '../src/react/index.js';

describe('<Sigil retry={false}> (#9)', () => {
  const base = { box: { width: 40 }, size: 40, alt: '', onRetry() {} };
  it('renders a retry button by default', () => {
    expect(renderToStaticMarkup(<SigilFailure {...base} retry />)).toContain('<button');
  });
  it('renders no focusable element when retry is false', () => {
    const html = renderToStaticMarkup(<SigilFailure {...base} retry={false} />);
    expect(html).not.toMatch(/<button|<a |tabindex/);
    expect(html).toContain('data-status="error"');
  });
});
