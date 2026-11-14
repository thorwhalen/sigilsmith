/**
 * `minidenticons@1`: adapter over the MIT `minidenticons` library (geometric × hash).
 *
 * Proves the facade/plugin path for third-party generators: the library is an
 * optional peer dependency the host installs (`npm i minidenticons@4.2.1`), and this
 * adapter maps the kernel's context onto its API, passing the kernel's hash
 * (the library's default hash produced 60 near-duplicates in 150 sequential ids). Output depends on the library
 * version too, so `sigilsmith build` records it in the lock and `check` compares it.
 *
 * Frozen: this module's output for a given seed, params and pinned library never changes.
 */
import { minidenticon } from 'minidenticons';
import { hash32 } from '../../hash.js';
import { escapeXml, svgImage } from '../../svg.js';
import type { GeneratorModule } from '../../types.js';
import { meta, type MinidenticonsParams } from './meta.js';

export type { MinidenticonsParams };


const mini: GeneratorModule<MinidenticonsParams> = {
  ...meta,
  render({ seed, params }) {
    // The library's own string hash collides on sequential ids (`item-1`, `item-2`); cyrb128 does not.
    const inner = minidenticon(seed, Number(params.saturation), Number(params.lightness), hash32);
    if (params.background === 'none') return svgImage(inner);
    const nested = inner.replace('<svg ', '<svg x="8" y="8" width="84" height="84" ');
    return svgImage(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="16" fill="${escapeXml(String(params.background))}"/>${nested}</svg>`);
  },
};

export default mini;
