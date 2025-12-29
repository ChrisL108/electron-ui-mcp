/**
 * Window management tools - browser_tabs, browser_resize, browser_close
 */

import { getGlobalContext } from '../electron/context';
import type { ToolDefinition } from './index';

export const windowTools: ToolDefinition[] = [
  {
    name: 'browser_tabs',
    description:
      'List all open windows in the Electron app or switch to a specific window.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['list', 'select'],
          description: 'Action to perform (default: list)',
        },
        index: {
          type: 'number',
          description: 'Window index to select (for select action)',
        },
        title: {
          type: 'string',
          description: 'Window title to select (for select action, partial match)',
        },
      },
    },
    annotations: {
      readOnlyHint: false,
      idempotentHint: true,
    },
    handler: async (args) => {
      const { action = 'list', index, title } = args as {
        action?: 'list' | 'select';
        index?: number;
        title?: string;
      };

      const ctx = getGlobalContext();

      if (action === 'list') {
        const windows = await ctx.getWindows();
        return {
          windows,
          activeIndex: windows.findIndex((w) => !w.isClosed),
        };
      }

      if (action === 'select') {
        await ctx.selectWindow({ index, title });
        const page = await ctx.getPage();
        return {
          success: true,
          selectedWindow: {
            title: await page.title(),
            url: page.url(),
          },
        };
      }

      return { error: 'Unknown action' };
    },
  },
  {
    name: 'browser_resize',
    description: 'Resize the current window.',
    inputSchema: {
      type: 'object',
      properties: {
        width: {
          type: 'number',
          description: 'Window width in pixels',
        },
        height: {
          type: 'number',
          description: 'Window height in pixels',
        },
        maximize: {
          type: 'boolean',
          description: 'Maximize the window (ignores width/height)',
        },
        minimize: {
          type: 'boolean',
          description: 'Minimize the window',
        },
        fullscreen: {
          type: 'boolean',
          description: 'Enter or exit fullscreen',
        },
      },
    },
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
    },
    handler: async (args) => {
      const { width, height, maximize, minimize, fullscreen } = args as {
        width?: number;
        height?: number;
        maximize?: boolean;
        minimize?: boolean;
        fullscreen?: boolean;
      };

      const ctx = getGlobalContext();
      const browserWindow = await ctx.getBrowserWindow();

      if (maximize) {
        await browserWindow.evaluate((bw) => bw.maximize());
        return { success: true, action: 'maximized' };
      }

      if (minimize) {
        await browserWindow.evaluate((bw) => bw.minimize());
        return { success: true, action: 'minimized' };
      }

      if (fullscreen !== undefined) {
        await browserWindow.evaluate((bw, fs) => bw.setFullScreen(fs), fullscreen);
        return { success: true, action: fullscreen ? 'fullscreen' : 'windowed' };
      }

      if (width !== undefined && height !== undefined) {
        await browserWindow.evaluate(
          (bw, size) => bw.setSize(size.width, size.height),
          { width, height }
        );
        return { success: true, width, height };
      }

      // Return current size
      const bounds = await browserWindow.evaluate((bw) => bw.getBounds());
      return {
        currentSize: bounds,
        suggestion: 'Specify width and height, or use maximize/minimize/fullscreen',
      };
    },
  },
  {
    name: 'browser_close',
    description:
      'Close the Electron application. The app will be relaunched on the next tool call.',
    inputSchema: {
      type: 'object',
      properties: {
        force: {
          type: 'boolean',
          description: 'Force close without waiting for cleanup (default: false)',
        },
      },
    },
    annotations: {
      destructiveHint: true,
    },
    handler: async (args) => {
      const { force } = args as { force?: boolean };

      const ctx = getGlobalContext();

      if (force) {
        await ctx.close();
      } else {
        // Try graceful close first
        try {
          const app = await ctx.getApp();
          await app.evaluate(({ app }) => app.quit());
        } catch {
          // Fall back to force close
          await ctx.close();
        }
      }

      return { success: true, message: 'Application closed' };
    },
  },
  {
    name: 'browser_console_messages',
    description: 'Get console messages from the renderer process.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of messages to return (default: 50)',
        },
        type: {
          type: 'string',
          enum: ['log', 'error', 'warning', 'info', 'debug'],
          description: 'Filter by message type',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    handler: async (args) => {
      const { limit = 50, type } = args as {
        limit?: number;
        type?: string;
      };

      const ctx = getGlobalContext();
      await ctx.ensureReady();

      let messages = ctx.getConsoleMessages(limit);

      if (type) {
        messages = messages.filter((m) => m.type === type);
      }

      return {
        messages,
        count: messages.length,
      };
    },
  },
  {
    name: 'browser_network_requests',
    description: 'Get recent network requests from the page.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of requests to return (default: 50)',
        },
        urlPattern: {
          type: 'string',
          description: 'Filter requests by URL pattern (regex)',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    handler: async (args) => {
      const { limit = 50, urlPattern } = args as {
        limit?: number;
        urlPattern?: string;
      };

      const ctx = getGlobalContext();
      await ctx.ensureReady();

      let requests = ctx.getNetworkRequests(limit);

      if (urlPattern) {
        const regex = new RegExp(urlPattern);
        requests = requests.filter((r) => regex.test(r.url));
      }

      return {
        requests,
        count: requests.length,
      };
    },
  },
];
