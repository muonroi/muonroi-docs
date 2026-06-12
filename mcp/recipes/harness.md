# Setup recipe — Agent Harness (`mcp-driver`)

> Agent-executable playbook. **Collect the values below first**, then run the steps. The harness is
> NOT a separate install — it is the `mcp-driver` subcommand built into the muonroi-cli binary. It
> lets an external agent *drive the muonroi-cli TUI as a real user* (structured JSON, no
> screenshots/OCR), exposing 16 `tui.*` tools over stdio MCP. Protocol v0.4.0.

## Prerequisites

- **muonroi-cli installed first** (see the `muonroi-cli` setup recipe). Provides `muonroi-cli` / `mu`.
- Works natively on **Windows** (named pipes) and **POSIX** (fd 3/4) — no WSL required for the MCP path.

## Values to collect from the user

| Value | When needed | Notes |
|-------|-------------|-------|
| **MCP client** | always | `Claude Desktop` \| `Cursor` \| `Claude Code` \| other — determines config location. |
| **Install shape** | always | `global-binary` (command = `muonroi-cli`) \| `repo-checkout` (command = `bun` + entry path). |

No API keys are required to register the driver itself; driving real LLM flows uses muonroi-cli's own
configured provider (or a mock fixture for tests).

## Steps

1. Confirm the CLI is on PATH: `muonroi-cli --smoke-boot-only`.
2. **Register the MCP server** in the client config.
   - Global binary:
     ```json
     {
       "mcpServers": {
         "muonroi-harness": { "command": "muonroi-cli", "args": ["mcp-driver"] }
       }
     }
     ```
   - From a repo checkout (Bun):
     ```json
     {
       "mcpServers": {
         "muonroi-harness": {
           "command": "bun",
           "args": ["run", "/absolute/path/to/muonroi-cli/src/index.ts", "mcp-driver"]
         }
       }
     }
     ```
   For Claude Code: `claude mcp add muonroi-harness -- muonroi-cli mcp-driver`.
3. Restart the client. It advertises **16 `tui.*` tools**: `tui.start`, `tui.snapshot`, `tui.press`,
   `tui.type`, `tui.query`, `tui.wait_for`, `tui.expect`, `tui.last_event`, `tui.stop`, `tui.capabilities`,
   `tui.changes_since`, … Drive flows by calling them.

> **Security boundary** (enforced by `tui.start` before any spawn): argv allowlist (`--agent-*`,
> `--mock-llm=*`, `--profile=*` only; else `{error:"argv_rejected"}`), env strip (`NODE_OPTIONS`,
> `BUN_OPTIONS`, `LD_PRELOAD`, `DYLD_*`, `LD_AUDIT`, `NODE_PATH`), cwd containment (`realpath` under
> home or repo root), and mock-llm path containment. This is a **local** driver by design — it spawns
> the caller's own TUI; it is intentionally NOT hosted centrally.

## Verify

- Protocol smoke (Windows-compatible) advertising `tui.capabilities`:
  ```bash
  printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"v","version":"0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"tui.capabilities","arguments":{}}}\n' | mu mcp-driver
  ```
- Inside the agent: `tui.start` → `tui.snapshot` returns a semantic frame; `tui.query "role=textbox"`
  finds the composer.

## Troubleshooting

- **`{error:"argv_rejected"}` from `tui.start`** → you passed an arg outside the allowlist; only
  `--agent-*`, `--mock-llm=*`, `--profile=*` are permitted.
- **Client shows 0 tools** → wrong `command`/`args`; restart client after editing config.
- **Windows** → named-pipe transport is automatic; the legacy `windows_unsupported` guard is no
  longer emitted. WSL is only needed for the vitest E2E fallback, not the MCP driver.

## Deep references

- docs.muonroi.com → CLI → *MCP Harness Driver* (16-tool catalogue, selector grammar, event kinds).
- Related: the **muonroi-tools** recipe (`tools-mcp`, analysis tools) and **muonroi-cli** recipe.
