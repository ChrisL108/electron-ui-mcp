/**
 * Navigation tools - browser_navigate, browser_navigate_back
 */

import { getGlobalContext } from '../electron/context';
import type { ToolDefinition } from './index';

export const navigationTools: ToolDefinition[] = [
  {
    name: 'browser_navigate',
    description:
      'Navigate to a URL in the current window. For Electron apps, this can be a file:// URL, app:// protocol, or http(s):// URL if the app supports it.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'URL to navigate to',
        },
        waitUntil: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle', 'commit'],
          description: 'When to consider navigation complete (default: domcontentloaded)',
        },
      },
      required: ['url'],
    },
    annotations: {
      destructiveHint: false,
      idempotentHint: true,
    },
    handler: async (args) => {
      const { url, waitUntil = 'domcontentloaded' } = args as {
        url: string;
        waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();

      await page.goto(url, {
        waitUntil,
        timeout: 30000,
      });

      return {
        success: true,
        url: page.url(),
        title: await page.title(),
      };
    },
  },
  {
    name: 'browser_navigate_back',
    description: 'Navigate back in the browser history.',
    inputSchema: {
      type: 'object',
      properties: {
        waitUntil: {
          type: 'string',
          enum: ['load', 'domcontentloaded', 'networkidle', 'commit'],
          description: 'When to consider navigation complete (default: domcontentloaded)',
        },
      },
    },
    annotations: {
      destructiveHint: false,
      idempotentHint: false,
    },
    handler: async (args) => {
      const { waitUntil = 'domcontentloaded' } = args as {
        waitUntil?: 'load' | 'domcontentloaded' | 'networkidle' | 'commit';
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();

      await page.goBack({
        waitUntil,
        timeout: 30000,
      });

      return {
        success: true,
        url: page.url(),
        title: await page.title(),
      };
    },
  },
];
