# Setting Up electron-ui-mcp with Claude Code

## Quick Setup

Add the MCP server to Claude Code:

```bash
claude mcp add electron-ui-mcp -- npx electron-ui-mcp --dev .vite/build/main.js --cwd /path/to/your-electron-app
```

Replace `/path/to/your-electron-app` with your actual Electron project path.

## Common Configurations

### Vite + Electron (dev mode)

```bash
claude mcp add electron-ui-mcp -- npx electron-ui-mcp \
  --dev .vite/build/main.js \
  --dev-server http://localhost:5173 \
  --cwd /path/to/your-electron-app
```

### Packaged App (macOS)

```bash
claude mcp add electron-ui-mcp -- npx electron-ui-mcp \
  --packaged /Applications/YourApp.app
```

### Isolated Testing Mode

```bash
claude mcp add electron-ui-mcp -- npx electron-ui-mcp \
  --dev .vite/build/main.js \
  --isolated \
  --e2e \
  --cwd /path/to/your-electron-app
```

## Verify Installation

```bash
claude mcp list
```

You should see `electron-ui-mcp` in the list.

## Basic Usage in Claude Code

Once configured, ask Claude to interact with your Electron app:

1. **Take a snapshot** to see what's on screen:
   ```
   Take a snapshot of the Electron app
   ```

2. **Click elements** using refs from the snapshot:
   ```
   Click the "Sign In" button (ref e3)
   ```

3. **Type into fields**:
   ```
   Type "user@example.com" into the email field (ref e2)
   ```

4. **Take annotated screenshots** for visual debugging:
   ```
   Take an annotated screenshot showing element refs
   ```

## Troubleshooting

### App doesn't launch

1. Ensure your Electron app builds successfully:
   ```bash
   cd /path/to/your-electron-app && npm run build
   ```

2. Check the main.js path is correct relative to `--cwd`

3. Try with increased timeout:
   ```bash
   claude mcp add electron-ui-mcp -- npx electron-ui-mcp \
     --dev .vite/build/main.js \
     --timeout 120000 \
     --cwd /path/to/your-electron-app
   ```

### Refs not found

- Refs are invalidated when a new snapshot is taken or when switching windows
- Always take a fresh snapshot before interacting with elements

### Remove and re-add

```bash
claude mcp remove electron-ui-mcp
claude mcp add electron-ui-mcp -- npx electron-ui-mcp [your options]
```

## Available Tools

| Tool | Description |
|------|-------------|
| `browser_snapshot` | Capture accessibility tree with refs |
| `browser_take_screenshot` | Screenshot (use `annotate: true` for ref overlays) |
| `browser_click` | Click element by ref |
| `browser_type` | Type into element |
| `browser_navigate` | Navigate to URL |
| `browser_wait_for` | Wait for text/element/URL |
| `electron_evaluate_main` | Run JS in main process |
| `electron_app_info` | Get app metadata |

See full tool list in [README.md](../README.md#available-tools).
