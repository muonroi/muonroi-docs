---
title: Ideal Product Loop
sidebar_position: 1
---

# `/ideal` — Product loop reference

`/ideal` is the muonroi-cli slash command that drives an idea from a one-line
brief to a shipped sprint. It chains together intent detection, discovery,
council debate, sprint orchestration, and ship-time delivery polish — all
gated by circuit breakers that halt the run when cost, oscillation, or
verifiability conditions break down.

This guide is the **canonical reference for the Council Researcher**. It
mirrors the live behaviour in `muonroi-cli` and links back to source files
so every claim is traceable. If this guide and the code disagree, the code
wins — and this file is wrong.

## Overview

The command has five subcommands dispatched in `runProductLoop`
(`src/product-loop/index.ts:96`):

| Subcommand | Behaviour |
|---|---|
| `start` (default) | Create run → drive FSM → sprint loop |
| `status` | List runs or detail one |
| `resume` | Re-enter FSM from `state.md`, mark in-flight sprint crashed |
| `abort` | Write `aborted=true`, fire EE phase-outcome=aborted |
| `ship` | Skip Cond #1-#4 if already passing; force Cond #5 (user gate) |

The `start` path branches on PIL Layer 1 signals:

1. **Sufficiency gaps present** → force Council (`runStart` with
   `forceCouncil=true`) even when complexity is low. See
   `src/product-loop/index.ts:116`.
2. **complexity=low, no gaps, no `--force-council`** → `runHotPath`: single
   sprint, no debate, no scoping. `src/product-loop/index.ts:138`.
3. **Otherwise** → full council path through `runLoopDriver`.

## Lifecycle diagram

```
user prompt
  │
  ▼
PIL Layer 1  ── scoreSufficiency() + scoreComplexity()
  │            (src/pil/layer1-intent.ts:84, :122)
  │
  ▼
runProductLoop  ── dispatch by sufficiency + complexity
  │            (src/product-loop/index.ts:96)
  │
  ├── hot-path (complexity=low, no gaps) ────────► single sprint ─► ship
  │   (src/product-loop/index.ts:138)
  │
  └── council path
        │
        ▼
    runLoopDriver FSM  (src/product-loop/loop-driver.ts:109)
        │
        ▼
   ┌────────────────────────────────────────────────────────────┐
   │ 1. idle                                                    │
   │ 2. discover     — discoverProject + auditRepo (parallel)   │
   │ 3. gather       — discovery interview (askcard loop)       │
   │ 4. research     — debate + CB-1 BB context injection       │
   │ 5. scoping      — ProductSpec synth + preflight approval   │
   │ 6. approved     — emit "Ready to Sprint" card              │
   └────────────────────────────────────────────────────────────┘
        │
        ▼
    Phase 2: sprint loop
        │
        ├── MUONROI_PHASE_MODE != "0" → runPhasesPath (Subsystem E)
        │   (src/product-loop/index.ts:677)
        │
        └── legacy drainSprints — runSprint × maxSprints
            (src/product-loop/index.ts:497)
                │
                ▼
            per-sprint: plan → implement → verify → judge
            (src/product-loop/sprint-runner.ts:98)
                │
                ▼
            done-gate (5 conditions) → shipped | continue | halt
```

Ten stages from invocation to last sprint:

1. PIL Layer 1 — intent + sufficiency + complexity scoring.
2. Routing — hot-path vs council vs forced-council.
3. `createRun` — allocate `runId`, write manifest, emit cost preview.
4. `discover` — manifest probe + repo audit + cross-run memory.
5. `gather` — discovery interview (10 questions, mixed leader/council mode).
6. `research` — multi-expert debate, BB context injected via CB-1.
7. `scoping` — Leader synthesises `ProductSpec`, preflight asks for approval.
8. `approved` — "Ready to Sprint" card emitted, control returns to outer loop.
9. Sprint loop — `runSprint` per sprint, history fed to next iteration.
10. Ship — done-gate Cond #5 passes → `polishDelivery` + `extractRunToEE`.

## Routing & sufficiency gate

PIL Layer 1 produces two signals consumed by the router:

| Signal | Source | Used as |
|---|---|---|
| `complexity` (low/medium/high) | `scoreComplexity()` in `src/pil/layer1-intent.ts:122` | Decides hot-path vs council |
| `sufficiencyMissing` (`scope` / `target` / `intent`) | `scoreSufficiency()` in `src/pil/layer1-intent.ts:84` | Forces Council when non-empty |

`scoreSufficiency` flags three missing categories:

- **target** — no file ref AND no concrete verb. Caller can't tell what's
  being changed.
- **scope** — vague product noun (`app`, `platform`, `service`, …) in a
  prompt shorter than 80 chars.
- **intent** — no scope-noun, no file ref, no verb, length < 30.

The rule in `src/product-loop/index.ts:116-127`: **any non-empty
`sufficiencyMissing` forces `forceCouncil=true`**, even when
`complexity=low`. Vague briefs like "todo app" go through AskCard discovery
before any scaffolding fires — empty AskCard answers are cheaper than
scaffolding the wrong product.

`scoreComplexity` is additive: length, file-ref count, FORCE_LOW_RE keywords
(-3), FORCE_HIGH_RE keywords (+3, e.g. `architect|migrate|refactor|
multi-tenant|microservic|distributed|scale`), `hasMaxSprintsOne` (-2),
`t0HitCount > 0` (-1), `taskType === "debug"` (+1). Buckets: `<= 2` low,
`<= 5` medium, else high.

The harness emits a `route-decision` event whenever routing fires —
`{ path: "hot-path" | "council", complexity, forceCouncil,
sufficiencyMissing, runId }`. See `src/product-loop/index.ts:163` and
`:391`.

## Discovery interview (10 questions)

The discovery interview runs during the `gather` stage. The full question
list lives in `DISCOVERY_QUESTIONS` (`src/product-loop/discovery-schema.ts:13`):

| # | id | required | mode |
|---|---|---|---|
| 1 | `productType` | yes | leader |
| 2 | `targetPlatform` | yes | leader |
| 3 | `audience` | yes | leader |
| 4 | `backendArchitecture` | yes | council |
| 5 | `backendStack` | yes | council |
| 6 | `dbStrategy` | yes | council |
| 7 | `frontendApproach` | no | leader |
| 8 | `baStatus` | no | leader |
| 9 | `designStatus` | no | leader |
| 10 | `deployment` | no | council |

Modes (see `src/product-loop/discovery-recommender.ts:91` and `:235`):

- **leader** — single LLM call via `leaderRecommend`. The leader uses
  `LEADER_SYSTEM` ("You are a product context recommender…"), `maxTokens=4096`
  (reasoner models burn output budget on reasoning tokens — 1024 truncates
  the JSON tail). Two retry attempts; 401 errors short-circuit to the
  user-only fallback.
- **council** — multi-stance debate via `councilRecommend`. Stances are
  consumed, a `tallyMajority` ≥ 2-of-3 wins; ties go to `SYNTH_SYSTEM` for
  tiebreak. If synth fails, the highest-confidence stance wins.

Council cost guard: `computeCostGuard` returns `max(2.5, 0.15 * capUsd)`,
and `shouldFallbackToLeader` short-circuits to leader when the next
projected council call (`ESTIMATED_NEXT_COUNCIL_COST_USD = 0.45`) would
exceed it (`src/product-loop/discovery-recommender.ts:355-364`).

### `frontendApproach.agentHarness` slot

Added in commit `9526d2a`, the `frontendApproach` answer is now
`{ library, framework, agentHarness? }` where `agentHarness ∈
{ "core", "react", "angular", "opentui", "none" }`
(`src/product-loop/discovery-schema.ts:50-51`,
validation at `:127`). The leader prompt instructs the model to pick the
matching `@muonroi/agent-harness-*` wrapper: `"react"` for React/Next,
`"angular"` for Angular, `"opentui"` for terminal UI, `"core"` for headless
integration, `"none"` only when no UI is built. See the constraint string
in `getSchemaHintForLeader` (`src/product-loop/discovery-schema.ts:97-104`)
and the ecosystem preamble note in
`src/product-loop/discovery-ecosystem.ts:63`.

## Ecosystem bias

`/ideal` is the CLI of the Muonroi ecosystem, so the default recommendation
posture biases every answer toward existing BB packages and Muonroi.*
templates rather than greenfield reinventions. Implementation lives in
`src/product-loop/discovery-ecosystem.ts`.

`isEcosystemBiasEnabled()` (`:30`) defaults ON. The setting
`userSettings.discoveryEcosystemBias = false` is the single switch that
disables all four injection sites. On unreadable settings the function
fails OPEN (over-bias is preferred over under-bias for an ecosystem CLI).

Three inject points consume the bias:

1. **`buildEcosystemPreamble()`** (`:48`) — prepended to every leader
   recommendation prompt. Names the .NET 9 / `Muonroi.BaseTemplate` /
   `Muonroi.Microservices.Template` / `Muonroi.Modular.Template` defaults,
   the muonroi-building-block (BB) families (auth, audit, modular
   boundaries, rule engines), and PostgreSQL / EF Core as DB default.
2. **`buildEcosystemDebateContext()`** (`:78`) — appended to the
   debate-planner system prompt so stance LENSES (not just answer values)
   compare BB recipes against the user's brief.
3. **`buildEcosystemResearchSeed()`** (`:107`) — augments the Researcher,
   Architect, and Skeptic lenses in `runLoopDriver`'s research phase. The
   Researcher is told to query `muonroi-docs` MCP first via `docs_search`;
   the Architect is told to compose from existing packages; the Skeptic is
   told to demand muonroi-docs evidence for any claimed feature.

The bias is opinionated on purpose: an ecosystem-consistent scaffold is
worth the constraint, because every byte of new infra written outside the
ecosystem becomes maintenance debt that BB already solves.

## Council debate phase

The research phase (`src/product-loop/loop-driver.ts:378`) builds four
default stances — Researcher, Cost-Controller, Skeptic, Architect — and
augments three of them when ecosystem bias is on. Stances are then mapped
onto resolved council participants with a trim-or-repeat pattern (same as
`council/index.ts:166-173`).

**CB-1 BB-aware injection** (`src/product-loop/loop-driver.ts:444-475`)
runs BEFORE the debate fires:

- Filesystem-based path: `IntentDetectionTrace.targetFramework ===
  "muonroi-building-block"` (set by `detectBBFramework()` when an existing
  BB tree is detected).
- Prompt-based fallback: `inferBBFromPrompt(ctx.idea)` matches the prompt
  against the `bb-recipes` collection. Threshold 0.60 catches canonical BB
  intents ("fraud detection", "loan approval", "multi-tenant", "decision
  table FEEL") while rejecting generic prompts.
- When active, `fetchBBContext(ctx.idea)` (`src/ee/bb-retrieval.ts`)
  retrieves recipes + behavioural rules + package recommendations from EE
  collections `bb-recipes`, `bb-behavioral`, `experience-principles` in
  parallel, with retry-once and graceful degrade. Token budget 1500.
  Marker-stamped output `<!-- bb-context-injected:<sha16> -->` lets PIL
  Layer 3 dedup already-injected hits.

Raw debate content is suppressed in the UI; the user only sees phase
events + a single condensed `Research Summary` card after debate
completion. The summary is appended to `delegations.md`; assumptions
extracted from the debate land in the assumption ledger via
`extractAssumptionsFromDebate` (`loop-driver.ts:527`).

If the debate produces no summary, the synthesis prompt receives the
literal sentinel `(debate produced no summary — using empty research
findings)`.

## Sprint orchestration

Each sprint is driven by `runSprint` (`src/product-loop/sprint-runner.ts:98`).
The inner sequence is:

1. **CB-3** check FIRST (verify-blank). Runs before the planner so a missing
   verify recipe fails closed without spending council tokens.
2. **Plan** — `runCouncil` with `skipClarification=true`.
3. **Implement** — host's `processMessageFn` drives the orchestrator tool loop.
4. **Verify** — `runVerifyOrchestration` (engineering floor).
5. **Judge** — done-gate evaluates 5 conditions; failing conditions feed
   `feedback-routing` to focus the next sprint.
6. **CB-1 / CB-2** projected after the sprint scores so circuit breakers
   can halt the loop on the next iteration.

Per-role memory is appended via `appendRoleMemory` (2KB rolling buffer per
slot). Cost is reserved via `reserveForProduct`, committed via
`commitToProduct`, released via `release` on failure.

Two execution paths:

- **Subsystem E phase-orchestrated path** (default — `MUONROI_PHASE_MODE !=
  "0"`). `runPhasesPath` in `src/product-loop/index.ts:677` builds a
  `sprintRunner` adapter, history resets per phase so CB-2 oscillation
  detection scopes correctly, and a `customerVerdict` resolver wires
  Discord verdict polling when chat is configured.
- **Legacy `drainSprints` path** — straight loop `for sprintN = 1 ..
  maxSprints` with continue-feedback carry-over.

When a sprint reaches `iter.stage === "shipped"`, the manifest is finalised
with `verdict = { pass: true, reason: "all_conditions_met" }`,
`polishDelivery` runs (scaffold README, fill package.json, write
`delivery-notes.md` — idempotent + non-destructive), and `extractRunToEE`
mines the run artifacts for cross-run memory.

Reaching `maxSprints` without ship returns
`stage="halted", reason="max_sprints_reached"`.

## Circuit breakers

Source: `src/product-loop/circuit-breakers.ts`.

| ID | Trigger | Formula | Halt reason |
|---|---|---|---|
| **CB-1** Cost Projection | Projected next sprint cost > 1.5 × remaining cap | `ewma = recent3.reduce((avg,c) => avg*0.7 + c*0.3, recent[0])`; `projection = ewma * 1.2`; halt iff `projection > (capUsd - spentUsd) * 1.5` | cost projection overrun |
| **CB-2** Oscillation | Two consecutive non-positive score deltas after sprint 3 | `delta_t = score[t] - score[t-1] ≤ 0 && delta_t_minus_1 ≤ 0 && sprintN ≥ 3 && history.length ≥ 3` | score not improving |
| **CB-3** Verify Blank | Sprint 1 has no recipe or `coverage === 0` | `sprintN === 1 && (recipe === null \|\| recipe.coverage === 0)` | `"no_recipe"` or `"zero_coverage"` |

CB-4 through CB-7 are referenced by sprint-runner via the planner /
done-gate paths (cost-scoper reservation breach, role-collision, missing
provider keys, ship-time gate refusal). They surface as `halt` chunks from
`runSprint` and are forwarded to the UI at three sites in
`src/product-loop/index.ts` (Site 1 hot-path `:262`, Site 2 drainSprints
`:528`, Site 3 phases `:752`).

CB-3's `no_recipe` is the canonical "this sprint can't be verified" halt
and is the most common one in fresh projects — fix by adding a
`detectVerifyRecipe` to the harness or scaffolding a test runner before
running `/ideal`.

The harness emits a `sprint-halt` event whenever any CB fires
(`{ sprintN, reason, runId }`).

## Settings flags

| Setting | Default | Effect |
|---|---|---|
| `discoveryEcosystemBias` | `true` | Master switch for all four ecosystem-bias inject sites. Setting `false` disables `buildEcosystemPreamble`, `buildEcosystemDebateContext`, `buildEcosystemResearchSeed`, and the leader-prompt `agentHarness` slot guidance. |
| `eeBBContext` | `true` | Master switch for CB-1 BB context retrieval. Setting `false` skips `fetchBBContext` entirely — no network call, no telemetry. The research phase still runs, just without BB recipes. |

Environment variables that influence the loop:

| Env | Default | Effect |
|---|---|---|
| `MUONROI_PHASE_MODE` | unset (= on) | Set to `0` to use the legacy `drainSprints` path instead of `runPhasesPath`. |
| `MUONROI_DEBUG_LEADER` | `0` | Emit `[leader-debug]` and `[leader-timing]` JSON lines to stderr from `leaderRecommend` and the synth tiebreak. |
| `MUONROI_HARNESS_EVENTS` | unset (lifecycle preset) | Allowlist of harness event kinds. See agent-harness reference. |

## Forensics

After a run completes, inspect cost behaviour:

```bash
bun run src/index.ts usage forensics <runId-prefix>          # human-readable
bun run src/index.ts usage forensics <runId-prefix> --json   # machine-parseable
```

The forensics output flags three anomaly conditions:

- `peak single-call input > 80,000` — sub-agent cumulative cap did not
  engage (Phase B target breach).
- `NULL message_seq on 'message' source` — Phase A5 message write-ahead
  bypassed.
- `zero cache_creation_tokens across deepseek input tokens` — conservative
  warning. DeepSeek has no `cache_creation` field; only treat as a
  regression if `cacheReadTokens === 0` as well.

Baselines:

- Pre-fix worst case: session `b58603caceb9` — peak 504,737 input on a
  single prompt.
- Post-fix DeepSeek: session `5f349ef73ccb` — peak 31,702 input, 41.6%
  cache hit on the same "explore oauth" prompt.
- Post-fix OAuth gpt-5.4: session `63974a79c0cd` — peak 31,827 input, 97%
  cache hit on shorter prompts.

After A1-A5 + B1-B4 + C1-C3 + F1 + G1-G2 + M1 + O1 shipped, peak should
stay ≤ 80K input tokens on any single call.

## See also

- [Council debate](./council-debate.md) — multi-expert debate plumbing,
  stance lifecycle, leader vs council synth tiebreak.
- [PIL pipeline](./pil-pipeline.md) — Layer 1 intent / sufficiency /
  complexity scoring; Layer 3 EE injection; marker dedup.
- Agent-harness reference (in muonroi-cli `CLAUDE.md`) — `route-decision`,
  `council-step`, `sprint-halt`, and `sprint-plan-committed` event shapes.
- EE down behaviour: `muonroi-cli/docs/ee/EE-DOWN-BEHAVIOR.md` —
  per-call-site graceful-degrade matrix.
