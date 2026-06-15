---
title: Getting Started
sidebar_label: Getting Started
sidebar_position: 2
---

# Getting Started with Experience Engine

Experience Engine is a local-first AI memory system that learns from your development patterns. If you only want to **use** it, one command installs and wires everything — no clone, no Docker, no bash.

## Quick Install (Recommended)

Works on **any OS** (Windows, macOS, Linux). No `git clone`, no Docker, no Git Bash:

```bash
npx @muonroi/experience-engine init
```

`init` auto-detects a brain and wires your coding agent's hooks for you, resolving the mode in this order:

1. A local brain already running at `http://localhost:8082` → uses it (no token needed).
2. Otherwise, if Docker is available, it offers to start the local stack for you.
3. Otherwise it configures a **thin client** against a remote brain — point it at yours:

```bash
npx @muonroi/experience-engine init \
  --server https://your-vps:8082 \
  --token YOUR_TOKEN
```

Add `--yes` for a fully non-interactive install. Useful flags:

| Flag | Purpose |
|------|---------|
| `--server URL` | Remote brain base URL (thin-client mode) |
| `--token TOKEN` | Bearer token for write/feedback endpoints |
| `--read-token TOKEN` | Read-only token for `/api/stats`, `/api/gates` |
| `--local` / `--remote` | Force a mode instead of auto-detecting |
| `--agents claude,codex` | Wire only specific agents |
| `--yes`, `-y` | Non-interactive (never prompts, never runs Docker) |

Config is saved to `~/.experience/config.json`. Re-running `init` is idempotent (preserves `org` settings, dedups hooks). Restart your agent session afterward so it picks up the new hooks.

:::tip Already have a brain on a VPS?
On a clean machine, skip all prompts:
`npx @muonroi/experience-engine init --server https://your-vps:8082 --token YOUR_TOKEN --yes`
:::

## Feed the brain — `sync`

`init` makes your agent learn *going forward*. To backfill the brain from this machine's
**existing** agent history — and to top it up periodically — run `sync` (also
cross-platform, no bash, no repo checkout):

```bash
npx @muonroi/experience-engine sync
```

It scans your Claude/Codex/Gemini **sessions** and curated **`MEMORY.md`** files and pushes
new experiences to the configured brain. Incremental and idempotent — each run only sends
what changed since the last.

| Flag | Effect |
| --- | --- |
| `--max N` | Max sessions to extract this run (default 30) |
| `--max-age DUR` | Only sessions newer than `DUR`, e.g. `90d` (default `365d`) |
| `--runtime CSV` | Limit to `claude,codex,gemini,muonroi-cli,antigravity` |
| `--project SLUG` | Limit to one project slug |
| `--sessions-only` | Skip curated-memory import |
| `--memory-only` | Only import `MEMORY.md` |
| `--include-reference` | Also import `reference`-type memory |
| `--reset-marker` | Reprocess everything (ignore incremental markers) |
| `--upgrade` | Refresh the thin-client runtime (`init --yes`) first, then sync |
| `--dry-run` | Detect only; write nothing |
| `-v` | Verbose per-item output |

It honors `~/.experience/config.json`, so a thin client POSTs to your remote brain. This is
the cross-platform equivalent of `bash upgrade.sh --sync-only`. Schedule it (cron on
Linux/macOS, Task Scheduler on Windows) to keep the brain current.

:::tip Recommended cadence
After the first `init`, run `npx @muonroi/experience-engine sync` once to backfill, then on a
daily schedule. Use `--upgrade` occasionally to also refresh the runtime in the same pass.
:::

## Self-host the brain (Docker)

To run the full stack (Qdrant + Ollama + API) on your own machine, then point `init` at it. Starts Qdrant (vector store), Ollama (embeddings), and Experience Engine API in one command.

```bash
git clone https://github.com/muonroi/experience-engine.git
cd experience-engine
docker compose up -d
```

This starts three services:
- **Qdrant** (port 6333) — vector storage for memories
- **Ollama** (port 11434) — embedding models, auto-pulled on first run
- **Experience Engine API** (port 8082) — main service

Verify the setup:

```bash
curl http://localhost:8082/health
```

Response:
```json
{
  "status": "ok",
  "qdrant": {
    "status": "ok"
  },
  "fileStore": {
    "status": "ok"
  }
}
```

Everything runs locally. Zero API keys. Zero config files.

## Full local-install wizard (setup.sh)

For advanced configuration (choosing vector store, embedding/brain providers, and which agents to wire), use the interactive bash wizard. This is the heavier path — prefer `npx … init` unless you need to pick providers:

```bash
bash .experience/setup.sh
```

The script walks you through four steps:

**Step A — Vector Store**
- Qdrant Cloud (managed, account required)
- Local Docker (recommended for development)
- VPS SSH Tunnel (for thin client architectures)

**Step B — Embedding Provider**
- OpenAI (requires API key)
- Gemini (requires API key)
- SiliconFlow
- VoyageAI
- Ollama (local, no keys)
- Custom

**Step C — Brain Provider** (LLM for knowledge extraction)
- OpenAI
- Gemini
- Claude
- DeepSeek
- SiliconFlow
- Ollama (local, no keys)
- Custom

**Step D — Agent Wiring**
- Claude Code (recommended)
- Gemini CLI
- Codex CLI
- OpenCode

Configuration is saved to `~/.experience/config.json`.

## Thin Client Setup (Team/VPS)

If your team runs a shared Experience Engine on a VPS, connect your workstation as a thin client. The cross-platform `init` command is the simplest path:

```bash
npx @muonroi/experience-engine init \
  --server http://your-vps:8082 \
  --token YOUR_TOKEN --yes
```

The legacy bash installer is still available (`npx @muonroi/experience-engine setup-thin-client --server … --token …`), but requires bash/Git Bash on Windows.

Config saved to `~/.experience/config.json`:
```json
{
  "serverBaseUrl": "http://your-vps:8082",
  "serverAuthToken": "your-token"
}
```

**Thin Client Architecture:**
- **VPS holds:** Qdrant, embed/brain API keys, all extracted knowledge, evolution jobs
- **Your machine holds:** hooks, local event queue, configuration
- **Offline support:** Events queue locally and drain automatically when VPS comes online
- **Instant onboarding:** New developer runs one command and instantly accesses team's accumulated knowledge

## Bootstrap from Existing Memory

The recommended import path uses the adapter-based `import-memory.js` tool, which supports all four runtimes (Claude, Gemini, Antigravity, Codex) and is mtime-gated so only changed files re-import:

```bash
node .experience/tools/import-memory.js
```

This scans `~/.claude/projects/*/memory/`, `~/.gemini/projects/*/memory/MEMORY.md`, `~/.gemini/antigravity/projects/*/memory/MEMORY.md`, and `~/.codex/projects/*/memory/MEMORY.md`, then upserts entries into the brain.

> **Legacy path (Claude-only):** `node tools/experience-bulk-seed.js --memory-dir ~/.claude/projects/*/memory` still works for Claude projects but is not adapter-aware and does not cover Gemini, Antigravity, or Codex memory. Prefer `import-memory.js` for new setups.

See [Memory Adapters](./memory-adapters) for full CLI flags, type routing, and the MEMORY.md bullet format.

## Upgrade (existing installs)

To refresh an existing install with the latest code and sync all agent sessions into the brain:

```bash
bash upgrade.sh
```

What this does:
1. `git pull --ff-only` to fetch the latest code
2. Detects your install mode from `~/.experience/config.json` (`thin-client` or `full`)
3. Delegates to the appropriate setup script to refresh the runtime
4. **Step 4 — Session sync:** runs `bulk-extract.js` to extract new experiences from local agent sessions, then runs `import-memory.js` to sync curated agent memory from all four runtime adapters

Options:

| Flag | Description |
|------|-------------|
| `--sync-only` | Skip pull and runtime refresh; only run Step 4 (bulk-extract + import-memory) |
| `--no-sync` | Skip Step 4 entirely (pull + runtime refresh only) |
| `--no-pull` | Skip git pull, run everything else |
| `--dry-run` | Print what would happen; change nothing |
| `--sync-max N` | Limit session extraction batch size (default 30) |

## Wiring to Claude Code

Once Experience Engine is running, integrate it with Claude Code for automatic PreToolUse warnings:

**Config file:** `~/.experience/config.json`
```json
{
  "serverBaseUrl": "http://your-vps:8082",
  "serverAuthToken": "your-token"
}
```

No additional wiring is needed. The hooks inject experience-based warnings automatically before Edit/Write/Bash calls. See your project's `CLAUDE.md` for integration details.

---

## Agent Hook Compatibility

| Agent | Windows | macOS / Linux | WSL |
|-------|---------|---------------|-----|
| Claude Code | Works | Works | — |
| Gemini CLI | Works | Works | — |
| Codex CLI | **Hooks disabled** | Works | **Works** |
| OpenCode | Works | Works | — |

> **Windows installs:** `npx @muonroi/experience-engine init` runs natively — no Git Bash required (hook commands invoke `node` with absolute paths). The bash `setup.sh` / `setup-thin-client.sh` paths still need Git Bash or WSL.
>
> **Codex on Windows:** Run Codex from WSL. The `setup.sh` script handles all WSL-specific hook wiring automatically.

---

## Next Steps

- [Overview](./overview.md) — Understand how Experience Engine works
- [Configuration](./configuration.md) — Configure providers, storage, and wiring
- [How It Works](./how-it-works.md) — Learn about memories, hooks, and the feedback loop
