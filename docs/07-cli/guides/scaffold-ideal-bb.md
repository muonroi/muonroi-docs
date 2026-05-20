---
title: BB-aware /ideal scaffold
sidebar_position: 6
---

# `/ideal` — BB-aware (muonroi-building-block) scaffold flow

When `/ideal` resolves a target onto an existing `muonroi-building-block`
(BB) tree, or when the user's idea matches canonical BB intents,
muonroi-cli switches into a **BB-aware path**. This path injects BB
recipes/behavioral rules/package recommendations into the council system
prompt at CB-1, then applies a senior-bar code-gen on top of the dotnet
template, and finally runs a hard quality gate (`dotnet restore`,
`dotnet build`, modular-boundaries script, sentinel regex).

This guide mirrors the live behaviour in `muonroi-cli` and links every
claim back to source so it stays traceable. If this guide and the code
disagree, the code wins — and this file is wrong.

## Overview

The BB path activates in two ways:

| Activation | Source | Trigger |
|---|---|---|
| **Filesystem-based** | `detectBBFramework()` in `src/scaffold/init-new.ts:36` | An existing tree contains `Directory.Build.props` + `*.sln` + any `src/Muonroi.*` directory. Sets `IntentDetectionTrace.targetFramework = "muonroi-building-block"`. |
| **Prompt-based fallback** | `inferBBFromPrompt()` in `src/ee/bb-retrieval.ts:439` | Filesystem check returned undefined; the user's prompt is queried against the `bb-recipes` collection and the top hit score ≥ `BB_INFER_SCORE_FLOOR` (0.60). |

Once active, the loop driver injects EE-retrieved BB context BEFORE the
council debate fires (CB-1), then — after scaffold — the BB ecosystem
applier wires senior-bar artifacts (Program.cs services, sample rule +
test, packages-props minimalism, modular-boundaries CI step), and a
quality gate validates the result. Failures fall through to a soft
`EE-GATE-FAILURES.md` recovery doc; `/ideal --resume <path>` re-enters
CB-1 with that doc as the seed.

## Detection heuristic

`detectBBFramework(dirPath, fsOps?)` (`src/scaffold/init-new.ts:36-66`)
returns `"muonroi-building-block"` when ALL three signals match:

1. `Directory.Build.props` exists at the root (`init-new.ts:41`).
2. Any `*.sln` file is present in the root directory
   (`init-new.ts:45-51`).
3. `src/` exists and contains at least one directory whose name starts
   with `Muonroi.` (`init-new.ts:55-62`).

When any signal is missing the function returns `undefined` and `/ideal`
falls back to the prompt-based path. The check is filesystem-only — no
content parsing — so it stays fast (~1ms) on cold repos.

### Prompt-based fallback

When filesystem detection returns undefined (typical for a fresh
`init-new` flow with an empty cwd), the loop driver calls
`inferBBFromPrompt(ctx.idea)` (`src/product-loop/loop-driver.ts:522`).
This issues a single `bb-recipes` query against the Experience Engine and
returns `true` iff `points[0]?.score >= 0.60`
(`src/ee/bb-retrieval.ts:428,463`).

The threshold was calibrated against the 2026-05-16 coverage probe:

| Prompt | Top hit score | Verdict |
|---|---|---|
| "fraud detection" | 0.63 | BB-active |
| "loan approval" | 0.68 | BB-active |
| "multi-tenant SaaS" | 0.84 | BB-active |
| "decision table FEEL" | 0.82 | BB-active |
| "write a TODO app" | < 0.55 | Generic — no BB |

When the inferred path activates, the loop driver also stamps
`ctx._intentTrace.targetFramework = "muonroi-building-block"` so
downstream phases (scaffold-apply, quality-gate) see a consistent
intent trace (`loop-driver.ts:523-525`).

`inferBBFromPrompt` is graceful-degrade by design: it returns `false`
on any error (EE unconfigured, network fail, feature flag off, prompt
< 4 chars). It never throws.

## EE context injection at CB-1

The research phase entry point that fires BB injection is in
`runLoopDriver` at `src/product-loop/loop-driver.ts:508-552` (the
`case "research"` arm). It runs BEFORE the council debate is built,
so every stance LENS sees the retrieved context.

### `fetchBBContext` shape

`fetchBBContext(prompt, opts?)` (`src/ee/bb-retrieval.ts:245`) calls
`/api/search` on three EE collections in parallel:

| Collection | Purpose | Mapped to |
|---|---|---|
| `bb-recipes` | Closest sample recipes (e.g. `mr-fraud-svc`, `mr-loan-svc`) | `BBRecipe[]` with `name`, `score`, `intentKeywords`, `description` |
| `bb-behavioral` | Behavioral rules (e.g. "always wire `AddInfrastructure` before `app.UseDefaultMiddleware`") | `BBBehavioralRule[]` |
| `bb-packages` | Package recommendations (e.g. `Muonroi.RuleEngine.Core`, `Muonroi.MultiTenancy`) | `BBPackage[]` with `license` ("OSS"\|"Commercial"\|other) |

Budgeting and retry semantics (`bb-retrieval.ts:86-89, 132-150,
291-307`):

- Total budget: `BB_RETRIEVAL_TIMEOUT_MS` — default 800ms, overridable
  via `MUONROI_BB_RETRIEVAL_TIMEOUT_MS` env, clamped to `[300, 3000]`.
- Each collection has **retry-once** semantics via `queryWithRetry`.
- On `AbortSignal` fire while all three collections returned 0 points,
  an `ee-timeout` event is emitted via `logEeFailure` for harness specs.
- On network failure, `_networkErrorLogged` ensures the stderr log
  prints **once** per process lifetime (`bb-retrieval.ts:91-92, 297`).
- Returns an empty `BBContext` (recipes/behavioral/packages all empty)
  on any failure. The research phase still runs — just without BB hints.

### Token budget (1500 default)

`fetchBBContext` applies a 40/40/20 split across the
`maxTokens` budget (`bb-retrieval.ts:89, 350-357`):

| Category | Budget share | Notes |
|---|---|---|
| Recipes | 40% (= 600 tokens) | Sorted by score, trimmed greedily until the budget is exhausted. |
| Behavioral rules | 40% (= 600 tokens) | Same algorithm. |
| Packages | 20% (= 300 tokens) | Same algorithm. |

`approxTokens(text) = ceil(text.length / 4)` (`bb-retrieval.ts:195`).
Override per-call via `FetchBBContextOpts.maxTokens`.

### Marker-based dedup with PIL Layer 3

`renderBBContextBlock(ctx)` (`bb-retrieval.ts:381`) emits a context
block stamped with a deduplication marker:

```
## BB context (retrieved from Experience Engine)
Closest sample(s): mr-fraud-svc (matches intent: fraud, rule-engine, ml)
  - mr-decision-svc (matches intent: decision, rule-engine, FEEL)
Packages to consider:
- Muonroi.RuleEngine.Core (OSS) — ...
- Muonroi.MultiTenancy (OSS) — ...
Behavioral rules:
- Always wire AddInfrastructure before app.UseDefaultMiddleware
<!-- bb-context-injected:a4f1c2e9d8b703f5 -->
```

The marker is `<!-- bb-context-injected:<sha16> -->` where
`sha16 = sha256(content).slice(0, 16)` (`bbContextMarker()` at
`bb-retrieval.ts:225-228`).

PIL Layer 3 honours this marker. Before appending any EE hit, the
layer extracts already-present sha16s from `ctx.enriched`
(`src/pil/layer3-ee-injection.ts:60-68`) and computes `payloadSha16()`
(`layer3-ee-injection.ts:74-76`) for each candidate. Hits whose sha
matches a marker already present are skipped — preventing
double-injection when both CB-1 (loop-driver) and PIL Layer 3 are
active on the same pipeline run.

### Injection site

The injected block is **prepended** to `conversationContext` in the
research phase (`loop-driver.ts:540-542`):

```ts
const bbCtx = await fetchBBContext(ctx.idea);
const bbBlock = renderBBContextBlock(bbCtx);
if (bbBlock) {
  conversationContext = `${bbBlock}\n\n${conversationContext}`;
}
```

The block lands BEFORE any prior project context and BEFORE the
stance lenses, so every Researcher/Architect/Skeptic/Cost-Controller
sees BB-aware framing in their system prompt.

## Senior-bar code-gen (`bb-ecosystem-apply.ts`)

After `dotnet new <bbTemplate>` succeeds and EE packages are wired,
`applyBBEcosystem(opts)` (`src/scaffold/bb-ecosystem-apply.ts:397`)
runs a five-step senior-bar pass on top of the template output.

### Task 6.8 — Program.cs wiring

`applyProgramCsWiring()` (`bb-ecosystem-apply.ts:102`) does
regex-anchored injection BELOW the line
`var builder = WebApplication.CreateBuilder(args);` (anchor at
`bb-ecosystem-apply.ts:138`). The injected block is wrapped in
sentinel comments for idempotency:

```cs
// >>> muonroi-cli:injected:bb-ecosystem
builder.Services.AddInfrastructure(builder.Configuration, new MTokenInfo(builder.Configuration));
app.UseDefaultMiddleware();
builder.Services.AddRuleEngine<MyAppDbContext>();
builder.Services.AddRulesFromAssemblies(typeof(Program).Assembly);
builder.Services.AddMultiTenancy(builder.Configuration);
builder.Services.AddMuonroiAuth(builder.Configuration);
// <<< muonroi-cli:injected:bb-ecosystem
```

The block content is intent-driven (`buildBBServicesBlock()` at
`bb-ecosystem-apply.ts:76-100`):

| Intent keyword | Wired service |
|---|---|
| always | `AddInfrastructure` + `app.UseDefaultMiddleware()` |
| `rule`, `rule-engine`, `fraud`, `loan`, `approval`, `decision` | `AddRuleEngine<{ProjectName}DbContext>()` + `AddRulesFromAssemblies(typeof(Program).Assembly)` |
| `tenant`, `tenancy`, `saas`, `multi-tenant` | `AddMultiTenancy(builder.Configuration)` |
| `auth`, `authn`, `jwt`, `identity` | `AddMuonroiAuth(builder.Configuration)` |

Idempotency: when `SENTINEL_OPEN` (`bb-ecosystem-apply.ts:23`) is
already present in the file, the pass returns
`{ modified: false, reason: "sentinel already present" }`.

`Program.cs` is searched at three candidate paths
(`bb-ecosystem-apply.ts:113-117`): the template root, the
`src/{ProjectName}.Api/` directory, or the `src/` directory.

### Tasks 6.9 + 6.10 — Sample rule + test

When intent matches any of `rule`, `rule-engine`, `fraud`, `loan`,
`approval`, `decision`
(`bb-ecosystem-apply.ts:424-434`), the applier emits:

- `src/{ProjectName}.Domain/Rules/Sample{IntentPascal}Rule.cs` — a
  scaffolded `IRule<{ProjectName}RuleContext>` with the
  `[MExtractAsRule("SAMPLE_{INTENT_UPPER}", DependsOn = new string[] { })]`
  attribute (`generateSampleRule()` at `:184`,
  `buildSampleRuleCs()` at `:156`).
- `tests/{ProjectName}.UnitTests/Rules/Sample{IntentPascal}RuleTests.cs`
  — an XUnit `[Fact]` that exercises the rule's `EvaluateAsync` and
  asserts `RuleResultStatus.Passed` (`generateSampleRuleTest()` at
  `:248`, `buildSampleRuleTestCs()` at `:212`).

The PascalCase intent name is derived from
`intent.split(/[-_\s]+/).map(capitalize).join("")` so kebab/snake-cased
intents (`"fraud-detection"`) become Pascal class names
(`SampleFraudDetectionRule`).

### Task 6.11 — Directory.Packages.props minimalism

`minimizePackagesProps()` (`bb-ecosystem-apply.ts:276`) parses the
template-emitted `Directory.Packages.props` via `fast-xml-parser` and
**filters** the `<PackageVersion>` entries:

- Non-`Muonroi.*` packages are **always kept**
  (`bb-ecosystem-apply.ts:321`).
- `Muonroi.*` packages are kept **only if** they appear in
  `opts.eePackages` (the EE-recommended package set).

This trims template-bundled BB packages the user's intent doesn't need.
If `fast-xml-parser` is not installed, the pass silently skips
(`bb-ecosystem-apply.ts:333-336`) — it is an enhancement, not a gate.

### Task 6.12 — Modular-boundaries script + CI wiring

When `bbRepoRoot` is provided, `copyBoundaryScript()`
(`bb-ecosystem-apply.ts:346`) copies
`<bbRepoRoot>/scripts/check-modular-boundaries.ps1` into
`<serverDir>/scripts/check-modular-boundaries.ps1` and appends a CI
step into `.github/workflows/ci.yml` (when it exists):

```yaml
      - name: Check modular boundaries
        run: pwsh ./scripts/check-modular-boundaries.ps1 -RepoRoot .
```

The CI wiring is idempotent — if `ci.yml` already references
`check-modular-boundaries.ps1`, the step is not appended again
(`bb-ecosystem-apply.ts:378`).

## Quality gates (`bb-quality-gate.ts`)

After scaffold + senior-bar apply complete, the quality gate runs
five checks. Any failure flips `passed: false` and feeds the failure
list to retry/recovery
(`runQualityGate()` at `src/scaffold/bb-quality-gate.ts:81`).

| # | Step | Command | Timeout | Source |
|---|---|---|---|---|
| 1 | dotnet restore | `dotnet restore --nologo` | 120s | `bb-quality-gate.ts:87` |
| 2 | dotnet build | `dotnet build -c Debug --nologo` | 180s | `bb-quality-gate.ts:93` |
| 3 | modular boundaries | `pwsh scripts/check-modular-boundaries.ps1 -RepoRoot .` | 30s | `bb-quality-gate.ts:99-105` |
| 4 | sentinel grep | `Select-String -Path Program.cs -Pattern '// >>> muonroi-cli:injected:bb-ecosystem' -Quiet` | 5s | `bb-quality-gate.ts:108-122` |
| 5 | template leftover scan | `Get-ChildItem … *.cs,*.csproj \| Select-String -Pattern 'BaseTemplate\|DocTemplate\|TemplateSample' -List` | 15s | `bb-quality-gate.ts:128-154` |

Step 5 catches the BB template's placeholder identifiers
(`BaseTemplate`, `DocTemplate`, `TemplateSample`). The agent is
expected to rename or delete these during scaffold — any survivor is
treated as a gate failure with the file list attached to the failure
output.

### Retry-once via council (Task 6.14)

`runQualityGateWithRetry()` (`bb-quality-gate.ts:163`) runs the gate
once; if it fails, the failure summary is appended to the original
intent prompt and `continueAsCouncil()` is fired with the combined
prompt as input (`bb-quality-gate.ts:175-187`). When the caller
provides `onRetryCodeGen`, that callback is invoked between council
re-entry and the second gate run — typically wired to re-run
`applyBBEcosystem` with the council's revised intent.

The output template (`bb-quality-gate.ts:171-180`):

```
{original prompt}

## Gate failures (please fix in next iteration)
### dotnet build
```
…build output (truncated to 500 chars)…
```

Please revise the BB ecosystem wiring to fix these compilation/boundary errors.
```

### Soft fallback (Task 6.15) — `EE-GATE-FAILURES.md`

When retry still fails, `emitGateFailuresFallback()`
(`bb-quality-gate.ts:202`) writes `<serverDir>/EE-GATE-FAILURES.md`
containing:

- Date stamp + each failure's step name and output (truncated to
  1000 chars per step).
- Optional "Remediation hints from EE" section per failure, populated
  by querying `fetchBBContext` with the failure keywords; up to three
  behavioral rules are surfaced per failure
  (`bb-quality-gate.ts:228-246`).
- A "Next steps" footer pointing the user at `/ideal --resume .`.

A single-line stdout notice fires after the file is written
(`bb-quality-gate.ts:262-264`):

```
⚠️ Scaffold complete with N gate failure(s) — see EE-GATE-FAILURES.md. Run /ideal --resume to attempt fixes interactively.
```

`runGatePipeline()` (`bb-quality-gate.ts:271`) is the one-call
convenience that chains run + retry + soft fallback.

## Failure recovery: `/ideal --resume <path>`

`resumeFromGateFailures()` (`src/scaffold/resume-from-gate-failures.ts:64`)
is the handler bound to `/ideal --resume <project-path>`. It performs
a four-step recovery:

1. **Validate path** via `pointToExisting()`
   (`resume-from-gate-failures.ts:71-76`). Path-validation only — the
   verify-recipe detector is stubbed to `null` by default; pass
   `opts.detectVerifyRecipe` to enable real detection.
2. **Locate `EE-GATE-FAILURES.md`** at `<absolutePath>/EE-GATE-FAILURES.md`
   (`resume-from-gate-failures.ts:81-88`). Returns `reason:
   "no_gate_failures_file"` when missing.
3. **Load failure context + optional `EE-INTENT.md`** (the original
   intent file stamped by `init-new`)
   (`resume-from-gate-failures.ts:92-111`). `EE-INTENT.md` is best-effort
   — its absence is non-fatal.
4. **Re-enter CB-1 via `continueAsCouncil`** with a templated resume
   prompt (`buildResumePrompt()` at `resume-from-gate-failures.ts:137-167`).

The resume prompt template (`resume-from-gate-failures.ts:137-167`):

```
# /ideal --resume: Fix gate failures

The previous scaffold run produced gate failures. Please analyze them
and provide corrected BB ecosystem wiring (Program.cs,
Directory.Packages.props, etc.).

## Original Intent
{first 800 chars of EE-INTENT.md, if present}

## Gate Failures to Fix
{first 2000 chars of EE-GATE-FAILURES.md}

## Instructions

1. Identify root cause of each failure from the output above.
2. Suggest specific code changes to Program.cs or Directory.Packages.props.
3. If boundary violations: list which packages to remove or replace with OSS alternatives.
4. Output a revised scaffold plan that will pass the quality gate.
```

Return values (`ResumeResult.reason`):

| Reason | Meaning |
|---|---|
| `"resumed"` | Council re-entered successfully; `specPath` points at the revised spec. |
| `"no_gate_failures_file"` | No `EE-GATE-FAILURES.md` at `absolutePath`. |
| `"invalid_path"` | `pointToExisting` rejected the path. |
| `"error"` | Read failure or council exception; `error` carries detail. |

## Feature flag — `userSettings.eeBBContext`

`fetchBBContext` and `inferBBFromPrompt` read
`userSettings.eeBBContext` via `loadUserSettings()`
(`src/ee/bb-retrieval.ts:255-258, 440-441`). When `false`:

- `fetchBBContext()` returns the empty `BBContext` immediately — no
  network call, no telemetry, no stderr log
  (`bb-retrieval.ts:255-258`).
- `inferBBFromPrompt()` returns `false` immediately
  (`bb-retrieval.ts:440-441`).
- The CB-1 injection block in `loop-driver.ts:536-552` becomes a
  no-op because `bbActive` falls through to `false`.
- The research phase still runs — just without BB context.

The flag defaults to `true` ("on"). It is the single switch that
disables the entire CB-1 BB retrieval path.

Environment overrides that compose with the flag:

| Env | Default | Effect |
|---|---|---|
| `MUONROI_BB_RETRIEVAL_TIMEOUT_MS` | 800 (clamped 300–3000) | Per-collection budget for `fetchBBContext`'s parallel queries (`bb-retrieval.ts:88`). |
| `MUONROI_PIL_SEARCH_TIMEOUT_MS` | 1500 (clamped 500–5000) | Layer 3 EE injection budget (`layer3-ee-injection.ts:34`). |
| `MUONROI_PIL_SCORE_FLOOR` | 0.55 | Score floor for Layer 3 hits before injection (`layer3-ee-injection.ts:40-43`). |

## Related files

Source files referenced in this guide:

| File | Role |
|---|---|
| `src/scaffold/init-new.ts` | `detectBBFramework()` heuristic, `toDotNetAssemblyName()`, dotnet template install + scaffold pipeline. |
| `src/scaffold/bb-ecosystem-apply.ts` | Senior-bar code-gen — Program.cs wiring, sample rule + test, packages-props minimalism, boundary script + CI wiring. |
| `src/scaffold/bb-quality-gate.ts` | 5-step quality gate, retry-once via council, soft `EE-GATE-FAILURES.md` fallback. |
| `src/scaffold/resume-from-gate-failures.ts` | `/ideal --resume <path>` handler — re-enters CB-1 with gate failures as the seed. |
| `src/ee/bb-retrieval.ts` | `fetchBBContext`, `inferBBFromPrompt`, `renderBBContextBlock`, `bbContextMarker`. |
| `src/product-loop/loop-driver.ts` | CB-1 injection point in the research phase (`runLoopDriver` case `"research"`). |
| `src/pil/layer3-ee-injection.ts` | Marker-based dedup against `<!-- bb-context-injected:<sha16> -->`. |

## See also

- [Ideal product loop](./ideal-product-loop.md) — overall `/ideal`
  routing, sufficiency gate, council debate phase, circuit breakers.
- [Council debate](./council-debate.md) — multi-expert stance
  plumbing that consumes the injected BB context.
- [PIL pipeline](./pil-pipeline.md) — Layer 3 EE injection and the
  marker dedup contract shared with `bb-retrieval.ts`.
- [Experience Engine](./experience-engine.md) — `bb-recipes`,
  `bb-behavioral`, `bb-packages` collections + ingestion pipeline.
- EE down behaviour: `muonroi-cli/docs/ee/EE-DOWN-BEHAVIOR.md` —
  per-call-site graceful-degrade matrix, including `bb-retrieval`.
- BB ingestion layout: `muonroi-cli/docs/agent-harness/EE-INGESTION.md`.
