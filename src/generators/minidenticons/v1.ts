/**
 * `minidenticons@1`: adapter over the MIT `minidenticons` library (geometric × hash).
 *
 * Proves the facade/plugin path for third-party generators: the library is an
 * optional peer dependency the host installs (`npm i minidenticons@4.2.1`), and this
 * adapter maps the kernel's context onto its API. Output depends on the library
 * version too, so `sigilsmith build` records it in the lock and `check` compares it.
 *
 * Frozen: this module's output for a given seed, params and pinned library never changes.
 */
import { minidenticon } from 'minidenticons';
import { svgImage } from '../../svg.js';
import type { GeneratorModule } from '../../types.js';

export interface MinidenticonsParams {
  saturation: number;
  lightness: number;
  /** Light tile behind the figure, so it stays visible on dark pages. `none` for transparent. */
  background: string;
}

const mini: GeneratorModule<MinidenticonsParams> = {
  id: 'minidenticons',
  major: 1,
  kind: 'hash',
  determinism: 'pure',
  defaults: { saturation: 70, lightness: 45, background: '#f4f4f5' },
  defaultInputs: ['$key'],
  render({ seed, params }) {
    const inner = minidenticon(seed, params.saturation, params.lightness);
    if (params.background === 'none') return svgImage(inner);
    const nested = inner.replace('<svg ', '<svg x="8" y="8" width="84" height="84" ');
    return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="${params.background}"/>${nested}</svg>`);
  },
};

export default mini;
