---
title: Cost-Leak Forensics
sidebar_position: 7
---

# Cost-leak forensics & token caps

`muonroi-cli` ships a forensics CLI plus a stack of cumulative caps,
prepareStep compactors, and cross-turn dedup designed to keep any single
LLM call under **80,000 input tokens**. This guide is the canonical
reference for diagnosing "why did this session cost so much" and for
verifying that the Phase A/B/C cost-optimization wins still hold after
new code lands.

Every claim links back to source so the rules stay traceable. If this
guide and the code disagree, the code wins.

## Overview

The forensics tool answers three questions about a recorded session:

1. **Where did the input tokens go?** Per-event breakdown joining
   `usage_events` with `interaction_logs` to show which user prompt
   triggered which billed input.
2. **Did the safety caps engage?** Anomaly flags fire when the
   sub-agent cumulative cap, the message write-ahead, or the DeepSeek
   cache-split fields look wrong.
3. **What `providerOptions` shape did each call carry?** Phase O1
   records the type-shape (not values) of providerOptions per event so
   post-mortem can prove the OAuth `promptCacheKey` or `store=false`
   wiring fired.

Use it when:

- A real session burned more than the projected cost preview.
- You've just changed orchestrator wiring (`prepareStep`, sub-agent
  cap, message persistence) and need a regression check.
- A user reports "the agent feels expensive on this prompt" and you
  need numbers to argue from.

For *pre-flight* verification (before burning real tokens), see the
**Verifying provider-layer behavior with the mock model (H1)** section
in `muonroi-cli/CLAUDE.md` — the `installMockModel` harness lets you
assert against recorded `doStreamCalls` in a unit test.

Implementation: `src/cli/cost-forensics.ts`.

## CLI usage

```bash
# Human-readable summary + per-event breakdown
bun run src/index.ts usage forensics <session-id-prefix>

# Machine-parseable JSON (CostForensicsSummary shape)
bun run src/index.ts usage forensics <session-id-prefix> --json
```

The prefix matches against the most recent five sessions whose `id`
starts with `<prefix>` (`resolveSessionId` in
`src/cli/cost-forensics.ts:71`). Ambiguous prefixes print the matching
IDs to stderr and exit non-zero.

The human-readable report contains five sections:

1. **Header** — session ID and counters (user prompts, tool calls,
   LLM events).
2. **Aggregate totals** — total input/output, cache read/create, peak
   single-call input, estimated USD cost.
3. **Per-event breakdown** — one row per `usage_events` entry with
   columns `seq | src | input | out | cacheR | cacheC | ts`.
4. **`providerOptions` shape** — Phase O1 type-only snapshot per event
   that carried providerOptions.
5. **Anomalies** — flags relative to Phase A/B/C acceptance targets.
   If none fire, the report ends with `✓ No acceptance-target
   anomalies detected.`

The JSON shape is exported as `CostForensicsSummary` from
`src/cli/cost-forensics.ts:31` — stable enough to script regression
checks in CI.

## Anomaly flags

Three flags can fire after the per-event breakdown. Each maps to a
specific phase target in the cost-optimization plan.

| Anomaly | Meaning | Phase breach | Where to look |
|---|---|---|---|
| `peak single-call input > 80,000` | A single LLM call billed more than the sub-agent cumulative cap should allow | **Phase B target breach** — sub-agent cap (`wrapToolSetWithCap`) did not engage | `src/orchestrator/sub-agent-cap.ts:188`; sub-agent wiring in `src/orchestrator/stream-runner.ts:258`; top-level wiring in `src/orchestrator/message-processor.ts:996` |
| `NULL message_seq on 'message' source` | A `message`-source `usage_events` row landed without a paired `message_seq` | **Phase A5 breach** — write-ahead persistence was bypassed | `persistMessageWriteAhead` must be called BEFORE `streamText` in `src/orchestrator/message-processor.ts:709` (entry point at `:101`) |
| `deepseek route has zero cache_creation_tokens across N deepseek input tokens` | A DeepSeek-shaped event (capability `readField === "promptCacheHitTokens"`) emitted zero cache_creation across a large input volume | **Conservative** — DeepSeek never emits `cache_creation` (cache reads only). Treat as regression only if `cacheReadTokens === 0` on the same events. | `detectProviderForModel` + `getProviderCapabilities().cacheMetricLayout()` in `src/cli/cost-forensics.ts:233-237`; C1 normalization tests in `src/orchestrator/__tests__/usage-normalizer-c1.test.ts` |

The DeepSeek warning is scoped via provider capabilities so adding a
new DeepSeek-shaped provider (e.g. siliconflow) wires through
automatically without touching the forensics literal — Phase 12.2-G5
swapped the old `model.startsWith("deepseek")` check for capability
detection (`src/cli/cost-forensics.ts:233`).

## Known baselines

The optimization stack lands across phases A1–A5, B1–B4, C1–C3, F1,
G1–G2, M1, and O1. The three reference sessions below are the
acceptance baseline.

| Era | Session ID | Peak single-call input | Cache hit | Notes |
|---|---|---|---|---|
| **Pre-fix worst case** | `b58603caceb9` | 504,737 | low | Single prompt blew past 500K input; all three anomalies firing. |
| **Post-fix DeepSeek** | `5f349ef73ccb` | 31,702 | 41.6% | Same "explore oauth" prompt as the pre-fix case — **16× reduction**. |
| **Post-fix OAuth gpt-5.4** | `63974a79c0cd` | 31,827 | 97% | Shorter prompts; F1 promptCacheKey + B4 top-level compaction holding. |

After A1–A5 + B1–B4 + C1–C3 + F1 + G1–G2 + M1 + O1 ship, peak input
should stay **≤ 80K tokens on any single call**. A peak above that on
a freshly-recorded session is a regression — re-run forensics with
`--json`, capture the offending event row, and bisect against the
phase wiring listed in the anomaly table above.

## Environment caps

Every cap has a sane default; env overrides exist for diagnosis,
benchmarks, and emergency knob-turning. All values are clamped to a
safe range — invalid values fall back to the default rather than
disabling the cap.

| Env var | Range | Default | Effect |
|---|---|---|---|
| `MUONROI_MAX_TOOL_OUTPUT_CHARS` | 10,000 – 200,000 | 32,000 | Per-call tool-output cap. Every tool result longer than this is truncated with a footer. Source: `src/tools/registry.ts:35-40`. |
| `MUONROI_SUB_AGENT_BUDGET_CHARS` | 20,000 – 600,000 | 120,000 | Cumulative budget the `task` sub-agent may receive across one invocation. Tiers at 30%/70% (aggressive). Source: `getSubAgentBudgetChars()` in `src/utils/settings.ts:894`. |
| `MUONROI_TOP_LEVEL_TOOL_BUDGET_CHARS` | 50,000 – 1,500,000 | 400,000 | Cumulative budget for the **top-level** agentic tool loop, fresh per turn. Tiers at 50%/80% (loose). Engages when the sub-agent path falls back to direct top-level tool calls. Source: `getTopLevelToolBudgetChars()` in `src/utils/settings.ts:980`. |
| `MUONROI_SUBAGENT_COMPACT_THRESHOLD_CHARS` | 20,000 – 500,000 | 80,000 | **Phase B3** — cumulative message-chars above which the sub-agent `prepareStep` compactor rewrites older `tool_result` parts into `[elided by sub-agent compactor]` stubs. |
| `MUONROI_SUBAGENT_COMPACT_KEEP_LAST` | 1 – 20 | 3 | **Phase B3** — trailing tool turns kept verbatim during sub-agent compaction. |
| `MUONROI_TOP_LEVEL_COMPACT_THRESHOLD_CHARS` | 50,000 – 1,500,000 | 200,000 | **Phase B4** — same as B3 threshold but for the top-level orchestrator loop. Higher default because top-level agents carry more useful early context. |
| `MUONROI_TOP_LEVEL_COMPACT_KEEP_LAST` | 1 – 30 | 5 | **Phase B4** — trailing tool turns kept verbatim during top-level compaction. |
| `MUONROI_CROSS_TURN_DEDUP` | `0` / `1` | `1` | **Phase C3** — session-scoped dedup of identical tool outputs across user turns. Second identical result is replaced with `[tool_result identical to earlier turn — dedup ref sha1=..., originally from tool=... turn=...]`. LRU cap 200 entries per session; min 500 chars to qualify. |
| `MUONROI_DEBUG_SUBAGENT` | `0` / `1` | `0` | Emit detailed stderr telemetry from `task` sub-agents: streamText config, per-part stream counts, finish reason, error parts, full catch-block error shape. Use when diagnosing silent task failures ("No output generated" on reasoning models). |

The compaction pipeline (B3 + B4) is implemented in
`src/orchestrator/subagent-compactor.ts` and wired in two places:

- **Sub-agent** — `prepareStep` in `src/orchestrator/stream-runner.ts`
  (entry at `:24-27`).
- **Top-level** — `prepareStep` in
  `src/orchestrator/message-processor.ts:1155` (cap construction at
  `:996`).

Both compactors share the same algorithm: count cumulative chars
across `messages`, leave the last `KEEP_LAST` tool turns verbatim, and
rewrite earlier `tool_result` parts into a short summary stub. The
compactor never mutates the persisted message store — only the
in-memory copy passed to the next `streamText` step.

## Leak coverage map

Every named leak has a dedicated harness spec that verifies the fix
holds against a deterministic mock model. The specs install
`MockLanguageModelV3` from `ai/test` in front of the orchestrator and
assert against recorded `doStreamCalls` — no real tokens burned.

| Leak | Description | Spec |
|---|---|---|
| **G1** | OAuth backend rejects `max_output_tokens` — orchestrator must drop the param when registry marks it unsupported. | `tests/harness/cost-leak-g1.spec.ts` + `tests/harness/cost-leak-g1-tui.spec.ts` |
| **F1** | Stable OpenAI `promptCacheKey` — deterministic sha256 prefix across all rounds in the same session (cache hits compound). | `tests/harness/cost-leak-f1.spec.ts` + `tests/harness/cost-leak-f1-tui.spec.ts` |
| **B3** | Sub-agent `prepareStep` compaction — cumulative prompt chars stay below uncompacted control; older `tool_result` parts rewritten to `[elided by sub-agent compactor]` stubs. | `tests/harness/cost-leak-b3.spec.ts` + `tests/harness/cost-leak-b3-tui.spec.ts` |
| **B4** | Top-level `prepareStep` compaction — same as B3 but at the top-level loop; assertion checks `elided by top-level compactor`. | `tests/harness/cost-leak-b4.spec.ts` + `tests/harness/cost-leak-b4-tui.spec.ts` |
| **C1** | DeepSeek cache-split field — `prompt_cache_hit_tokens` read into `cacheReadTokens`; `prompt_cache_miss_tokens` into `noCacheInputTokens`. Anthropic-style `cache_read_input_tokens` still wins when present. | `src/orchestrator/__tests__/usage-normalizer-c1.test.ts` + `tests/harness/cost-leak-c1-tui.spec.ts` |
| **C3** | Cross-turn dedup — identical tool outputs across turns replaced with sha1 reference stub. | `tests/harness/cost-leak-c3.spec.ts` |

Auxiliary specs:

- `tests/harness/cost-leak-tui-smoke.spec.ts` — sanity smoke that
  spawns a TUI child with the mock model and confirms the
  cost-leak fixtures load through `loadMockModelFromDir` in
  `src/index.ts`.

The TUI-suffixed variants (`*-tui.spec.ts`) drive the assertion
through a real spawned child via the agent harness — useful when the
leak only manifests once the orchestrator is wired into the full app
shell rather than a unit harness.

### Anti-patterns when writing a new leak spec

These are documented in `muonroi-cli/CLAUDE.md`; reproduced here so
contributors don't have to context-switch:

1. **Do NOT inline `runtime.unsupportedParams?.includes(...)`** —
   always go through `shouldDropParam(runtime, param)` so a future
   refactor of the rule updates production and tests together.
2. **Do NOT depend on `globalThis.__muonroiMockModel` from the parent
   process when you also spawn a TUI child** — the mock lives in the
   importing process. For TUI E2E, the fixture file's `model` block
   is loaded by the child via `loadMockModelFromDir` in
   `src/index.ts`.
3. **Do NOT skip `await loadCatalog()` in `beforeAll`** — without it,
   `getModelInfo(modelId)` returns `undefined` and the
   `providerOptions` merge block silently no-ops.

## Workflow: "this session cost too much, what do I do?"

Follow this sequence when a user (or your own gut) flags a session as
expensive. Each step has a deterministic output — don't skip ahead.

### 1. Capture the session ID

The session ID is logged on every run start. For an `/ideal` run, the
manifest under `~/.muonroi/runs/<runId>/manifest.json` carries it.
For a free-form chat session, run `muonroi-cli usage list` (or query
`sessions` directly) to find a prefix.

### 2. Run forensics with the human-readable report first

```bash
bun run src/index.ts usage forensics <prefix>
```

Read top-down:

- **Peak single call** — must be ≤ 80,000. If it isn't, jump to
  step 4.
- **Cache hit ratio** — should be > 30% on any session with more than
  one round-trip. If it's 0%, F1's `promptCacheKey` may not be firing
  (OpenAI provider) or DeepSeek normalization may be broken (C1).
- **Anomalies block** — every flag is actionable. Read the **Anomaly
  flags** table above to find the file + line that should be checked.

### 3. Cross-reference user prompts

If a single event row dwarfs the rest, the `seq` column lets you
cross-reference with `interaction_logs` to find the user prompt that
triggered it. The `source` column tells you whether the call came
from `message` (top-level), `task` (sub-agent), or something else.
DeepSeek + `source=task` is the hot spot the B3 compactor protects.

### 4. If peak input > 80K

This is a Phase B breach. The sub-agent cap should have engaged but
didn't. Check, in order:

1. **Was the call routed through `wrapToolSetWithCap`?** Sub-agent
   path: `src/orchestrator/stream-runner.ts:258`. Top-level path:
   `src/orchestrator/message-processor.ts:996`. A call that bypasses
   both wrappers (rare — usually a new code path) will never see
   the cap.
2. **Did `prepareStep` rewrite older tool results?** Look for
   `[elided by sub-agent compactor]` or `[elided by top-level
   compactor]` stubs in the persisted messages. If they're absent
   despite cumulative chars above the threshold, the compactor input
   wiring is broken — see `compactSubAgentMessages` in
   `src/orchestrator/subagent-compactor.ts`.
3. **Is cross-turn dedup disabled?** Check
   `MUONROI_CROSS_TURN_DEDUP` — default is `1`. A previously-disabled
   shell exporting `0` will let identical tool results re-bill on
   every turn.

### 5. If NULL `message_seq` rows exist

A5 write-ahead bypass. The orchestrator must call
`persistMessageWriteAhead(session.id, seq, role, json)` BEFORE the
`streamText` call (`src/orchestrator/message-processor.ts:709`).
After streaming completes, `markMessageCompleted` flips the row to
the final state; on error, `markMessageErrored` preserves the
diagnostic. A NULL seq on a `message`-source row means the
write-ahead was skipped — usually a missed branch in a new code
path.

### 6. Capture a baseline JSON snapshot

When you've identified the fix, snapshot the post-fix forensics with
`--json` and stash it alongside the spec under
`tests/harness/cost-leak-*.spec.ts`. Future regression PRs can diff
against the snapshot rather than re-deriving the expected shape from
the breakdown.

### 7. Add a regression spec

If the leak doesn't map onto an existing G1/F1/B3/B4/C1/C3 spec, add
a new one under `tests/harness/cost-leak-<id>.spec.ts` following the
pattern in `muonroi-cli/CLAUDE.md` ("Pattern: write a cost-leak
spec"). The mock-model assertion is cheap to run in CI and prevents
the leak from re-opening silently.

## See also

- [Ideal Product Loop](./ideal-product-loop.md) — the
  `/ideal` "Forensics" appendix is the in-loop view; this guide is
  the full reference.
- [PIL Pipeline](./pil-pipeline.md) — Layer 6 budget enforcement is
  the *projected* cap that fires CB-1 before a sprint runs. Forensics
  is the *actual* cap that fires after.
- [Agent Harness](./agent-harness.md) — `installMockModel`, the
  `MockLanguageModelV3` recording API, and the `inspectAll` /
  `cumulativePromptChars` helpers used by cost-leak specs.
- `muonroi-cli/CLAUDE.md` — "Cost-leak forensics & acceptance checks"
  section. Authoritative summary that this guide mirrors.
- `src/cli/cost-forensics.ts` — CLI implementation.
- `src/orchestrator/subagent-compactor.ts` — B3/B4 compaction.
- `src/orchestrator/sub-agent-cap.ts` — F1 cumulative cap.
- `src/orchestrator/__tests__/usage-normalizer-c1.test.ts` — DeepSeek
  cache-split normalization control tests.
