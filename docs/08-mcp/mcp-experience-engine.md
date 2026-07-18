---
title: Experience Engine & CLI Tools MCP
sidebar_label: Experience Engine MCP
sidebar_position: 2
---

# Experience Engine & muonroi-cli Tools MCP

Two stdio MCP servers give any agent (Claude Code, Codex, Cursor, Gemini CLI) access to the Muonroi **Experience Engine** brain and the muonroi-cli developer toolchain. They are **separate servers with no overlap** — one brain, one implementation each:

| Server | Package / command | Serves | Install cost |
|--------|-------------------|--------|--------------|
| `experience-engine` | `@muonroi/experience-engine` → `exp-mcp` | the `ee_*` brain tools | tiny — just the engine |
| `muonroi-tools` | `muonroi-cli` → `muonroi-cli tools-mcp` | `selfverify_*`, `usage_forensics`, `lsp_*`, `setup_guide` | the full CLI |

:::info Why two servers
The `ee_*` tools used to be served by muonroi-cli's `muonroi-tools` server as well. That forced anyone who only wanted the brain to install a whole CLI, and left two copies of the same four tools to drift apart. Since v0.7.0 the brain is served **only** by `exp-mcp` from the `experience-engine` package. `muonroi-tools` deliberately does **not** serve `ee_*` anymore.
:::

## Experience Engine MCP (`exp-mcp`)

Semantic recall over the shared brain — prior decisions, gotchas, learned warnings/recipes, and task checkpoints — plus the feedback loop that keeps the brain clean.

### Install & register

```bash
npm i -g @muonroi/experience-engine
claude mcp add experience-engine --scope user -- exp-mcp
```

Or in any `mcpServers` config:

```json
{
  "mcpServers": {
    "experience-engine": { "command": "exp-mcp" }
  }
}
```

**Config:** `~/.experience/config.json` supplies the brain URL and auth token — the hosted brain at `https://experience.muonroi.com` on thin-client installs, or `http://localhost:8082` on a local full brain.

### Tools

#### `ee_query`

Active recall over the brain via the `recallMode` pipeline (same path as `exp-recall.js`). **Call proactively, before acting** on an unfamiliar or risky step. Returns ranked lines with `[id col]` handles.

| Parameter | Type | Description |
|-----------|------|-------------|
| `query` | string | Natural-language question |
| `project` | string | Optional slug — pick from `ee_projects`, do not invent one |

#### `ee_feedback`

Rate a recall entry so the brain keeps what helped and prunes the rest. Call once per `[id col]` you used or judged, after acting on an `ee_query` result.

| Parameter | Type | Description |
|-----------|------|-------------|
| `verdict` | enum | `followed` (you changed approach because of it), `ignored` (topical but didn't apply), `noise` (wrong by category) |
| `id`, `collection` | string | The `[id col]` handle from the recall |
| `reason` | enum | For `noise` only, first match wins: `stale_rule` → `wrong_repo` (entry SURVIVES for other repos) → `wrong_language` (SURVIVES for other langs) → `wrong_task` (LAST RESORT — deletes after 4 reports) |

#### `ee_projects`

List the project slugs the brain actually holds, with entry counts. **Call before passing `project`** to `ee_query`/`ee_write` — pick a slug verbatim instead of inventing one from the repo name.

#### `ee_health`

Check brain reachability. `{ok, status}`: `ok=true` answered; `status=0` = no response at all (down/DNS/timeout); `401/403` = auth token; `429` = rate limited, back off; `5xx` = brain-side fault. Never blocks work — if the brain is down, proceed.

#### `ee_write`

Save a new lesson the moment you hit a mistake and find the working fix — record the pitfall **and** the fix in one concise, generalizable lesson.

## muonroi-cli Tools MCP (`muonroi-tools`)

The muonroi-cli developer toolchain for **external** agents (the CLI's own inner agent calls these natively, no MCP hop).

### Register — via published npm (recommended)

Point the server at the published package so it can never go stale on a local dev build:

```bash
claude mcp add muonroi-tools --scope user -- cmd /c npx -y muonroi-cli@latest tools-mcp
```

(drop `cmd /c` on Linux/macOS). Equivalent `mcpServers` entry:

```json
{
  "mcpServers": {
    "muonroi-tools": {
      "type": "stdio",
      "command": "cmd",
      "args": ["/c", "npx", "-y", "muonroi-cli@latest", "tools-mcp"]
    }
  }
}
```

:::warning Avoid dev-linked binaries
Registering a locally-built binary (e.g. a `bun`-compiled `muonroi-cli-dev`) freezes the tool surface to whatever was compiled — it keeps serving tools long after they are removed from source. Using `npx muonroi-cli@latest` re-resolves the published version on each launch, so the surface can't drift. MCP config is read at **client startup** — restart the agent after editing it.
:::

### Tools

| Tool | Purpose |
|------|---------|
| `selfverify_start` / `_status` / `_result` / `_list` / `_cancel` | Async self-QA harness — Tier-1 heuristic or Tier-2 agentic LLM-driven runs |
| `usage_forensics` | Per-session cost/token forensics (peak input, cache hits, anomalies) |
| `lsp_query` | goToDefinition, findReferences, hover, symbols, call hierarchy |
| `lsp_waitForDiagnostics` / `lsp_impactOfChange` / `lsp_mutationPreview` | LSP-backed change-impact and diagnostics |
| `setup_guide` | Up-to-date muonroi-cli setup/install/first-run/MCP-wiring guide |

## Verify a registration

Reading the source proves nothing — **drive the server**. Pipe a JSON-RPC handshake into the command and inspect the returned tool names:

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"v","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | exp-mcp
```

`exp-mcp` returns the five `ee_*` tools; `npx muonroi-cli@latest tools-mcp` returns the `selfverify_*`/`lsp_*`/`usage_forensics`/`setup_guide` set with **no** `ee_*`. For an end-to-end brain check, `npx muonroi-cli@latest doctor` reports `ee.health: … server=ok, gates=ok`.

## See Also

- [BB Docs MCP Server](./mcp-bb-docs.md) — semantic search over Building Block docs and package references
- [MCP Developer Server](./mcp-developer-server.md) — RuleGen, scaffold, and compliance tools for Muonroi C# authoring
