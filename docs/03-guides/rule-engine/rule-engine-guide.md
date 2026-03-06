# Rule Engine Guide

The current Muonroi rule engine supports:

- code-first attributed rules
- runtime-managed rulesets
- approval workflow
- canary rollout
- Redis-backed hot reload
- FEEL-assisted decision-table authoring

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

## Wrapper-first expectations

- Use `IMDateTimeService`, `IMJsonSerializeService`, and `IMLog<T>`.
- Flow tenant and user data through `ISystemExecutionContextAccessor`.
- Guard premium registrations with `EnsureFeatureOrThrow(...)`.
