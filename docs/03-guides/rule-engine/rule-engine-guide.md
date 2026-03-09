# Rule Engine Guide

The current Muonroi rule engine supports:

- code-first attributed rules
- runtime-managed rulesets
- approval workflow
- canary rollout
- Redis-backed hot reload
- FEEL-assisted decision-table authoring
- dry-run testing with per-rule traces

## Core registrations

```csharp
builder.Services.AddFeelWeb();
builder.Services.AddMRuleEngineWithPostgres(connectionString, options =>
{
    options.RequireApproval = true;
    options.NotifyOnStateChange = true;
    options.EnableCanary = true;
});
```

Optional:

```csharp
builder.Services.AddMRuleEngineWithRedisHotReload(redisConnectionString);
```

## Authoring styles

1. Code-first via RuleGen and `[MExtractAsRule(...)]`
2. Runtime rulesets persisted through `IRuleSetStore`
3. Decision tables converted into executable rules

## Runtime services

- `RulesEngineService`
- `IRuleSetStore`
- `IRuleSetAuditStore`
- `IRuleSetApprovalService`
- `ICanaryRolloutService`
- `IRuleSetChangeNotifier`

## Current lifecycle

1. Save a new ruleset version.
2. Submit it for approval when `RequireApproval=true`.
3. Approve it through maker-checker flow.
4. Activate or canary it.
5. Broadcast change notifications through Redis + SignalR when enabled.

## FEEL integration

Decision table input cells are evaluated through `IFeelCellEvaluator`.

- `FullFeelCellEvaluator` uses FEEL runtime for unary tests (`> 100`, `[10..20]`, `in (...)`).
- `SimplifiedFeelCellEvaluator` is available as backward-compatible fallback.
- Server-side FEEL validation endpoint:
  - `POST /api/v1/decision-tables/{id}/feel/validate-expression`
  - request: `{ "expression": "> 100", "columnDataType": "number" }`
  - response: `{ "isValid": true, "error": null }`

## Conflict and redundancy detection

Decision table validation now includes:

- Unique hit policy conflict checks with multi-column overlap detection.
- First hit policy redundancy checks for unreachable rows.

Validation endpoint remains:

- `POST /api/v1/decision-tables/{id}/validate`

The response contains `errors` (conflicts/invalid expressions) and `warnings` (redundancies, gaps).

## Dry-run workflow

Use control-plane dry-run before activation:

- `POST /api/v1/control-plane/rulesets/{workflow}/dry-run`
- request body:
  - `version` (optional)
  - `inputs` (fact map)
  - `contextType` (optional, for code-based workflows)

Response fields:

- `rulesMatched`
- `evaluationTimeMs`
- `traces[]` (`ruleName`, `matched`, `failReason`)
- `outputFacts`
- `errors`

## Wrapper-first expectations

- Use `IMDateTimeService`, `IMJsonSerializeService`, and `IMLog<T>`.
- Flow tenant and user data through `ISystemExecutionContextAccessor`.
- Guard premium registrations with `EnsureFeatureOrThrow(...)`.
