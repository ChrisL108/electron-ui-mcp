/**
 * electron-ui-mcp - Electron UI automation MCP server
 *
 * Provides Playwright-style automation primitives for Electron apps via MCP.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { Config, resolveConfig, CliOptions } from './config';
import { ElectronContext, setGlobalContext, getGlobalContext } from './electron/context';
import { getAllTools, ToolDefinition } from './tools';
import { formatError } from './utils/errors';

export { Config, resolveConfig, CliOptions } from './config';
export { ElectronContext, setGlobalContext, getGlobalContext } from './electron/context';
export { getAllTools, ToolDefinition } from './tools';
export * from './utils/errors';
export * from './utils/refs';

/**
 * Create and configure the MCP server
 */
export function createServer(config: Config): Server {
  // Initialize the global context
  const context = new ElectronContext(config);
  setGlobalContext(context);

  // Create MCP server
  const server = new Server(
    {
      name: 'electron-ui-mcp',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Get all tools
  const tools = getAllTools();
  const toolMap = new Map<string, ToolDefinition>();
  for (const tool of tools) {
    toolMap.set(tool.name, tool);
  }

  // Handle list tools request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
      })),
    };
  });

  // Handle call tool request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    const tool = toolMap.get(name);
    if (!tool) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Unknown tool: ${name}`,
              suggestion: `Available tools: ${Array.from(toolMap.keys()).join(', ')}`,
            }),
          },
        ],
        isError: true,
      };
    }

    try {
      const result = await tool.handler(args || {});

      // Handle screenshot results specially (include image)
      if (name === 'browser_take_screenshot' && result && typeof result === 'object') {
        const screenshotResult = result as { format: string; data: string };
        return {
          content: [
            {
              type: 'image',
              data: screenshotResult.data,
              mimeType: screenshotResult.format === 'jpeg' ? 'image/jpeg' : 'image/png',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const formatted = formatError(error);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(formatted, null, 2),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Run the MCP server with stdio transport
 */
export async function runServer(config: Config): Promise<void> {
  const server = createServer(config);
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    try {
      const ctx = getGlobalContext();
      await ctx.close();
    } catch {
      // Ignore errors during shutdown
    }
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    try {
      const ctx = getGlobalContext();
      await ctx.close();
    } catch {
      // Ignore errors during shutdown
    }
    process.exit(0);
  });

  await server.connect(transport);
}

/**
 * Main entry point for programmatic use
 */
export async function main(cliOptions: CliOptions = {}): Promise<void> {
  const config = resolveConfig(cliOptions);
  await runServer(config);
}
