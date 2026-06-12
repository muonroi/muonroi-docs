# Setup recipe — Muonroi agent ecosystem (full install)

> Agent-executable playbook for setting up the **whole** Muonroi agent toolchain on a fresh machine:
> muonroi-cli + Experience Engine + the two local MCP servers (`tools-mcp`, `mcp-driver`). Do the
> components in this order — later ones depend on earlier ones. For each component, call
> `setup_guide` with that component name for the detailed steps; this file is the orchestration map.

## Prerequisites

- A shell (Linux/macOS bash or Windows PowerShell).
- **Node.js ≥ 20** (Experience Engine, recall/feedback helpers).
- Optional: **Docker** (local Experience Engine stack) and/or **Bun ≥ 1.3** (if installing the CLI
  via `bun add -g` instead of the prebuilt binary).

## Values to collect from the user

Gather these up front so the whole flow runs without stopping:

| Value | For component | Notes |
|-------|---------------|-------|
| **OS / shell** | muonroi-cli | picks `install.sh` vs `install.ps1`. |
| **CLI provider + API key** | muonroi-cli | `deepseek` or `siliconflow` (BYOK). |
| **EE deployment mode** | experience-engine | `local-docker` (zero keys, needs Docker) or `thin-client`. |
| `serverBaseUrl` + `serverAuthToken` | experience-engine (thin-client) | from the team VPS admin. |
| **MCP client** | tools-mcp + harness | `Claude Code` \| `Cursor` \| `Claude Desktop`. |

## Steps

1. **Install muonroi-cli** → `setup_guide { component: "muonroi-cli" }`.
   End state: `muonroi-cli`/`mu` on PATH, provider key stored, `muonroi-cli --smoke-boot-only` passes.
2. **Set up Experience Engine** → `setup_guide { component: "experience-engine" }`.
   End state: `~/.experience/config.json` exists; `curl <serverBaseUrl-or-localhost>:8082/health`
   returns `status: ok`. (Required for the `ee.*` tools in step 3; skippable if you don't need recall.)
3. **Register `tools-mcp`** in the MCP client → `setup_guide { component: "muonroi-tools" }`.
   End state: client advertises 9 tools; `ee.health` returns `{ ok: true }`.
4. **Register `mcp-driver`** in the MCP client → `setup_guide { component: "harness" }`.
   End state: client advertises 16 `tui.*` tools; `tui.capabilities` responds.

> `tools-mcp` and `mcp-driver` are **local by design** — they act on the caller's own machine and are
> intentionally not hosted. Only the docs MCP (the one serving this recipe) is hosted.

## Verify

End-to-end checklist after all four components:

- `muonroi-cli --smoke-boot-only` → boots clean.
- `curl <ee-host>:8082/health` → `status: ok`.
- In the MCP client, `ee.health` → `{ ok: true }` and `tui.capabilities` → tool list.
- `node ~/.experience/exp-recall.js "test"` → returns ranked lines or empty (no error).

## Troubleshooting

- Resolve failures **per component** using that component's own recipe Troubleshooting section
  (`setup_guide { component: "<name>" }`).
- Most common ordering mistake: registering `tools-mcp` before Experience Engine is configured →
  `ee.*` tools return error envelopes until `~/.experience/config.json` is populated.

## Deep references

- Each component's deep docs are linked from its individual recipe; use `docs_search` (this MCP) for
  any field not covered, e.g. `docs_search "muonroi-cli providers reference"`.
