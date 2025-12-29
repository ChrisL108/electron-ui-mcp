---
Question: Playwright Electron _electron.launch patterns for dev vs packaged builds. How to support Vite dev server or live reload?
---

# Playwright Electron testing patterns for Vite-based apps

Testing Electron applications with Playwright requires different configurations for development and production builds. **The key distinction is whether your main process loads renderer content from a Vite dev server URL (development) or bundled files (production)**—and Playwright's `_electron.launch()` must be configured accordingly. Modern tooling like electron-vite and vite-plugin-electron expose environment variables that make conditional configuration straightforward.

## The `_electron.launch()` API fundamentals

Playwright provides experimental Electron support through the `_electron` namespace, accessible via:

```typescript
import { _electron as electron } from '@playwright/test';
```

The `electron.launch()` method accepts configuration options that determine how the Electron process starts. **Two options are critical for dev/prod switching**:

- **`args`**: Array of arguments passed to Electron—typically your main script path (e.g., `['main.js']` or `['.']`)
- **`executablePath`**: Path to the Electron executable—omit for development (uses `node_modules/.bin/electron`), specify for packaged builds

Additional options include `cwd` (working directory), `env` (environment variables), `timeout` (launch timeout, default 30s), and context options like `recordVideo`, `colorScheme`, and `locale`.

## Configuring launch for Vite dev server integration

When using Vite-based Electron tooling, the main process conditionally loads content based on environment variables. Your test configuration must ensure these variables are set correctly.

**electron-vite** uses `ELECTRON_RENDERER_URL`:

```typescript
// In your Electron main process (how electron-vite handles it)
if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
  mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
} else {
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}
```

**vite-plugin-electron** uses `VITE_DEV_SERVER_URL`:

```typescript
// In your Electron main process
if (process.env.VITE_DEV_SERVER_URL) {
  win.loadURL(process.env.VITE_DEV_SERVER_URL);
} else {
  win.loadFile('dist/index.html');
}
```

For Playwright tests to work in development mode, the Vite dev server must be running and the appropriate environment variable passed through the launch configuration:

```typescript
const electronApp = await electron.launch({
  args: ['.'],
  env: {
    ...process.env,
    VITE_DEV_SERVER_URL: 'http://localhost:5173', // or ELECTRON_RENDERER_URL
  },
});
```

## HMR and live reload patterns during test development

Hot Module Replacement works automatically for the **renderer process** when loading from the Vite dev server URL—no special Playwright configuration required. The dev server handles module updates via WebSocket, and changes reflect immediately in the test window.

**Main process hot reloading** requires additional tooling since changes require an Electron restart. electron-vite supports this via CLI flag or config:

```bash
electron-vite dev --watch
```

**Preload script reloading** (vite-plugin-electron 0.29+) sends an IPC message when preload scripts rebuild. Handle this in your main process:

```typescript
process.on('message', (msg) => {
  if (msg === 'electron-vite&type=hot-reload') {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.reload();
    }
  }
});
```

For practical test development, run your dev server in a separate terminal and use `reuseExistingServer` in Playwright config to avoid server startup delays between test runs.

## Conditional launch configuration with TypeScript

The most robust pattern uses a custom fixture that detects the environment and configures launch options accordingly. This approach centralizes logic and makes tests environment-agnostic.

```typescript
// fixtures/electron.ts
import { test as base, _electron as electron, ElectronApplication, Page } from '@playwright/test';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';
import path from 'path';

type ElectronFixtures = {
  electronApp: ElectronApplication;
  appWindow: Page;
};

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const isProduction = process.env.TEST_MODE === 'production';
    
    let app: ElectronApplication;
    
    if (isProduction) {
      // Production: launch packaged build
      const latestBuild = findLatestBuild('dist'); // or 'out', 'release'
      const appInfo = parseElectronApp(latestBuild);
      
      app = await electron.launch({
        args: [appInfo.main],
        executablePath: appInfo.executable,
      });
    } else {
      // Development: launch with dev server
      app = await electron.launch({
        args: [path.join(__dirname, '../.')],
        env: {
          ...process.env,
          NODE_ENV: 'test',
          ELECTRON_RENDERER_URL: process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173',
        },
      });
    }
    
    await use(app);
    await app.close();
  },
  
  appWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await use(window);
  },
});

export { expect } from '@playwright/test';
```

Tests using this fixture remain identical regardless of environment:

```typescript
// tests/app.spec.ts
import { test, expect } from '../fixtures/electron';

test('app launches and displays main view', async ({ appWindow }) => {
  await expect(appWindow.locator('h1')).toContainText('Welcome');
});

test('verify environment', async ({ electronApp }) => {
  const isPackaged = await electronApp.evaluate(({ app }) => app.isPackaged);
  // isPackaged is false in dev, true in production builds
  console.log(`Running against ${isPackaged ? 'packaged' : 'development'} build`);
});
```

## Detecting dev vs production mode

Multiple detection methods exist, each suited to different scenarios:

**Using `app.isPackaged` (runtime detection)**—the most reliable method for determining build type from within Electron:

```typescript
const isPackaged = await electronApp.evaluate(async ({ app }) => {
  return app.isPackaged;
});
```

**Environment variable patterns** for test configuration:

```typescript
// Common patterns across projects
const isDev = process.env.NODE_ENV !== 'production';
const isDev = !!process.env.VITE_DEV_SERVER_URL;
const isDev = !!process.env.ELECTRON_RENDERER_URL;
const isCI = process.env.CI === 'true' || process.env.CI === '1';
```

**Vite's built-in mode detection** (in renderer process):

```typescript
import.meta.env.DEV   // true in development
import.meta.env.PROD  // true in production
import.meta.env.MODE  // 'development' or 'production'
```

## Complete playwright.config.ts with dev server support

This configuration demonstrates conditional setup for both development and production testing:

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

// Load environment-specific config
const testEnv = process.env.TEST_ENV || 'dev';
dotenv.config({ path: path.resolve(__dirname, `.env.${testEnv}`) });

const isDevMode = testEnv === 'dev';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  
  fullyParallel: false, // Electron tests often need serialization
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker recommended for Electron
  
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  // Start Vite dev server for development testing
  ...(isDevMode && {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  }),

  use: {
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'electron-dev',
      testMatch: '**/*.e2e.ts',
      use: {
        // Custom options passed to fixtures
      },
      metadata: {
        testMode: 'development',
        devServerUrl: 'http://localhost:5173',
      },
    },
    {
      name: 'electron-prod',
      testMatch: '**/*.e2e.ts',
      use: {},
      metadata: {
        testMode: 'production',
        buildDir: './dist',
      },
    },
  ],
});
```

Run specific projects with:

```bash
# Development testing (requires dev server)
npx playwright test --project=electron-dev

# Production testing (requires built app)
npm run build && npx playwright test --project=electron-prod
```

## The electron-playwright-helpers library

The **electron-playwright-helpers** package (maintained by SpaceAge TV) provides battle-tested utilities for packaged app testing:

```typescript
import { 
  findLatestBuild, 
  parseElectronApp,
  clickMenuItemById,
  retry,
  retryUntilTruthy 
} from 'electron-playwright-helpers';

// Find most recent build in output directory
const latestBuild = findLatestBuild('out');

// Parse the Electron app structure
const appInfo = parseElectronApp(latestBuild);
// Returns: { executable, main, name, resourcesDir, asar, platform, arch, packageJson }

// Handle context stability issues in Electron 27+
const appName = await retry(() => 
  electronApp.evaluate(({ app }) => app.getName())
);
```

**Key functions include**: `findLatestBuild()` for locating packaged builds across platforms, `parseElectronApp()` for extracting paths from app bundles, and `retry()`/`retryUntilTruthy()` for handling flaky evaluate calls in newer Electron versions.

## Advanced fixture with full conditional logic

This comprehensive fixture handles all scenarios including CI-specific security adjustments:

```typescript
// fixtures/electronApp.fixture.ts
import { test as base, _electron as electron, ElectronApplication } from '@playwright/test';
import { findLatestBuild, parseElectronApp } from 'electron-playwright-helpers';
import path from 'path';

interface ElectronTestConfig {
  mode: 'development' | 'production';
  devServerUrl?: string;
  buildDir?: string;
  timeout?: number;
}

const getConfig = (): ElectronTestConfig => {
  const mode = process.env.TEST_MODE === 'production' ? 'production' : 'development';
  
  return {
    mode,
    devServerUrl: process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173',
    buildDir: process.env.BUILD_DIR || 'dist',
    timeout: parseInt(process.env.LAUNCH_TIMEOUT || '30000'),
  };
};

export const test = base.extend<{ electronApp: ElectronApplication }>({
  electronApp: async ({}, use, testInfo) => {
    const config = getConfig();
    
    let launchOptions: Parameters<typeof electron.launch>[0];
    
    if (config.mode === 'production') {
      const latestBuild = findLatestBuild(config.buildDir);
      const appInfo = parseElectronApp(latestBuild);
      
      launchOptions = {
        args: [appInfo.main],
        executablePath: appInfo.executable,
        timeout: config.timeout,
        recordVideo: { dir: path.join(testInfo.outputDir, 'videos') },
      };
    } else {
      launchOptions = {
        args: ['.'],
        cwd: path.resolve(__dirname, '..'),
        timeout: config.timeout,
        env: {
          ...process.env,
          NODE_ENV: 'test',
          ELECTRON_RENDERER_URL: config.devServerUrl,
          // CI-specific: enable nodeIntegration for easier testing
          CI: process.env.CI || '0',
        },
        recordVideo: { dir: path.join(testInfo.outputDir, 'videos') },
      };
    }
    
    const app = await electron.launch(launchOptions);
    
    // Wait for app to be ready
    await app.evaluate(async ({ app }) => {
      await app.whenReady();
    });
    
    await use(app);
    await app.close();
  },
});

export { expect } from '@playwright/test';
```

## Conclusion

The core pattern for Playwright Electron testing with Vite involves three elements: **environment detection** (via `TEST_MODE`, `NODE_ENV`, or `app.isPackaged`), **conditional launch configuration** (setting `args` and `executablePath` based on mode), and **dev server integration** (passing `VITE_DEV_SERVER_URL` or `ELECTRON_RENDERER_URL` through the `env` option). 

Custom fixtures provide the cleanest abstraction, hiding environment complexity from individual tests. For production testing, `electron-playwright-helpers` simplifies finding and parsing packaged builds across platforms. Keep workers set to 1 for Electron tests to avoid conflicts, and leverage Playwright's `webServer` option to automatically start your Vite dev server during development testing.