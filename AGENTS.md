# Agent Learnings (electron-ui-mcp)

Concise, high‑signal rules to keep the MCP server reliable and predictable.

## Critical Rules
- Always check source before changing architecture or tool schemas
- Never commit or publish without explicit approval
- Add concise comments only for non‑obvious lifecycle/state logic
- Prefer simple, testable flows over clever abstractions
- Minimize churn in docs: keep to high‑level flows, stable file references, and short examples
- Use LLM reasoning for “smart” decisions; avoid brittle heuristics/regex

## MCP Design Guardrails
- Match Playwright MCP tool names and parameter shapes for compatibility
- Keep the core `browser_*` tool set stable; add `electron_*` for main‑process features
- Use tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) where applicable
- Always guard tool execution with an `ensureReady()` lifecycle gate
- Reject or explicitly handle stale snapshot refs (clear error + suggestion)

## Electron Lifecycle Rules
- Support `E2E=1` and custom `ELECTRON_USER_DATA_DIR` where possible
- Use a single active window by default; expose explicit window selection
- Handle crashes/closed windows by resetting state to `idle`
- Register dialog handlers before actions to avoid race conditions

## Snapshot & Ref System
- Snapshot output must include role + name + ref; fall back to `data-testid`
- Refs are per-snapshot; stale refs should fail fast with recovery guidance

## Testing Discipline
- Provide a minimal fixture app for smoke tests
- Keep E2E tests deterministic; avoid relying on timing-sensitive UI
- Record artifacts on failure (screenshots, trace) for debugging

## Project Structure (Suggested)
- `src/electron/`: lifecycle manager, window registry
- `src/tools/`: MCP tool implementations
- `src/cli.ts`: CLI entrypoint & config parsing
- `docs/plans/`: planning + design docs

