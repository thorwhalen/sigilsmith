/**
 * A `Sigil` built in Node from a loaded config, for the CLI (explain, preview, check,
 * build). It uses the same kernel as the browser, so what the CLI reports is what the
 * app will draw.
 */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { remoteFromSpec, type RemoteSpec, type Transport } from '../remote.js';
import { createSigil, type Sigil } from '../sigil.js';
import type { GeneratorLoader, Item } from '../types.js';
import { NODE_LOADERS } from './builtins.js';
import type { LoadedConfig } from './config.js';

/**
 * Import a host module (a custom key function or transport). TypeScript, extensionless
 * imports and the host's own dependencies are handled by bundling it with esbuild first
 * when esbuild is installed (any Vite/tsup project has it); otherwise Node imports it
 * directly, which needs plain JS or Node's own type stripping (22.18+).
 */
async function importHostModule(file: string, hostDir: string): Promise<unknown> {
  let esbuild: typeof import('esbuild') | undefined;
  try {
    esbuild = (await import(pathToFileURL(createRequire(`${dirname(file)}/`).resolve('esbuild')).href)) as typeof import('esbuild');
  } catch {
    esbuild = undefined;
  }
  if (!esbuild) return import(pathToFileURL(file).href);
  // Inside the host project, so the bundle's bare imports resolve against its node_modules.
  const cache = join(hostDir, 'node_modules', '.cache', 'sigilsmith');
  mkdirSync(cache, { recursive: true });
  const out = join(mkdtempSync(join(cache, 'mod-')), 'mod.mjs');
  await esbuild.build({ entryPoints: [file], bundle: true, format: 'esm', platform: 'node', outfile: out, packages: 'external', logLevel: 'silent' });
  return import(pathToFileURL(out).href);
}

/** Import `<module path>#<export>` relative to the config's directory. */
export async function importRef<T>(dir: string, ref: string): Promise<T> {
  const [path, name] = ref.split('#') as [string, string];
  const mod = (await importHostModule(resolve(dir, path), dir)) as Record<string, unknown>;
  if (!(name in mod)) throw new Error(`\`${path}\` has no export \`${name}\``);
  return mod[name] as T;
}

export async function nodeSigil(loaded: LoadedConfig, opts: { remote?: boolean } = {}): Promise<Sigil> {
  const cfg = loaded.config!;
  const generators: Record<string, GeneratorLoader> = { ...NODE_LOADERS };
  for (const [ref, spec] of Object.entries(cfg.remote)) {
    const [id, major] = ref.split('@') as [string, string];
    if (opts.remote === false) continue;
    generators[ref] = async () => {
      const transport = spec.transport === 'module' ? await importRef<Transport>(loaded.dir, spec.module) : undefined;
      return remoteFromSpec(id, Number(major), spec as RemoteSpec, transport ? { transport } : {});
    };
  }
  let keyFn: ((item: Item) => string) | undefined;
  if ('custom' in cfg.key) keyFn = await importRef<(item: Item) => string>(loaded.dir, cfg.key.custom);
  return createSigil({ config: loaded.resolved!, generators, ...(keyFn ? { keyFn } : {}), onWarn: () => {} });
}
