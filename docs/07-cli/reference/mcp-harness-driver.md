---
title: MCP Harness Driver
sidebar_label: MCP Harness Driver
sidebar_position: 4
---

# MCP Harness Driver

The `mcp-driver` subcommand boots a stdio Model Context Protocol (MCP) server
that exposes muonroi-cli's TUI as a structured surface to external agents
(Claude Desktop, Cursor, Codex, custom MCP clients). Agents drive the TUI as a
real user via JSON-RPC tool calls instead of screenshots or OCR.

The implementation lives in `packages/agent-harness-core/src/mcp-server.ts:386`
(`createMcpHarnessServer`) and is wired into the CLI at
`src/index.ts:1403` (`mcp-driver` command).

## Overview

- **Transport**: stdio JSON-RPC (MCP SDK `StdioServerTransport`,
  `packages/agent-harness-core/src/mcp-server.ts:537`).
- **Underlying TUI transport**: POSIX uses anonymous `fd 3`/`fd 4`
  sidechannels; Windows uses named pipes
  (`\\.\pipe\muonroi-harness-{pid}-{uuid}-{in|out}`). Selection is automatic —
  the spawn implementation injected at construction time
  (`packages/agent-harness-opentui/src/agent-mode.ts:73`) picks the correct
  transport per platform.
- **Protocol version**: `0.4.0` (`packages/agent-harness-core/src/protocol.ts:1`).
- **Tool count**: 16 (see [Tool Catalogue](#tool-catalogue)).

The server is a thin layer over the in-process `Driver` API
(`packages/agent-harness-core/src/driver.ts`). Every tool delegates to a
Driver method on the current TUI child, or returns
`{ error: "no_driver", message: "Call tui.start first" }` when no TUI is
running (`packages/agent-harness-core/src/mcp-server.ts:131`).

## Launching the driver

```bash
muonroi-cli mcp-driver
# or, in this repo:
bun run src/index.ts mcp-driver
```

The process reads JSON-RPC over stdin and writes responses over stdout. Logs
go to stderr.

## MCP client configuration

Add the following to your MCP client config (Claude Desktop, Cursor, or any
SDK-compatible client):

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

If `muonroi-cli` is installed globally, point `command` at the binary and
drop the `bun run` wrapper:

```json
{
  "mcpServers": {
    "muonroi-harness": {
      "command": "muonroi-cli",
      "args": ["mcp-driver"]
    }
  }
}
```

After restart, the client advertises 16 tools prefixed `tui.*`. Begin every
session with `tui.start` and end with `tui.stop`.

## Security boundary

`tui.start` performs four independent checks before spawning the child TUI.
Any failure short-circuits the spawn and returns an error response with
`isError: true`. None of these checks can be disabled at runtime.

### 1. Argv allowlist

Only flags that match the following regex are accepted
(`packages/agent-harness-core/src/mcp-server.ts:57`):

```
^(--agent-[a-z-]+(=.*)?|--mock-llm(=.+)?|--profile=[a-zA-Z0-9_-]+)$
```

In practice this allows:

- `--agent-mode`, `--agent-snapshot`, `--agent-record`, …
- `--mock-llm`, `--mock-llm=<path>`
- `--profile=<name>` (alphanumeric, `_`, `-`)

Any other argv triggers
`{ error: "argv_rejected", bad: "<offending-arg>" }`
(`packages/agent-harness-core/src/mcp-server.ts:431`). The driver also force-
appends `--agent-mode` if the caller omitted it
(`packages/agent-harness-core/src/mcp-server.ts:462`).

### 2. Environment strip

The following keys are removed from the inherited environment before spawn
(`packages/agent-harness-core/src/mcp-server.ts:59`):

- `NODE_OPTIONS`
- `BUN_OPTIONS`
- `LD_PRELOAD`
- `DYLD_INSERT_LIBRARIES`
- `DYLD_LIBRARY_PATH`
- `LD_AUDIT`
- `DYLD_FRAMEWORK_PATH`
- `NODE_PATH`

In addition, every key must match `^[A-Z_][A-Z0-9_]{0,63}$` —
non-conformant keys are silently dropped
(`packages/agent-harness-core/src/mcp-server.ts:58`).

### 3. CWD containment

If the caller provides `cwd`, it is resolved with `realpathSync` and rejected
unless it equals or is contained by the user's home directory **or** the
muonroi-cli repository root
(`packages/agent-harness-core/src/mcp-server.ts:89`). Symlink escape attempts
fail because `realpathSync` resolves them before comparison. Failure returns
`{ error: "cwd_rejected", reason: "<reason>" }`
(`packages/agent-harness-core/src/mcp-server.ts:442`).

### 4. Mock-LLM path containment

`mockLlmDir`, when supplied, is resolved against the repo root and rejected
if it escapes (`packages/agent-harness-core/src/mcp-server.ts:108`). Failure
returns `{ error: "mock_llm_rejected" }`
(`packages/agent-harness-core/src/mcp-server.ts:449`).

### 5. Single-instance guard

Only one TUI child may run per driver. A second `tui.start` returns
`{ error: "already_started" }`
(`packages/agent-harness-core/src/mcp-server.ts:424`). Call `tui.stop` before
starting another.

### Platform support

Both POSIX and Windows are supported. The Windows transport (named pipes) was
added after the original POSIX-only release; the spawn implementation
(`packages/agent-harness-opentui/src/agent-mode.ts:73`) auto-selects the
correct path. Legacy callers that hard-coded `windows_unsupported` checks
should remove those guards.

## Tool catalogue

All tools live under the `tui.` namespace. Inputs are validated with Zod;
violations surface as MCP protocol errors before reaching tool code. Outputs
are always wrapped in `{ content: [{ type: "text", text: <json-or-string> }] }`
— the value shown in the table is the decoded payload.

### Lifecycle

| Tool | Input | Output | Source | Purpose |
|------|-------|--------|--------|---------|
| `tui.start` | `args: string[]`, `cwd?: string`, `env?: Record<string,string>`, `mockLlmDir?: string` | `{ ok: true, pid }` or `{ error }` | `packages/agent-harness-core/src/mcp-server.ts:411` | Spawn the TUI in agent-mode after all four security checks pass. |
| `tui.stop` | none | `"ok"` | `packages/agent-harness-core/src/mcp-server.ts:356` | Kill the current child TUI and clear the driver slot. |

### Inspection

| Tool | Input | Output | Source | Purpose |
|------|-------|--------|--------|---------|
| `tui.capabilities` | none | `{ protocol: "0.4.0", features: string[] }` | `packages/agent-harness-core/src/mcp-server.ts:395` | Report the wire protocol version and supported feature list. Safe to call before `tui.start`. |
| `tui.snapshot` | none | `LiveFrame \| null` | `packages/agent-harness-core/src/mcp-server.ts:136` | Most recent `LiveFrame` observed from the TUI (see `packages/agent-harness-core/src/protocol.ts:44`). |
| `tui.changes_since` | `seq: number` | `LiveFrame \| null` | `packages/agent-harness-core/src/mcp-server.ts:142` | Returns the current frame only if its `seq` exceeds the provided number — lets clients poll efficiently. |
| `tui.query` | `selector: string` (≤500 chars) | `UINode \| null` or `{ error: "ambiguous" }` | `packages/agent-harness-core/src/mcp-server.ts:155` | Single-node lookup. Throws (mapped to MCP error) when the selector matches more than one node. |
| `tui.query_all` | `selector: string` | `UINode[]` | `packages/agent-harness-core/src/mcp-server.ts:177` | All matching nodes. |
| `tui.count` | `selector: string` | `string` (decimal integer) | `packages/agent-harness-core/src/mcp-server.ts:190` | Match count — cheaper than `query_all` when only cardinality matters. |
| `tui.expect` | `selector: string`, `predicate: unknown` (Predicate schema) | `"true"` \| `"false"` | `packages/agent-harness-core/src/mcp-server.ts:329` | Evaluate a Zod-typed predicate against the first match. See `packages/agent-harness-core/src/predicate.ts` for grammar. |
| `tui.last_event` | `kind: "toast" \| "stream.delta"` | `LiveEvent \| null` | `packages/agent-harness-core/src/mcp-server.ts:343` | Most recent event of the given kind from the driver's ring buffer (cap 1000). |
| `tui.render_text` | none | ASCII-art string | `packages/agent-harness-core/src/mcp-server.ts:203` | Debug rendering of the current frame as plain text — useful for log capture. |

### Interaction

| Tool | Input | Output | Source | Purpose |
|------|-------|--------|--------|---------|
| `tui.press` | `key: string` (≤64 chars) | `"ok"` | `packages/agent-harness-core/src/mcp-server.ts:220` | Send a single key (e.g. `"Enter"`, `"Down"`, `"Escape"`, `"a"`). |
| `tui.press_sequence` | `keys: string[]` (≤100 items) | `"ok"` | `packages/agent-harness-core/src/mcp-server.ts:234` | Send keys in order with no delay between them. |
| `tui.type` | `text: string` (≤10 000 chars) | `"ok"` | `packages/agent-harness-core/src/mcp-server.ts:248` | Type literal text into the focused element. Newlines must be sent via `tui.press "Enter"`. |
| `tui.focus` | `selector: string` | `"ok"` or `{ error: "focus_failed" }` | `packages/agent-harness-core/src/mcp-server.ts:262` | Move focus by dispatching `__focus__:<id>`. The selector must match exactly one node. |

### Waiting

| Tool | Input | Output | Source | Purpose |
|------|-------|--------|--------|---------|
| `tui.wait_for` | `{ selector?, idle?, all?: WaitCondition[], timeoutMs?: 0..60000 }` | `"ok"` or `{ error: "timeout" }` | `packages/agent-harness-core/src/mcp-server.ts:301` | Block until a selector matches, the TUI signals idle, or every condition in `all` is satisfied. |

`WaitCondition` shape: `{ selector?: string, idle?: boolean }`. Combining
fields inside a single condition AND-joins them; the `all` array AND-joins
multiple conditions.

## Error responses

All tools wrap errors in the standard MCP envelope
(`{ content: [{ type: "text", text: <json> }], isError: true }`). The decoded
JSON payload uses the following stable error codes:

| Code | Origin | Meaning |
|------|--------|---------|
| `no_driver` | every tool except `capabilities`/`start` | `tui.start` has not been called (or `tui.stop` cleared the driver). |
| `already_started` | `tui.start` | A child TUI is already running — call `tui.stop` first. |
| `argv_rejected` | `tui.start` | One element of `args` failed the allowlist regex. Payload includes `bad: "<arg>"`. |
| `cwd_rejected` | `tui.start` | `cwd` escapes home and repo root. Payload includes `reason`. |
| `mock_llm_rejected` | `tui.start` | `mockLlmDir` escapes repo root. |
| `spawn_failed` | `tui.start` | The injected spawn implementation threw. Payload includes `message`. |
| `ambiguous` | `tui.query` | Selector matched more than one node. Use `tui.query_all` or refine the selector. |
| `focus_failed` | `tui.focus` | Selector matched zero or more than one node, or the target rejected focus. |
| `timeout` | `tui.wait_for` | The timeout (default 5 s, max 60 s) elapsed before the condition was satisfied. |

The legacy `windows_unsupported` error documented in older revisions is no
longer emitted — both platforms are supported.

## Example session

The transcript below shows a minimal happy path. Lines beginning `→` are
client-to-driver; lines beginning `←` are driver-to-client. JSON is shown on
one line for brevity.

```jsonc
→ {"jsonrpc":"2.0","id":1,"method":"initialize",
   "params":{"protocolVersion":"2024-11-05","capabilities":{},
   "clientInfo":{"name":"my-agent","version":"0.1"}}}
← {"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05", ...}}

→ {"jsonrpc":"2.0","method":"notifications/initialized","params":{}}

→ {"jsonrpc":"2.0","id":2,"method":"tools/call",
   "params":{"name":"tui.capabilities","arguments":{}}}
← {"jsonrpc":"2.0","id":2,"result":{"content":[{"type":"text",
   "text":"{\"protocol\":\"0.4.0\",\"features\":[\"capabilities\",
   \"snapshot\",\"press\",\"type\",\"wait_for\",\"query\",
   \"expect\",\"render_text\"]}"}]}}

→ {"jsonrpc":"2.0","id":3,"method":"tools/call",
   "params":{"name":"tui.start",
   "arguments":{"args":["--agent-mode","--mock-llm",
   "tests/harness/fixtures/llm"]}}}
← {"jsonrpc":"2.0","id":3,"result":{"content":[{"type":"text",
   "text":"{\"ok\":true,\"pid\":12345}"}]}}

→ {"jsonrpc":"2.0","id":4,"method":"tools/call",
   "params":{"name":"tui.wait_for",
   "arguments":{"idle":true,"timeoutMs":15000}}}
← {"jsonrpc":"2.0","id":4,"result":{"content":[{"type":"text","text":"ok"}]}}

→ {"jsonrpc":"2.0","id":5,"method":"tools/call",
   "params":{"name":"tui.focus","arguments":{"selector":"id=composer"}}}
← {"jsonrpc":"2.0","id":5,"result":{"content":[{"type":"text","text":"ok"}]}}

→ {"jsonrpc":"2.0","id":6,"method":"tools/call",
   "params":{"name":"tui.type","arguments":{"text":"/ideal build a counter"}}}
← {"jsonrpc":"2.0","id":6,"result":{"content":[{"type":"text","text":"ok"}]}}

→ {"jsonrpc":"2.0","id":7,"method":"tools/call",
   "params":{"name":"tui.press","arguments":{"key":"Enter"}}}
← {"jsonrpc":"2.0","id":7,"result":{"content":[{"type":"text","text":"ok"}]}}

→ {"jsonrpc":"2.0","id":8,"method":"tools/call",
   "params":{"name":"tui.wait_for",
   "arguments":{"selector":"id=ideal-halt-card","timeoutMs":30000}}}
← {"jsonrpc":"2.0","id":8,"result":{"content":[{"type":"text","text":"ok"}]}}

→ {"jsonrpc":"2.0","id":9,"method":"tools/call",
   "params":{"name":"tui.snapshot","arguments":{}}}
← {"jsonrpc":"2.0","id":9,"result":{"content":[{"type":"text",
   "text":"{\"mode\":\"live\",\"version\":\"0.4.0\",\"seq\":42, ...}"}]}}

→ {"jsonrpc":"2.0","id":10,"method":"tools/call",
   "params":{"name":"tui.stop","arguments":{}}}
← {"jsonrpc":"2.0","id":10,"result":{"content":[{"type":"text","text":"ok"}]}}
```

## Selector and predicate grammar

Selector strings accepted by `tui.query`, `tui.query_all`, `tui.count`,
`tui.expect`, `tui.focus`, and `tui.wait_for` follow the CSS-like grammar
defined in `packages/agent-harness-core/src/selector.ts`. Quick examples:

```
role=textbox                    # exact field match
name~="Council"                 # case-insensitive substring
name*="Co.*l$"                  # regex
focus                           # flag (also: selected, disabled)
[index=0]                       # positional within siblings
role=dialog >> role=button      # child combinator
role=listitem name="OK"         # AND multiple terms
```

Predicate objects passed to `tui.expect` follow the schema in
`packages/agent-harness-core/src/predicate.ts`, e.g.:

```json
{ "field": "value", "op": "eq", "rhs": "hello" }
```

## See also

- [Commands Reference](./commands-reference.md) — top-level CLI commands including `mcp-driver`.
- `packages/agent-harness-core/README.md` — package-level overview.
- `docs/agent-harness/PROTOCOL.md` — wire format and `LiveFrame`/`LiveEvent` reference.
- `docs/agent-harness/spike-0d-mcp-sdk.md` — design notes from the MCP SDK spike.
