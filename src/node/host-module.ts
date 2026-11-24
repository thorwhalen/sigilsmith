/**
 * Import code that belongs to the host project (a custom key function, a module transport,
 * an extension generator) the way its bundler would see it.
 *
 * With esbuild installed (any Vite or tsup project has it), the module is bundled into a
 * fresh directory under the project's `node_modules/.cache/sigilsmith/` first: TypeScript,
 * TSX, extensionless imports and tsconfig path aliases work, the host's packages resolve
 * from its own node_modules, and a long-lived process (the MCP server) sees every edit,
 * since each load is a new file. Without esbuild, Node imports the file itself (plain JS, or
 * erasable TypeScript with Node's type stripping, 22.18+); JS is cache-busted by its mtime.
 */
import { mkdirSync, mkdtempSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

type Esbuild = typeof import('esbuild');

/** The host's esbuild (or none), resolved from `fromDir`. */
export async function hostEsbuild(fromDir: string): Promise<Esbuild | undefined> {
  try {
    return (await import(pathToFileURL(createRequire(`${fromDir}/`).resolve('esbuild')).href)) as Esbuild;
  } catch {
    return undefined;
  }
}

/** A fresh scratch directory inside the host project (so bare imports resolve against its node_modules). */
export function hostScratch(hostDir: string): string {
  const cache = join(hostDir, 'node_modules', '.cache', 'sigilsmith');
  mkdirSync(cache, { recursive: true });
  return mkdtempSync(join(cache, 'mod-'));
}

/** Import a file of the host project (see the module doc). */
export async function importHostModule(file: string, hostDir: string): Promise<unknown> {
  const esbuild = await hostEsbuild(dirname(file));
  if (!esbuild) {
    // JS is cache-busted by mtime, so a long-lived process sees edits; a TS file is imported
    // plain (a query on it confuses some loaders' type stripping): install esbuild for that.
    const url = pathToFileURL(file).href;
    return import(/\.[cm]?tsx?$/.test(file) ? url : `${url}?sigilsmith-mtime=${statSync(file).mtimeMs}`);
  }
  const out = join(hostScratch(hostDir), 'mod.mjs');
  await esbuild.build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'node', outfile: out, packages: 'external', logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

/**
 * Import a package the host depends on, resolved from the host with ESM conditions (a
 * stub module inside the project imports it), not from sigilsmith's own location.
 */
export async function importHostPackage(spec: string, hostDir: string): Promise<unknown> {
  const stub = join(hostScratch(hostDir), 'stub.mjs');
  writeFileSync(stub, `export * from ${JSON.stringify(spec)};\nimport * as m from ${JSON.stringify(spec)};\nexport default m.default;\n`);
  return import(pathToFileURL(stub).href);
}

/**
 * The gzip size of a host module as the browser would ship it (bundled for the browser,
 * minified, the host's packages included), or null without esbuild.
 */
export async function measureHostModule(entry: { file?: string; spec?: string }, hostDir: string): Promise<number | null> {
  const esbuild = await hostEsbuild(entry.file ? dirname(entry.file) : hostDir);
  if (!esbuild) return null;
  const { gzipSync } = await import('node:zlib');
  const contents = entry.file ? `export { default } from ${JSON.stringify(entry.file)};` : `export { default } from ${JSON.stringify(entry.spec)};`;
  const r = await esbuild.build({ stdin: { contents, resolveDir: hostDir, loader: 'js' }, bundle: true, minify: true, format: 'esm', platform: 'browser', write: false, logLevel: 'silent', external: ['react', 'react/*', 'react-dom'] });
  return gzipSync(r.outputFiles[0]!.contents, { level: 9 }).length;
}
