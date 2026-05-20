---
title: Commands Reference
sidebar_label: Commands Reference
sidebar_position: 3
---

# Commands Reference

Comprehensive reference for muonroi-cli top-level commands, slash commands, agent modes, and keyboard shortcuts.

## Top-Level CLI Commands

These commands run outside the TUI, useful for scripting, CI/CD, and headless workflows.

| Command | Description | Example |
|---------|-------------|---------|
| (no args) | Enter interactive TUI with built-in agent | `muonroi-cli` |
| `"<prompt>"` | Start TUI with initial message | `muonroi-cli "fix the flaky test"` |
| `--prompt` | Headless mode with formatted output | `muonroi-cli --prompt "run tests" --format json` |
| `models` | List all available models with pricing | `muonroi-cli models` |
| `doctor` | Health check for CLI dependencies and services | `muonroi-cli doctor` |
| `update` | Update muonroi-cli to the latest release | `muonroi-cli update` |
| `uninstall` | Remove installed binary and optional data | `muonroi-cli uninstall --dry-run` |
| `daemon` | Start the schedule daemon for scheduled tasks | `muonroi-cli daemon --background` |

### Configuration & Keys

| Command | Description | Example |
|---------|-------------|---------|
| `config` | Edit settings interactively | `muonroi-cli config` |
| `keys set <provider>` | Store provider API key in OS keychain | `muonroi-cli keys set anthropic` |
| `keys list` | Show all stored keys (masked) | `muonroi-cli keys list` |
| `keys delete <provider>` | Remove a provider key from keychain | `muonroi-cli keys delete openai` |
| `keys login <provider>` | OAuth subscription login (e.g., openai) | `muonroi-cli keys login openai` |
| `keys logout <provider>` | OAuth subscription logout and token revoke | `muonroi-cli keys logout openai` |
| `keys import-bw [providers...]` | Import keys from Bitwarden vault | `muonroi-cli keys import-bw anthropic openai` |
| `keys cleanup-settings` | Strip plaintext keys from settings.json | `muonroi-cli keys cleanup-settings` |
| `keys set-chat <id>` | Store chat service secret (discord/slack) | `muonroi-cli keys set-chat discord-token` |

### Cost & Usage Analysis

| Command | Description | Example |
|---------|-------------|---------|
| `usage report` | Aggregate cost by model, role, phase, or callsite | `muonroi-cli usage report --by model --json` |
| `usage pil` | Attribute system-prompt size growth to PIL layers | `muonroi-cli usage pil --top 10 --json` |
| `usage forensics <prefix>` | Per-event token + cache breakdown for a session | `muonroi-cli usage forensics abc123 --json` |

### MCP (Model Context Protocol)

| Command | Description | Example |
|---------|-------------|---------|
| `mcp setup-research` | Configure web research servers (context7, tavily) | `muonroi-cli mcp setup-research` |
| `mcp set <id>` | Store MCP secret key in OS keychain | `muonroi-cli mcp set tavily` |
| `mcp import-bw [keys...]` | Import MCP secrets from Bitwarden | `muonroi-cli mcp import-bw tavily` |

### Other Commands

| Command | Description | Example |
|---------|-------------|---------|
| `bug-report` | Generate anonymized diagnostic bundle | `muonroi-cli bug-report` |
| `mcp-driver` | Run the agent-harness MCP driver (stdio) | `muonroi-cli mcp-driver` |
| `share <user>` | Add stakeholder to product Discord channel | `muonroi-cli share @alice --product myproduct` |

## Slash Commands

Slash commands run inside the TUI and interact with the agent state, planning system, and experience engine.

| Command | Arguments | Description | Notes |
|---------|-----------|-------------|-------|
| `/ideal` | `"<idea>"` `[flags]` | Start product ideal loop (idea → shipped sprint) | See flags below |
| `/ideal status` | `[runId]` | List active runs or show detail of one | `--max-cost`, `--max-sprints`, `--done-threshold` |
| `/ideal resume` | `<runId>` | Resume a halted or crashed ideal run | Skips deployment gate if conditions met |
| `/ideal abort` | `<runId>` | Hard-kill an ideal run | Cannot be undone; deletes run artifacts |
| `/ideal ship` | `<runId>` | Force user-approval deployment gate | Bypasses conditions #1-#4 if already passing |
| `/council` | `[rounds] <topic>` | Multi-model debate — models discuss a topic | Default: 3 rounds from same provider |
| `/council inspect` | `<session-id>` | Inspect debate state from a past council session | Shows all participant contributions |
| `/discuss` | `[<gray-area>]` | Create or load a planning run; capture gray areas | Stores in `.muonroi-flow/runs/` |
| `/plan` | (no args) | Write plan to roadmap; gated on resolved gray areas | Blocks if G-entries marked `[open]` |
| `/execute` | (no args) | Read plan from roadmap, set state to executing | Follows the plan written in `/plan` |
| `/clear` | (no args) | Relock state from artifacts, discard chat context | Summarizes decisions, gray areas, roadmap |
| `/compact` | (no args) | Perform two-pass message compaction | Reduces token usage, flags stale suggestions to EE |
| `/cost` | (no args) | Show session cost, model, tier, token usage | Includes EE health and activity pulse |
| `/config` | (no args) | Edit settings in TUI (API key, model, providers) | Opens interactive settings editor |
| `/ee search` | `<query>` | Semantic search of experience brain | Returns relevant lesson entries |
| `/ee status` | (no args) | Show EE connection status and stats | Displays intercepts, suggestions, lessons |
| `/debug` | `[on\|off\|status]` | Toggle pipeline debug tracing | Shows PIL → Router → EE → Model → Tokens |
| `/export` | (no args) | Export chat history and artifacts | Compares persisted DB state vs screen state |
| `/expand` | (no args) | Expand message context (inverse of compact) | Restores full message history |
| `/pin` | `[<msg-id>]` | Pin or unpin messages from compaction | Pinned messages always included in compact |
| `/optimize` | (no args) | Tune system-prompt and cache strategy | Suggests layer reductions, cache policies |

### `/ideal` Flags

| Flag | Default | Range | Description |
|------|---------|-------|-------------|
| `--max-cost` | 50 | 1..1000 | Max USD spend for full run |
| `--max-sprints` | 8 | 1..20 | Max iterations before termination |
| `--done-threshold` | 0.9 | 0.7..1.0 | Confidence required for done gate (clamped) |
| `--stack` | (none) | text | Free-form stack description hint |
| `--no-prior-context` | (off) | flag | Skip cross-run workspace memory injection |
| `--force-council` | (off) | flag | Always run full council even for low-complexity |

## Agent Modes

The agent runs in one of three modes controlled by config or environment:

| Mode | Description | Best For | Command Example |
|------|-------------|----------|-----------------|
| `agent` | Full autonomous coding agent with tool use | Development, feature implementation | `MUONROI_MODE=agent muonroi-cli` |
| `plan` | Planning only — no tool execution | Architecture & design review | `MUONROI_MODE=plan muonroi-cli` |
| `ask` | Q&A without tool use — reads files, answers | Questions, code review, research | `MUONROI_MODE=ask muonroi-cli` |

Default mode is `agent`. Set via `~/.muonroi-cli/user-settings.json` or `MUONROI_MODE` env var.

## Keyboard Shortcuts

| Key(s) | Action |
|--------|--------|
| `Ctrl+C` | Exit TUI |
| `Ctrl+D` | Cancel current input; exit if at prompt |
| `Tab` | Cycle through available modes/agent roles |
| `Shift+Enter` | Submit multi-line input |
| `Ctrl+L` | Clear screen |
| `Ctrl+A` | Go to start of line |
| `Ctrl+E` | Go to end of line |
| `Ctrl+U` | Kill line (delete from cursor to start) |
| `Ctrl+K` | Kill line (delete from cursor to end) |
| `Ctrl+W` | Delete word backward |
| `Ctrl+F` | Forward character |
| `Ctrl+B` | Backward character |
| `Ctrl+P` | Previous history entry |
| `Ctrl+N` | Next history entry |

Additional keys may be customized via `~/.muonroi-cli/user-keybindings.json`.

## Environment Variables

| Variable | Type | Description | Example |
|----------|------|-------------|---------|
| `MUONROI_API_KEY` | String | API key for default provider (legacy) | `sk-ant-...` |
| `MUONROI_MODEL` | String | Override default model (suppresses routing) | `claude-opus-4-1` |
| `MUONROI_MODE` | String | Agent mode: `agent`, `plan`, or `ask` | `MUONROI_MODE=plan` |
| `MUONROI_DEV` | Boolean | Enable development features (e.g., debug output) | `MUONROI_DEV=1` |
| `MUONROI_EE_URL` | URL | Experience Engine server URL | `http://localhost:8082` |
| `MUONROI_EE_AUTH_TOKEN` | String | EE authentication token | (from EE setup) |
| `MUONROI_DISCORD_TOKEN` | String | Discord bot token for `/share` | (from Discord dev portal) |
| `MUONROI_DISCORD_GUILD_ID` | String | Discord guild/server ID for `/share` | (from Discord) |
| `MUONROI_TEST_NO_KEYCHAIN` | Boolean | Suppress OS keychain in tests | `MUONROI_TEST_NO_KEYCHAIN=1` |

## Configuration Files

All config files live in `~/.muonroi-cli/`:

| File | Purpose |
|------|---------|
| `user-settings.json` | Global user settings (API key, model defaults, providers) |
| `.muonroi-cli/settings.json` | Per-project overrides (checked into repo) |
| `user-keybindings.json` | Keyboard shortcut customization |
| `crash.log` | Crash and unhandled rejection logs |

Project-specific settings in `.muonroi-cli/settings.json` override global `user-settings.json`.

## Headless / CI Mode

For automation and CI/CD pipelines:

```bash
# Run with prompt, output JSON
muonroi-cli --prompt "run tests" --format json

# Inspect session costs
muonroi-cli usage forensics <session-prefix> --json

# Check CLI health
muonroi-cli doctor
```

All headless commands exit with code 0 on success, 1 on failure.
