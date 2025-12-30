# electron-ui-mcp

> **⚠️ WARNING: This project is under active development and not ready for production use.**
>
> APIs, tool names, and configuration formats may change without notice. See [docs/plans/multi-app-support.md](docs/plans/multi-app-support.md) for upcoming changes.

Electron UI automation MCP server with Playwright-style primitives.

This package provides a Model Context Protocol (MCP) server that enables AI assistants to automate Electron desktop applications using a familiar Playwright-like API.

## Features

- **Playwright-compatible tool naming** - Uses `browser_*` tool names matching the official Playwright MCP server for maximum LLM compatibility
- **Lazy initialization** - App launches automatically on first tool call
- **Lifecycle guards** - State machine ensures tools only run when app is ready
- **Snapshot-based element addressing** - ARIA tree snapshots with element refs (`e0`, `e1`, etc.)
- **Annotated screenshots** - Overlay ref labels on screenshots for visual debugging
- **Dev and packaged app support** - Works with both development builds and packaged executables
- **Electron-specific tools** - Additional `electron_*` tools for main process access

## Quick Start

No installation required - use `npx` directly:

### Add to Claude Code

```bash
claude mcp add electron-ui-mcp -- npx electron-ui-mcp --dev .vite/build/main.js --cwd /path/to/your-electron-app
```

### Add to Codex CLI

```bash
codex mcp add electron-ui-mcp -- npx electron-ui-mcp --dev .vite/build/main.js --cwd /path/to/your-electron-app
```

### Add to Gemini CLI

```bash
gemini mcp add electron-ui-mcp -- npx electron-ui-mcp --dev .vite/build/main.js --cwd /path/to/your-electron-app
```

## Usage

### CLI

```bash
# Dev mode - launch from main.js entry
electron-ui-mcp --dev .vite/build/main.js --cwd /path/to/app

# With Vite dev server
electron-ui-mcp --dev .vite/build/main.js --dev-server http://localhost:5173

# Packaged app (macOS)
electron-ui-mcp --packaged /Applications/MyApp.app

# Packaged app (Windows)
electron-ui-mcp --packaged "C:\Program Files\MyApp\MyApp.exe"

# With isolated userData (for testing)
electron-ui-mcp --dev .vite/build/main.js --isolated --e2e
```

### CLI Options

```
Options:
  --dev <path>           Launch dev mode with main.js entry
  --packaged <path>      Launch packaged app executable
  --cwd <path>           Working directory
  --user-data-dir <path> Custom userData directory
  --isolated             Use isolated temp userData
  --dev-server <url>     Dev server URL for renderer
  --e2e                  Enable E2E mode
  --timeout <ms>         Launch timeout (default: 60000)
  --config <path>        Path to config file
```

## Configuration

### Claude Desktop

Add to your Claude Desktop config (`~/.claude.json`):

```json
{
  "mcpServers": {
    "electron": {
      "command": "npx",
      "args": ["electron-ui-mcp", "--dev", ".vite/build/main.js"],
      "cwd": "/path/to/your-electron-app"
    }
  }
}
```

### Codex CLI

Codex stores MCP config in `~/.codex/config.toml`:

```toml
[mcp_servers.electron]
command = "npx"
args = ["electron-ui-mcp", "--dev", ".vite/build/main.js", "--cwd", "/path/to/your-electron-app"]
```

### Gemini CLI

Gemini stores MCP config in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "electron": {
      "command": "npx",
      "args": ["electron-ui-mcp", "--dev", ".vite/build/main.js", "--cwd", "/path/to/your-electron-app"]
    }
  }
}
```

### Configuration File

Create `electron-ui-mcp.json` in your project root:

```json
{
  "mode": "dev",
  "appPath": ".vite/build/main.js",
  "rendererUrl": "http://localhost:5173",
  "isolated": true,
  "e2e": true,
  "timeout": 60000
}
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ELECTRON_APP_PATH` | Path to executable or main.js |
| `ELECTRON_CWD` | Working directory |
| `ELECTRON_USER_DATA_DIR` | Custom userData directory |
| `ELECTRON_RENDERER_URL` | Dev server URL for renderer |
| `E2E` | Enable E2E mode (sets `E2E=1`) |
| `ELECTRON_LAUNCH_TIMEOUT` | Launch timeout in ms |
| `ELECTRON_MODE` | `dev` or `packaged` |

## Available Tools

### Browser Tools (Playwright-compatible)

| Tool | Description |
|------|-------------|
| `browser_navigate` | Navigate to URL |
| `browser_navigate_back` | Go back in history |
| `browser_snapshot` | Capture accessibility tree with refs |
| `browser_take_screenshot` | Take screenshot (with optional ref annotations) |
| `browser_click` | Click element by ref |
| `browser_type` | Type into element |
| `browser_press_key` | Press keyboard key |
| `browser_fill_form` | Fill multiple form fields |
| `browser_select_option` | Select dropdown option |
| `browser_hover` | Hover over element |
| `browser_drag` | Drag and drop |
| `browser_file_upload` | Upload files |
| `browser_handle_dialog` | Handle JS dialogs |
| `browser_wait_for` | Wait for condition |
| `browser_evaluate` | Execute JS in renderer |
| `browser_tabs` | List/select windows |
| `browser_resize` | Resize window |
| `browser_close` | Close application |
| `browser_console_messages` | Get console log |
| `browser_network_requests` | Get network log |

### Electron-specific Tools

| Tool | Description |
|------|-------------|
| `electron_evaluate_main` | Execute JS in main process |
| `electron_app_info` | Get app metadata |

## How It Works

### Snapshot and Refs

The `browser_snapshot` tool captures an accessibility tree of the current page:

```
- [e0] heading "Welcome" [level 1]
- [e1] button "Sign In"
- [e2] textbox "Email"
- [e3] textbox "Password"
- [e4] button "Submit"
```

Use these refs with interaction tools:

```json
{
  "name": "browser_click",
  "arguments": {
    "element": "Submit button",
    "ref": "e4"
  }
}
```

**Important**: Refs are invalidated when a new snapshot is taken or when switching between windows. Always take a fresh snapshot before interacting with elements.

### Annotated Screenshots

Use `browser_take_screenshot` with `annotate: true` to overlay ref labels on the screenshot:

```json
{
  "name": "browser_take_screenshot",
  "arguments": {
    "annotate": true
  }
}
```

This draws red highlight boxes and ref labels (e0, e1, etc.) at each element's position, making it easy to visually identify which ref corresponds to which UI element.

**Note**: If no snapshot has been taken yet, `annotate: true` will automatically capture one, which generates new refs. This can invalidate refs from a previous snapshot.

```
┌─────────────────────────────────┐
│  e0                             │
│  ┌───────────────────────────┐  │
│  │     Welcome to App        │  │
│  └───────────────────────────┘  │
│                                 │
│  e1                e2           │
│  ┌──────┐  ┌─────────────────┐  │
│  │Email │  │_________________│  │
│  └──────┘  └─────────────────┘  │
│                                 │
│             e3                  │
│           ┌────────┐            │
│           │ Submit │            │
│           └────────┘            │
└─────────────────────────────────┘
```

If no snapshot has been taken yet, one will be captured automatically before annotating.

### Lifecycle States

The server manages these states:
- `idle` - Not launched
- `launching` - Starting up
- `ready` - App running, ready for tools
- `error` - Launch failed
- `closed` - App was closed

Tools automatically launch the app if needed (lazy initialization).

## Programmatic Usage

Install as a dependency:

```bash
npm install electron-ui-mcp
```

Then use in your code:

```typescript
import { createServer, resolveConfig } from 'electron-ui-mcp';

const config = resolveConfig({
  dev: '.vite/build/main.js',
  isolated: true,
});

const server = createServer(config);
```

## Security Considerations

### Main Process Code Execution

The `electron_evaluate_main` tool executes arbitrary JavaScript in the Electron main process. This is intentionally powerful for automation but should only be used in trusted environments. The main process has full Node.js and system access.

### Environment Variable Passthrough

By default, all environment variables from the host process are passed to the launched Electron app. This can unintentionally expose secrets if the app logs or exposes environment variables. Use `--isolated` mode or set specific variables via the config to limit exposure.

### File Access

The `browser_file_upload` tool can read arbitrary local files. This is expected behavior for automation but worth noting when exposing this server to untrusted callers.

## Requirements

- Node.js >= 18
- Electron >= 28 (peer dependency)
- Playwright >= 1.50

## License

MIT
