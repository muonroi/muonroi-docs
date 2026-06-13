---
title: How It Works
sidebar_label: How It Works
sidebar_position: 3
---

# How It Works

The Experience Engine is a feedback loop that intercepts every mutating tool call an agent makes, checks it against a knowledge base of past mistakes, injects relevant warnings, and then evaluates whether the agent followed those warnings — all without any manual coordination.

## Hook Lifecycle Overview

```
Agent writes code
  │
  ├─ BEFORE each mutating tool call
  │   ├─ Layer 1: Read-only skip (ls, cat, git log…) → bypassed instantly, $0
  │   ├─ Layer 2: Semantic search → "Have I seen this mistake before?"
  │   │           Ranks by: confidence · recency · hit frequency · domain match
  │   │           Follows 1-hop graph edges to surface related experiences
  │   └─ Layer 3: Brain relevance filter → LLM asks "is this warning relevant HERE?"
  │               ~200 tokens in, 1 token out. Fail-open if brain is slow.
  │               If relevant → injects: "⚠️ Last time this caused X [id:a1b2 col:behavioral]"
  │
  └─ AFTER each session
      ├─ Extracts lessons from mistakes (retry loops, corrections, test failures)
      ├─ Stores as Q&A in vector DB with domain/language/framework tags
      ├─ Judge worker: evaluates FOLLOWED / IGNORED / IRRELEVANT per hint
      └─ Evolution engine:
           3x confirmed → promote to Behavioral (T1)
           Cluster of T1 entries → generalize to Principle (T0)
           3x ignored or noise → demote + archive
           Memory SHRINKS as capability GROWS
```

---

## Anti-Noise: 3-Layer Filter

The system is designed to inject warnings only when they are high-signal and relevant. Three layers enforce this.

### Layer 1 — Read-only Skip (regex, 0ms, $0)

Commands that never mutate code bypass the pipeline entirely. This includes `ls`, `cat`, `git log`, `docker ps`, and similar read-only operations. Chained commands skip only if **all** parts of the chain are read-only.

This layer costs nothing and ensures the engine does not slow down pure exploration work.

### Layer 2 — Quality Scoring

Each candidate experience in the knowledge base is scored before it can surface as a warning. Scoring factors:

- **Hit frequency** — how often this experience was triggered
- **Recency** — recent confirmations outweigh old ones (temporal decay applied)
- **Confidence aging** — entries with no recent signals decay toward neutral
- **Language/framework gate** — a `.ts` file only matches TypeScript-tagged experiences; a `.cs` file matches C# / dotnet only
- **Domain match** — infrastructure, auth, data access, etc. must align
- **Superseded penalty** — entries that have been replaced by newer knowledge rank lower
- **Session dedup** — the same warning is never shown twice in a single session
- **Budget cap** — maximum 8 warnings per session to prevent noise accumulation
- **Noise suppression** — entries tagged `wrong_repo`, `wrong_language`, `wrong_task`, or `stale_rule` three or more times are demoted automatically

### Layer 3 — Brain Relevance Filter (LLM, ~1 output token, fail-open)

After Layer 2 produces a ranked shortlist, a lightweight LLM call decides which entries are actually relevant to the current action.

```
Input:  ACTION: Edit Startup.cs — services.AddSingleton<DbContext>()
        1. Stateful objects must be scoped, never singleton
        2. Always use IMLog, never ILogger
        3. Never modify ePort consumer code

Output: 1        (only warning #1 is relevant to this specific action)
```

Cost: approximately 200 input tokens plus 1 output token. This is $0 with a local Ollama model and approximately $0.00004 with SiliconFlow. The call is **fail-open** — if the brain takes more than 3 seconds to respond, all shortlisted warnings pass through rather than blocking the agent.

---

## Judge Worker — Closed Feedback Loop

After each tool call, a detached background process evaluates whether the agent followed the hint. This happens without any cooperation from the agent.

```
interceptor-post.js  →  judge-worker.js  →  brain LLM
                                          →  FOLLOWED   (positive signal)
                                          →  IGNORED    (negative signal)
                                          →  IRRELEVANT (noise tag + reason)
                                          →  UNCLEAR    (abstain)
```

The judge reads the tool call input and output, compares it against the injected warnings, and emits a verdict. This verdict is recorded against each experience entry and drives the evolution cycle (see below).

Manual `exp-feedback` commands are still accepted and produce a stronger signal than the automatic judge, but the loop is closed either way.

---

## 4-Tier Knowledge Architecture

Experiences are stored in four tiers with different retrieval costs and promotion requirements.

| Tier | Name | Size | Loading | Description |
|------|------|------|---------|-------------|
| T0 | Principles | ~400 tokens | Always loaded | Generalized rules derived from clusters of T1 entries. Match novel cases. |
| T1 | Behavioral | ~600 tokens | Always loaded | Specific confirmed reflexes with high follow rate. |
| T2 | QA Cache | semantic | Retrieved on match | Detailed Q&A pairs, retrieved by vector similarity. |
| T3 | Raw | staging | TTL 30 days | Unprocessed lessons extracted from session transcripts. |

### Lifecycle

```
T3 (extracted from session) → T2 (stored with tags)
T2 (3x confirmed by judge)  → T1 (promoted to behavioral)
T1 (cluster of similar)     → T0 (LLM generalizes to principle)
T2 (3x ignored or noise)    → demote → archive
```

Memory **shrinks** as capability grows: a single T0 principle replaces multiple specific T1 and T2 entries once the pattern is fully generalized.

---

## Evolution Cycle

### Promotion Path

1. **T3 to T2** — The session-end extractor (`stop-extractor.js`) identifies retry loops, corrections, and test failures in the session transcript and converts them into Q&A pairs tagged with domain, language, and framework metadata.

2. **T2 to T1** — After three confirmed follows (recorded by the judge worker or manual `exp-feedback followed`), the entry is promoted to behavioral. It is now always loaded for the relevant language/domain scope.

3. **T1 to T0** — When a cluster of similar T1 entries accumulates, the evolution engine asks the brain LLM to generalize them into a principle. The resulting T0 entry uses the format: "when X class of failure appears, do Y because Z."

### Runbook Reconfirm on Supersede (§3.6)

A runbook entry (`nodeKind: 'runbook'`) stitches several atomic experience entries together via `derivedFromId` (a list of 8-character ID prefixes). When one of those referenced entries is superseded, the runbook's procedure step may be stale — but the runbook body is human-authored ground truth, so the engine **never auto-edits it**.

Instead, when the evolution cycle detects that a superseded entry's 8-char ID prefix matches any entry in a runbook's `derivedFromId` list, it flags the runbook:

- Sets `needsReconfirm: true` on the payload
- Records `reconfirmAt` (ISO timestamp)
- Sets `reconfirmReason: "derivedFrom superseded: <id>,<id>"`
- Records the triggered IDs in `reconfirmTriggeredBy`
- Appends an `op: runbook-needs-reconfirm` row to the activity log

The flagging is **idempotent**: if the runbook is already flagged and no new superseded ID appeared, the payload is not re-written. Runbooks that are themselves already superseded are exempt.

The `needsReconfirm` flag surfaces in the session-end nudge and the dashboard, prompting a human to re-validate the runbook body against current practice.

### Demotion Path

An entry that receives three ignored or noise verdicts is demoted and archived. Archived entries retain their history but are excluded from retrieval.

The `exp-feedback noise` command accepts a reason code that controls how narrowly the demotion is applied:

| Reason | Effect |
|--------|--------|
| `wrong_language` | Adds caller language to `scope.lang_exclude`. Entry survives for other languages. |
| `wrong_repo` | Adds caller project slug to `scope.project_exclude`. Entry survives elsewhere. |
| `wrong_task` | Counts toward supersede ratio only. Does not narrow scope. Last resort. |
| `stale_rule` | Marks entry as referencing obsolete API. Counts toward supersede. |

Use `wrong_language` or `wrong_repo` whenever the mismatch is clearly scoped — these preserve the entry for other contexts. `wrong_task` pushes the entry toward full deletion.

---

## Experience Graph

Experiences are linked with typed edges. When an entry is retrieved by vector search, the engine automatically follows 1-hop edges to surface related knowledge.

```
DbContext singleton ──generalizes──→ "Stateful objects: always scoped"
                    ──relates-to───→ HttpClient singleton
                    ──supersedes───→ [old] "Use transient for DbContext"
```

Edge types:

- `generalizes` — this entry is a broader statement of the linked entry
- `relates-to` — same failure class, different context
- `supersedes` — this entry replaces the linked entry due to a framework or API change

Superseded entries are not deleted. They remain in the graph with reduced rank, and `/api/timeline` shows the full evolution of any given knowledge area.

---

## Temporal Reasoning

The engine tracks when entries were confirmed and uses recency as a ranking factor. When two entries contradict each other, the more recently confirmed entry ranks higher.

Example:

```
Jan:  "Use singleton for HttpClient"  (confirmed 5x)
Mar:  "Actually, use IHttpClientFactory"  → contradicts Jan entry
      → Jan entry marked superseded, not deleted
      → New entry ranked higher (recent confirmation)
      → /api/timeline shows the full evolution
```

This means the engine handles library upgrades and breaking changes without losing the historical record of why a pattern existed.

---

## Agent Instruction Injection

On every install and upgrade, `inject-agent-instructions.sh` writes a marker-delimited block into each supported agent's config file:

| Agent | Config file |
|-------|-------------|
| Claude Code | `~/.claude/CLAUDE.md` |
| Gemini CLI | `~/.gemini/GEMINI.md` |
| Codex CLI | `~/.codex/AGENTS.md` |
| OpenCode | `~/.config/opencode/AGENTS.md` |

The block is wrapped in HTML comment markers:

```
<!-- experience-engine:start -->
## Experience Engine
...
<!-- experience-engine:end -->
```

The script is **idempotent**:
- If the target file does not exist but its parent directory does, the file is created containing only the block.
- If the target file already contains the managed block, the block is replaced in-place (auto-migrating stale/older versions).
- If the target file exists without a managed block, the block is appended.
- If the parent directory does not exist (agent not installed), the file is silently skipped.

**Opt out:** Set `EXPERIENCE_SKIP_MD_INJECT=1` before running setup or upgrade to skip injection entirely.

The injected block includes a "Project Memory Self-Curation" subsection that instructs each agent how to write lessons back to its own memory directory (`MEMORY.md` bullets for Gemini/Antigravity/Codex; per-file frontmatter under `~/.claude/projects/<slug>/memory/` for Claude). This closes the curation loop: agents write memory, `import-memory.js` reads it back into the brain.

---

## Key Files

| File | Purpose |
|------|---------|
| `.experience/interceptor.js` | PreToolUse intercept logic — runs Layers 1, 2, 3 and injects warnings |
| `.experience/interceptor-post.js` | PostToolUse reconciliation — feeds tool output to judge worker |
| `.experience/judge-worker.js` | Background feedback evaluation — emits FOLLOWED / IGNORED / IRRELEVANT |
| `.experience/experience-core.js` | Shared processing logic used by interceptor and extractor |
| `.experience/stop-extractor.js` | Session-end lesson extraction — converts transcript to T3 entries |

---

## Related

- [Overview](./overview)
- [Configuration](./configuration)
- [Observability](./observability)
