/**
 * `shapes@1`: overlapping Bauhaus-style shapes (abstract × hash), in-house.
 *
 * A tinted tile with two to five shapes (circle, square, triangle, half disc) in the
 * palette colours, placed, sized and rotated by the seeded PRNG. Rotation uses SVG
 * transforms, not trigonometry, so coordinates are exact in every engine.
 *
 * Frozen: this module's output for a given seed and params never changes.
 */
import { n, svgDoc, svgImage, tile } from '../../svg.js';
import type { GeneratorModule } from '../../types.js';
import { meta, type ShapesParams } from './meta.js';

export type { ShapesParams };


const KINDS = ['circle', 'square', 'triangle', 'half'] as const;

const shapes: GeneratorModule<ShapesParams> = {
  ...meta,
  render({ rng, palette, params }) {
    const count = Math.max(2, Math.min(5, Math.round(params.count)));
    const colours = [palette.primary, palette.secondary, palette.accent, palette.ink];
    let body = tile(palette.background, params.shape);
    for (let i = 0; i < count; i++) {
      const kind = KINDS[Math.floor(rng() * KINDS.length)]!;
      const colour = colours[(i + Math.floor(rng() * colours.length)) % colours.length]!;
      const s = 28 + rng() * (52 - i * 6);
      const cx = 22 + rng() * 56;
      const cy = 22 + rng() * 56;
      const rot = Math.floor(rng() * 24) * 15;
      const h = s / 2;
      const t = `transform="rotate(${rot} ${n(cx)} ${n(cy)})"`;
      const op = i === 0 ? '' : ' fill-opacity="0.9"';
      if (kind === 'circle') body += `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(h)}" fill="${colour}"${op}/>`;
      else if (kind === 'square') body += `<rect x="${n(cx - h)}" y="${n(cy - h)}" width="${n(s)}" height="${n(s)}" fill="${colour}"${op} ${t}/>`;
      else if (kind === 'triangle') body += `<polygon points="${n(cx)},${n(cy - h)} ${n(cx + h)},${n(cy + h)} ${n(cx - h)},${n(cy + h)}" fill="${colour}"${op} ${t}/>`;
      else body += `<path d="M${n(cx - h)} ${n(cy)}A${n(h)} ${n(h)} 0 0 1 ${n(cx + h)} ${n(cy)}Z" fill="${colour}"${op} ${t}/>`;
    }
    return svgImage(svgDoc(body));
  },
};

export default shapes;
