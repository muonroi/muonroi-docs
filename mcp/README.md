# muonroi-docs MCP server

stdio MCP server that provides semantic search over Muonroi Building Block docs and recipes — replacing 8-10 `read_file` loops with 1-2 `docs.search` calls.

## How it works

1. `npm run ingest` walks `muonroi-docs/docs/**/*.md` and `muonroi-building-block/**/README.md|Agent.md|AGENTS.md|EE-INTENT.md`, splits into ~800-char chunks, embeds via your configured provider (Ollama/OpenAI/SiliconFlow), and upserts into the `bb-docs` Qdrant collection.
2. The MCP server (`src/server.js`) exposes 5 tools over stdio. Any MCP-compatible client can call them.

## Prerequisites

- Node 20+
- Qdrant accessible at the URL in `~/.experience/config.json` (`qdrantUrl` key)
- Embedding provider configured in `~/.experience/config.json` (`embedProvider`, `embedModel`, `embedKey`, `embedEndpoint`)

## Ingest

```sh
cd D:/sources/Core/muonroi-docs/mcp
npm install
npm run ingest
```

Re-running is idempotent: unchanged files are skipped (point id = sha256 of filepath + chunkIndex + contentHash).

## Register with Claude Code

Add to `~/.claude/claude_desktop_config.json` (or equivalent MCP config):

```json
{
  "mcpServers": {
    "muonroi-docs": {
      "command": "node",
      "args": ["D:/sources/Core/muonroi-docs/mcp/src/server.js"]
    }
  }
}
```

## Tools

| Tool | Args | Returns |
|------|------|---------|
| `docs.search` | `{ query: string, topK?: number }` | `Array<{ docId, score, title, excerpt, source }>` |
| `docs.read` | `{ docId: string }` | `{ docId, title, content, source }` |
| `bb.template.describe` | `{ shortName: string }` e.g. `"mr-micro-sln"` | `{ shortName, purpose, structure, packages, samplePrompt, sourceDoc }` |
| `bb.package.describe` | `{ packageId: string }` e.g. `"Muonroi.RuleEngine.Runtime"` | `{ packageId, purpose, dependsOn, samples, sourceDoc }` |
| `bb.recipe.list` | `{ domain?: string }` e.g. `"auth"` | `Array<{ recipeId, title, summary, sourceDoc }>` |

### Examples

```json
// Find where auth is documented
{ "tool": "docs.search", "arguments": { "query": "OIDC authentication BFF pattern", "topK": 3 } }

// Describe a template
{ "tool": "bb.template.describe", "arguments": { "shortName": "mr-micro-sln" } }

// List caching recipes
{ "tool": "bb.recipe.list", "arguments": { "domain": "caching" } }
```

## Troubleshooting

- **`docs.search` returns empty** — run `npm run ingest` to populate the `bb-docs` collection.
- **Embedding fails** — check `~/.experience/config.json` for `embedProvider`/`embedModel`/`embedKey`. For Ollama: ensure `ollama serve` is running and `nomic-embed-text` model is pulled.
- **Qdrant not reachable** — check `qdrantUrl` in `~/.experience/config.json`.

## Tests

```sh
npm test
# node:test runner — no extra dependencies
```
