/**
 * Serve an app's static files to extras running in Node (preview, check, build).
 *
 * In the browser, `/games/pong.webp` is fetched from the app's server. The CLI has no
 * server, so it reads the same path from the project's static folder instead: `public/`
 * first (the Vite, Next and CRA convention), then the project root. A deployed app
 * often prefixes its paths with a base (`/myapp/games/pong.webp`), so the path without
 * its first segment is tried too. `http(s):` and `data:` URLs go to the real `fetch`.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FetchLike } from '../types.js';

export interface AssetFetchOptions {
  /** Project root; defaults to the current directory (where the CLI runs). */
  root?: string;
  /** Folders under the root that hold static files, tried in order. */
  staticDirs?: string[];
}

const DEFAULT_STATIC_DIRS = ['public', '.'];

function response(bytes: Uint8Array | null): Awaited<ReturnType<FetchLike>> {
  return {
    ok: bytes !== null,
    status: bytes !== null ? 200 : 404,
    arrayBuffer: async () => (bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new ArrayBuffer(0)) as ArrayBuffer,
  };
}

export function assetFetch(o: AssetFetchOptions = {}): FetchLike {
  const root = resolve(o.root ?? process.cwd());
  const dirs = (o.staticDirs ?? DEFAULT_STATIC_DIRS).map((d) => resolve(root, d));
  const read = (file: string) => (existsSync(file) && statSync(file).isFile() ? new Uint8Array(readFileSync(file)) : null);
  return async (url) => {
    if (/^(https?|data|blob):/i.test(url)) return fetch(url);
    if (url.startsWith('file:')) return response(read(fileURLToPath(url)));
    const path = decodeURIComponent(url.split(/[?#]/)[0]!).replace(/^\.?\/+/, '');
    const tries = [path, path.split('/').slice(1).join('/')].filter((p) => p && !p.split('/').includes('..'));
    for (const dir of dirs) for (const p of tries) {
      const bytes = read(join(dir, p));
      if (bytes) return response(bytes);
    }
    return response(null);
  };
}
