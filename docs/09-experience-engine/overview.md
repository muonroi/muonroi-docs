---
title: Overview
sidebar_label: Overview
sidebar_position: 1
---

# Experience Engine

`@muonroi/experience-engine` is continual learning infrastructure for AI coding agents. It extracts lessons from mistakes, generalizes them into behavioral principles, and evolves over time — while its memory footprint actually shrinks.

## The Problem With Accumulation

Most memory tools store facts. That approach fails at scale:

```
Without Experience Engine:
  Session 1:  DbContext singleton → production bug → 15 min debug
  Session 2:  DbContext singleton → same bug       → 15 min debug (again)
  Session 50: 200 memory entries. Still making the same mistakes.

With Experience Engine:
  Session 1:  DbContext singleton → lesson extracted automatically
  Session 2:  About to repeat it  → hook fires → "Last time: state corruption"
  Session 15: 3 similar lessons   → evolved into principle:
                                     "Stateful objects must be scoped, never singleton"
  Session 16: RedisConnection singleton (never seen before)
              → principle matches the novel case → bug avoided
              Memory: 50 entries → 15 principles. Fewer entries. More coverage.
```

**Core insight:** Knowledge should evolve from experience, not accumulate as facts.

## 4-Tier Knowledge Architecture

```
Tier  Label       Size           Purpose
----  ----------  -------------  ----------------------------------------------
T0    Principles  ~400 tokens    Generalized rules — always loaded, match novel cases
T1    Behavioral  ~600 tokens    Specific confirmed reflexes — always loaded
T2    QA Cache    semantic       Detailed Q&A — retrieved on semantic similarity
T3    Raw         staging        Unprocessed lessons — TTL 30 days
```

**Lifecycle:**

```
T3 (extracted) → T2 → (confirmed 3x) → T1 → (cluster) → T0
T2 (ignored 3x) → demote → archive
```

Principles at T0 generalize to cases never seen before. A singleton lesson extracted from `DbContext` will fire on `RedisConnection` without a separate entry.

## Experience Graph

Experiences are linked with typed edges rather than stored as isolated facts:

```
DbContext singleton ──generalizes──> "Stateful objects: always scoped"
                    ──relates-to───> HttpClient singleton
                    ──supersedes───> [old] "Use transient for DbContext"
```

Typed edges enable the engine to detect when a new principle makes an older entry redundant and retire it automatically.

## Runtime Architecture

```
+----------------------------------+
|   Local Machine / Thin Client    |
|                                  |
|  Agent (Claude / Gemini / ...)   |
|    |                             |
|    +-- interceptor.js            |  PreToolUse  — inject warnings
|    +-- interceptor-post.js       |  PostToolUse — reconcile outcomes
|    +-- stop-extractor.js         |  Session End — extract lessons
|    |                             |
|    +-- offline-queue             |  Buffer when VPS unreachable
+----------------------------------+
              |  REST
              v
+----------------------------------+
|         VPS Brain Server         |
|                                  |
|  server.js        REST API       |
|  experience-core.js  Processing  |
|  judge-worker.js     Async eval  |
|  evolve()            T2→T1→T0    |
+----------------------------------+
              |
              v
+----------------------------------+
|         Knowledge Store          |
|                                  |
|  Qdrant    T2 semantic search    |
|  FileStore T0 / T1 always-loaded |
+----------------------------------+
```

Hooks run locally on the agent machine. The brain server handles all inference and evolution. Qdrant is used for semantic retrieval at T2; T0 and T1 fit in a flat file and are always injected into context.

## Comparison

| | Mem0 | Letta | Zep | Experience Engine |
|---|---|---|---|---|
| Storage model | Facts accumulate | Agent self-edit | KG + facts | Extract → Evolve → Generalize |
| Memory over time | Grows linearly | Grows linearly | Grows linearly | Shrinks (principles replace entries) |
| Novel case coverage | Exact match only | Exact match only | Exact match only | Principles generalize to unseen cases |
| Mistake detection | No | No | No | Yes — 5 pattern types |
| Automatic feedback loop | No | No | No | Yes — judge-worker, no agent cooperation needed |
| Local-first | Optional | Optional | Partial | Yes — FileStore default, zero cloud required |
| Runtime dependencies | Python + SDK | PostgreSQL + pgvector | PostgreSQL | Zero — Node.js built-in |
| Multi-agent | Yes | Yes | Limited | Claude / Gemini / Codex / OpenCode |
| Data ownership | Vendor cloud | SaaS | Vendor cloud | You own everything |
| Token cost trend | Grows | Grows | Grows | Shrinks |

## Supported Agents

- Claude Code
- Gemini CLI
- Codex CLI
- OpenCode

## Supported Providers

| Embedding | Brain (LLM) |
|-----------|-------------|
| Ollama (nomic-embed-text) | Ollama (qwen2.5:3b) |
| OpenAI (text-embedding-3-small) | OpenAI (gpt-4o-mini) |
| Gemini (text-embedding-004) | Gemini (gemini-2.0-flash) |
| VoyageAI (voyage-code-3) | Claude (haiku) |
| SiliconFlow (Qwen3-Embedding) | DeepSeek (deepseek-chat) |
| Custom (any OpenAI-compatible) | SiliconFlow (Qwen2.5-7B) |

All provider pairs are independently configurable — embedding and brain do not need to be from the same vendor.

## Related

- [Getting Started](./getting-started) — Docker setup, npm install, thin client wiring
- [How It Works](./how-it-works) — Hook lifecycle, noise filtering, judge worker, evolution cycle
- [Configuration](./configuration) — `config.json` reference
- [API Reference](./api-reference) — REST endpoints
- [Observability](./observability) — Stats, health checks, admin tools
- [Python SDK](./python-sdk) — Python client usage
