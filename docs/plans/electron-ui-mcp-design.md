# Plan: electron-ui-mcp - Custom Electron Automation MCP Server

## Summary

Create a standalone npm package `electron-ui-mcp` that provides Playwright-style automation primitives for Electron apps via MCP. This fixes the issues with the broken `electron-playwright-mcp` (null reference errors from missing initialization), keeps tool naming compatible with the official Playwright MCP schema, and adds configurable launch modes for dev + packaged apps.

## Why the Existing MCP Failed

The `electron-playwright-mcp` package fails with "Cannot read properties of null (reading 'title')" because:
1. `initBrowserManager()` is async but not awaited before tools are invoked
2. Tools access `this.currentPage` which is `null` until initialization completes
3. No state machine to track initialization progress

## Solution: Lazy Initialization with State Guards

Every tool handler calls `ensureReady()` first, which:
- Launches the Electron app if not already running
- Coalesces concurrent calls to share the same launch promise
- Tracks state: `idle` → `launching` → `ready` (or `error`)

## Package Structure

```
electron-ui-mcp/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts              # MCP server setup & exports
│   ├── cli.ts                # CLI entry with commander
│   ├── config.ts             # Config resolution (CLI > env > file > defaults)
│   ├── electron/
│   │   ├── context.ts        # ElectronContext - lifecycle manager
│   │   ├── window.ts         # Window wrapper with Page
│   │   └── snapshot.ts       # ARIA snapshot with ref generation
│   ├── tools/
│   │   ├── index.ts          # Tool registry
│   │   ├── navigation.ts     # navigate, navigate_back
│   │   ├── interaction.ts    # click, type, fill_form, select, hover, drag
│   │   ├── snapshot.ts       # snapshot, take_screenshot
│   │   ├── evaluation.ts     # evaluate (renderer), evaluate_main
│   │   ├── waiting.ts        # wait_for
│   │   ├── windows.ts        # list_windows, select_window, close
│   │   └── application.ts    # launch, close, app_info
│   └── utils/
│       ├── errors.ts         # Custom error types with suggestions
│       └── refs.ts           # Element ref manager
└── dist/
```

## Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.25.0",
    "playwright": "^1.50.0",
    "zod": "^3.24.0",
    "commander": "^12.0.0"
  },
  "peerDependencies": {
    "electron": ">=28.0.0"
  }
}
```

## Configuration Modes

### Dev Mode (default)
Launches from `.vite/build/main.js` - requires a built main entry but not packaged.

```bash
electron-ui-mcp --dev .vite/build/main.js --cwd /path/to/app
```

Optional dev server mode (when you want a live renderer):
- Add a `--dev-server` option that sets `MAIN_WINDOW_VITE_DEV_SERVER_URL` (or equivalent) in env.

### Packaged Mode
Launches from packaged app executable.

```bash
# macOS
electron-ui-mcp --packaged /path/to/App.app

# Windows
electron-ui-mcp --packaged "C:\Program Files\App\App.exe"
```

### Environment Variables
| Variable | Description |
|----------|-------------|
| `ELECTRON_APP_PATH` | Path to executable or main.js |
| `ELECTRON_CWD` | Working directory |
| `ELECTRON_USER_DATA_DIR` | Custom userData (or temp if `--isolated`) |
| `E2E` | Enable E2E mode (bun-app compatible) |
| `ELECTRON_RENDERER_URL` | Optional dev server URL for renderer |

## MCP Tools

Tool naming should stay aligned with the official Playwright MCP schema (20 core tools), to maximize LLM/tooling compatibility. Additional tools can be optional and capability-gated.

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to URL or switch renderer |
| `browser_navigate_back` | Go back in history |
| `browser_snapshot` | Capture accessibility tree with refs |
| `browser_take_screenshot` | Visual screenshot |
| `browser_click` | Click element by ref |
| `browser_type` | Type into element |
| `browser_press_key` | Press keyboard key |
| `browser_fill_form` | Fill multiple fields |
| `browser_select_option` | Select dropdown |
| `browser_hover` | Hover over element |
| `browser_drag` | Drag and drop |
| `browser_file_upload` | Upload files |
| `browser_handle_dialog` | Accept/dismiss dialogs |
| `browser_wait_for` | Wait for text/selector/time |
| `browser_evaluate` | Execute JS in renderer |
| `browser_tabs` | Window management |
| `browser_resize` | Resize window |
| `browser_close` | Close app |
| `browser_network_requests` | Get network log |
| `browser_console_messages` | Get console log |
| `electron_evaluate_main` | Execute in main process |
| `electron_app_info` | Get app metadata |

## Key Implementation Patterns

### 1. ElectronContext (Lifecycle Manager)

```typescript
class ElectronContext {
  private state: 'idle' | 'launching' | 'ready' | 'error' | 'closed' = 'idle';
  private launchPromise: Promise<void> | null = null;

  async ensureReady(): Promise<void> {
    if (this.state === 'ready') return;
    if (this.state === 'launching' && this.launchPromise) {
      await this.launchPromise;  // Coalesce concurrent calls
      return;
    }
    this.state = 'launching';
    this.launchPromise = this.launch();
    await this.launchPromise;
    this.state = 'ready';
  }
}
```

### 2. Launch Pattern (from bun-app reference)

```typescript
// Reference: test/e2e/launchElectron.ts
const app = await electron.launch({
  args: [mainEntry],  // or executablePath for packaged
  env: { ...process.env, E2E: '1', E2E_USER_DATA_DIR: tempDir },
  timeout: 60_000,
});
const page = await app.firstWindow();
await page.waitForLoadState('domcontentloaded');
```

### 2b. Window Management (multi-window)
- `firstWindow()` may return hidden/splash windows; allow selecting by title/URL.
- Use `waitForEvent('window')` + predicate to capture specific windows.
- Don’t rely on window index ordering; it’s not stable.

### 3. Ref System (Element Addressing)

Snapshot generates refs like `e0`, `e1`, `e2` that map to Playwright locators:
- ARIA role + accessible name
- Falls back to data-testid if available
- Refs regenerate on each snapshot (stale refs error with suggestion)

### 4. Dialog Handling (JS + Electron)
- Register dialog handlers before triggering actions to avoid race conditions.
- Provide `browser_handle_dialog` and queue dialogs internally.
- For Electron `dialog` module (main process), expose `electron_evaluate_main` as a fallback hook.

### 5. Error Handling

Custom errors include recovery suggestions:
```typescript
throw new RefNotFoundError(ref);
// → "Element ref 'e42' not found. Suggestion: Take a new snapshot with browser_snapshot"
```

### 6. Tool Schema Compatibility
- Keep `browser_*` naming and parameter shapes aligned with Playwright MCP.
- Add MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) for better LLM behavior.
- Consider optional capability flags for advanced tools (vision, testing, tracing).

### 7. Optional Helpers
- `electron-playwright-helpers` can help locate packaged builds and retry flaky evaluate calls.
- Note: Electron is not headless; CI needs a display (Xvfb) on Linux.

## Implementation Steps

1. **Initialize package** - Create npm package with TypeScript, dependencies
2. **Implement ElectronContext** - Lifecycle management with lazy init
3. **Implement snapshot system** - ARIA tree with ref generation
4. **Implement core tools** - navigate, click, type, snapshot
5. **Implement remaining tools** - forms, dialogs, evaluation, windows
6. **Add CLI** - commander-based with config modes
7. **Add tests** - Unit tests + integration with test fixture app
8. **Documentation** - README with usage examples

## Claude Desktop Config Example

```json
{
  "mcpServers": {
    "electron": {
      "command": "npx",
      "args": ["electron-ui-mcp", "--dev", ".vite/build/main.js"],
      "cwd": "/path/to/bun-app"
    }
  }
}
```

## Reference Files

- `docs/reference/electron-launch-example.md` - Bun-app Playwright launch reference
- `docs/reference/playwright/testing-electron-apps.md` - Electron testing patterns
- `https://github.com/microsoft/playwright-mcp` - MCP tool definitions reference
