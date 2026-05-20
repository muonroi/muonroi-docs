---
title: PIL Pipeline
sidebar_position: 3
---

# PIL (Prompt Inference Layer) reference

PIL is a **6-layer pipeline** that runs deterministic intent extraction,
context retrieval, and budget enforcement *before* the LLM ever sees the
user's prompt. It is the first stop on every `/ideal` invocation and
the gate that decides whether the hot-path or the Council debate fires.

This document is the implementation-level reference for what PIL does,
layer by layer. It is queried by the Council Researcher stance during
the debate's research phase so the council can reason about *why* PIL
classified a given prompt the way it did.

## Goal

PIL aims to:

1. **Extract intent deterministically** with cheap local regex /
   tree-sitter signals before falling back to brain round-trips.
2. **Enforce a token budget** so EE-injected context, GSD directives,
   recent files, and output-style suffixes never blow up the system
   prompt past `DEFAULT_TOKEN_BUDGET`.
3. **Decide the routing tier** — `low` / `medium` / `high` complexity
   plus `sufficient` / `missing` gates the hot-path vs Council path.
4. **Fail open.** Every layer wraps in a try/catch that returns the
   context unchanged. A timeout returns the original `fallback`
   captured *before* `runLayers()` starts.

## 5-layer architecture (Layer 1..Layer 6)

`runPipeline()` (`src/pil/pipeline.ts:168`) is the entry point. It
captures a `fallback` `PipelineContext` first, races `runLayers()`
against a timeout (`pipelineTimeoutMs()`), and returns whichever
finishes first.

| Layer | File                              | Purpose                                                    |
|-------|-----------------------------------|------------------------------------------------------------|
| 1     | `layer1-intent.ts`                | Intent: taskType, confidence, domain, outputStyle (regex)  |
| 2     | `layer2-personality.ts`           | Personality / output-style adaptation from EE profile      |
| 3     | `layer3-ee-injection.ts`          | EE injection — principles + behavioral patterns + T1 rules |
| 4     | `layer4-gsd.ts`                   | GSD directive — discuss/plan/execute scaffold              |
| 5     | `layer5-context.ts`               | Recent files, flow state, principles fallback              |
| 6     | `layer6-output.ts`                | Output-style suffix + MANDATORY RULES                      |

Layers 2–5 are **skipped entirely** when Layer 1 returns
`taskType === null` (`src/pil/pipeline.ts:97-117`). Pure chitchat doesn't
need a GSD directive or workspace context — injecting them on `"hi"`
wastes prompt budget and forces the model into tool-using mode.

Timeout budget (`src/pil/pipeline.ts:33-63`):

- **200ms** when EE is unreachable / unconfigured — fast regex-only
- **3500ms** when EE thin / thin-degraded / fat mode is active — Layer 1
  unified call needs ~p95=2171ms, ~p99=2734ms in production

Override per-test via `MUONROI_TEST_PIPELINE_TIMEOUT_MS` env.

## Layer 1: Intent

`layer1Intent()` (`src/pil/layer1-intent.ts:287`) runs a **3-pass
cascade** with progressively expensive signals:

1. **Pass 1 — local classifier** (`src/router/classifier`): regex +
   tree-sitter. Maps 14 reason strings → `TaskType` via
   `REASON_TO_TASK_TYPE` (`src/pil/layer1-intent.ts:157`).
2. **Pass 2 — keyword fallback** (`src/pil/layer1-intent.ts:185-226`):
   bilingual EN+VN patterns catch debug/plan/documentation that the
   classifier misses. Runs when Pass 1 abstains OR returns the
   low-signal `general` taskType.
3. **Pass 2.5 — chitchat short-circuit**: prompts < 10 chars + ≤ 2 words
   without task signal map to `taskType="general"` /
   `intentKind="chitchat"` / `outputStyle="concise"` without ANY brain
   call (`src/pil/layer1-intent.ts:333-343`).
4. **Pass 3 — EE brain unified call** (`pilContext`): single
   `/api/pil-context` round-trip replaces the legacy multi-call
   classifier+style cascade. Fires only when feature flag is on AND
   local signal is weak (no taskType OR confidence < 0.7) AND not
   chitchat (`src/pil/layer1-intent.ts:349-377`).

### `scoreComplexity`

`scoreComplexity()` (`src/pil/layer1-intent.ts:122`) returns a bucketed
label and the raw score:

```
length > 500           → +3
length > 200           → +2
file refs >= 3         → +2
FORCE_LOW_RE match     → -3   (fix typo|rename|delete|format|lint|...)
FORCE_HIGH_RE match    → +3   (architect|migrate|refactor|design|...)
hasMaxSprintsOne flag  → -2
prior t0 hit count > 0 → -1

score <= 2  → low
score <= 5  → medium
score >  5  → high
```

The bucket drives Layer 4's tier selection and gates which directive
template is injected.

### `scoreSufficiency` + `SufficiencyMissing`

`scoreSufficiency()` (`src/pil/layer1-intent.ts:84`) returns
`{sufficient, missing}` where `missing` is a subset of
`("target" | "scope" | "intent")`:

```ts
export type SufficiencyMissing = "scope" | "target" | "intent";
```

- **target** — no file reference + no concrete verb. Caller doesn't know
  *what* to change. Triggers Council clarification: "fix what?"
- **scope** — vague product noun (`app`, `site`, `platform`) in a prompt
  shorter than 80 chars. Architecture is undefined. Triggers Council
  persona/MVP/architecture AskCard questions.
- **intent** — prompt < 30 chars with no scope-noun, file-ref, or verb.
  Triggers Council "create new / fix bug / refactor?" question.

The router treats `!sufficient` as a forced-Council signal — empty
AskCard answers are cheaper than scaffolding the wrong product. See
`council-debate.md` "When the Council fires" for the consumer side.

## Layer 2: Task type classification + output style

`layer2-personality.ts` adapts Layer 1's taskType into a personality
mode (concise vs detailed vs balanced) using the EE Who Am I profile
when available. Output style is propagated to Layer 6 which appends the
suffix instruction.

When `ctx._brainData` is populated by Layer 1's unified call, Layer 2
reads the personality fields from there instead of issuing a fresh
brain round-trip.

## Layer 3: EE injection — marker dedup, confidence floor, fail-open

`layer3EeInjection()` (`src/pil/layer3-ee-injection.ts:160`) queries
two EE collections in parallel via the bridge:

| Collection                | Floor          | Purpose                                  |
|---------------------------|----------------|------------------------------------------|
| `experience-principles`   | 0.40 (default) | T0 generalized principles from evolution |
| `experience-behavioral`   | 0.55 (default) | T1/T2 behavioral patterns                |

The principle floor is lower (`PIL_PRINCIPLES_FLOOR`,
`src/pil/layer3-ee-injection.ts:50`) because principles are
pre-validated abstractions — relevance comes from generality, not
keyword match.

Override per-machine with `MUONROI_PIL_SCORE_FLOOR=<float>`.

### Marker dedup

When `/ideal` injects BB context at CB-1 (`fetchBBContext` in
`src/ee/bb-retrieval.ts`), the rendered block is stamped with
`<!-- bb-context-injected:<sha16> -->` where `sha16 =
sha256(content).slice(0,16)`.

Layer 3 scans `ctx.enriched` for these markers
(`extractBBMarkerShas`, `src/pil/layer3-ee-injection.ts:60`), computes
sha16 for each EE hit payload, and **skips any hit whose sha matches an
already-present marker**. This prevents the same recipe / behavioral
rule from being injected twice when both CB-1 and PIL Layer 3 fire on
the same pipeline run.

The contract is symmetric — `src/ee/bb-retrieval.ts:225-228` writes the
marker, `src/pil/layer3-ee-injection.ts:60-76` reads it. Both sides use
the same sha16 prefix algorithm.

### T1 promotion

Points with `tier === "proven"` OR `hitCount >= 3` are promoted to
**T1 behavioral rules** (`isT1Proven`,
`src/pil/layer3-ee-injection.ts:99-108`). T1 rules don't go in the
`[experience: ...]` hint block — they end up on `ctx.t1Rules` and
Layer 6 appends them as `## MANDATORY RULES` to the prompt suffix so
the model treats them as instructions, not just context.

### Fail-open behavior

Every error path returns ctx with `applied: false`:

- Embed / search round-trip exception → `delta: "error=<msg>"`
- Both collections returned zero points → `delta: "no-points"`
- All points filtered below the floor → `delta: "filtered_noise"`

A row is written to `interaction_logs.ee_injection` with the relevant
`eventSubtype` (`injected` / `no_match` / `filtered_noise` / `error`)
so `usage forensics` can reconstruct why a given turn had no EE context.

### Formatter mode (unified call)

When Layer 1's unified `pilContext` call populated `ctx._brainData`,
Layer 3 runs in **formatter mode** — zero network round-trips, just
render the principles + behavioral patterns from the cached payload
(`src/pil/layer3-ee-injection.ts:161-203`).

## Layer 4: GSD integration

`layer4Gsd()` (`src/pil/layer4-gsd.ts:52`) injects a GSD workflow
directive scaled to the complexity tier:

| Tier      | Directive                                                          |
|-----------|--------------------------------------------------------------------|
| `heavy`   | discuss → research → verify → plan → impl → verify (with gray areas) |
| `standard`| GSD-quick mindset (short plan + impl + verify)                     |
| `quick`   | Minimal hint, run inline                                           |

Tier comes from `scoreComplexity` (`src/gsd/complexity.ts` —
different from PIL Layer 1's complexity, which is heuristic-only). The
tier-aware directive lives in `src/gsd/directives.ts:buildDirective`.

Gray areas (`detectGrayAreas`, `src/gsd/gray-areas.ts`) are only
attached when `tier === "heavy"`. The questions are surfaced to Layer 5
output and seed the Council clarifier's `pilSeed` parameter — see
`council-debate.md` "Phase A".

The directive consumes up to **25% of the token budget**
(`DIRECTIVE_BUDGET_FRACTION = 0.25`, `src/pil/layer4-gsd.ts:42`); the
rest is reserved for EE injection, context enrichment, and the suffix.

Chitchat short-circuits Layer 4 entirely
(`src/pil/layer4-gsd.ts:57-62`) — injecting "STANDARD task" onto "hi"
flips the model into tool-using mode and wastes the user's wait.

## Layer 5: Context policy enforcement

`layer5Context()` (`src/pil/layer5-context.ts:86`) injects:

| Source            | Budget | Notes                                              |
|-------------------|--------|----------------------------------------------------|
| T0/T1 principles  | 12%    | Skipped when L1 unified call already supplied them |
| Resume digest     | 5%     | Stale-flagged when `digestAgeMs > 30 min`          |
| Flow state        | 5%     | From `.muonroi-flow/runs/<id>/state.md`            |
| Recent files      | 3%     | Top 10 most-recently-modified `.ts/.tsx` in `src/` |

Chitchat short-circuits Layer 5 too — greetings don't need workspace
context (`src/pil/layer5-context.ts:90-95`).

Stale digest threshold is hardcoded at 30 minutes
(`STALE_THRESHOLD_MS`, `src/pil/layer5-context.ts:14`); when EE v4.0
Who Am I profile is wired in, the threshold will adapt to the user's
session length pattern.

## How PIL output shapes Council debate

PIL's output is consumed by Council via the `pilCtx` field in
`runCouncil()`:

```ts
// src/council/index.ts:99-104
let pilCtx: PipelineContext | undefined;
try {
  pilCtx = await runPipeline(topic, { sessionId });
} catch { /* fail-open */ }

const pilSeed = pilCtx?.grayAreas?.length ? pilCtx.grayAreas : undefined;
```

Three fields cross the boundary:

1. **`grayAreas`** → `pilSeed` for `runClarification` — heuristic gaps
   from Layer 4 become the first AskCard questions
   (`src/council/index.ts:106-122`).
2. **`taskType` + `complexityTier`** → `planDebate` prompt context
   (`src/council/index.ts:243-244`) — the leader calibrates stance
   depth and round count to the task type ("bugfix" gets a tighter
   plan than "architecture").
3. **`outputStyle`** → `runPlanning` (`src/council/index.ts:354`) —
   the synthesizer mirrors the user's preferred verbosity in the
   final outcome.

## Settings: eeBBContext, eePIL flags

Both flags live in `userSettings`:

| Flag                       | Default | Effect when `false`                            |
|----------------------------|---------|------------------------------------------------|
| `eeBBContext`              | `true`  | `fetchBBContext` / `inferBBFromPrompt` no-op   |
| `discoveryEcosystemBias`   | `true`  | All four ecosystem inject sites no-op          |

`eeBBContext` short-circuits early — `fetchBBContext` at
`src/ee/bb-retrieval.ts:255-258` returns `empty` before any network
call. Same for `inferBBFromPrompt` at `src/ee/bb-retrieval.ts:440`.

The PIL pipeline itself does not have a single on/off flag — disabling
PIL means killing every layer's brain call individually. To run "PIL
fast-only" set `MUONROI_PIL_SEARCH_TIMEOUT_MS=500` and leave EE
unconfigured; the timeout will trip every layer that needs the brain
and the pipeline falls back to regex-only intent classification.

## Telemetry: ui_interaction.pil events

Every pipeline run writes one row to the PIL budget log
(`src/pil/budget-log.ts`, called fire-and-forget from
`src/pil/pipeline.ts:140-156`):

```ts
{
  ts, sessionId, taskType, domain, confidence,
  rawChars, enrichedChars, totalDeltaChars, totalMs,
  layers: [
    { name, charsBefore, charsAfter, charsDelta, durationMs },
    ...
  ],
  fallbackReason,                  // null on happy path
  intentDetection: IntentDetectionTrace | null,
}
```

`IntentDetectionTrace` (`src/pil/types.ts:100-143`) records which Pass
decided the final taskType + style — `pass1Hit`, `pass2Hit`,
`pass25ChitchatHit`, `pass3UnifiedSucceeded`, etc. — so cost reports
can answer "are we wasting brain calls when regex would have answered?"

Individual layers also write `interaction_logs.ee_injection` rows
with `eventSubtype` of `injected` / `no_match` / `filtered_noise` /
`error` (Layer 3, `src/pil/layer3-ee-injection.ts:212-247`). These are
queried by `usage forensics <runId>` to reconstruct the EE injection
shape of a past run.

Retention: 14 days default; probabilistic prune ~1-in-200 inserts. See
`src/storage/interaction-log.ts:29-51`.

## See also

- [`ideal-product-loop.md`](./ideal-product-loop.md) — how `/ideal` calls
  `runPipeline` before routing to hot-path or Council
- [`council-debate.md`](./council-debate.md) — how Council consumes
  `grayAreas`, `taskType`, `complexityTier`, `outputStyle` from PIL
- `EE-INGESTION.md` — how
  `experience-principles` and `experience-behavioral` collections are
  populated and evolved
