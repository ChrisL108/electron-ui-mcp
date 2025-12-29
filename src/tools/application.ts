/**
 * Application tools - electron_app_info
 */

import { getGlobalContext } from '../electron/context';
import type { ToolDefinition } from './index';

export const applicationTools: ToolDefinition[] = [
  {
    name: 'electron_app_info',
    description:
      'Get information about the Electron application including name, version, paths, and window state.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
      idempotentHint: true,
    },
    handler: async () => {
      const ctx = getGlobalContext();
      const app = await ctx.getApp();

      const appInfo = await app.evaluate(async ({ app }) => {
        return {
          name: app.getName(),
          version: app.getVersion(),
          electronVersion: process.versions.electron,
          nodeVersion: process.versions.node,
          chromeVersion: process.versions.chrome,
          isPackaged: app.isPackaged,
          locale: app.getLocale(),
          paths: {
            appPath: app.getAppPath(),
            userData: app.getPath('userData'),
            temp: app.getPath('temp'),
            logs: app.getPath('logs'),
          },
        };
      });

      // Get window info
      const windows = await ctx.getWindows();
      const currentPage = await ctx.getPage();
      const currentTitle = await currentPage.title();

      return {
        app: appInfo,
        windows: {
          count: windows.length,
          list: windows,
          current: {
            title: currentTitle,
            url: currentPage.url(),
          },
        },
        state: ctx.getState(),
      };
    },
  },
];
