/**
 * Snapshot tools - browser_snapshot, browser_take_screenshot
 */

import { getGlobalContext } from '../electron/context';
import { captureSnapshot, takeScreenshot } from '../electron/snapshot';
import type { ToolDefinition } from './index';

export const snapshotTools: ToolDefinition[] = [
  {
    name: 'browser_snapshot',
    description:
      'Capture an accessibility snapshot of the current page. Returns a tree of elements with refs that can be used with interaction tools like browser_click and browser_type. IMPORTANT: Refs are invalidated when a new snapshot is taken.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: false, // Each snapshot generates new refs
    },
    handler: async () => {
      const ctx = getGlobalContext();
      const page = await ctx.getPage();
      const snapshot = await captureSnapshot(page);

      return {
        snapshotId: snapshot.snapshotId,
        title: snapshot.title,
        url: snapshot.url,
        content: snapshot.text,
      };
    },
  },
  {
    name: 'browser_take_screenshot',
    description:
      'Take a screenshot of the current page. Returns base64-encoded image data.',
    inputSchema: {
      type: 'object',
      properties: {
        fullPage: {
          type: 'boolean',
          description: 'Capture full scrollable page (default: false)',
        },
        type: {
          type: 'string',
          enum: ['png', 'jpeg'],
          description: 'Image format (default: png)',
        },
        quality: {
          type: 'number',
          description: 'JPEG quality 0-100 (only for jpeg, default: 80)',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    handler: async (args) => {
      const { fullPage, type, quality } = args as {
        fullPage?: boolean;
        type?: 'png' | 'jpeg';
        quality?: number;
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();

      const buffer = await takeScreenshot(page, { fullPage, type, quality });

      return {
        format: type || 'png',
        data: buffer.toString('base64'),
      };
    },
  },
];
