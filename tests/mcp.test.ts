/**
 * The MCP surface: a real MCP client talks to `sigilsmith mcp` over stdio. The tools
 * are the same operations the CLI runs (one registry), so this checks the wiring, the
 * schemas and the envelope, not the logic again.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPERATIONS } from '../src/node/operations.js';
import { BASIC, makeProject } from './project.js';

const CLI = new URL('../dist/cli/main.js', import.meta.url).pathname;

describe('MCP server', () => {
  let client: Client;
  let dir: string;
  beforeAll(async () => {
    dir = makeProject(BASIC);
    client = new Client({ name: 'test', version: '0' });
    await client.connect(new StdioClientTransport({ command: 'node', args: [CLI, 'mcp', '--cwd', dir] }));
  }, 20000);
  afterAll(async () => client?.close());

  it('exposes every operation as a tool, with annotations', async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(OPERATIONS.map((o) => o.name).sort());
    expect(tools.find((t) => t.name === 'check')!.annotations).toMatchObject({ readOnlyHint: true });
    expect(tools.find((t) => t.name === 'catalog')!.inputSchema.properties).toHaveProperty('maxGzip');
  });

  it('build then check returns the same envelope as the CLI', async () => {
    const built = await client.callTool({ name: 'build', arguments: {} });
    expect(built.isError).toBe(false);
    const checked = await client.callTool({ name: 'check', arguments: { only: ['fresh', 'data', 'identity'] } });
    const env = JSON.parse((checked.content as Array<{ text: string }>)[0]!.text);
    expect(env).toMatchObject({ schema: 'sigilsmith.check/1', ok: true });
  }, 20000);

  it('rejects bad input with a schema error, and preview returns the sheet as an image', async () => {
    const bad = await client.callTool({ name: 'catalog', arguments: { style: ['baroque'] } });
    expect(bad.isError).toBe(true);
    const pv = await client.callTool({ name: 'preview', arguments: { generators: ['rings@1'] } });
    expect((pv.content as Array<{ type: string }>).map((c) => c.type)).toEqual(['text', 'image']);
  }, 60000);
});
