/**
 * Evaluation tools - browser_evaluate, electron_evaluate_main
 */

import { getGlobalContext } from '../electron/context';
import { EvaluationError } from '../utils/errors';
import type { ToolDefinition } from './index';

export const evaluationTools: ToolDefinition[] = [
  {
    name: 'browser_evaluate',
    description:
      'Execute JavaScript in the renderer (browser) context. The code runs in the page and has access to the DOM and window object. Returns the result of the expression.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'JavaScript code to execute. Can be an expression or function body. For async operations, use async/await.',
        },
      },
      required: ['code'],
    },
    annotations: {
      destructiveHint: false,
    },
    handler: async (args) => {
      const { code } = args as { code: string };

      const ctx = getGlobalContext();
      const page = await ctx.getPage();

      try {
        // Wrap code in an async IIFE to support await
        const wrappedCode = `
          (async () => {
            ${code}
          })()
        `;

        const result = await page.evaluate(wrappedCode);

        return {
          success: true,
          result: result !== undefined ? result : null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new EvaluationError(message, false);
      }
    },
  },
  {
    name: 'electron_evaluate_main',
    description:
      'Execute JavaScript in the Electron main process. Has access to Electron APIs like app, BrowserWindow, dialog, etc. Use this for main process operations like showing native dialogs or accessing system APIs.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'JavaScript code to execute in main process. The code receives destructured Electron modules: { app, BrowserWindow, dialog, shell, clipboard, etc. }',
        },
      },
      required: ['code'],
    },
    annotations: {
      destructiveHint: true, // Main process access can be destructive
    },
    handler: async (args) => {
      const { code } = args as { code: string };

      const ctx = getGlobalContext();
      const app = await ctx.getApp();

      try {
        // The evaluate function receives Electron modules
        const result = await app.evaluate(
          // eslint-disable-next-line @typescript-eslint/no-implied-eval
          new Function(
            '{ app, BrowserWindow, dialog, shell, clipboard, nativeTheme, screen, session }',
            `return (async () => { ${code} })()`
          ) as Parameters<typeof app.evaluate>[0]
        );

        return {
          success: true,
          result: result !== undefined ? result : null,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new EvaluationError(message, true);
      }
    },
  },
];
