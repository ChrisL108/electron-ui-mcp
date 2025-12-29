# Project Review Prompt

Use this prompt to request a comprehensive code review from another LLM.

---

## Prompt

You are reviewing the `electron-ui-mcp` project - an MCP (Model Context Protocol) server that enables AI assistants to automate Electron desktop applications using Playwright-style primitives.

### Project Context

This is a TypeScript npm package that:
- Exposes 21 MCP tools for UI automation (clicking, typing, screenshots, etc.)
- Uses Playwright's Electron API under the hood
- Matches the official Playwright MCP tool naming schema (`browser_*`) for LLM compatibility
- Adds Electron-specific tools (`electron_*`) for main process access
- Supports both development builds and packaged Electron apps

### Key Design Decisions

1. **Lazy initialization** - App launches on first tool call via `ensureReady()` pattern
2. **Snapshot-based refs** - Elements are addressed by refs (`e0`, `e1`) from accessibility snapshots
3. **Annotated screenshots** - Can overlay ref labels on screenshots for visual debugging
4. **Config resolution** - CLI args > environment variables > config file > defaults

### Files to Review

Please read and analyze these files in order:

**Core Architecture:**
- `src/index.ts` - MCP server setup and tool registration
- `src/cli.ts` - CLI entry point with commander
- `src/config.ts` - Configuration resolution system
- `src/electron/context.ts` - ElectronContext lifecycle manager (critical)
- `src/electron/snapshot.ts` - ARIA snapshot and annotation system

**Tools Implementation:**
- `src/tools/index.ts` - Tool registry
- `src/tools/navigation.ts` - browser_navigate, browser_navigate_back
- `src/tools/interaction.ts` - click, type, hover, drag, etc.
- `src/tools/snapshot.ts` - browser_snapshot, browser_take_screenshot
- `src/tools/evaluation.ts` - browser_evaluate, electron_evaluate_main
- `src/tools/waiting.ts` - browser_wait_for, browser_handle_dialog
- `src/tools/windows.ts` - browser_tabs, browser_resize, browser_close
- `src/tools/application.ts` - electron_app_info

**Utilities:**
- `src/utils/errors.ts` - Custom errors with recovery suggestions
- `src/utils/refs.ts` - Element ref manager

**Tests:**
- `test/config.test.ts`
- `test/refs.test.ts`
- `test/errors.test.ts`

**Documentation:**
- `README.md`
- `docs/plans/electron-ui-mcp-design.md` - Original design document
- `AGENTS.md` - Project guidelines

### Review Criteria

Please evaluate the project on these dimensions:

#### 1. Architecture & Design
- Is the lifecycle state machine in `ElectronContext` robust?
- Is the ref/snapshot system well-designed for LLM usage?
- Are there any race conditions or timing issues?
- Is the config resolution order sensible?

#### 2. Code Quality
- TypeScript type safety - any `any` types that should be stricter?
- Error handling - are errors informative with good recovery suggestions?
- Code organization - is the separation of concerns appropriate?
- Are there any code smells or anti-patterns?

#### 3. MCP Compliance
- Do the tool schemas match Playwright MCP conventions?
- Are tool annotations (readOnlyHint, destructiveHint, etc.) correct?
- Is the tool response format appropriate for LLM consumption?

#### 4. Security Concerns
- Any risks with `electron_evaluate_main` executing arbitrary code?
- File path handling - any path traversal concerns?
- Environment variable handling - any secrets exposure risks?

#### 5. Reliability & Edge Cases
- What happens if the Electron app crashes mid-session?
- How does it handle multiple windows opening/closing?
- What if dialogs appear unexpectedly?
- Stale ref handling - is it robust enough?

#### 6. Testing Coverage
- What's missing from the current unit tests?
- What integration tests should be added?
- Any suggestions for a fixture Electron app for E2E tests?

#### 7. Documentation
- Is the README clear and complete?
- Are the tool descriptions helpful for LLMs?
- Any missing documentation?

#### 8. Performance
- Any concerns with the snapshot/bounding box collection?
- Memory leaks from event handlers?
- Cleanup on app close - is it thorough?

#### 9. Improvements & Suggestions
- What features are missing that would be valuable?
- Any simplifications that could reduce complexity?
- Dependencies that could be removed or swapped?

### Output Format

Please write your findings to: `docs/reviews/REVIEW_[DATE].md`

Structure your review as:

```markdown
# Code Review: electron-ui-mcp

**Reviewer:** [LLM Name/Version]
**Date:** [Date]
**Commit:** [Current commit hash]

## Executive Summary
[2-3 paragraph overview of findings]

## Architecture & Design
[Detailed findings]

## Code Quality
[Detailed findings]

## MCP Compliance
[Detailed findings]

## Security Concerns
[Detailed findings with severity ratings]

## Reliability & Edge Cases
[Detailed findings]

## Testing Coverage
[Detailed findings with specific test suggestions]

## Documentation
[Detailed findings]

## Performance
[Detailed findings]

## Recommended Improvements

### High Priority
- [Item 1]
- [Item 2]

### Medium Priority
- [Item 1]
- [Item 2]

### Low Priority / Nice-to-Have
- [Item 1]
- [Item 2]

## Conclusion
[Final assessment and overall recommendation]
```

---

## How to Use This Prompt

1. Start a new conversation with an LLM (Claude, GPT-4, Gemini, etc.)
2. Share this prompt along with the project files
3. Ask the LLM to perform the review and output to the specified location
4. Review findings and create issues/tasks as needed

Alternatively, if using Claude Code or similar:
```
Review the electron-ui-mcp project following the guidelines in docs/REVIEW_PROMPT.md
```
