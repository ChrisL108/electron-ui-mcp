---
Question: Playwright Electron: how to enumerate and switch windows reliably. Any pitfalls when reusing the active window?
---

# Playwright Electron window management: A complete guide

Playwright provides experimental but capable APIs for managing multiple windows in Electron tests through the `ElectronApplication` class. The core methods—`windows()`, `firstWindow()`, and `waitForEvent('window')`—form the foundation, but reliable testing requires understanding critical timing issues and race conditions that plague multi-window scenarios. This guide covers enumeration, switching, common pitfalls, and battle-tested reliability patterns with TypeScript examples.

## Window enumeration APIs and their behaviors

Playwright exposes three primary mechanisms for accessing Electron windows, each with distinct use cases and timing characteristics.

### The synchronous `windows()` method

The `electronApp.windows()` method returns an array of Playwright `Page` objects representing all currently open windows. Crucially, this is **synchronous**—it returns immediately with whatever windows exist at that moment:

```typescript
import { _electron as electron, ElectronApplication, Page } from 'playwright';

const electronApp: ElectronApplication = await electron.launch({ args: ['main.js'] });
const windows: Page[] = electronApp.windows();
console.log(`Open windows: ${windows.length}`);

// Iterate and inspect each window
for (const window of windows) {
  console.log(await window.title()); // title() is async!
}
```

**Critical caveat**: Window order from `windows()` is not guaranteed to be consistent across calls. Never rely on index position to identify specific windows—use titles, URLs, or other distinguishing properties instead.

### The async `firstWindow()` method

Unlike `windows()`, the `firstWindow()` method **waits** for a window to exist before returning:

```typescript
const electronApp = await electron.launch({ args: ['main.js'] });

// Blocks until first window is created AND loaded
const mainWindow: Page = await electronApp.firstWindow({ timeout: 60000 });
await mainWindow.waitForLoadState('domcontentloaded');
```

A common issue: apps with background renderers or splash screens may return an unexpected hidden window. GitHub issue #11526 documents cases where `firstWindow()` returns a hidden renderer page instead of the visible main window. The workaround is using `waitForEvent` with a predicate.

### The `window` event for tracking creation

The `on('window')` event fires whenever a window is **created and loaded** (not just created):

```typescript
electronApp.on('window', (page: Page) => {
  console.log(`New window opened: ${await page.title()}`);
});
```

For one-time waiting, use `waitForEvent` with optional predicate filtering:

```typescript
const settingsWindow = await electronApp.waitForEvent('window', {
  predicate: async (page: Page) => (await page.title()) === 'Settings',
  timeout: 10000
});
```

## Switching between windows reliably

The critical pattern for multi-window tests is setting up the event listener **before** triggering the action that opens a new window. This prevents race conditions where the window opens before your listener attaches.

### The Promise.all pattern for window creation

```typescript
// CORRECT: Set up listener before triggering action
const windowPromise = electronApp.waitForEvent('window');
await mainWindow.click('button#open-settings');
const settingsWindow = await windowPromise;

// Or use Promise.all for explicit parallelism
const [newWindow] = await Promise.all([
  electronApp.waitForEvent('window'),
  mainWindow.click('button#open-settings')
]);
```

### Finding windows by properties

Since window order is unreliable, identify windows by their characteristics:

```typescript
async function findWindowByTitle(
  electronApp: ElectronApplication,
  title: string
): Promise<Page> {
  const windows = electronApp.windows();
  for (const win of windows) {
    if (await win.title() === title) return win;
  }
  throw new Error(`Window "${title}" not found`);
}

async function findWindowByUrl(
  electronApp: ElectronApplication,
  urlPattern: RegExp
): Promise<Page> {
  const windows = electronApp.windows();
  for (const win of windows) {
    if (urlPattern.test(win.url())) return win;
  }
  throw new Error(`Window matching ${urlPattern} not found`);
}
```

### Handling splash screens

Apps with splash screens require waiting for the splash to close before testing the main window:

```typescript
async function waitForMainWindow(electronApp: ElectronApplication): Promise<Page> {
  // Wait for initial window (may be splash screen)
  await electronApp.firstWindow();
  
  // Poll until splash closes, leaving only main window
  while (electronApp.windows().length > 1) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const windows = electronApp.windows();
  if (windows.length !== 1) {
    throw new Error(`Expected 1 window, found ${windows.length}`);
  }
  return windows[0];
}
```

## Pitfalls when reusing windows across test steps

Reusing the same window instance across multiple test steps introduces several categories of problems that cause flaky tests.

### Stale page references after navigation

When a window navigates to a new URL or reloads, the underlying execution context changes. Operations on the old `Page` object may fail with **"Execution context was destroyed"** errors. This became particularly prevalent with Electron 27+, as documented in GitHub issue #33737:

```typescript
// This pattern is fragile across navigations
const page = await electronApp.firstWindow();
await page.goto('app://settings');
// Context may be destroyed here
await page.evaluate(() => localStorage.clear()); // May throw!
```

### State carryover between tests

Tests sharing a window inherit state from previous tests: localStorage, cookies, DOM state, and JavaScript variables all persist. This creates hidden dependencies between tests:

```typescript
// test.spec.ts - These tests have hidden coupling
test('sets user preference', async ({ mainWindow }) => {
  await mainWindow.evaluate(() => localStorage.setItem('theme', 'dark'));
});

test('reads default theme', async ({ mainWindow }) => {
  // FAILS: inherits 'dark' from previous test!
  const theme = await mainWindow.evaluate(() => localStorage.getItem('theme'));
  expect(theme).toBeNull();
});
```

### Focus and activation timing

Window focus state affects keyboard input and certain UI behaviors. Tests may fail intermittently when the window loses focus to another application or when running headless:

```typescript
// Fragile: assumes window has focus
await mainWindow.keyboard.type('search query');

// More reliable: explicitly focus first
await mainWindow.bringToFront();
await mainWindow.focus();
await mainWindow.keyboard.type('search query');
```

### The single-instance lock problem

Apps using `app.requestSingleInstanceLock()` cause particular issues. Launching a second Electron instance in tests triggers "illegal access" errors because the second instance quits immediately per the single-instance lock behavior.

## Reliability patterns for robust tests

These patterns emerge from real-world testing of production Electron applications.

### Fixture-based isolation

The most reliable approach uses Playwright Test fixtures to guarantee fresh app state per test:

```typescript
// fixtures.ts
import { test as base, ElectronApplication, Page } from '@playwright/test';
import { _electron as electron } from 'playwright';

interface ElectronFixtures {
  electronApp: ElectronApplication;
  mainWindow: Page;
}

export const test = base.extend<ElectronFixtures>({
  electronApp: async ({}, use) => {
    const app = await electron.launch({ 
      args: ['main.js'],
      timeout: 60000 
    });
    await use(app);
    await app.close(); // Always cleanup
  },
  
  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow({ timeout: 30000 });
    await window.waitForLoadState('domcontentloaded');
    await use(window);
  },
});

export { expect } from '@playwright/test';
```

### Retry wrapper for flaky evaluate calls

The `electron-playwright-helpers` library provides battle-tested retry logic, but here's a self-contained implementation:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; delayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, delayMs = 500 } = options;
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      const isRetryable = 
        lastError.message.includes('context') ||
        lastError.message.includes('destroyed') ||
        lastError.message.includes('Promise was collected') ||
        lastError.message.includes('browser has been closed');
      
      if (!isRetryable || attempt === maxRetries - 1) throw lastError;
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastError;
}

// Usage
const appName = await withRetry(() => 
  electronApp.evaluate(({ app }) => app.getName())
);
```

### Complete window manager class

This TypeScript class encapsulates reliable window management patterns:

```typescript
import { ElectronApplication, Page } from 'playwright';

export class WindowManager {
  constructor(private readonly electronApp: ElectronApplication) {}

  async waitForWindowByTitle(title: string, timeout = 30000): Promise<Page> {
    // First check existing windows
    const existing = await this.findByTitle(title);
    if (existing) return existing;

    // Wait for new window with matching title
    return this.electronApp.waitForEvent('window', {
      predicate: async (page) => (await page.title()) === title,
      timeout,
    });
  }

  async findByTitle(title: string): Promise<Page | null> {
    for (const win of this.electronApp.windows()) {
      if (await win.title() === title) return win;
    }
    return null;
  }

  async closeAllExcept(keepWindow: Page): Promise<void> {
    for (const win of this.electronApp.windows()) {
      if (win !== keepWindow && !win.isClosed()) {
        await win.close();
      }
    }
  }

  async waitForWindowCount(count: number, timeout = 10000): Promise<void> {
    const start = Date.now();
    while (this.electronApp.windows().length !== count) {
      if (Date.now() - start > timeout) {
        throw new Error(`Timeout: expected ${count} windows, found ${this.electronApp.windows().length}`);
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }
}
```

### Accessing the underlying BrowserWindow

When you need Electron's native `BrowserWindow` properties (like `isMaximized()` or custom properties), use the `browserWindow()` method:

```typescript
const page = await electronApp.firstWindow();
const browserWindow = await electronApp.browserWindow(page);

// Access BrowserWindow properties via evaluate
const isMaximized = await browserWindow.evaluate((bw) => bw.isMaximized());
const bounds = await browserWindow.evaluate((bw) => bw.getBounds());
const windowId = await browserWindow.evaluate((bw) => bw.id);
```

## Conclusion

Reliable Playwright Electron window testing requires understanding the timing semantics of each API. Use `waitForEvent('window')` with predicates over `firstWindow()` when dealing with multiple windows, always set up listeners before triggering window-opening actions, and implement retry logic for `evaluate()` calls to handle context destruction. Fresh app instances per test via fixtures eliminate state pollution, though worker-scoped fixtures can amortize launch overhead when complete isolation isn't required. The `electron-playwright-helpers` library provides production-ready implementations of these patterns for teams wanting a battle-tested foundation.