---
title: BB Docs MCP Server
sidebar_label: BB Docs MCP Server
sidebar_position: 10
---

# BB Docs MCP Server

The `muonroi-docs` repository ships a stdio [Model Context Protocol](https://modelcontextprotocol.io) server that exposes semantic search over all Muonroi Building Block documentation and package references. Agents (Claude Code, Cursor, Copilot) use this instead of reading individual markdown files.

## Architecture

```
docs/
├── mcp/
│   ├── src/
│   │   ├── server.js           ← stdio MCP entrypoint
│   │   ├── qdrant-client.js    ← Qdrant wrapper + embedding
│   │   └── tools/
│   │       ├── docs-search.js
│   │       ├── docs-read.js
│   │       ├── bb-template-describe.js
│   │       ├── bb-package-describe.js
│   │       └── bb-recipe-list.js
│   ├── ingest/
│   │   ├── crawl.js            ← Walk docs + BB sources, split into chunks
│   │   ├── ingest.js           ← Embed + upsert into Qdrant
│   │   └── sources.json        ← Crawl roots configuration
│   └── tests/                  ← node --test suite
```

**Vector store:** Qdrant collection `bb-docs`.  
**Config:** `~/.experience/config.json` — reads `qdrantUrl`, `qdrantKey`, and embedding provider settings.  
**Embedding:** Delegates to the configured provider (Ollama / OpenAI / SiliconFlow) via the experience-engine config.

## Tools

### `docs.search`

Semantic search across all ingested docs and recipes. Returns ranked chunks with score, title, excerpt, and source path.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Natural-language search query |
| `topK` | number | 5 | Max results (max 20) |

**Example:**
```json
{
  "tool": "docs.search",
  "arguments": {
    "query": "how to configure canary rollout for rule engine",
    "topK": 5
  }
}
```

**Returns:**
```json
[
  {
    "docId": "a1b2c3d4-...",
    "score": 0.87,
    "title": "Canary Rollout Guide",
    "excerpt": "Canary deployment gradually exposes a new ruleset version...",
    "source": "D:/sources/Core/muonroi-docs/docs/03-guides/control-plane/canary-rollout-guide.md"
  }
]
```

### `docs.read`

Fetch full markdown content of one doc chunk by its `docId`. Get IDs from `docs.search` first.

| Parameter | Type | Description |
|-----------|------|-------------|
| `docId` | string | Chunk ID returned by `docs.search` |

### `bb.package.describe`

Structured info about a Muonroi NuGet package — purpose, dependencies, and code samples. Derived from semantic search over the `05-reference/packages/` docs.

| Parameter | Type | Description |
|-----------|------|-------------|
| `packageId` | string | e.g. `"Muonroi.RuleEngine.Runtime"` |

**Returns:** `{ packageId, purpose, dependsOn[], samples[], sourceDoc }`

### `bb.template.describe`

Structured info about a `dotnet new` template from `muonroi-building-block`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `shortName` | string | e.g. `"mr-micro-sln"`, `"mr-modular"`, `"mr-api"` |

**Returns:** `{ shortName, purpose, structure, packages[], samplePrompt, sourceDoc }`

### `bb.recipe.list`

List available how-to recipes, optionally filtered by domain.

| Parameter | Type | Description |
|-----------|------|-------------|
| `domain` | string | Optional: `"auth"`, `"caching"`, `"rule-engine"`, `"background-jobs"`, etc. |

## Setup

### First-time install and ingest

```bash
cd D:/sources/Core/muonroi-docs/mcp
npm install
npm run ingest
```

`npm run ingest` runs `crawl.js` (walks all configured source roots) then `ingest.js` (embeds and upserts into Qdrant). Run it again whenever docs change significantly.

### Re-ingest after adding docs

```bash
npm run ingest
```

The ingest is incremental — unchanged files (detected via `contentHash`) are skipped.

### Prerequisites

- **Qdrant** running and accessible (URL in `~/.experience/config.json` → `qdrantUrl`)
- **Embedding provider** configured in `~/.experience/config.json`

Minimal config example:
```json
{
  "qdrantUrl": "http://localhost:6333",
  "qdrantKey": "",
  "embedProvider": "ollama",
  "embedModel": "nomic-embed-text"
}
```

## Register with Claude Code

Add to your MCP settings (`.claude/mcp.json` or `~/.claude/mcp.json`):

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

## Crawl sources

`mcp/ingest/sources.json` controls which files are indexed:

| Label | Path | Glob |
|-------|------|------|
| `muonroi-docs` | `muonroi-docs/docs` | `**/*.md` |
| `bb-readme` | `muonroi-building-block` | `**/README.md` |
| `bb-agent` | `muonroi-building-block` | `**/Agent.md` |
| `bb-agents` | `muonroi-building-block` | `**/AGENTS.md` |
| `bb-ee-intent` | `muonroi-building-block` | `**/EE-INTENT.md` |
| `cli-docs` | `muonroi-cli/docs` | `**/*.md` |

To add a new source root, edit `sources.json` and re-run `npm run ingest`.

## Chunking strategy

Files are split by H2/H3 boundaries, then further divided into ~800-character chunks with 100-character overlap. Each chunk gets a deterministic ID based on `sha256(filepath + chunkIndex + contentHash)` so re-ingesting the same content is idempotent.

## Tests

```bash
cd mcp
node --test tests/
```

15 tests, zero extra dependencies.

## See Also

- [MCP Developer Server](./mcp-developer-server.md) — Developer-side MCP server (RuleGen, scaffold, compliance tools)
- [Package Reference](../05-reference/packages/core-foundation.md) — Per-package deep-dive docs that populate `bb.package.describe`
- [appsettings Configuration](../05-reference/appsettings-guide.md) — General configuration reference
