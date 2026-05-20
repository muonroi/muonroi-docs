---
title: Getting Started
sidebar_label: Getting Started
sidebar_position: 2
---

# Getting Started with Experience Engine

Experience Engine is a local-first AI memory system that learns from your development patterns. Get started in minutes with Docker, npm, or setup scripts.

## Docker (Recommended)

The fastest way to get running: starts Qdrant (vector store), Ollama (embeddings), and Experience Engine API in one command.

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

## npm

Install via npm for programmatic access:

```bash
npx @muonroi/experience-engine setup
```

This launches an interactive setup wizard.

## Interactive Setup (setup.sh)

For advanced configuration, use the setup script:

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

If your team runs a shared Experience Engine on a VPS, connect your workstation as a thin client:

```bash
npx @muonroi/experience-engine setup-thin-client \
  --server http://your-vps:8082 \
  --token YOUR_TOKEN
```

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

If you have existing Claude Code memories and want to seed the brain:

```bash
node tools/experience-bulk-seed.js --memory-dir ~/.claude/projects/*/memory
```

This imports past patterns and decisions into the knowledge base.

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

## Next Steps

- [Overview](./overview.md) — Understand how Experience Engine works
- [Configuration](./configuration.md) — Configure providers, storage, and wiring
- [How It Works](./how-it-works.md) — Learn about memories, hooks, and the feedback loop
