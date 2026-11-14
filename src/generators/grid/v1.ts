/**
 * `grid@1`: a mirrored-grid identicon (geometric × hash), in-house, no dependencies.
 *
 * Cells of a `cells × cells` grid are switched on by the seeded PRNG and mirrored
 * left-right, in the primary colour on a light tinted tile. Symmetry makes the shape
 * read as a figure; a single hue plus the shape are the two channels people use to
 * tell identicons apart at 16–32 px (docs/research/identity-and-images.md).
 *
 * Frozen: this module's output for a given seed and params never changes.
 */
import { n, svgDoc, svgImage, tile } from '../../svg.js';
import type { GeneratorModule } from '../../types.js';

export interface GridParams {
  cells: number;
  density: number;
  shape: 'square' | 'rounded' | 'circle';
  padding: number;
}

const grid: GeneratorModule<GridParams> = {
  id: 'grid',
  major: 1,
  kind: 'hash',
  determinism: 'pure',
  defaults: { cells: 5, density: 0.5, shape: 'rounded', padding: 0.16 },
  defaultInputs: ['$key'],
  render({ rng, palette, params }) {
    const cells = Math.max(3, Math.min(9, Math.round(params.cells)));
    const half = Math.ceil(cells / 2);
    const on: boolean[][] = [];
    let count = 0;
    for (let y = 0; y < cells; y++) {
      const row: boolean[] = [];
      for (let x = 0; x < half; x++) {
        const v = rng() < params.density;
        row.push(v);
        if (v) count++;
      }
      on.push(row);
    }
    // Guarantee a visible figure: switch on cells until at least a third of the half-grid is lit.
    for (let i = 0; count < Math.ceil((cells * half) / 3); i++) {
      const y = Math.floor(rng() * cells);
      const x = Math.floor(rng() * half);
      if (!on[y]![x]) {
        on[y]![x] = true;
        count++;
      }
    }
    const pad = 100 * params.padding;
    const size = (100 - 2 * pad) / cells;
    let body = tile(palette.background, params.shape);
    let rects = '';
    for (let y = 0; y < cells; y++) {
      for (let x = 0; x < cells; x++) {
        const src = x < half ? x : cells - 1 - x;
        if (on[y]![src]) rects += `<rect x="${n(pad + x * size)}" y="${n(pad + y * size)}" width="${n(size)}" height="${n(size)}"/>`;
      }
    }
    body += `<g fill="${palette.primary}">${rects}</g>`;
    return svgImage(svgDoc(body));
  },
};

export default grid;
