/**
 * `rings@1`: concentric arcs (abstract × hash), in-house, no dependencies.
 *
 * Three to five rings, each an arc of seeded length and rotation in one of the
 * palette colours, on a dark tinted tile. Abstract and calm, readable at 24 px as a
 * colour pair plus a rotation pattern; better at 48 px and up.
 *
 * Frozen: this module's output for a given seed and params never changes.
 */
import { n, svgDoc, svgImage, tile } from '../../svg.js';
import type { GeneratorModule } from '../../types.js';

export interface RingsParams {
  rings: number;
  shape: 'square' | 'rounded' | 'circle';
  stroke: number;
}

const rings: GeneratorModule<RingsParams> = {
  id: 'rings',
  major: 1,
  kind: 'hash',
  determinism: 'pure',
  defaults: { rings: 4, shape: 'circle', stroke: 8 },
  defaultInputs: ['$key'],
  render({ rng, palette, params }) {
    const count = Math.max(2, Math.min(6, Math.round(params.rings)));
    const colours = [palette.primary, palette.secondary, palette.accent, palette.background];
    const step = 40 / count;
    let body = tile(palette.ink, params.shape);
    for (let i = 0; i < count; i++) {
      const r = 42 - i * step;
      const circumference = 2 * Math.PI * r;
      const frac = 0.35 + 0.6 * rng();
      const angle = Math.floor(rng() * 24) * 15;
      const colour = colours[Math.floor(rng() * colours.length)]!;
      body += `<circle cx="50" cy="50" r="${n(r)}" fill="none" stroke="${colour}" stroke-width="${n(Math.min(params.stroke, step * 0.8))}" stroke-linecap="round" stroke-dasharray="${n(circumference * frac)} ${n(circumference)}" transform="rotate(${angle} 50 50)"/>`;
    }
    body += `<circle cx="50" cy="50" r="${n(step * 0.6)}" fill="${palette.secondary}"/>`;
    return svgImage(svgDoc(body));
  },
};

export default rings;
