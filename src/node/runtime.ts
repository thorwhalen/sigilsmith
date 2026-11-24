/**
 * A `Sigil` built in Node from a loaded config, for the CLI (explain, preview, check,
 * build). It uses the same kernel as the browser, so what the CLI reports is what the
 * app will draw.
 */
import { resolve } from 'node:path';
import { importHostModule } from './host-module.js';
import { remoteFromSpec, type RemoteSpec, type Transport } from '../remote.js';
import { planFeatures } from '../features.js';
import { createSigil, type Sigil } from '../sigil.js';
import type { GeneratorLoader, Item } from '../types.js';
import { nodeLoaders } from './builtins.js';
import type { LoadedConfig } from './config.js';

/** Import `<module path>#<export>` relative to the config's directory. */
export async function importRef<T>(dir: string, ref: string): Promise<T> {
  const [path, name] = ref.split('#') as [string, string];
  const mod = (await importHostModule(resolve(dir, path), dir)) as Record<string, unknown>;
  if (!(name in mod)) throw new Error(`\`${path}\` has no export \`${name}\``);
  return mod[name] as T;
}

export async function nodeSigil(loaded: LoadedConfig, opts: { remote?: boolean } = {}): Promise<Sigil> {
  const cfg = loaded.config!;
  const generators: Record<string, GeneratorLoader> = nodeLoaders(loaded.dir);
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
  return createSigil({ config: loaded.resolved!, generators, features: planFeatures, ...(keyFn ? { keyFn } : {}), onWarn: () => {} });
}
