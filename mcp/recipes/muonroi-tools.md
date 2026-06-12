# Setup recipe — muonroi-tools (`tools-mcp`)

> Agent-executable playbook. **Collect the values below first**, then run the steps. `muonroi-tools`
> is NOT a separate install — it is the `tools-mcp` subcommand built into the muonroi-cli binary. It
> exposes muonroi-cli's native developer tools (self-verify, Experience-Engine recall, cost
> forensics, LSP) to an external agent as 9 JSON-RPC tools.

## Prerequisites

- **muonroi-cli installed first** (see the `muonroi-cli` setup recipe). The binary provides
  `muonroi-cli` / `mu`.
- For the `ee.*` tool group only: a reachable **Experience Engine** with `~/.experience/config.json`
  containing `serverBaseUrl` + `serverAuthToken` (see the `experience-engine` setup recipe).
- The server starts even if a backing service is down; the affected tool just returns an error envelope.

## Values to collect from the user

| Value | When needed | Notes |
|-------|-------------|-------|
| **MCP client** | always | `Claude Code` \| `Cursor` \| other SDK-compatible client — determines where the config goes. |
| **Install shape** | always | `global-binary` (config command = `muonroi-cli`) \| `repo-checkout` (config command = `bun` + entry path). |
| **Experience Engine configured?** | for `ee.*` | if yes, confirm `~/.experience/config.json` has `serverBaseUrl` + `serverAuthToken`. |
| `EXPERIENCE_ACTIVITY_LOG` | optional | only if `usage.forensics` should read a non-default log (default `~/.experience/activity.jsonl`). |

## Steps

1. Confirm the CLI is on PATH: `muonroi-cli --smoke-boot-only` (or `mu --smoke-boot-only`).
2. **Register the MCP server** in the user's client config.
   - Global binary install:
     ```json
     {
       "mcpServers": {
         "muonroi-tools": { "command": "muonroi-cli", "args": ["tools-mcp"] }
       }
     }
     ```
   - From a repo checkout (Bun):
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
   For Claude Code you can also run:
   `claude mcp add muonroi-tools -- muonroi-cli tools-mcp`.
3. Restart the MCP client. It advertises **9 tools** across `selfverify.*`, `ee.*`, `usage.*`, `lsp.*`.
4. (If using `ee.*`) ensure Experience Engine is set up so `~/.experience/config.json` is populated.

> This is a **local** server by design — it acts on the caller's own machine (self-verify drives your
> repo, `usage.forensics` reads your sessions, `lsp.query` indexes your code). It is intentionally NOT
> hosted centrally.

## Verify

- Protocol smoke without an MCP client (advertises tools):
  ```bash
  printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"v","version":"0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | mu tools-mcp
  ```
- Inside the agent, call `ee.health` → `{ ok: true }` proves the Experience-Engine link; call
  `ee.query` with a sample query to confirm recall returns `[id col]` lines.

## Troubleshooting

- **Client shows 0 tools** → wrong `command`/`args`; for global install use `command:"muonroi-cli"`,
  for a checkout use `bun` + absolute entry path. Restart the client after editing config.
- **`ee.*` tools return an error envelope** → Experience Engine unreachable; verify
  `~/.experience/config.json` `serverBaseUrl`/`serverAuthToken` and that the server responds on
  `/health`.
- **`usage.forensics` empty** → no activity log yet, or `EXPERIENCE_ACTIVITY_LOG` points elsewhere.

## Deep references

- docs.muonroi.com → CLI → *MCP Tools Server* (full 9-tool catalogue + Zod input schemas).
- Related: the **harness** recipe (`mcp-driver`, 16 `tui.*` tools) and **experience-engine** recipe.
