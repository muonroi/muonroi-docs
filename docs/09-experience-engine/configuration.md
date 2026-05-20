---
title: Configuration
sidebar_label: Configuration
sidebar_position: 4
---

# Experience Engine Configuration

The Experience Engine reads configuration from `~/.experience/config.json` or environment variables. This guide covers all configuration options and setup methods.

## Config File Location

Primary configuration file: `~/.experience/config.json`

For project-specific overrides, place files in the `.experience/` directory within your project root.

## Minimal Thin-Client Configuration

If you're connecting to a remote Experience Engine server, use minimal configuration:

```json
{
  "serverBaseUrl": "http://your-vps:8082",
  "serverAuthToken": "your-token"
}
```

Replace:
- `your-vps` — hostname or IP of the Experience Engine server
- `your-token` — authentication token issued by the server administrator

## Full Local Configuration

When running the Experience Engine server locally, the setup wizard (`.experience/setup.sh`) generates a complete configuration file with the following structure:

### Vector Store Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `qdrant.url` | string | `http://localhost:6333` | Qdrant vector database endpoint |
| `qdrant.apiKey` | string | (optional) | API key for Qdrant Cloud or authenticated instances |

**Example:**

```json
{
  "qdrant": {
    "url": "http://localhost:6333",
    "apiKey": "your-api-key"
  }
}
```

### Embedding Provider Configuration

Embeddings power semantic search over experience entries. Configure exactly one provider:

| Field | Type | Description |
|-------|------|-------------|
| `embedProvider` | string | Provider: `ollama` \| `openai` \| `gemini` \| `voyageai` \| `siliconflow` \| `custom` |
| `embedModel` | string | Model name (e.g., `nomic-embed-text` for Ollama, `text-embedding-3-small` for OpenAI) |
| `embedApiKey` | string | API key (not required for Ollama) |
| `embedBaseUrl` | string | Custom base URL for proxy or self-hosted providers |

**Examples:**

Ollama (local, no API key required):
```json
{
  "embedProvider": "ollama",
  "embedModel": "nomic-embed-text",
  "embedBaseUrl": "http://localhost:11434"
}
```

OpenAI:
```json
{
  "embedProvider": "openai",
  "embedModel": "text-embedding-3-small",
  "embedApiKey": "sk-..."
}
```

Google Gemini:
```json
{
  "embedProvider": "gemini",
  "embedModel": "text-embedding-004",
  "embedApiKey": "your-api-key"
}
```

### Brain Provider Configuration

The brain filters and ranks hook warnings. Configure exactly one provider:

| Field | Type | Description |
|-------|------|-------------|
| `brainProvider` | string | Provider: `ollama` \| `openai` \| `gemini` \| `claude` \| `deepseek` \| `siliconflow` \| `custom` |
| `brainModel` | string | Model name (e.g., `mistral` for Ollama, `gpt-4o-mini` for OpenAI) |
| `brainApiKey` | string | API key (not required for Ollama) |
| `brainBaseUrl` | string | Custom base URL for proxy or self-hosted providers |

**Examples:**

Ollama (local):
```json
{
  "brainProvider": "ollama",
  "brainModel": "mistral",
  "brainBaseUrl": "http://localhost:11434"
}
```

OpenAI:
```json
{
  "brainProvider": "openai",
  "brainModel": "gpt-4o-mini",
  "brainApiKey": "sk-..."
}
```

Anthropic Claude:
```json
{
  "brainProvider": "claude",
  "brainModel": "claude-haiku-4-5-20251001",
  "brainApiKey": "sk-ant-..."
}
```

### Hook Behavior Configuration

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxWarningsPerSession` | number | `8` | Maximum number of warnings injected in a single session |
| `brainTimeoutMs` | number | `3000` | Timeout (milliseconds) before brain filter fails open and allows warning through |
| `sessionDedupEnabled` | boolean | `true` | Suppress duplicate warnings within the same session |

**Example:**

```json
{
  "maxWarningsPerSession": 10,
  "brainTimeoutMs": 5000,
  "sessionDedupEnabled": true
}
```

## Environment Variables

Override config file values using environment variables. Useful for CI/CD and containerized deployments:

| Variable | Overrides | Example |
|----------|-----------|---------|
| `EE_SERVER_URL` | `serverBaseUrl` | `http://experience-server:8082` |
| `EE_SERVER_TOKEN` | `serverAuthToken` | `token-xyz` |

**Example:**

```bash
export EE_SERVER_URL=http://experience-server:8082
export EE_SERVER_TOKEN=my-secret-token
# Your app now uses remote Experience Engine
```

Environment variables take precedence over `config.json`.

## Per-Project Scope

Experience entries can be scoped to specific projects and languages using scope filters. The scope fields control where hooks are injected:

| Field | Type | Description |
|-------|------|-------------|
| `scope.lang_include` | string[] | File extensions to include (e.g., `["ts", "js"]`) |
| `scope.lang_exclude` | string[] | File extensions to exclude (e.g., `["py"]`) |
| `scope.project_include` | string[] | Project slugs to include (e.g., `["muonroi-building-block"]`) |
| `scope.project_exclude` | string[] | Project slugs to exclude (e.g., `["quick-codex"]`) |

When an entry is reported as `wrong_language` or `wrong_repo` via feedback, the engine automatically populates the appropriate `scope.lang_exclude` or `scope.project_exclude` fields.

## Feedback Commands

Report hook effectiveness and help the engine learn. Run these commands from within your project:

```bash
# Mark a hook as useful (engine strengthens it)
node ~/.experience/exp-feedback.js followed <pointId> <collection>

# Mark a hook as ignored (engine weakens it if repeated)
node ~/.experience/exp-feedback.js ignored <pointId> <collection>

# Mark a hook as noisy with a reason
node ~/.experience/exp-feedback.js noise <pointId> <collection> <reason>
```

Replace:
- `<pointId>` — experience entry ID (shown in hook output)
- `<collection>` — collection name (shown in hook output, e.g., `behavioral_rules`)
- `<reason>` — why the hook was wrong (see table below)

### Feedback Reason Values

| Reason | When | Engine Action |
|--------|------|---------------|
| `wrong_language` | Hook fires for the wrong programming language | Adds file extension to `scope.lang_exclude` |
| `wrong_repo` | Hook targets a different project | Adds project slug to `scope.project_exclude` |
| `wrong_task` | Hook is irrelevant to the task type (last resort) | Counts toward supersede ratio only |
| `stale_rule` | Hook references obsolete API or deprecated pattern | Counts toward supersede ratio |

**Note:** Prefer `wrong_language` or `wrong_repo` over `wrong_task` when the mismatch is language- or project-specific. This allows the engine to narrow scope rather than delete the entry entirely.

### Important: Using the Feedback Helper

The feedback helper reads authentication from `~/.experience/config.json` and works on thin clients where the engine runs on a remote VPS:

```bash
node ~/.experience/exp-feedback.js noise <pointId> <collection> <reason>
```

Do **not** use raw `curl` commands to `/api/feedback` — they default to localhost and silently fail on thin-client installations.

## Complete Configuration Example

```json
{
  "serverBaseUrl": "http://localhost:8082",
  "serverAuthToken": "dev-token-xyz",
  "qdrant": {
    "url": "http://localhost:6333"
  },
  "embedProvider": "ollama",
  "embedModel": "nomic-embed-text",
  "embedBaseUrl": "http://localhost:11434",
  "brainProvider": "claude",
  "brainModel": "claude-haiku-4-5-20251001",
  "brainApiKey": "sk-ant-...",
  "maxWarningsPerSession": 8,
  "brainTimeoutMs": 3000,
  "sessionDedupEnabled": true
}
```

## Troubleshooting

**Hooks not appearing?**
- Check `serverBaseUrl` and `serverAuthToken` are correct
- Verify `.experience/config.json` is readable by your shell
- Check `maxWarningsPerSession` is not exceeded
- Verify project scope filters (lang_include/exclude, project_include/exclude) match your context

**Feedback commands failing?**
- Ensure `~/.experience/config.json` contains valid `serverBaseUrl` and `serverAuthToken`
- Verify the Experience Engine server is running and accessible
- On thin clients, use the `exp-feedback.js` helper instead of raw `curl`

**Duplicate warnings in session?**
- Set `sessionDedupEnabled: false` if you need to see all warnings (not recommended)
- Higher `maxWarningsPerSession` allows more unique warnings per session

## Related Links

- [Experience Engine Overview](./overview)
- [How It Works](./how-it-works)
- [API Reference](./api-reference)
