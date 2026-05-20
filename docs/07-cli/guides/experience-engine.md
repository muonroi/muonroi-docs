---
title: Experience Engine
sidebar_label: Experience Engine
sidebar_position: 4
---

# Experience Engine

The Experience Engine (EE) is a persistent behavioral memory system built into `muonroi-cli`. It accumulates lessons from past session outcomes across all projects so the agent can recognize and avoid repeating mistakes it — or other sessions — have made before.

Unlike static lint rules, EE learns from real incidents. A bug caught in one project can prevent the same bug in an unrelated codebase the next day.

---

## How it works

EE operates in a three-stage lifecycle:

### 1. Capture

After every tool call, a PostToolUse hook evaluates the outcome asynchronously. A judge model classifies what happened — success, partial success, or incident — and stores the result as an **observation** attached to the action context (repo, language, task type, tool used).

### 2. Warn

Before each tool call, a PreToolUse hook queries EE via semantic search. If a past observation or principle matches the current action with sufficient confidence, a **warning** is injected inline before the agent proceeds.

Example progression:

| Session | What happened |
|---------|---------------|
| 1 | `DbContext` registered as singleton → state corruption bug → observation captured |
| 2 | Agent about to repeat the same pattern → PreToolUse warning fires → avoided |
| 15 | Three similar observations accumulated → evolution cycle compresses them into a principle: _"Stateful objects must be scoped, never singleton"_ |
| 16 | `RedisConnection` singleton (never seen before) → principle matches semantically → avoided preemptively |

### 3. Evolve

Periodic evolution cycles compress observations into **behavioral rules**, then compress rules into **principles**. Principles are scope-aware (language, repo, task type) and generalize across contexts. This is what enables cross-project learning — a principle extracted from one repository applies to all repositories in the same ecosystem.

---

## PreToolUse warnings

When EE detects a relevant past lesson, it injects a warning before the tool call executes. The agent sees this inline, before any file is written or command is run.

### Warning format

```
⚠️ [Experience - High Confidence] <message>
Why: <rationale>
[id:xxxx col:name]
↩ Wrong? node ~/.experience/exp-feedback.js noise <id> <col> <reason>
```

Advisory suggestions (lower confidence) use:

```
💡 [Suggestion] <message>
Why: <rationale>
[id:xxxx col:name]
↩ Wrong? node ~/.experience/exp-feedback.js noise <id> <col> <reason>
```

### What to do

- **High-confidence warnings** — follow them. They reflect confirmed past incidents.
- **Suggestions** — treat as input; apply judgment.
- **Wrong hint** — report it immediately (see [Feedback commands](#feedback-commands)). Noise in the engine degrades all agents.
- **Ignored hint** — record it via the helper so the engine can track drift.

Do not silently ignore warnings. Unrecorded ignores prevent the engine from learning whether a hint was useful.

---

## Feedback commands

Use `exp-feedback` to close the loop after a warning fires. The helper reads server URL and auth token from `~/.experience/config.json` and works on thin-client installs. Do not use raw `curl` to `/api/feedback` — it defaults to `localhost:8082` and silently no-ops on remote setups.

```bash
# Confirm the hint was correct and you followed it
exp-feedback followed <pointId> <collection>

# Note that you ignored the hint (without marking it wrong)
exp-feedback ignored <pointId> <collection>

# Report a bad hint
exp-feedback noise <pointId> <collection> <reason>
```

`<pointId>` and `<collection>` are printed in the `[id:xxxx col:name]` line of the warning.

### Feedback reason values

| Reason | When to use | Engine action |
|---|---|---|
| `wrong_language` | Hint is about a language or framework that does not match the current file | Adds caller language to `scope.lang_exclude` — entry survives for other languages |
| `wrong_repo` | Hint targets a different project | Adds caller project slug to `scope.project_exclude` |
| `wrong_task` | Hint type is completely irrelevant to the current task | Counts toward supersede ratio only — **last resort**, does not narrow scope |
| `stale_rule` | Hint references an obsolete API or deprecated version | Counts toward supersede |

**Prefer `wrong_language` or `wrong_repo`** over `wrong_task` when the mismatch is clearly about context. `wrong_task` pushes the entry toward full deletion without preserving any scope narrowing.

---

## Slash commands

| Command | Description |
|---|---|
| `/ee search <query>` | Semantic search over the EE brain. Returns past lessons, observations, and principles relevant to the query in natural language. |

Example:

```
/ee search singleton DI registration
/ee search redis connection pooling
```

---

## Configuration

EE behavior is controlled via `user-settings.json`.

| Setting | Type | Default | Description |
|---|---|---|---|
| `councilExperienceMode` | `"off" \| "advisory" \| "enforcing"` | `"advisory"` | Controls how EE warnings are surfaced. `off` disables all hooks. `advisory` shows warnings but does not block. `enforcing` treats high-confidence warnings as blockers. |
| `eeBBContext` | `boolean` | `true` | Injects building-block-aware context into EE queries. Improves relevance of warnings in BB-heavy codebases. |

---

## Self-hosting

The EE client communicates with the `experience-engine` service over HTTP. The default local address is `http://localhost:8082`; remote (thin-client) installs point to the configured VPS endpoint in `~/.experience/config.json`.

Timeout budgets are adaptive:
- Local (`localhost` / `127.0.0.1`): **100 ms** — fast enough to be invisible; wedged server detected quickly.
- Remote (VPS): **10 000 ms** — accounts for embedding generation, Qdrant lookup, and brain routing over external API.

All hooks **fail open**. If EE is unreachable, a rate-limited warning is logged at most once per minute and the CLI continues normally. No tool call is ever blocked due to EE unavailability.

---

## Best practices

- **Act on high-confidence warnings.** They represent confirmed, repeated incidents, not speculative rules.
- **Submit feedback every time you override a warning.** The engine cannot distinguish a useful hint from noise without signal.
- **Use `/ee search` before starting unfamiliar work.** Retrieve relevant past lessons before touching files rather than discovering them mid-edit.
- **Prefer `wrong_language` / `wrong_repo` over `wrong_task`** when reporting noise. Narrowing scope preserves the entry for other contexts; `wrong_task` accelerates deletion.
- **Do not disable EE (`"off"`)** on shared projects. Lessons accumulated by other sessions will stop surfacing, erasing cross-project benefit.
- **Keep `eeBBContext: true`** in BB-heavy repositories. Context injection significantly improves warning relevance for building-block patterns.
