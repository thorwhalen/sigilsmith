/**
 * `glyph@1`: a feature glyph (geometric × metadata), in-house, no dependencies.
 *
 * Every visual channel is a param, so a feature mapping can drive it: hue and tone
 * (colour), shape (silhouette), size, fill (surface texture), rings, orbit (count of
 * satellites), mark (a waveform-like line) and rotation. Items whose features match
 * share a look; the item's own hash only adds a small rotation and phase offset
 * (`jitter`), and the blob and noise shapes. With default params it is a plain
 * hash-coloured disc, so it degrades gracefully when an item has no features.
 *
 * Frozen: this module's output for a given seed and params never changes.
 */
import { oklchToHex } from '../../palette.js';
import { n, svgDoc, svgImage, tile } from '../../svg.js';
import type { GeneratorModule } from '../../types.js';
import { GLYPH_FILLS, GLYPH_MARKS, GLYPH_SHAPES, meta, type GlyphParams } from './meta.js';

export type { GlyphParams };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(x) ? x : lo));
const pick = <T extends string>(v: string, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);
const pt = (r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return `${n(50 + r * Math.cos(a))},${n(50 + r * Math.sin(a))}`;
};

function silhouette(shape: GlyphParams['shape'], R: number, rot: number, blob: number[]): string {
  const poly = (k: number, inner?: number) => {
    const pts: string[] = [];
    const m = inner === undefined ? k : 2 * k;
    for (let i = 0; i < m; i++) pts.push(pt(inner !== undefined && i % 2 ? R * inner : R, rot + (i * 360) / m));
    return `<polygon points="${pts.join(' ')}"`;
  };
  switch (shape) {
    case 'circle':
      return `<circle cx="50" cy="50" r="${n(R)}"`;
    case 'triangle':
      return poly(3);
    case 'square':
      return `<polygon points="${[45, 135, 225, 315].map((d) => pt(R * 0.92, rot + d)).join(' ')}"`;
    case 'diamond':
      return `<polygon points="${[0, 90, 180, 270].map((d) => pt(d % 180 ? R * 0.68 : R, rot + d)).join(' ')}"`;
    case 'pentagon':
      return poly(5);
    case 'hexagon':
      return poly(6);
    case 'star':
      return poly(5, 0.45);
    case 'flower': {
      const k = 6;
      let d = `M${pt(R * 0.3, rot)}`;
      for (let i = 0; i < k; i++) d += `Q${pt(R * 1.3, rot + ((i + 0.5) * 360) / k)} ${pt(R * 0.3, rot + ((i + 1) * 360) / k)}`;
      return `<path d="${d}Z"`;
    }
    case 'blob': {
      const k = blob.length;
      const p = blob.map((u, i) => {
        const a = ((rot + (i * 360) / k - 90) * Math.PI) / 180;
        const r = R * (0.78 + 0.3 * u);
        return [50 + r * Math.cos(a), 50 + r * Math.sin(a)] as const;
      });
      const mid = (i: number) => [(p[i]![0] + p[(i + 1) % k]![0]) / 2, (p[i]![1] + p[(i + 1) % k]![1]) / 2] as const;
      const m0 = mid(k - 1);
      let d = `M${n(m0[0])},${n(m0[1])}`;
      for (let i = 0; i < k; i++) {
        const m = mid(i);
        d += `Q${n(p[i]![0])},${n(p[i]![1])} ${n(m[0])},${n(m[1])}`;
      }
      return `<path d="${d}Z"`;
    }
  }
}

function markPath(mark: GlyphParams['mark'], R: number, noise: number[]): string {
  const w = R * 0.8;
  const a = R * 0.32;
  const x0 = 50 - w;
  const xs = (i: number, k: number) => x0 + (2 * w * i) / k;
  const pts: Array<[number, number]> = [];
  if (mark === 'sine') for (let i = 0; i <= 16; i++) pts.push([xs(i, 16), 50 - a * Math.sin((i / 16) * 2 * Math.PI)]);
  else if (mark === 'zigzag') for (let i = 0; i <= 6; i++) pts.push([xs(i, 6), 50 + (i % 2 ? -a : a) * (i === 0 || i === 6 ? 0 : 1)]);
  else if (mark === 'steps') for (let i = 0; i < 4; i++) {
    const y = 50 + (i % 2 ? a : -a);
    pts.push([xs(i, 4), y], [xs(i + 1, 4), y]);
  }
  else if (mark === 'pulse') pts.push([xs(0, 8), 50], [xs(3, 8), 50], [xs(3.6, 8), 50 + a * 0.6], [xs(4.2, 8), 50 - a * 1.6], [xs(4.8, 8), 50 + a], [xs(5.3, 8), 50], [xs(8, 8), 50]);
  else if (mark === 'noise') noise.forEach((u, i) => pts.push([xs(i, noise.length - 1), 50 + a * (2 * u - 1)]));
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${n(x)},${n(y)}`).join('');
}

const glyph: GeneratorModule<GlyphParams> = {
  ...meta,
  render({ rng, palette, params, hash }) {
    // Draw every random number up front, in a fixed order, so params never shift the stream.
    const rJ = rng();
    const oJ = rng();
    const blob = Array.from({ length: 8 }, () => rng());
    const noise = Array.from({ length: 12 }, () => rng());

    const hue = params.hue >= 0 ? Math.round(clamp(params.hue, 0, 359)) : palette.hue;
    const c = clamp(params.chroma, 0, 0.3);
    const dark = params.tone === 'dark';
    const shape = pick(params.shape, GLYPH_SHAPES, 'circle');
    const fill = pick(params.fill, GLYPH_FILLS, 'solid');
    const mark = pick(params.mark, GLYPH_MARKS, 'none');
    const rings = Math.round(clamp(params.rings, 0, 3));
    const orbit = Math.round(clamp(params.orbit, 0, 8));
    const jitter = clamp(params.jitter, 0, 1);
    const R = 45 * clamp(params.size, 0.2, 0.85);
    const rot = Math.round(clamp(params.rotation, -360, 360) + (rJ - 0.5) * 60 * jitter);

    const bg = dark ? oklchToHex(0.27, c * 0.45, hue) : oklchToHex(0.95, c * 0.3, hue);
    const main = oklchToHex(dark ? 0.72 : 0.6, c, hue);
    const second = oklchToHex(dark ? 0.82 : 0.74, c, (hue + 150) % 360);
    const ink = dark ? oklchToHex(0.95, c * 0.2, hue) : oklchToHex(0.3, c * 0.6, hue);
    const id = `gl${(hash >>> 0).toString(36)}`;

    let defs = '';
    let attrs: string;
    if (fill === 'solid') attrs = `fill="${main}"`;
    else if (fill === 'outline') attrs = `fill="none" stroke="${main}" stroke-width="6" stroke-linejoin="round"`;
    else if (fill === 'half') {
      defs = `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0.5" stop-color="${main}"/><stop offset="0.5" stop-color="${second}"/></linearGradient>`;
      attrs = `fill="url(#${id})"`;
    } else {
      const motif = fill === 'stripes' ? `<rect width="4" height="8" fill="${main}"/>` : `<circle cx="4" cy="4" r="2.2" fill="${main}"/>`;
      const t = fill === 'stripes' ? ' patternTransform="rotate(45)"' : '';
      defs = `<pattern id="${id}" width="8" height="8" patternUnits="userSpaceOnUse"${t}>${motif}</pattern>`;
      attrs = `fill="url(#${id})" stroke="${main}" stroke-width="3" stroke-linejoin="round"`;
    }

    let body = tile(bg, params.tile === 'square' || params.tile === 'circle' ? params.tile : 'rounded');
    if (defs) body += `<defs>${defs}</defs>`;
    for (let i = rings; i >= 1; i--) {
      const r = Math.min(47, R + 6 * i + 1);
      body += `<circle cx="50" cy="50" r="${n(r)}" fill="none" stroke="${second}" stroke-width="2.5" stroke-opacity="${n(1 - 0.22 * (i - 1))}"/>`;
    }
    body += `${silhouette(shape, R, rot, blob)} ${attrs}/>`;
    if (mark !== 'none') {
      const onShape = fill === 'solid' || fill === 'half';
      body += `<path d="${markPath(mark, R, noise)}" fill="none" stroke="${onShape ? bg : ink}" stroke-width="${n(Math.max(2.5, R * 0.12))}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    if (orbit > 0) {
      const ro = Math.min(44, R + 6 * rings + 8);
      const phase = rot + oJ * (360 / orbit) * jitter;
      for (let i = 0; i < orbit; i++) {
        const [x, y] = pt(ro, phase + (i * 360) / orbit).split(',');
        body += `<circle cx="${x}" cy="${y}" r="${n(Math.max(2.5, 5 - orbit * 0.3))}" fill="${second}"/>`;
      }
    }
    return svgImage(svgDoc(body));
  },
};

export default glyph;
