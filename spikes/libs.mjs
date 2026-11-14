/** Registry of spiked libraries. `pkgs[0]` is the main package (version shown); all pkgs contribute licences. */
export const LIBS = [
  { id: 'in-house-baseline', pkgs: [], note: 'Hand-written ~15-line SVG identicon (FNV-1a + mulberry32 + 5x5 mirrored grid + one HSL hue). The floor.' },
  { id: 'minidenticons', pkgs: ['minidenticons'], note: 'Tiny identicon, SVG string out.' },
  { id: 'jdenticon', pkgs: ['jdenticon'], note: 'toSvg(key, size). Browser entry resolved by esbuild.' },
  { id: 'dicebear-identicon', pkgs: ['@dicebear/core', '@dicebear/identicon'], note: 'core + identicon style (`import * as style`, no tree-shaking of the style schema).' },
  { id: 'dicebear-shapes', pkgs: ['@dicebear/core', '@dicebear/shapes'], note: 'core + shapes style.' },
  { id: 'dicebear-initials', pkgs: ['@dicebear/core', '@dicebear/initials'], note: 'core + initials style (text based; needs fonts at render time).' },
  { id: 'dicebear-glass', pkgs: ['@dicebear/core', '@dicebear/glass'], note: 'core + glass style.' },
  { id: 'boring-avatars', pkgs: ['boring-avatars'], external: ['react', 'react/jsx-runtime'], react: true, note: 'React component, variant "beam". react / react/jsx-runtime marked external (NOT counted); ReactDOMServer used for Node rendering.' },
  { id: 'geopattern', pkgs: ['geopattern'], note: 'Tiling background patterns (not square; cropped to a square with slice).' },
  { id: 'trianglify', pkgs: ['trianglify'], note: 'Delaunay gradient triangles. GPL-3.0: incompatible with an MIT package; measured for reference only.' },
  { id: 'blockies-base64', pkgs: ['ethereum-blockies-base64'], note: 'Blockies via pnglib, PNG data URL out (pure JS, no canvas).' },
  { id: 'download-blockies', pkgs: ['@download/blockies'], dom: 'canvas', note: 'Blockies needing a canvas; in Node a fake 2D context records fillRect into an SVG.' },
  { id: 'multiavatar', pkgs: ['@multiavatar/multiavatar'], note: 'Large illustrated avatars (embedded art). Custom licence, see notes.' },
  { id: 'hashicon', pkgs: ['@emeraldpay/hashicon'], dom: 'canvas', noRender: true, note: 'Needs a real canvas; size measured, not rendered (no canvas in Node here).' },
  { id: 'thumbhash', pkgs: ['thumbhash'], note: 'Decoder only; a key is turned into 25 pseudo-random bytes, decoded to a 32px PNG data URL (blurry colour field).' },
  { id: 'blurhash', pkgs: ['blurhash'], note: 'Decoder only (RGBA out); size EXCLUDES canvas/PNG output code that a real integration adds. Key -> synthetic base83 string.' },
  { id: 'simplex-noise', pkgs: ['simplex-noise'], note: 'Noise primitive; entry builds a 16x16 HSL cell field with an in-house hash/PRNG (counted).' },
  { id: 'roughjs', pkgs: ['roughjs'], note: 'Sketchy shapes via rough.generator() (no DOM); entry draws a circle + 2 rects with an in-house hash/PRNG (counted).' },
];
export const SKIPPED = [
  ['@dicebear/* other styles (avataaars, lorelei, ...)', 'illustration styles carry large embedded art; identicon, shapes, initials and glass cover the geometric end'],
  ['react-blockies, jazzicon variants', 'React/canvas wrappers around the same blockies algorithm already measured twice'],
  ['gradient-avatar, github-identicon (various)', 'tiny unmaintained forks of the identicon family already represented by minidenticons and jdenticon'],
];
