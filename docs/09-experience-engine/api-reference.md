---
title: API Reference
sidebar_label: API Reference
sidebar_position: 5
---

# Experience Engine REST API Reference

The Experience Engine exposes a REST API for querying, evolving, and observing the knowledge base. The server runs on Node.js with zero external dependencies — Qdrant and FileStore are the only I/O layers.

## Base URL

```
http://localhost:8082
```

CORS is enabled. If authentication is configured, pass the token as:

```
Authorization: Bearer YOUR_TOKEN
```

The token is read from `serverAuthToken` in `config.json`.

---

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/health` | Liveness check — Qdrant + FileStore status |
| `POST` | `/api/intercept` | Query experience before a tool call (PreToolUse hook) |
| `POST` | `/api/posttool` | Post-tool outcome + judge enqueue (PostToolUse hook) |
| `POST` | `/api/extract` | Extract lessons from session transcript |
| `POST` | `/api/evolve` | Trigger promotion / pruning cycle (T2 → T1 → T0) |
| `GET`  | `/api/stats` | Observability: hit rate, mistakes avoided, velocity metrics |
| `GET`  | `/api/gates` | Server-side readiness report |
| `GET`  | `/api/graph` | Graph edges for an experience ID |
| `GET`  | `/api/timeline` | Knowledge evolution for a topic — shows superseded entries |
| `POST` | `/api/feedback` | Report verdict: FOLLOWED / IGNORED / IRRELEVANT |
| `POST` | `/api/route-model` | Route task to optimal model tier (keywords → history → brain) |
| `POST` | `/api/route-task` | Route task to optimal workflow |
| `POST` | `/api/brain` | Proxy LLM call through server (firewall / compliance support) |
| `POST` | `/api/principles/share` | Export principle as portable JSON |
| `POST` | `/api/principles/import` | Import shared principle |
| `POST` | `/api/pil-context` | PIL context — classification + retrieval in one call (5-min LRU cache) |

---

## Endpoint Details

### GET /health

Liveness check. Returns status of Qdrant and FileStore.

**Request:**

```bash
curl http://localhost:8082/health
```

**Response (200 OK):**

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

**Response (503 Service Unavailable):**

```json
{
  "status": "degraded",
  "qdrant": {
    "status": "unreachable"
  },
  "fileStore": {
    "status": "ok"
  }
}
```

---

### POST /api/intercept

Query experience before a tool call. Injected by the PreToolUse hook.

**Request:**

```bash
curl -X POST http://localhost:8082/api/intercept \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "Write",
    "toolInput": {
      "file_path": "src/db.ts"
    },
    "context": {
      "agent": "claude-code",
      "workspace": "muonroi-control-plane"
    }
  }'
```

**Response (200 OK):**

```json
{
  "suggestions": "⚠️ [Experience - High Confidence (0.85)]: Stateful objects must be scoped, never singleton\n   Why: Last time this caused state corruption in production\n   [id:a1b2c3d4 col:experience-behavioral]",
  "hasSuggestions": true
}
```

If no suggestions match:

```json
{
  "suggestions": null,
  "hasSuggestions": false
}
```

---

### POST /api/posttool

Report tool outcome and enqueue judge for automatic verdict. Injected by the PostToolUse hook.

**Request:**

```bash
curl -X POST http://localhost:8082/api/posttool \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "Write",
    "toolInput": {
      "file_path": "src/db.ts"
    },
    "outcome": {
      "success": true,
      "error": null,
      "duration_ms": 245
    },
    "suggestions": "⚠️ [Experience - High Confidence (0.85)]: Stateful objects...",
    "context": {
      "agent": "claude-code",
      "workspace": "muonroi-control-plane"
    }
  }'
```

**Response (202 Accepted):**

```json
{
  "judgeJobId": "judge-a1b2c3d4-5e6f-7g8h"
}
```

The judge runs asynchronously. Use `/api/stats` to monitor verdict distribution.

---

### POST /api/extract

Extract lessons from a session transcript. Run manually or at session end via `stop-extractor.js`.

**Request:**

```bash
curl -X POST http://localhost:8082/api/extract \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Agent tried AddSingleton<DbContext> in Startup.cs. Test failed with concurrent access error. Stack trace shows state corruption. Agent realized mistake and corrected to AddScoped<DbContext>. Test passed.",
    "sessionId": "sess-abc123",
    "agent": "claude-code",
    "workspace": "muonroi-building-block"
  }'
```

**Response (200 OK):**

```json
{
  "lessons": [
    {
      "id": "lesson-xyz789",
      "pattern": "singleton-state-corruption",
      "confidence": 0.92,
      "tier": "T3",
      "text": "DbContext with singleton lifetime causes concurrent access errors in stateful applications"
    }
  ],
  "count": 1
}
```

---

### POST /api/evolve

Trigger the promotion cycle manually. Normally runs on schedule; use this to force evolution.

**Request:**

```bash
curl -X POST http://localhost:8082/api/evolve
```

**Response (200 OK):**

```json
{
  "promoted": 2,
  "abstracted": 1,
  "archived": 3,
  "timestamp": "2026-05-20T14:32:10Z"
}
```

- `promoted`: Entries moved from T2 → T1 (or T1 → T0)
- `abstracted`: New principles created by clustering similar entries
- `archived`: Entries demoted or retired (ignored 3+ times, superseded)

---

### GET /api/stats

Observability metrics for the knowledge base.

**Request:**

```bash
curl "http://localhost:8082/api/stats"
```

**Response (200 OK):**

```json
{
  "hitRate": 0.78,
  "interceptionRate": 0.62,
  "totalInterceptions": 4521,
  "verdicts": {
    "followed": 2814,
    "ignored": 1122,
    "irrelevant": 585
  },
  "mistakesAvoided": 312,
  "velocityPerSession": {
    "avg": 4.2,
    "min": 1,
    "max": 18
  },
  "knowledge": {
    "T0": 14,
    "T1": 67,
    "T2": 412,
    "T3": 1203
  },
  "timestamp": "2026-05-20T14:30:00Z"
}
```

- `hitRate`: Percentage of interceptions with matching suggestions
- `verdicts.followed`: Suggestions that user acted on
- `mistakesAvoided`: Estimated bugs prevented (inferred from pattern match + success)
- `knowledge`: Entry count by tier

---

### GET /api/gates

Server-side readiness report. Use this before heavy operations.

**Request:**

```bash
curl "http://localhost:8082/api/gates"
```

**Response (200 OK):**

```json
{
  "ready": true,
  "qdrant": {
    "available": true,
    "healthy": true,
    "collections": 3,
    "vectorsIndexed": 45821
  },
  "fileStore": {
    "available": true,
    "healthy": true,
    "fileCount": 156,
    "diskUsageMb": 23.4
  },
  "judge": {
    "queueLength": 5,
    "processingRate": 12.3
  },
  "timestamp": "2026-05-20T14:30:00Z"
}
```

---

### GET /api/graph

Fetch graph edges for an experience ID.

**Request:**

```bash
curl "http://localhost:8082/api/graph?id=a1b2c3d4&types=generalizes,relates-to,supersedes"
```

**Query Parameters:**

- `id` (required): Experience ID
- `types` (optional): Comma-separated edge types to include (defaults to all)

**Response (200 OK):**

```json
{
  "id": "a1b2c3d4",
  "text": "Stateful objects must be scoped, never singleton",
  "edges": [
    {
      "type": "generalizes",
      "targets": [
        {
          "id": "lesson-xyz789",
          "text": "DbContext singleton causes state corruption"
        }
      ]
    },
    {
      "type": "relates-to",
      "targets": [
        {
          "id": "principle-456def",
          "text": "HttpClient singleton can cause socket exhaustion"
        }
      ]
    },
    {
      "type": "supersedes",
      "targets": [
        {
          "id": "old-entry-789",
          "text": "[archived] Use transient for DbContext (outdated)",
          "status": "archived"
        }
      ]
    }
  ]
}
```

---

### GET /api/timeline

Evolution history for a topic.

**Request:**

```bash
curl "http://localhost:8082/api/timeline?topic=dependency+injection&limit=10"
```

**Query Parameters:**

- `topic` (required): Topic name (URL-encoded)
- `limit` (optional): Max entries to return (default 20)

**Response (200 OK):**

```json
{
  "topic": "dependency injection",
  "events": [
    {
      "timestamp": "2025-11-03T10:15:00Z",
      "type": "extracted",
      "id": "lesson-001",
      "text": "AddSingleton<DbContext> causes concurrent access errors",
      "tier": "T3",
      "verdict_distribution": {
        "followed": 8,
        "ignored": 2
      }
    },
    {
      "timestamp": "2025-11-18T09:22:00Z",
      "type": "promoted",
      "from": "T3",
      "to": "T2",
      "id": "lesson-001",
      "reason": "confirmed 3+ times"
    },
    {
      "timestamp": "2025-12-01T14:30:00Z",
      "type": "abstracted",
      "id": "principle-a1b2",
      "text": "Stateful objects must be scoped, never singleton",
      "generalizesCount": 4,
      "tier": "T0"
    },
    {
      "timestamp": "2026-05-15T11:45:00Z",
      "type": "supersedes",
      "supersedesId": "old-entry-789",
      "principle": "principle-a1b2",
      "reason": "new principle covers this case + is more general"
    }
  ]
}
```

---

### POST /api/feedback

Report a verdict on a suggestion. Use the `exp-feedback.js` helper instead of raw curl (see note below).

**Request (raw curl — not recommended):**

```bash
curl -X POST http://localhost:8082/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "pointId": "a1b2c3d4",
    "collection": "experience-behavioral",
    "verdict": "followed"
  }'
```

**Request (recommended — use helper):**

```bash
node ~/.experience/exp-feedback.js followed a1b2c3d4 experience-behavioral
```

**Response (200 OK):**

```json
{
  "recorded": true,
  "verdict": "followed",
  "pointId": "a1b2c3d4",
  "collection": "experience-behavioral"
}
```

**Important:** On thin-client setups, use the `exp-feedback.js` helper instead of raw curl. The helper reads `serverBaseUrl` and `serverAuthToken` from `~/.experience/config.json` and works correctly on remote VPS installations. Raw curl defaults to `localhost:8082` and will silently fail on remote setups.

---

### POST /api/route-model

Route a task to the optimal model tier based on keywords, history, and brain evaluation.

**Request:**

```bash
curl -X POST http://localhost:8082/api/route-model \
  -H "Content-Type: application/json" \
  -d '{
    "task": "debug race condition in auth middleware",
    "runtime": "claude-code",
    "complexity_hint": "high"
  }'
```

**Response (200 OK):**

```json
{
  "tier": "premium",
  "model": "claude-opus",
  "reasoningEffort": "high",
  "confidence": 0.85,
  "source": "brain",
  "reasoning": "Race conditions require deep analysis. Brain classified as premium-tier complexity."
}
```

**Routing layers (fastest first):**

1. **Keywords** (~0ms): Exact task-type matches (e.g., "debug" → premium)
2. **History** (~50ms): Semantic search in T2 — retrieve similar past tasks
3. **Brain** (~200ms): LLM evaluation (fallback, only on low-confidence keyword/history matches)

---

### POST /api/route-task

Route a task to the optimal workflow (e.g., GSD phase, skill, standalone).

**Request:**

```bash
curl -X POST http://localhost:8082/api/route-task \
  -H "Content-Type: application/json" \
  -d '{
    "task": "add authentication to REST API",
    "runtime": "claude-code",
    "context": {
      "repo": "muonroi-building-block",
      "scope": "multi-file"
    }
  }'
```

**Response (200 OK):**

```json
{
  "workflow": "gsd-plan-phase",
  "reasoning": "Multi-file architecture change. Requires planning + structured execution.",
  "recommendedSkill": "gsd-plan-phase",
  "alternatives": [
    {
      "workflow": "gsd-execute-phase",
      "confidence": 0.65,
      "reason": "If plan already exists"
    }
  ]
}
```

---

### POST /api/brain

Proxy an LLM call through the server for firewall / compliance scenarios.

**Request:**

```bash
curl -X POST http://localhost:8082/api/brain \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {
        "role": "user",
        "content": "Explain the singleton pattern in C#"
      }
    ],
    "model": "auto",
    "maxTokens": 500
  }'
```

**Response (200 OK):**

```json
{
  "content": "The singleton pattern ensures a class has only one instance...",
  "model": "gemini-2.0-flash",
  "tokensUsed": 142,
  "cacheHit": false
}
```

---

### POST /api/principles/share

Export a principle as portable JSON for sharing across teams.

**Request:**

```bash
curl -X POST http://localhost:8082/api/principles/share \
  -H "Content-Type: application/json" \
  -d '{
    "id": "principle-a1b2c3d4",
    "format": "json"
  }'
```

**Response (200 OK):**

```json
{
  "id": "principle-a1b2c3d4",
  "text": "Stateful objects must be scoped, never singleton",
  "tier": "T0",
  "confidence": 0.92,
  "sourceExamples": [
    "DbContext lifecycle in ASP.NET",
    "HttpClient in microservices"
  ],
  "tags": ["dependency-injection", "state-management", "c#"],
  "exported": "2026-05-20T14:30:00Z"
}
```

---

### POST /api/principles/import

Import a shared principle from another workspace or team.

**Request:**

```bash
curl -X POST http://localhost:8082/api/principles/import \
  -H "Content-Type: application/json" \
  -d '{
    "principle": {
      "text": "Stateful objects must be scoped, never singleton",
      "confidence": 0.92,
      "sourceExamples": [
        "DbContext lifecycle in ASP.NET",
        "HttpClient in microservices"
      ],
      "tags": ["dependency-injection"]
    },
    "source": "team-shared-library"
  }'
```

**Response (200 OK):**

```json
{
  "id": "principle-new-xyz789",
  "text": "Stateful objects must be scoped, never singleton",
  "tier": "T0",
  "imported": true,
  "mergedWithExisting": false
}
```

---

### POST /api/pil-context

PIL (Pattern-Instance-Learning) context — classification + semantic retrieval in one call. Cached for 5 minutes (LRU).

Used by muonroi-cli L1 to reduce round-trips.

**Request:**

```bash
curl -X POST http://localhost:8082/api/pil-context \
  -H "Content-Type: application/json" \
  -d '{
    "toolName": "Edit",
    "toolInput": {
      "file_path": "src/db.ts"
    },
    "workspace": "muonroi-control-plane"
  }'
```

**Response (200 OK):**

```json
{
  "classification": {
    "risk": "high",
    "category": "stateful-modification",
    "reason": "Historical mistakes in this file type"
  },
  "suggestions": [
    {
      "id": "a1b2c3d4",
      "text": "Stateful objects must be scoped, never singleton",
      "confidence": 0.92,
      "source": "T1"
    },
    {
      "id": "lesson-xyz789",
      "text": "DbContext migrations: always lazy-load in transaction scope",
      "confidence": 0.78,
      "source": "T2"
    }
  ],
  "cacheHit": false,
  "ttl": 300
}
```

---

## Error Responses

All endpoints return standard HTTP error codes:

| Code | Meaning |
|------|---------|
| `200 OK` | Request succeeded |
| `202 Accepted` | Request queued (async operation) |
| `400 Bad Request` | Malformed input |
| `401 Unauthorized` | Missing or invalid auth token |
| `404 Not Found` | Resource not found |
| `429 Too Many Requests` | Rate limit exceeded |
| `500 Internal Server Error` | Server error |
| `503 Service Unavailable` | Qdrant or FileStore down |

**Error response format:**

```json
{
  "error": "Qdrant is unreachable",
  "code": "QDRANT_UNREACHABLE",
  "timestamp": "2026-05-20T14:30:00Z"
}
```

---

## Rate Limiting

- **Default:** 100 requests / minute per IP
- **Authenticated (token):** 500 requests / minute

Clients receive `429 Too Many Requests` with a `Retry-After` header.

---

## Related

- [Getting Started](./getting-started) — Docker setup, config
- [How It Works](./how-it-works) — Hook lifecycle, judge worker, evolution
- [Configuration](./configuration) — `config.json` reference, auth setup
- [Observability](./observability) — Admin tools, monitoring
