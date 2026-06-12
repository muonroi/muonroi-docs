# Setup recipe — Experience Engine

> Agent-executable playbook. Read top-to-bottom, **collect the values below from the user first**,
> then run the steps. Experience Engine is a local-first AI memory system that injects learned
> warnings into agents (Claude Code / Gemini / Codex / OpenCode) before Edit/Write/Bash.

## Prerequisites

- **Node.js ≥ 20** (`node --version`).
- One of: **Docker + Docker Compose** (local full stack) **or** SSH access to a team VPS already
  running Experience Engine (thin-client mode).
- `git` on PATH (only for the local-Docker path that clones the repo).

## Values to collect from the user

Ask the user for these BEFORE running any step. Pick the deployment mode first; the rest depend on it.

| Value | When needed | Notes |
|-------|-------------|-------|
| **Deployment mode** | always | `local-docker` (runs Qdrant+Ollama+API on this machine, zero keys) **or** `thin-client` (connect to a shared VPS). |
| `serverBaseUrl` | thin-client | e.g. `http://your-vps:8082`. |
| `serverAuthToken` | thin-client | issued by the VPS admin. |
| **Embed provider** | local-docker (advanced) | `ollama` (local, no key — default) \| `openai` \| `gemini` \| `voyageai` \| `siliconflow` \| `custom`. |
| **Embed API key** | if embed provider ≠ ollama | provider key. |
| **Brain provider** | local-docker (advanced) | `ollama` (local) \| `openai` \| `gemini` \| `claude` \| `deepseek` \| `siliconflow`. |
| **Brain API key** | if brain provider ≠ ollama | provider key. |
| **Agent to wire** | always | `Claude Code` (recommended) \| `Gemini CLI` \| `Codex CLI` \| `OpenCode`. |

> Never echo collected API keys back to the user or write them anywhere other than
> `~/.experience/config.json`.

## Steps

### Path A — local Docker stack (recommended for a single developer)

1. Clone and start the stack:
   ```bash
   git clone https://github.com/muonroi/experience-engine.git
   cd experience-engine
   docker compose up -d
   ```
   This starts **Qdrant** (`:6333`), **Ollama** (`:11434`, models auto-pulled), and the
   **Experience Engine API** (`:8082`). With Ollama embeddings it needs **zero API keys**.
2. (Advanced, only if the user chose non-Ollama providers) run the interactive wizard instead of/after
   compose to write provider config: `bash .experience/setup.sh` (Windows: `pwsh .experience/setup.ps1`,
   which locates Git Bash and calls `setup.sh`). It walks Vector store → Embedding provider →
   Brain provider → Agent wiring and writes `~/.experience/config.json`.

### Path B — thin-client (connect to a team VPS)

1. Run the one-shot thin-client setup with the collected URL + token:
   ```bash
   npx @muonroi/experience-engine setup-thin-client \
     --server <serverBaseUrl> \
     --token <serverAuthToken>
   ```
   This writes the minimal `~/.experience/config.json`:
   ```json
   { "serverBaseUrl": "<serverBaseUrl>", "serverAuthToken": "<serverAuthToken>" }
   ```
   The VPS holds Qdrant + all keys + extracted knowledge; this machine only queues events and runs hooks.

### Wire the agent (both paths)

- For **Claude Code**: no extra wiring beyond `~/.experience/config.json` — the installed hooks inject
  warnings automatically before Edit/Write/Bash. `setup.sh` performs agent-specific wiring when run.
- **Codex on Windows** must run from WSL (hooks are disabled on native Windows Codex).

## Verify

- Local stack health:
  ```bash
  curl http://localhost:8082/health
  # → {"status":"ok","qdrant":{"status":"ok"},"fileStore":{"status":"ok"}}
  ```
- Thin-client reachability: `curl <serverBaseUrl>/health` returns `status: ok`.
- Active recall works end-to-end: `node ~/.experience/exp-recall.js "test"` returns ranked lines
  (or an empty set on a fresh brain — no error).

## Troubleshooting

- **Hooks not appearing** → check `serverBaseUrl`/`serverAuthToken` are correct and
  `~/.experience/config.json` is readable; confirm `maxWarningsPerSession` (default 8) not exceeded.
- **Feedback commands failing on a thin client** → use `node ~/.experience/exp-feedback.js …`,
  NOT raw `curl …/api/feedback` (raw curl defaults to localhost and silently no-ops on thin clients).
- **Vector dimension error** on search → the embed model's dimension changed; the Qdrant collection
  must be recreated and re-ingested at the new dimension.

## Deep references

- docs.muonroi.com → Experience Engine → *Getting Started*, *Configuration* (full `config.json` shape:
  `qdrant.url`, `embedProvider`/`embedModel`/`embedApiKey`, `brainProvider`/`brainModel`/`brainApiKey`,
  `maxWarningsPerSession`, `brainTimeoutMs`).
- Use `docs.search` (this MCP) for any field not covered here, e.g. `docs.search "experience engine config.json brainProvider"`.
