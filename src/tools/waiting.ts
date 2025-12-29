/**
 * Waiting tools - browser_wait_for, browser_handle_dialog
 */

import { getGlobalContext } from '../electron/context';
import { refManager } from '../utils/refs';
import { TimeoutError } from '../utils/errors';
import type { ToolDefinition } from './index';

export const waitingTools: ToolDefinition[] = [
  {
    name: 'browser_wait_for',
    description:
      'Wait for a condition to be met. Can wait for text, element visibility, URL change, or a specific timeout.',
    inputSchema: {
      type: 'object',
      properties: {
        text: {
          type: 'string',
          description: 'Wait for this text to appear on the page',
        },
        ref: {
          type: 'string',
          description: 'Wait for element with this ref to be visible',
        },
        selector: {
          type: 'string',
          description: 'Wait for element matching CSS selector to be visible',
        },
        url: {
          type: 'string',
          description: 'Wait for URL to match (exact match or regex pattern)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout in milliseconds (default: 30000)',
        },
        state: {
          type: 'string',
          enum: ['visible', 'hidden', 'attached', 'detached'],
          description: 'Element state to wait for (default: visible)',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    handler: async (args) => {
      const { text, ref, selector, url, timeout = 30000, state = 'visible' } = args as {
        text?: string;
        ref?: string;
        selector?: string;
        url?: string;
        timeout?: number;
        state?: 'visible' | 'hidden' | 'attached' | 'detached';
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();

      try {
        if (text) {
          await page.waitForSelector(`text=${text}`, { timeout, state });
          return { success: true, waited: 'text', value: text };
        }

        if (ref) {
          const locator = refManager.resolveToLocator(page, ref);
          await locator.waitFor({ timeout, state });
          return { success: true, waited: 'ref', value: ref };
        }

        if (selector) {
          await page.waitForSelector(selector, { timeout, state });
          return { success: true, waited: 'selector', value: selector };
        }

        if (url) {
          await page.waitForURL(url, { timeout });
          return { success: true, waited: 'url', value: url };
        }

        // If no condition specified, just wait for the timeout
        await page.waitForTimeout(timeout);
        return { success: true, waited: 'timeout', value: timeout };
      } catch (error) {
        if (error instanceof Error && error.message.includes('Timeout')) {
          throw new TimeoutError(
            text ? `text "${text}"` : ref ? `ref "${ref}"` : selector || url || 'condition',
            timeout
          );
        }
        throw error;
      }
    },
  },
  {
    name: 'browser_handle_dialog',
    description:
      'Handle a JavaScript dialog (alert, confirm, prompt, beforeunload). Set up before triggering actions that might show dialogs.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['accept', 'dismiss'],
          description: 'Whether to accept or dismiss the dialog',
        },
        promptText: {
          type: 'string',
          description: 'Text to enter in prompt dialogs (only for accept)',
        },
        timeout: {
          type: 'number',
          description: 'Timeout to wait for dialog in milliseconds (default: 5000)',
        },
      },
      required: ['action'],
    },
    annotations: {
      destructiveHint: false,
    },
    handler: async (args) => {
      const { action, promptText, timeout = 5000 } = args as {
        action: 'accept' | 'dismiss';
        promptText?: string;
        timeout?: number;
      };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();

      // Set up dialog handler for the next dialog
      const dialogPromise = page.waitForEvent('dialog', { timeout });

      try {
        const dialog = await dialogPromise;

        const dialogInfo = {
          type: dialog.type(),
          message: dialog.message(),
          defaultValue: dialog.defaultValue(),
        };

        if (action === 'accept') {
          await dialog.accept(promptText);
        } else {
          await dialog.dismiss();
        }

        ctx.clearPendingDialogs();

        return {
          success: true,
          action,
          dialog: dialogInfo,
        };
      } catch (error) {
        // Check if there are pending dialogs in context
        const pending = ctx.getPendingDialogs();
        if (pending.length > 0) {
          return {
            success: false,
            error: 'Dialog already appeared but was not captured',
            pendingDialogs: pending,
          };
        }

        return {
          success: false,
          error: 'No dialog appeared within timeout',
          suggestion: 'Ensure the dialog-triggering action was performed',
        };
      }
    },
  },
];
