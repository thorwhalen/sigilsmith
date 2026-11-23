import { defineConfig } from 'tsup';

/**
 * One ESM build with an entry per public subpath and per generator major, so bundlers
 * can only ever pull in what the wiring module imports. Shared kernel code is split
 * into chunks rather than duplicated into each generator.
 */
export default defineConfig({
  entry: {
    index: 'src/index.ts',
    remote: 'src/remote.ts',
    features: 'src/features.ts',
    delivery: 'src/delivery.ts',
    'targets/index': 'src/targets/index.ts',
    'zodal/index': 'src/zodal/index.ts',
    'zodal/settings': 'src/zodal/settings.ts',
    'react/index': 'src/react/index.tsx',
    'node/index': 'src/node/index.ts',
    'cli/main': 'src/cli/main.ts',
    'mcp/server': 'src/mcp/server.ts',
    'generators/grid/v1': 'src/generators/grid/v1.ts',
    'generators/rings/v1': 'src/generators/rings/v1.ts',
    'generators/shapes/v1': 'src/generators/shapes/v1.ts',
    'generators/initials/v1': 'src/generators/initials/v1.ts',
    'generators/emoji/v1': 'src/generators/emoji/v1.ts',
    'generators/minidenticons/v1': 'src/generators/minidenticons/v1.ts',
    'generators/glyph/v1': 'src/generators/glyph/v1.ts',
    'generators/aura/v1': 'src/generators/aura/v1.ts',
    'extras/screenshot/v1': 'src/extras/screenshot/v1.ts',
  },
  format: ['esm'],
  dts: true,
  splitting: true,
  treeshake: true,
  clean: true,
  target: 'es2022',
  platform: 'neutral',
  external: ['react', 'react-dom', 'zod', /^@zodal\//, 'minidenticons', '@resvg/resvg-js', /^@modelcontextprotocol\//, /^node:/],
});
