/**
 * Measure what an app actually ships: the kernel as imported by the wiring module, and
 * each generator's incremental cost on top of it (kernel+generator minus kernel), with
 * esbuild (minified ESM, browser) and gzip -9 / brotli max. Writes catalog/_sizes.json,
 * which the catalog, `check budget` and the README read. Run after `npm run build`.
 */
import { build } from 'esbuild';
import { readdirSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url).pathname;
async function measure(contents, extraExternal = []) {
  const r = await build({ stdin: { contents, resolveDir: dist }, bundle: true, minify: true, format: 'esm', platform: 'browser', write: false, external: ['react', 'react/*', 'react-dom', 'zod', '@zodal/*', ...extraExternal], logLevel: 'silent' });
  const b = r.outputFiles[0].contents;
  return { minBytes: b.length, gzipBytes: gzipSync(b, { level: 9 }).length, brotliBytes: brotliCompressSync(b, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length };
}
const KERNEL = `import { createSigil } from './index.js'; export const s = createSigil({ config: globalThis.c, generators: {} });`;
const kernel = await measure(KERNEL);
const generators = {};
// Extras count like generators. The generators an extra falls back to are its own lazy
// chunks (shared with the app's, loaded only when drawn), so they are not in its figure.
for (const [dir, id] of ['generators', 'extras'].flatMap((d) => readdirSync(`${dist}${d}`).map((i) => [d, i]))) {
  for (const f of readdirSync(`${dist}${dir}/${id}`).filter((x) => /^v\d+\.js$/.test(x))) {
    const ref = `${id}@${f.slice(1, -3)}`;
    const ext = dir === 'extras' ? ['../../generators/*'] : [];
    const both = await measure(`${KERNEL} import g from './${dir}/${id}/${f}'; export { g };`, ext);
    const alone = await measure(`import g from './${dir}/${id}/${f}'; export { g };`, ext);
    generators[ref] = { minBytes: both.minBytes - kernel.minBytes, gzipBytes: both.gzipBytes - kernel.gzipBytes, brotliBytes: both.brotliBytes - kernel.brotliBytes, standaloneGzipBytes: alone.gzipBytes };
  }
}
const remote = await measure(`import { remoteFromSpec, progressive } from './remote.js'; export { remoteFromSpec, progressive };`);
const delivery = await measure(`import { deliver, onInputsChanged, memoryStore } from './delivery.js'; export { deliver, onInputsChanged, memoryStore };`);
const features = await measure(`${KERNEL} import { planFeatures } from './features.js'; export { planFeatures };`);
features.minBytes -= kernel.minBytes; features.gzipBytes -= kernel.gzipBytes; features.brotliBytes -= kernel.brotliBytes;
const react = await measure(`import { Sigil, SigilProvider } from './react/index.js'; export { Sigil, SigilProvider };`);
// The picker (and the delivery code it uploads through), on top of the React adapter.
const withPicker = await measure(`import { Sigil, SigilProvider, SigilPicker, useSigilPicker } from './react/index.js'; export { Sigil, SigilProvider, SigilPicker, useSigilPicker };`);
const picker = { minBytes: withPicker.minBytes - react.minBytes, gzipBytes: withPicker.gzipBytes - react.gzipBytes, brotliBytes: withPicker.brotliBytes - react.brotliBytes };
const out = { measuredAt: new Date().toISOString().slice(0, 10), method: 'esbuild minify esm browser; generator = (kernel+generator) - kernel', kernel, generators, modules: { remote, delivery, react, picker, features } };
writeFileSync(new URL('../catalog/_sizes.json', import.meta.url), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
