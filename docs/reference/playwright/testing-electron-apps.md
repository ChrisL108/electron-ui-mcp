# Running Playwright tests against Electron desktop applications

**Playwright provides first-class Electron testing support** through its `_electron` API, enabling full end-to-end testing of Electron apps including IPC communication, main process evaluation, and renderer UI automation. For your bun-app with Electron Forge + Vite, Playwright can launch the app, interact with React + assistant-ui chat interfaces, and verify Notion integration fields—all without authentication requirements.

The testing workflow involves launching your Electron app via `electron.launch()`, obtaining a Page object from `firstWindow()`, and using standard Playwright locators for UI interactions. For MCP integration with Claude Code or Codex CLI, the official `@playwright/mcp` server enables AI-assisted test automation, though Electron apps require launching via Playwright's Electron API rather than the standard browser MCP tools.

---

## Launching Electron apps with Playwright

The official API uses `_electron.launch()` to start your Electron application and return an `ElectronApplication` instance for test control:

```typescript
import { _electron as electron } from '@playwright/test';

const electronApp = await electron.launch({
  args: ['./dist/main.js'],           // Path to main process entry
  cwd: '/path/to/bun-app',            // Working directory
  env: { ...process.env, NODE_ENV: 'test' },
  timeout: 30000,                     // Startup timeout
  recordVideo: { dir: 'test-videos' } // Optional video capture
});

const window = await electronApp.firstWindow();
```

For Electron Forge apps, point `args` to your built main process file (typically `.vite/build/main.js` in dev mode or the packaged executable path). The `executablePath` option lets you specify a custom Electron binary location when testing packaged builds.

**Key launch options include** `args` (passed to Electron), `env` (environment variables), `cwd` (working directory), `timeout` (max startup wait), `recordVideo` and `recordHar` for artifact capture, and `colorScheme` for dark/light mode testing.

---

## Attaching to running Electron instances is not supported

**Playwright cannot attach to already-running Electron processes**—this is a documented limitation. Unlike browser testing where you can connect via CDP, Electron's integration requires initialization that only happens during `electron.launch()`.

Attempted workarounds using `chromium.connect_over_cdp()` fail with "Browser context management is not supported" errors. The recommended approach is to always launch fresh instances:

```typescript
// This does NOT work for Electron:
// browser = await chromium.connect_over_cdp('http://localhost:9222')

// Always use electron.launch() instead
const electronApp = await electron.launch({ args: ['main.js'] });
```

If you need to test against a running app for debugging, consider using Electron's DevTools directly or creating a test mode that launches your app with Playwright from the start.

---

## Playwright configuration for Electron Forge + Vite

Electron apps require a different configuration than browser testing—no `webServer` block, sequential test execution, and higher timeouts:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,                    // Higher timeout for app startup
  fullyParallel: false,              // Electron tests run sequentially
  workers: 1,                        // Single worker prevents conflicts
  retries: process.env.CI ? 2 : 0,
  reporter: [['html'], ['list']],
  
  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 15000,
  },
  
  projects: [{
    name: 'electron',
    testMatch: '**/*.spec.ts',
  }],
});
```

**For Electron Forge + Vite specifically**, test against the compiled `.vite/build/main.js` output rather than trying to integrate with `electron-forge start`:

```typescript
// Test helper for dev mode
async function launchElectronDev() {
  const electronApp = await electron.launch({
    args: [path.join(__dirname, '../../.vite/build/main.js')],
    env: { ...process.env, NODE_ENV: 'test' },
  });
  return electronApp;
}
```

For packaged builds, use the `electron-playwright-helpers` library which provides `findLatestBuild()` and `parseElectronApp()` to locate executables across platforms.

---

## Testing without authentication

Your bun-app's no-login architecture simplifies test setup—just launch and interact directly:

```typescript
test.describe.serial('App Tests', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    electronApp = await electron.launch({ args: ['./dist/main.js'] });
    page = await electronApp.firstWindow();
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await electronApp.close();
  });

  test('app loads without auth', async () => {
    await expect(page.getByRole('main')).toBeVisible();
  });
});
```

For state reset between tests, use Electron's main process evaluation to clear storage:

```typescript
test.beforeEach(async () => {
  await electronApp.evaluate(async ({ session }) => {
    await session.defaultSession.clearStorageData();
  });
  await page.reload();
});
```

---

## Accessing windows and interacting with UI elements

The `ElectronApplication` provides access to windows and main process, while each window is a standard Playwright `Page`:

```typescript
// Get the first window (your main BrowserWindow)
const page = await electronApp.firstWindow();

// Get all open windows
const windows = electronApp.windows();

// Access BrowserWindow handle for a page
const browserWindow = await electronApp.browserWindow(page);
const isVisible = await browserWindow.evaluate((bw) => bw.isVisible());

// Evaluate in main process
const appPath = await electronApp.evaluate(async ({ app }) => {
  return app.getAppPath();
});
```

**UI interactions use standard Playwright locators** which work with your React + assistant-ui components:

```typescript
// Click sidebar navigation
await page.getByRole('button', { name: /settings/i }).click();

// Fill chat input
await page.locator('[data-testid="chat-input"]').fill('Hello');

// Click send and wait for response
await page.getByRole('button', { name: /send/i }).click();
await expect(page.locator('.assistant-message').last()).toBeVisible();

// Verify settings fields
await expect(page.getByLabel('Notion API Key')).toBeVisible();
await expect(page.getByLabel('Database ID')).toBeVisible();
```

For IPC testing, evaluate in the renderer to trigger `window.electronAPI.*` calls:

```typescript
await page.evaluate(async () => {
  const result = await window.electronAPI.fetchTasks();
  return result;
});
```

---

## Headed vs headless testing on macOS

**Electron does not support true headless mode**—this is a fundamental architectural limitation. Tests always launch a visible window, but this works well for macOS since it has native display support.

| Platform | Headless | Requirements |
|----------|----------|--------------|
| **macOS** | ❌ Not available | Works directly; no Xvfb needed |
| **Linux** | ❌ Not available | Requires Xvfb virtual display |
| **Windows** | ❌ Not available | Works directly |

For macOS CI (GitHub Actions), tests run headed without additional configuration:

```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: macos-latest
    steps:
      - run: npm ci
      - run: npm run package
      - run: npm run test:e2e  # Works directly on macOS
```

For Linux CI, wrap with `xvfb-run`:

```bash
xvfb-run --auto-servernum npm run test:e2e
```

---

## macOS permissions and sandbox requirements

**Playwright's Electron automation typically doesn't require Accessibility permissions** since it communicates via Chrome DevTools Protocol (CDP) rather than macOS accessibility APIs. However, the terminal or IDE running tests may need permissions.

**Required setup for local development:**
- Grant Accessibility permissions to Terminal.app or VS Code in System Settings → Privacy & Security → Accessibility (if you encounter automation issues)
- No code signing required for local testing
- Remove quarantine attribute from downloaded apps: `xattr -dr com.apple.quarantine /path/to/App.app`

**For CI/CD on GitHub Actions:**

```yaml
env:
  CSC_IDENTITY_AUTO_DISCOVERY: 'false'  # Skip code signing
  ELECTRON_DISABLE_SANDBOX: '1'          # Disable sandbox for CI
```

**Entitlements for hardened runtime** (if distributing test builds):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
</dict>
</plist>
```

For your Electron Forge app, ad-hoc signing works for testing: `codesign --force --deep -s - /path/to/App.app`

---

## Running tests from Claude Code CLI via MCP

The official `@playwright/mcp` package provides browser automation tools, but **Electron apps require a different approach** since the MCP server controls browser instances, not Electron apps.

**Configure Playwright MCP for browser testing:**

```bash
# Add to Claude Code
claude mcp add playwright npx @playwright/mcp@latest
```

Or edit `~/.claude.json`:

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless"]
    }
  }
}
```

**For Electron app testing**, run Playwright tests via shell commands rather than MCP browser tools:

```bash
# In Claude Code, execute Playwright Electron tests directly
npx playwright test tests/e2e/
```

## bun-app test harness notes

The current bun-app E2E harness is in:
- `playwright.config.ts`
- `test/e2e/launchElectron.ts`
- `test/e2e/app.spec.ts`

Run:
1) `npm run package` (builds `.vite/build/main.js`)
2) `npm run test:e2e`

For test isolation, the app supports `E2E_USER_DATA_DIR` which overrides
Electron’s `userData` path at startup. This prevents DB/Settings state from
persisting between runs.

Alternatively, create a custom MCP server wrapping Playwright's Electron API:

```javascript
// electron-mcp-server.js
const { McpServer } = require('@modelcontextprotocol/sdk/server');
const { _electron } = require('playwright');

const server = new McpServer({ name: 'electron-playwright', version: '1.0.0' });

server.addTool({
  name: 'launch_electron_app',
  description: 'Launch Electron app and return window info',
  handler: async ({ args }) => {
    const app = await _electron.launch({ args: args || ['./dist/main.js'] });
    const window = await app.firstWindow();
    return { title: await window.title() };
  }
});

server.listen();
```

---

## Running tests from Codex CLI via MCP

Codex CLI uses TOML configuration at `~/.codex/config.toml`:

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest"]

[mcp_servers.playwright.env]
HEADLESS = "true"
```

**MCP commands for Codex:**

```bash
codex mcp add playwright npx "@playwright/mcp@latest"
codex mcp list --json
codex mcp get playwright
```

The same limitation applies—for Electron testing, use shell command execution:

```bash
# Within Codex CLI session
npm run test:e2e
```

---

## Complete TypeScript test example

This example demonstrates launching your bun-app, sending a chat message, and verifying Settings with Notion fields:

```typescript
// tests/e2e/bun-app.spec.ts
import { test, expect, _electron as electron } from '@playwright/test';
import type { ElectronApplication, Page } from '@playwright/test';
import path from 'path';

test.describe.serial('Bun App E2E Tests', () => {
  let electronApp: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    // Launch Electron Forge + Vite app
    electronApp = await electron.launch({
      args: [path.join(__dirname, '../../.vite/build/main.js')],
      env: { ...process.env, NODE_ENV: 'test' },
      timeout: 60000,
    });

    page = await electronApp.firstWindow();
    page.on('console', console.log);
    await page.waitForLoadState('domcontentloaded');
  });

  test.afterAll(async () => {
    await page.screenshot({ path: 'screenshots/final.png' });
    await electronApp.close();
  });

  test('app window opens successfully', async () => {
    const title = await page.title();
    expect(title).toBeTruthy();
    
    const isPackaged = await electronApp.evaluate(({ app }) => app.isPackaged);
    expect(isPackaged).toBe(false); // Dev mode
  });

  test('open chat and send a message', async () => {
    // Navigate to chat (adjust selectors for your UI)
    await page.getByRole('button', { name: /chat/i }).click();
    
    // Locate chat input (assistant-ui typically uses textbox)
    const chatInput = page.getByRole('textbox', { name: /message/i })
      .or(page.locator('[data-testid="chat-input"]'));
    
    await chatInput.fill('Hello, this is a test message');
    await chatInput.press('Enter');
    
    // Wait for response to appear (handle streaming)
    await expect(page.locator('[data-role="assistant"]').last())
      .toBeVisible({ timeout: 60000 });
  });

  test('validate response appears in chat', async () => {
    // Verify the assistant responded
    const messages = page.locator('[data-role="assistant"]');
    await expect(messages).toHaveCount(await messages.count());
    
    const lastMessage = messages.last();
    await expect(lastMessage).not.toBeEmpty();
    
    // Verify streaming completed (no typing indicator)
    await expect(page.locator('.typing-indicator')).toBeHidden({ timeout: 30000 });
  });

  test('navigate to Settings and verify Notion fields exist', async () => {
    // Open settings (adjust for your navigation structure)
    await page.getByRole('button', { name: /settings/i }).click();
    
    // Wait for settings panel
    await expect(page.getByRole('heading', { name: /settings/i })).toBeVisible();
    
    // Verify Notion SDK integration fields
    await expect(page.getByLabel(/notion.*api.*key/i)
      .or(page.locator('[data-testid="notion-api-key"]'))).toBeVisible();
    
    await expect(page.getByLabel(/notion.*database/i)
      .or(page.locator('[data-testid="notion-database-id"]'))).toBeVisible();
    
    // Optionally verify SQLite storage info
    await expect(page.getByText(/local.*storage|sqlite/i)).toBeVisible();
  });

  test('IPC communication works via electronAPI', async () => {
    // Test your window.electronAPI.* methods
    const result = await page.evaluate(async () => {
      // @ts-ignore - electronAPI is exposed via preload
      if (window.electronAPI?.getAppInfo) {
        return await window.electronAPI.getAppInfo();
      }
      return null;
    });
    
    if (result) {
      expect(result).toBeDefined();
    }
  });
});
```

---

## Known limitations of Playwright + Electron

| Limitation | Impact | Workaround |
|------------|--------|------------|
| **No headless mode** | Always opens visible window | Accept visual display; use `xvfb-run` on Linux CI |
| **Cannot attach to running apps** | Must launch fresh instances | Design tests to always use `electron.launch()` |
| **nodeCliInspect fuse required** | Packaged apps may timeout | Ensure fuse is enabled during packaging |
| **Single worker recommended** | Slower test execution | Run tests in serial with `workers: 1` |
| **DevTools conflicts** | May interfere with CDP | Don't auto-open DevTools in test mode |

**Critical fuse requirement**: If using `@electron/fuses`, ensure `EnableNodeCliInspectArguments` is **true**, otherwise Playwright cannot attach its debugger:

```javascript
// electron-builder config
{
  afterPack: async (context) => {
    flipFuses(context.appOutDir, {
      [FuseV1Options.EnableNodeCliInspectArguments]: true, // Required!
    });
  }
}
```

**Dev mode gotchas**:
- Ensure `protocol.registerSchemesAsPrivileged()` is called synchronously before app ready
- HMR may cause test flakiness—test against built output when possible
- Window loading may be slower than browser pages—use generous timeouts

---

## Recommended MCP server configuration

**For Claude Code** (project-level `.mcp.json`):

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest", "--headless", "--browser", "chromium"]
    }
  }
}
```

**For Codex CLI** (`~/.codex/config.toml`):

```toml
[mcp_servers.playwright]
command = "npx"
args = ["@playwright/mcp@latest", "--headless"]
```

**For Electron-specific testing**, the most effective approach is running Playwright tests via shell commands within the AI CLI session rather than using MCP browser tools, since MCP tools are designed for browser automation, not Electron app control. Your existing `npm run test:e2e` script integrates directly.

**Available Playwright MCP tools** include `browser_navigate`, `browser_click`, `browser_type`, `browser_snapshot`, `browser_take_screenshot`, and `browser_wait_for`—useful for web UI testing portions of your workflow but not for launching or controlling Electron directly.

---

## Quick reference commands

```bash
# Install dependencies
npm install -D @playwright/test playwright electron-playwright-helpers

# Run tests (after building)
npm run package && npx playwright test

# Debug mode
PWDEBUG=1 npx playwright test

# Generate report
npx playwright show-report

# macOS CI (GitHub Actions)
npm run test:e2e

# Linux CI
xvfb-run --auto-servernum npm run test:e2e

# Add MCP to Claude Code
claude mcp add playwright npx @playwright/mcp@latest

# Add MCP to Codex
codex mcp add playwright npx "@playwright/mcp@latest"
```
