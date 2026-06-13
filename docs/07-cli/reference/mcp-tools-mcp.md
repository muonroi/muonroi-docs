---
title: MCP Tools Server
sidebar_label: MCP Tools Server
sidebar_position: 5
---

# MCP Tools Server

The `tools-mcp` subcommand boots a stdio Model Context Protocol (MCP) server
that exposes muonroi-cli's **native developer tools** — self-verification runs,
Experience-Engine recall, per-session cost forensics, and LSP-backed code
intelligence — to external agents (Claude Code, Cursor, Codex, custom MCP
clients).

Where the [MCP Harness Driver](./mcp-harness-driver.md) lets an agent *drive the
TUI*, the Tools Server lets an agent *call the CLI's analysis capabilities
directly* as structured JSON-RPC tools.

The implementation lives in `src/mcp/tools-server.ts:156` (server registration)
and is wired into the CLI at `src/index.ts:1585` (`tools-mcp` command).

## Overview

- **Transport**: stdio JSON-RPC (MCP SDK `StdioServerTransport`,
  `src/mcp/tools-server.ts:169`).
- **Server name / version**: `muonroi-tools` / `0.1.0`
  (`src/mcp/tools-server.ts:156`).
- **Tool count**: 10 (see [Tool Catalogue](#tool-catalogue)).
- **Output envelope**: every tool returns
  `{ content: [{ type: "text", text: <json> }] }`; errors return the same
  envelope with `isError: true` and a `{ error, message }` payload.

## Launching the server

```bash
muonroi-cli tools-mcp
# short alias:
mu tools-mcp
# or, from a checkout of this repo:
bun run src/index.ts tools-mcp
```

The process reads JSON-RPC over stdin and writes responses over stdout. Logs go
to stderr.

## Installation

`tools-mcp` ships with the muonroi-cli binary. Install the CLI first:

```bash
# Linux / macOS (prebuilt binary, zero runtime deps)
curl -fsSL https://raw.githubusercontent.com/muonroi/muonroi-cli/master/install.sh | bash

# Windows PowerShell
irm https://raw.githubusercontent.com/muonroi/muonroi-cli/master/install.ps1 | iex

# or via Bun (requires Bun >= 1.3)
bun add -g muonroi-cli
```

:::note
Install with the prebuilt binary or `bun add -g` — **not** `npm install -g`. The
TUI uses Bun-only `import ... with { type: "file" }` syntax that the Node ESM
loader cannot parse. The standalone binary bundles its own runtime; `bun add -g`
requires Bun on `PATH`. The binary exposes both `muonroi-cli` and `mu`.
:::

## MCP client configuration

Add the following to your MCP client config (Claude Code, Cursor, or any
SDK-compatible client). If the CLI is installed globally:

```json
{
  "mcpServers": {
    "muonroi-tools": {
      "command": "muonroi-cli",
      "args": ["tools-mcp"]
    }
  }
}
```

From a repo checkout, point at the entrypoint via Bun:

```json
{
  "mcpServers": {
    "muonroi-tools": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/muonroi-cli/src/index.ts", "tools-mcp"]
    }
  }
}
```

After restart, the client advertises 10 tools across the `selfverify_*`,
`ee_*`, `usage_*`, and `lsp_*` namespaces.

## Prerequisites

Each tool group has its own dependency. The server starts regardless; a tool
returns an error envelope if its backing service is unreachable.

| Group | Requires | Configured via |
|-------|----------|----------------|
| `selfverify_*` | A muonroi-cli workspace (runs in-process). LLM-driven `agentic` mode needs a provider configured. | CLI settings / provider config |
| `ee_*` | A reachable Experience-Engine server. | `~/.experience/config.json` → `serverBaseUrl`, `serverAuthToken` |
| `usage_forensics` | A session activity log. | `EXPERIENCE_ACTIVITY_LOG` (default `~/.experience/activity.jsonl`) |
| `lsp_query` | A running language server for the target file. | CLI settings `lsp.enabled`, `lsp.tool` |

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `EXPERIENCE_ACTIVITY_LOG` | `~/.experience/activity.jsonl` | Path to the JSONL activity log read by `usage_forensics` (`src/ee/search.ts:49`). |
| `EXP_SESSION` | _(unset)_ | Optional source session id used to scope `ee_query` recall context (`src/ee/search.ts:89`). |
| `EXPERIENCE_RECALL_FEEDBACK_GATE` | `soft` | Feedback-gate mode for `ee_query`: `off` disables the gate, `soft` warns when unrated entries accumulate, `hard` refuses new recalls until unrated debt is below threshold. (`src/mcp/ee-tools.ts:63`) |
| `EXPERIENCE_RECALL_FEEDBACK_THRESHOLD` | `3` | Number of unrated `ee_query` results that trigger the hard gate. Only active when `EXPERIENCE_RECALL_FEEDBACK_GATE=hard`. (`src/mcp/ee-tools.ts:68`) |

## Tool catalogue

Inputs are validated with Zod; violations surface as MCP protocol errors before
reaching tool code.

### Self-verification

Run and poll the CLI's self-verify pipeline (heuristic `tier1` or LLM-driven
`agentic`). `selfverify_start` returns immediately with a `runId`; poll
`selfverify_status` / fetch `selfverify_result`.

| Tool | Input | Output | Source | Purpose |
|------|-------|--------|--------|---------|
| `selfverify_start` | `mode: "tier1" \| "agentic"`, `since?: string`, `max?: 1..50`, `emit?: boolean`, `out?: string`, `goal?: string`, `llm?: string`, `turns?: 1..50` | `{ runId }` | `src/mcp/tools-server.ts:63` | Start a self-verify run; returns the run id for polling. |
| `selfverify_status` | `runId: string` | `{ status, logTail, elapsedMs }` | `src/mcp/tools-server.ts:102` | Status, log tail, and elapsed time of a running job. |
| `selfverify_result` | `runId: string` | full report | `src/mcp/tools-server.ts:122` | Full report of a completed run (when `status = "done"`). |
| `selfverify_list` | none | run summaries | `src/mcp/tools-server.ts:137` | List recent self-verify runs with status + elapsed time. |
| `selfverify_cancel` | `runId: string` | `{ cancelled }` | `src/mcp/tools-server.ts:152` | Best-effort cancel of a running job. |

### Experience Engine

Active recall over the Experience-Engine brain (prior decisions, gotchas, task
checkpoints). `ee_query` stamps every returned `[id col]` handle into a
session-scoped pending ledger (`src/ee/recall-ledger.ts`). Subsequent
`ee_query` calls warn (soft mode) or refuse (hard mode) when unrated entries
accumulate above the threshold — use `ee_feedback` to clear them.

| Tool | Input | Output | Source | Purpose |
|------|-------|--------|--------|---------|
| `ee_query` | `query: string` (1–1000), `project?: string` (≤200), `maxChars?: 500..20000` | ranked index with `[id col]` handles | `src/mcp/ee-tools.ts:94` | Scope-filtered retrieval across all experience tiers (T0 principles → T1 behavioral → T2 seeds → self-QA). |
| `ee_feedback` | `id: string` (1–200), `collection: string` (1–200), `verdict: "followed"\|"ignored"\|"noise"`, `reason?: "wrong_repo"\|"wrong_language"\|"wrong_task"\|"stale_rule"` (required when verdict=`"noise"`) | `{ ok, id, verdict, pendingRemaining }` | `src/mcp/ee-tools.ts:145` | Rate a recalled entry after acting on an `ee_query` result. Clears the entry from the session pending-feedback gate. |
| `ee_health` | none | `{ ok, ... }` | `src/mcp/ee-tools.ts:193` | Check Experience-Engine server reachability. |

### Cost forensics

| Tool | Input | Output | Source | Purpose |
|------|-------|--------|--------|---------|
| `usage_forensics` | `prefix: string` (1–100) | per-session cost report | `src/mcp/forensics-tools.ts:40` | Token-cost forensics by session-id prefix — peak input tokens, cache-hit ratio, per-event breakdown. |

### Code intelligence

| Tool | Input | Output | Source | Purpose |
|------|-------|--------|--------|---------|
| `lsp_query` | `operation: <LSP op>`, `filePath: string` (1–1000), `line?: number`, `character?: number`, `query?: string` (≤1000) | LSP result | `src/mcp/lsp-tools.ts:43` | Semantic code intelligence via a language server. |

Supported `operation` values: `goToDefinition`, `findReferences`, `hover`,
`documentSymbol`, `workspaceSymbol`, `goToImplementation`,
`prepareCallHierarchy`, `incomingCalls`, `outgoingCalls`.

:::note C# (`csharp-ls`)
`csharp-ls` is the built-in server for `.cs` files. Install it with
`dotnet tool install -g csharp-ls`; the CLI resolves it from `PATH` first,
then falls back to `~/.dotnet/tools` (the dotnet global-tools directory is
frequently absent from `PATH` in spawned processes). Position-based operations
(`goToDefinition`, `hover`, `findReferences`) respond immediately after server
start. `documentSymbol` only returns results after the project or solution has
been fully restored and loaded — retry once the workspace has warmed up.
(`src/mcp/lsp-tools.ts:44`, `src/lsp/builtins.ts:237`)
:::

## Example: active recall before a risky step

```jsonc
→ {"jsonrpc":"2.0","id":1,"method":"tools/call",
   "params":{"name":"ee_query",
   "arguments":{"query":"how is JWT auth toggled in control-plane",
   "project":"muonroi-control-plane"}}}
← {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text",
   "text":"[id col] ... ranked recall lines ..."}]}}
```

After acting on a recalled hint, rate it via the `ee_feedback` MCP tool (or
`exp-feedback` CLI) so the brain learns — see the
[Experience Engine guide](../guides/experience-engine.md).

```jsonc
→ {"jsonrpc":"2.0","id":2,"method":"tools/call",
   "params":{"name":"ee_feedback",
   "arguments":{"id":"<id>","collection":"<col>","verdict":"followed"}}}
← {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text",
   "text":"{\"ok\":true,\"id\":\"...\",\"verdict\":\"followed\",\"pendingRemaining\":0}"}]}}
```

## See also

- [MCP Harness Driver](./mcp-harness-driver.md) — drive the TUI as a structured
  surface (`tui.*` tools).
- [Commands Reference](./commands-reference.md) — top-level CLI commands
  including `tools-mcp`.
- [Experience Engine guide](../guides/experience-engine.md) — recall workflow and
  feedback verdicts behind `ee_query` / `ee_feedback`.
- [Cost-leak forensics guide](../guides/cost-leak-forensics.md) — interpreting
  `usage_forensics` output.
