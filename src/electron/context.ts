/**
 * ElectronContext - Lifecycle manager with lazy initialization
 *
 * Every tool handler calls ensureReady() first, which:
 * - Launches the Electron app if not already running
 * - Coalesces concurrent calls to share the same launch promise
 * - Tracks state: idle -> launching -> ready (or error/closed)
 */

import { _electron as electron, ElectronApplication, Page } from 'playwright';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Config, resolveAppPath } from '../config';
import { AppNotReadyError, LaunchError, NoWindowError } from '../utils/errors';
import { refManager } from '../utils/refs';

export type ContextState = 'idle' | 'launching' | 'ready' | 'error' | 'closed';

export interface WindowInfo {
  index: number;
  title: string;
  url: string;
  isClosed: boolean;
}

interface DialogInfo {
  type: string;
  message: string;
  defaultValue?: string;
  timestamp: number;
}

export class ElectronContext {
  private state: ContextState = 'idle';
  private launchPromise: Promise<void> | null = null;
  private app: ElectronApplication | null = null;
  private currentPage: Page | null = null;
  private config: Config;
  private tempUserDataDir: string | null = null;
  private pendingDialogs: DialogInfo[] = [];
  private consoleMessages: Array<{ type: string; text: string; timestamp: number }> = [];
  private networkRequests: Array<{
    url: string;
    method: string;
    status?: number;
    timestamp: number;
  }> = [];

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Get current state
   */
  getState(): ContextState {
    return this.state;
  }

  /**
   * Ensure the app is ready, launching if necessary
   */
  async ensureReady(): Promise<void> {
    if (this.state === 'ready' && this.app && !this.isAppClosed()) {
      return;
    }

    if (this.state === 'launching' && this.launchPromise) {
      // Coalesce concurrent calls
      await this.launchPromise;
      return;
    }

    // Reset if we were in error/closed state
    if (this.state === 'error' || this.state === 'closed') {
      this.reset();
    }

    this.state = 'launching';
    this.launchPromise = this.launch();

    try {
      await this.launchPromise;
      this.state = 'ready';
    } catch (error) {
      this.state = 'error';
      throw error;
    } finally {
      this.launchPromise = null;
    }
  }

  /**
   * Launch the Electron app
   */
  private async launch(): Promise<void> {
    const appPath = resolveAppPath(this.config);

    // Create temp userData if isolated mode
    if (this.config.isolated && !this.config.userDataDir) {
      this.tempUserDataDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'electron-ui-mcp-')
      );
    }

    // Build environment - filter out undefined values
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    Object.assign(env, this.config.env);

    // Set E2E mode
    if (this.config.e2e) {
      env.E2E = '1';
    }

    // Set userData path
    const userDataDir = this.config.userDataDir || this.tempUserDataDir;
    if (userDataDir) {
      env.E2E_USER_DATA_DIR = userDataDir;
      env.ELECTRON_USER_DATA_DIR = userDataDir;
    }

    // Set renderer URL for dev mode
    if (this.config.rendererUrl) {
      env.MAIN_WINDOW_VITE_DEV_SERVER_URL = this.config.rendererUrl;
      env.ELECTRON_RENDERER_URL = this.config.rendererUrl;
      env.VITE_DEV_SERVER_URL = this.config.rendererUrl;
    }

    // Build launch args
    const args: string[] = [];

    if (this.config.mode === 'dev') {
      args.push(appPath);
    }

    args.push(...this.config.electronArgs);

    try {
      const launchOptions: Parameters<typeof electron.launch>[0] = {
        args,
        env,
        timeout: this.config.timeout,
      };

      // For packaged apps, use executablePath
      if (this.config.mode === 'packaged') {
        launchOptions.executablePath = appPath;
        launchOptions.args = this.config.electronArgs;
      }

      // Set cwd if specified
      if (this.config.cwd) {
        launchOptions.cwd = this.config.cwd;
      }

      this.app = await electron.launch(launchOptions);

      // Set up event handlers
      this.setupEventHandlers();

      // Wait for first window
      this.currentPage = await this.app.firstWindow();
      await this.currentPage.waitForLoadState('domcontentloaded');

      // Set up page handlers
      this.setupPageHandlers(this.currentPage);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new LaunchError(message, appPath);
    }
  }

  /**
   * Set up event handlers for the app
   */
  private setupEventHandlers(): void {
    if (!this.app) return;

    this.app.on('close', () => {
      this.state = 'closed';
      this.currentPage = null;
      refManager.clear();
    });
  }

  /**
   * Set up event handlers for a page
   */
  private setupPageHandlers(page: Page): void {
    // Dialog handling
    page.on('dialog', async (dialog) => {
      this.pendingDialogs.push({
        type: dialog.type(),
        message: dialog.message(),
        defaultValue: dialog.defaultValue(),
        timestamp: Date.now(),
      });
    });

    // Console message collection
    page.on('console', (msg) => {
      this.consoleMessages.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
      // Keep only last 100 messages
      if (this.consoleMessages.length > 100) {
        this.consoleMessages.shift();
      }
    });

    // Network request collection
    page.on('request', (request) => {
      this.networkRequests.push({
        url: request.url(),
        method: request.method(),
        timestamp: Date.now(),
      });
      // Keep only last 100 requests
      if (this.networkRequests.length > 100) {
        this.networkRequests.shift();
      }
    });

    page.on('response', (response) => {
      const req = this.networkRequests.find(
        (r) => r.url === response.url() && !r.status
      );
      if (req) {
        req.status = response.status();
      }
    });

    // Handle page close
    page.on('close', () => {
      if (this.currentPage === page) {
        this.currentPage = null;
      }
    });
  }

  /**
   * Check if app has been closed
   */
  private isAppClosed(): boolean {
    // Try to access windows - if it throws, the app is closed
    try {
      this.app?.windows();
      return false;
    } catch {
      return true;
    }
  }

  /**
   * Get the current page, throwing if none available
   */
  async getPage(): Promise<Page> {
    await this.ensureReady();

    if (!this.currentPage || this.currentPage.isClosed()) {
      // Try to get another window
      const windows = this.app?.windows() ?? [];
      for (const win of windows) {
        if (!win.isClosed()) {
          this.currentPage = win;
          this.setupPageHandlers(win);
          return win;
        }
      }
      throw new NoWindowError();
    }

    return this.currentPage;
  }

  /**
   * Get the Electron app
   */
  async getApp(): Promise<ElectronApplication> {
    await this.ensureReady();

    if (!this.app) {
      throw new AppNotReadyError();
    }

    return this.app;
  }

  /**
   * Get browser window handle for current page
   */
  async getBrowserWindow(): Promise<ReturnType<ElectronApplication['browserWindow']>> {
    const app = await this.getApp();
    const page = await this.getPage();
    return app.browserWindow(page);
  }

  /**
   * Get all windows
   */
  async getWindows(): Promise<WindowInfo[]> {
    await this.ensureReady();

    const windows = this.app?.windows() ?? [];
    const result: WindowInfo[] = [];

    for (let i = 0; i < windows.length; i++) {
      const win = windows[i];
      result.push({
        index: i,
        title: await win.title().catch(() => ''),
        url: win.url(),
        isClosed: win.isClosed(),
      });
    }

    return result;
  }

  /**
   * Select a window by index or title
   */
  async selectWindow(selector: { index?: number; title?: string }): Promise<void> {
    await this.ensureReady();

    const windows = this.app?.windows() ?? [];

    if (selector.index !== undefined) {
      if (selector.index < 0 || selector.index >= windows.length) {
        throw new Error(`Window index ${selector.index} out of range (0-${windows.length - 1})`);
      }
      this.currentPage = windows[selector.index];
      this.setupPageHandlers(this.currentPage);
      return;
    }

    if (selector.title) {
      for (const win of windows) {
        const title = await win.title().catch(() => '');
        if (title === selector.title || title.includes(selector.title)) {
          this.currentPage = win;
          this.setupPageHandlers(win);
          return;
        }
      }
      throw new Error(`No window found with title matching: ${selector.title}`);
    }

    throw new Error('Must specify either index or title to select window');
  }

  /**
   * Get pending dialogs
   */
  getPendingDialogs(): DialogInfo[] {
    return [...this.pendingDialogs];
  }

  /**
   * Clear pending dialogs
   */
  clearPendingDialogs(): void {
    this.pendingDialogs = [];
  }

  /**
   * Get console messages
   */
  getConsoleMessages(limit = 50): Array<{ type: string; text: string; timestamp: number }> {
    return this.consoleMessages.slice(-limit);
  }

  /**
   * Get network requests
   */
  getNetworkRequests(
    limit = 50
  ): Array<{ url: string; method: string; status?: number; timestamp: number }> {
    return this.networkRequests.slice(-limit);
  }

  /**
   * Close the app
   */
  async close(): Promise<void> {
    if (this.app) {
      try {
        await this.app.close();
      } catch {
        // Ignore close errors
      }
    }

    // Clean up temp userData
    if (this.tempUserDataDir) {
      try {
        await fs.promises.rm(this.tempUserDataDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }

    this.reset();
  }

  /**
   * Reset state
   */
  private reset(): void {
    this.app = null;
    this.currentPage = null;
    this.state = 'idle';
    this.launchPromise = null;
    this.pendingDialogs = [];
    this.consoleMessages = [];
    this.networkRequests = [];
    refManager.clear();
  }

}

// Global context instance (set by server initialization)
let globalContext: ElectronContext | null = null;

export function setGlobalContext(context: ElectronContext): void {
  globalContext = context;
}

export function getGlobalContext(): ElectronContext {
  if (!globalContext) {
    throw new Error('ElectronContext not initialized. Start the MCP server first.');
  }
  return globalContext;
}
