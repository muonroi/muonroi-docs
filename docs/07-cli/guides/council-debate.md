---
title: Council Debate
sidebar_position: 2
---

# Council debate reference

The Council is a multi-model debate orchestrator that turns a free-form
prompt into a structured `EnhancedCouncilOutcome` plus an optional
`ActionPlan`. It is the heavy-path of `/ideal`: the hot-path skips Council
entirely for trivial prompts, and the sufficiency gate forces Council when
PIL Layer 1 reports a missing `target`, `scope`, or `intent` (see
`pil-pipeline.md`).

This document is the implementation-level reference for what the Council
actually does, layer by layer. It is the source the **Council Researcher**
stance queries during the debate's own research phase.

## When the Council fires

`/ideal` dispatches three router paths:

| Path        | Trigger                                                                 | Council? |
|-------------|-------------------------------------------------------------------------|----------|
| `hot-path`  | Sufficient prompt + low complexity + no `--force-council` flag          | No       |
| `qc-flow`   | `scoreSufficiency` returns missing categories OR `--force-council`      | Yes      |
| `qc-lock`   | Sprint phase re-entry after a CB-gate halt                              | Yes      |

PIL Layer 1 (`scoreSufficiency`, `src/pil/layer1-intent.ts:84`) returns
`missing: ("target" | "scope" | "intent")[]`. Any non-empty `missing`
array hands off to Council so the AskCard preflight can surface persona /
MVP / architecture questions before code is written. Vague product nouns
(`app`, `site`, `platform`) in prompts shorter than 80 chars trip the
`scope` missing category — see `src/pil/layer1-intent.ts:63-114` for the
full vague-product / concrete-verb / scope-noun heuristic table.

## Lifecycle: phases A–E

Entry point is `runCouncil()` in `src/council/index.ts:42`. It is an
async generator that streams `StreamChunk`s as the debate progresses.

```
Phase A  Clarify          runClarification() — AskCard questions seeded by PIL grayAreas
Phase A  Preflight        runPreflight()     — confirm spec + research-need decision
Phase B  Plan debate      planDebate()       — propose stances + output shape
Phase C  Debate           runDebate()        — multi-round stance exchanges
Phase D  Synthesize       runPlanning()      — fold positions into EnhancedCouncilOutcome
Phase E  Execute          runExecution()     — only if user approves the ActionPlan
```

Each phase emits `phaseStart` / `phaseDone` events on the harness
sidechannel (`council-step` LiveEvents) so external drivers — `claude`,
`codex`, the harness specs in `tests/harness/council-flow.spec.ts` — can
observe progress without OCR.

### Phase A — Clarification + Preflight

`src/council/index.ts:93-163` runs the clarifier in a `while (!approved)`
loop. The clarifier is *seeded* by PIL's `grayAreas` (`pilSeed` at
`src/council/index.ts:106`) so heuristic gaps from PIL Layer 4 become
the first batch of AskCard questions. The user can refine answers until
the preflight is approved; the loop never advances past clarification
with an unconfirmed spec.

Research-need is a separate decision made by the leader *after*
clarification (`evaluateResearchNeed`, `src/council/debate.ts:1052`). The
user gets an explicit override AskCard at `src/council/index.ts:180-215`
so trivial topics ("what did we just decide?") can skip the slowest
phase of Council.

### Phase B — Debate plan

`planDebate()` (`src/council/debate-planner.ts:83`) uses the AI-SDK
`generateObject` call with a strict Zod schema (`DebatePlanSchema`,
`src/council/debate-planner.ts:44`) to produce:

- `intentSummary` — one-sentence read of what the user asked for
- `stances[]` — 2–4 leader-proposed stances (see "Stance design" below)
- `outputShape` — `{kind, sections[], guardrails[]}` driving synthesis
- `plannedRounds` — initial round budget, clamped to [1, 5]

If `generateObject` or the sanitizer rejects the result, the planner
retries once with the schema error appended to the prompt
(`src/council/debate-planner.ts:155-179`). If both attempts fail it
returns `FALLBACK_PLAN` (`src/council/debate-planner.ts:12`) — a generic
2-stance decision shape. This keeps the rest of the pipeline alive even
when the leader model is misbehaving.

### Phase C — Debate

`runDebate()` (`src/council/debate.ts:266`) runs three sub-phases:

1. **Research** (optional, `src/council/debate.ts:301-348`) — single
   research call by the `research`-role candidate. Internet-first when
   the workspace is empty; codebase-first otherwise.
2. **Opening statements** (`src/council/debate.ts:354-432`) — parallel
   `openingWithRetry` calls (3 attempts, linear backoff) so a transient
   timeout doesn't permanently silence a stance.
3. **Discussion rounds** (`src/council/debate.ts:480-1024`) — ring of
   symmetric pair exchanges (`A↔B`, `B↔C`, …) with leader evaluation
   between rounds.

Round budget is leader-decided. `plannedRounds` from Phase B is the
initial value; `LeaderEvaluation.extendRounds`
(`src/council/types.ts:58`) bumps it up at the absolute ceiling
`ABSOLUTE_MAX_ROUNDS = 8` (`src/council/debate.ts:61`). The
`implementation_plan` `outputShape.kind` has its own cap of 3 rounds
(`KIND_MAX_ROUNDS`, `src/council/debate.ts:453-456`) because observed
sessions showed R4 on implementation topics was always a redundant
"locked-confirmed" wrapper.

Early termination triggers:

- Leader sets `shouldContinue=false` after evaluation
- ≥80% of pair-turns in the latest round contain lock phrases
  (`convergenceRatio`, `src/council/debate.ts:140`) — the lock-phrase
  table covers EN + VN convergence vocabulary with a negation-head guard
  at `src/council/debate.ts:123-138`
- 2 consecutive rounds with ≥50% pair failures (circuit breaker,
  `src/council/debate.ts:806-822`)

### Phase D — Synthesis + Plan

`runPlanning()` (`src/council/planner.ts:16`) calls the leader with
`buildSynthesisPrompt` and `maxTokens: 8192`. The synthesizer is
instructed to emit a JSON object first, then a literal `---READABLE---`
separator, then markdown. `parseOutcome` (`src/council/planner.ts:258`)
splits on that separator and parses the JSON head.

Empty or unparseable synthesis triggers a single retry with a compacted
prompt (`src/council/planner.ts:92-130`) — the exchange history is
dropped, only final positions ride. This recovers most provider
timeouts. If both attempts fail, `synthesisFailReason` is set and the
post-debate AskCard surfaces `retry_synthesis` as the recommended action
(`src/council/index.ts:438-466`).

The `ActionPlan` is optional — present only when the synthesizer
emitted `plan: {steps, estimatedComplexity, prerequisites}` matching
`ActionPlan` in `src/council/types.ts:119-127`. When the synthesis used
the `implementation_plan` output shape and produced ≥3 structured
`actionItems`, the post-debate "Generate Action Plan" path lifts them
directly into `ActionPlan.steps` instead of re-running the synthesizer
— see `pickActionItemsFromOutcome` / `synthesizePlanFromActionItems`
at `src/council/index.ts:862-916` for the heuristic priority mapping.

### Phase E — Execute

Only runs when the user approves the plan at the action-plan preflight
(`src/council/planner.ts:185-211`). Each step is dispatched through
`processMessageFn`, the same path normal user messages take.

## Leader model resolution + tier promotion

`resolveLeaderModelDetailed()` (`src/council/leader.ts:101`) picks the
leader model with two hard rules:

1. **Stay on the session provider.** Crossing providers means different
   billing and surprise costs.
2. **Promote to the highest reachable tier on that provider** — but only
   when the user explicitly configured `roleModels.leader`. If no leader
   is configured, the session model is used as-is (the user's account
   may not have access to the premium tier).

Tier ranking lives in `TIER_RANK` (`src/council/leader.ts:7`):
`fast=1, balanced=2, premium=3`. A configured `roleModels.leader` on the
session provider is respected unless a strictly higher tier exists on
the same provider — in which case `LeaderResolution.promotedFrom` is
populated and the runCouncil banner reports the auto-promotion
(`src/council/index.ts:70-79`).

### Cost-aware sub-task downshifting

When `userSettings.councilCostAware === true`, `pickCouncilTaskModel()`
(`src/council/leader.ts:53`) downshifts five named sub-tasks to a
cheaper tier on the leader's provider:

| Sub-task            | Target tier | Why                              |
|---------------------|-------------|----------------------------------|
| `research_need`     | fast        | 1-line JSON classifier           |
| `evaluate_round`    | balanced    | Per-round criteria judgement     |
| `round_summary`     | fast        | 6-turn condensation              |
| `clarify_questions` | balanced    | 3–5 AskCard questions            |
| `spec_synthesis`    | balanced    | Merge Q&A into `ClarifiedSpec`   |

Synthesis, debate planning, and the per-stance turns themselves are
never downshifted. The cost-aware downshift requires a same-provider
candidate at the target tier — cross-provider fallbacks are explicitly
rejected (`src/council/leader.ts:67-73`).

## Stance design (debate-planner output shape)

`DebateStance` (`src/council/types.ts:100-107`) is the lens a participant
adopts for the specific topic. It is decoupled from `ModelRole` — the
role only picks which model slot from config; the stance is what that
model *thinks like* during this debate.

```ts
interface DebateStance {
  name: string;      // "Comparative Analyst", "Cost Skeptic", …
  lens: string;      // one-sentence framing
  focus?: string;    // optional concrete focus
}
```

The planner is prompted to propose stances framed around the user's
intent. `sanitizeStances` (`src/council/debate-planner.ts:217`) caps the
list at 4 and rejects entries missing `name` or `lens`.

### Experience Auditor stance

When the EE prefetch returned ≥1 warning and `councilExperienceMode !==
"off"`, `injectAuditorStance` (`src/council/debate-planner.ts:58`)
appends or replaces the last stance with `Experience Auditor` —
explicitly framed to challenge claims against the experience brain.
`advisory` mode appends; `enforcing` mode replaces the last generic
stance so the auditor is guaranteed a debate slot.

## Ecosystem framing (Muonroi BB + templates)

When `userSettings.discoveryEcosystemBias !== false` (default ON), the
debate planner appends `buildEcosystemDebateContext()`
(`src/product-loop/discovery-ecosystem.ts:78`) to the planner's system
prompt. The bias is *opt-out* because the CLI ships *with* the Muonroi
ecosystem — without bias, leader LLMs default to "Node.js + Express"
greenfield answers that ignore the BB packages the user already has
installed.

The injected suffix tells the leader:

> Stances and output sections MUST be framed around optimal use of the
> existing Muonroi ecosystem packages: muonroi-building-block (BB),
> Muonroi.BaseTemplate / Muonroi.Microservices.Template /
> Muonroi.Modular.Template, @muonroi/agent-harness-\{core,opentui,react,
> angular}. Prefer lenses that compare which BB package(s) solve the
> user's need without writing new infra.

See `src/council/debate-planner.ts:110-118` for the injection site —
note the lazy import so debate planning never blocks on an ecosystem
module load failure.

A companion BB-context retrieval runs at CB-1 (`/ideal` entry), well
before debate planning. `fetchBBContext()` in `src/ee/bb-retrieval.ts`
queries the EE `bb-recipes`, `bb-behavioral`, and `bb-packages`
collections in parallel (800ms budget, retry-once) and stamps the
rendered block with `<!-- bb-context-injected:<sha16> -->`. PIL Layer 3
dedupes EE hits whose payload sha matches an already-injected marker —
see `pil-pipeline.md` for the dedup contract.

## Research phase (Researcher stance + muonroi-docs MCP priority)

When the leader decides research is needed (`evaluateResearchNeed`,
`src/council/debate.ts:1052`), the chosen participant runs `llm.research`
with `internetFirst: boolean`. The flag flips when the workspace is
empty (`projectInfo.isEmpty` at `src/council/index.ts:90`) — fresh
`/ideal --init` runs research the web before anything else.

The `buildEcosystemResearchSeed()` lens augmentation
(`src/product-loop/discovery-ecosystem.ts:107`) tells the Researcher
stance:

> Query muonroi-docs MCP first (`docs_search` for BB package usage,
> recipes, conventions). Fall back to web search ONLY when muonroi-docs
> returns nothing relevant. Identify which existing BB / template
> packages address the user's need before proposing new code.

This is why the Council Researcher always queries `muonroi-docs` MCP
before reaching for `web_fetch` — the guides in this directory are the
first port of call.

Mid-debate research can also be triggered by the leader after a round
when `evaluation.needsResearch && evaluation.researchQuery` is set
(`src/council/debate.ts:858-911`). Empty findings render a visible
"_No new evidence found_" marker rather than a silent empty block — so
the user can distinguish a no-op research call from a rendering bug.

## Synthesis + ActionPlan + EnhancedCouncilOutcome

`EnhancedCouncilOutcome` (`src/council/types.ts:169-183`) is the
structured shape persisted to memory:

```ts
interface EnhancedCouncilOutcome {
  type: string;                            // "decision" | "action_items" | …
  summary: string;
  sections?: Record<string, unknown>;      // keyed by outputShape.sections[].key
  // Legacy fields — populated when the shape calls for them
  agreed?: string[];
  tradeoffs?: string[];
  recommendation?: string;
  actionItems?: string[];
  planUpdate?: string;
  resolvedQuestion?: { question: string; answer: string };
  plan?: ActionPlan;
}
```

The `type` value is free-form, driven by the leader's chosen
`outputShape.kind`. Common kinds: `decision`, `implementation_plan`,
`evaluation`, `action_items`, `resolve_question`. Synthesis prompts
shape the JSON dynamically based on the leader's section list, so the
outcome adapts to "what kind of answer was needed" rather than being
locked to a fixed schema.

## Persistence layers

The Council writes **three** distinct records per run, each serving a
different consumer.

### `[Council Memory]` system message

JSON-serialized `CouncilMemoryRecord` (`src/council/types.ts:213-230`)
written as a system message at `src/council/index.ts:751`. This is the
full record — spec, debatePlan, leader, participants, final positions,
per-round archive, synthesis, confidence, stats, ISO timestamp.

Used on follow-up turns so the agent can answer "who is the leader?",
"what did the verify role say?", and cite specific positions. Loaded
automatically when the session is resumed.

### `[Council Decision]` / `[Council Outcome]` (human-readable)

Two-line and JSON forms written at `src/council/index.ts:723-729`:

```
[Council Decision]
Topic: <topic>
<outcome.summary>
Agreed: ...
Recommendation: ...

[Council Outcome]
<full JSON of EnhancedCouncilOutcome>
```

The `[Council Decision]` form is the one users see in the message log;
the `[Council Outcome]` JSON is what the next turn's context loader
parses to recover structured sections.

### `interaction_logs.council_summary` row (NEW)

Forensics-friendly summary row added at `src/council/index.ts:763-778`:

```ts
logInteraction(sessionId, "council", {
  eventSubtype: "council_summary",
  model: leaderModelId,
  durationMs: Date.now() - stats.startMs,
  data: {
    topic, roundCount, participantCount,
    stances: [{role, model, stanceName, finalPositionExcerpt}],  // cap 8
    synthesisExcerpt,             // first 1500 chars
    evidenceDensity,
    confidenceLevel,
    recommendation,               // first 400 chars, null when absent
    agreedCount,
  },
});
```

The `[Council Memory]` system message is great for context replay but
can't be queried — `usage forensics` reads only `interaction_logs`.
Excerpts are capped (~2–4KB per run) so the table stays bounded; the
full text still lives in the system messages.

`interaction_logs` retention defaults to 14 days
(`src/storage/interaction-log.ts:29-32`); probabilistic pruning runs
~1-in-200 inserts.

## Confidence + evidenceDensity scoring

`evidenceDensity` is the ratio of `[CONFIRMED]`+`[REFUTED]` tags to the
total of cited + `[UNVERIFIED]` tags found in the debate exchange text
(`computeEvidenceDensity`, `src/council/debate.ts:1173`). It measures
how much of the debate's *own* claim-tagging was actually backed up by
verification — NOT the ratio of citations to sentences (which biases
to ~0.05 because most debate sentences are opinions, not claims).

When participants tag zero claims, density is 0 — no evidence awareness
was shown, low confidence is correct. The `EVIDENCE_RULE` prompt biases
participants to either verify or explicitly mark unverified.

`finalEvidenceDensity` (`src/council/debate.ts:1038`) is the **max** of
the cumulative density across the whole debate and the leader's
last-round measurement. Citations cluster in early rounds (fresh
fact-claims), so using only the last round's slice can wipe out
evidence work done earlier.

The confidence badge thresholds are
(`src/council/index.ts:408-414`):

| Level    | Threshold                                |
|----------|------------------------------------------|
| `high`   | `evidenceDensity >= 0.6`                 |
| `medium` | `evidenceDensity >= 0.3 && < 0.6`        |
| `low`    | `< 0.3` OR synthesis failed              |

## CQ-16 NEEDS HUMAN REVIEW threshold

After persistence completes, `judgeCouncilOutcome(synthesisText)` is
dispatched fire-and-forget (`src/council/index.ts:795-816`). It returns
a verdict with a `confidence` score 0..1. When `verdict.confidence <
0.5`, a `[NEEDS HUMAN REVIEW]` system message is appended:

```
[NEEDS HUMAN REVIEW] Council synthesis confidence: 23%.
Reason: <verdict.reason>
```

The same verdict is recorded to the EE brain via `recordCouncilOutcome`
so future runs can learn from low-confidence patterns. Both calls are
non-blocking — they fail silently if EE is unreachable.

## See also

- [`ideal-product-loop.md`](./ideal-product-loop.md) — how `/ideal`
  routes to Council and consumes its outcome
- [`pil-pipeline.md`](./pil-pipeline.md) — PIL Layer 1 sufficiency gate
  + Layer 4 gray-area seeding that feed Council clarification
- `EE-INGESTION.md` — how
  `bb-recipes` / `bb-behavioral` / `experience-principles` collections
  are populated
