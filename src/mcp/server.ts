/**
 * The MCP server: every operation in `src/node/operations.ts` as an MCP tool, over
 * stdio. Same names, same zod input schemas, same JSON envelopes as the CLI.
 *
 * Start it with `npx sigilsmith mcp` (from the host project's directory, or pass
 * `--cwd`). Register it in an agent, e.g. `claude mcp add sigilsmith -- npx sigilsmith mcp`.
 * Needs `@modelcontextprotocol/sdk` installed (an optional peer).
 *
 * `preview` also returns the contact sheet as an image, so a multimodal agent can
 * look at it without opening a file.
 */
import { existsSync, readFileSync } from 'node:fs';
import { PKG_NAME } from '../meta.js';
import { packageVersion } from '../node/build.js';
import { OPERATIONS, runOperation } from '../node/operations.js';

export async function startMcpServer(opts: { cwd?: string } = {}): Promise<void> {
  let sdk: { McpServer: any; StdioServerTransport: any };
  try {
    const [{ McpServer }, { StdioServerTransport }] = await Promise.all([import('@modelcontextprotocol/sdk/server/mcp.js'), import('@modelcontextprotocol/sdk/server/stdio.js')]);
    sdk = { McpServer, StdioServerTransport };
  } catch {
    throw new Error('the MCP server needs @modelcontextprotocol/sdk: `npm i -D @modelcontextprotocol/sdk@^1.32`');
  }
  const cwd = opts.cwd ?? process.cwd();
  const server = new sdk.McpServer({ name: PKG_NAME, version: packageVersion() });
  for (const op of OPERATIONS) {
    server.registerTool(op.name, { title: op.title, description: op.description, inputSchema: op.input, annotations: op.annotations }, async (args: unknown) => {
      const env = await runOperation(op.name, args, { cwd });
      const content: Array<Record<string, unknown>> = [{ type: 'text', text: JSON.stringify(env, null, 2) }];
      const png = (env.data as { files?: { png?: string } } | null)?.files?.png;
      if (op.name === 'preview' && png && existsSync(png)) content.push({ type: 'image', mimeType: 'image/png', data: readFileSync(png).toString('base64') });
      return { content, isError: !env.ok };
    });
  }
  await server.connect(new sdk.StdioServerTransport());
}
