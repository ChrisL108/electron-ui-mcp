---
Question: Compare Playwright MCP tool schema vs electron‑playwright‑mcp. Should we match tool naming and payload shapes to maximize LLM compatibility?
---

# Playwright MCP server schemas: official vs Electron fork

The official Microsoft Playwright MCP server and electron-playwright-mcp share **identical tool naming conventions and nearly identical schemas** for their common tools. Both use `snake_case` with a `browser_` prefix, reflecting the dominant pattern in the MCP ecosystem where **over 90% of servers use snake_case**. The key differences lie in scope: Microsoft's implementation offers **33 tools** with capability-gated features, while the Electron fork provides a streamlined **20-tool subset** adapted for desktop application automation.

## Tool inventory comparison reveals capability gaps

Microsoft's Playwright MCP server exposes a comprehensive automation toolkit organized into capability tiers, while electron-playwright-mcp focuses on core automation primitives.

| Category | Microsoft Playwright MCP | electron-playwright-mcp |
|----------|-------------------------|------------------------|
| Core automation | 20 tools | 20 tools (identical) |
| Vision/coordinate-based | 3 tools (`--caps=vision`) | None |
| PDF generation | 1 tool (`--caps=pdf`) | None |
| Test assertions | 5 tools (`--caps=testing`) | None |
| Tracing | 2 tools (`--caps=tracing`) | None |
| Browser installation | 1 tool | None |
| Playwright code execution | 1 tool (`browser_run_code`) | None |
| **Total** | **33 tools** | **20 tools** |

The **core 20 tools present in both implementations share identical names and parameter schemas**:

```
browser_click          browser_drag           browser_hover
browser_type           browser_press_key      browser_fill_form
browser_select_option  browser_navigate       browser_navigate_back
browser_snapshot       browser_take_screenshot browser_evaluate
browser_file_upload    browser_tabs           browser_handle_dialog
browser_wait_for       browser_resize         browser_close
browser_network_requests browser_console_messages
```

## Parameter schemas are functionally identical across shared tools

Both implementations use the same element reference system where `browser_snapshot` returns an accessibility tree with unique refs (e.g., `e123`) that subsequent interaction tools consume. Examining the `browser_click` tool demonstrates schema parity:

**Microsoft Playwright MCP:**
```typescript
{
  element: string,    // required - Human-readable element description
  ref: string,        // required - Element reference from snapshot
  doubleClick?: boolean,
  button?: string,    // "left" | "right" | "middle"
  modifiers?: string[]
}
```

**electron-playwright-mcp:**
```typescript
{
  element: string,    // required - Human-readable element description  
  ref: string,        // required - Element reference from snapshot
  doubleClick?: boolean,
  button?: string,    // defaults to "left"
  modifiers?: string[]
}
```

This pattern holds across all 20 shared tools—the `browser_type` tool in both requires `element`, `ref`, and `text` parameters with optional `submit` and `slowly` flags; `browser_drag` requires `startElement`, `startRef`, `endElement`, `endRef` in both. The schema alignment is no accident: electron-playwright-mcp explicitly states it was "inspired by/adapted from microsoft/playwright-mcp."

## Microsoft-exclusive tools extend automation capabilities

The **13 tools unique to Microsoft's implementation** fall into specialized categories requiring opt-in via capability flags:

**Vision tools** (`--caps=vision`) enable coordinate-based automation for scenarios where the accessibility tree is insufficient:
- `browser_mouse_click_xy` — Click at specific x,y coordinates
- `browser_mouse_drag_xy` — Drag between coordinate pairs  
- `browser_mouse_move_xy` — Move cursor to coordinates

**Testing tools** (`--caps=testing`) support test generation and verification:
- `browser_generate_locator` — Creates Playwright locators for test code
- `browser_verify_element_visible` — Asserts element visibility by role/name
- `browser_verify_text_visible` — Asserts text presence on page
- `browser_verify_list_visible` — Validates list contents
- `browser_verify_value` — Checks input/checkbox values

**Infrastructure tools** provide development workflow support:
- `browser_run_code` — Executes arbitrary Playwright code snippets
- `browser_install` — Installs required browser binaries
- `browser_pdf_save` (`--caps=pdf`) — Exports page as PDF
- `browser_start_tracing` / `browser_stop_tracing` (`--caps=tracing`) — Records traces

## MCP ecosystem has converged on naming standards

The SEP-986 specification, now finalized for the DRAFT-2025-11-25 release, establishes the official tool naming rules: **1-64 characters**, case-sensitive, limited to `A-Za-z0-9_-./`. Community analysis of 500+ public MCP servers reveals:

- **90%+ use snake_case** for tool names
- **95% use multi-word names** (e.g., `fetch_forecast` vs `forecast`)
- **Less than 1% use camelCase**
- **Imperative verbs dominate**: `get_`, `list_`, `create_`, `update_`, `delete_`

Both Playwright implementations align perfectly with these conventions. The `browser_` prefix follows Anthropic's recommendation for namespacing: *"Namespacing (grouping related tools under common prefixes) can help delineate boundaries between lots of tools."*

Tool annotations provide additional LLM guidance beyond naming:
```typescript
annotations: {
  readOnlyHint: boolean,    // true for browser_snapshot, browser_take_screenshot
  destructiveHint: boolean, // false for most browser tools
  idempotentHint: boolean,  // true for navigation tools
}
```

Microsoft's implementation marks each tool as either `readOnly: true` (snapshot, screenshot, network requests) or `destructive` (click, type, navigate), enabling MCP clients to skip confirmation prompts for safe operations.

## LLM generalization benefits from consistent naming patterns

Research from Anthropic's tool-building guidance indicates that **LLMs learn tool patterns through naming structure**. When tools follow predictable conventions, models can generalize usage without explicit training:

**Pattern recognition enables transfer learning.** An LLM that learns `browser_click` requires `element` and `ref` parameters will correctly infer that `browser_hover`, `browser_type`, and `browser_select_option` likely need the same parameters. The consistent `browser_` prefix signals that all tools operate on the same underlying resource.

**Snyk's research on GPT-4o tokenization** found that snake_case naming produces the best token boundaries: *"GPT-4o tokenization understands that practice best. Alternatives are to use a dash or an underscore as separators."* Spaces, dots, and brackets disrupt tool calling entirely.

**Cross-compatibility implications are significant.** Prompts and workflows built for Microsoft's Playwright MCP will transfer directly to electron-playwright-mcp for the 20 shared tools without modification. An agent trained on `browser_navigate` → `browser_snapshot` → `browser_click` workflows will execute identically on either implementation.

However, **prompts relying on Microsoft-exclusive tools will fail silently** on the Electron fork. A workflow using `browser_run_code` to execute custom Playwright scripts or `browser_verify_element_visible` for test assertions has no equivalent in electron-playwright-mcp.

## Architectural differences matter more than schema differences

The substantive distinction between these implementations isn't tool naming—it's the automation target:

| Aspect | Microsoft Playwright MCP | electron-playwright-mcp |
|--------|-------------------------|------------------------|
| Target | Web browsers (Chrome, Firefox, WebKit) | Electron desktop applications |
| Launch | Opens browser via Playwright | Connects to running Electron app |
| Use case | Web automation, testing | Desktop app automation |
| Renderer | Standard browser contexts | Electron renderer processes |

electron-playwright-mcp uses Playwright's `ElectronApplication` API rather than browser contexts, enabling automation of apps like VS Code, Slack, or Discord that are built on Electron. The MCP interface remains identical, but the underlying automation connects to different runtime targets.

## Conclusion

Schema alignment between these implementations is **near-perfect by design**, not coincidence—electron-playwright-mcp explicitly forked from Microsoft's patterns. For LLM workflows, this means **prompts transfer seamlessly** for core automation tasks. The meaningful differences are:

1. **Capability scope**: Microsoft offers 13 additional specialized tools
2. **Automation target**: Browsers vs Electron desktop applications  
3. **Feature flags**: Microsoft uses `--caps` for opt-in features; Electron fork has no capability system

Organizations building MCP-based automation should standardize on Microsoft's implementation for web automation and electron-playwright-mcp for desktop apps, with shared prompts covering the 20 common tools. The MCP ecosystem's strong convergence on snake_case naming with semantic prefixes means new implementations should follow this pattern to maximize LLM compatibility and workflow portability.