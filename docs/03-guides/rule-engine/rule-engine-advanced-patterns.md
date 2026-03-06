# Rule Engine Advanced Patterns

## Execution topologies

- code-first rules for compile-time safety
- runtime rulesets for operator-managed changes
- decision tables for business-friendly tabular authoring

## Approval and rollback

Use `RuleControlPlaneOptions.RequireApproval` when runtime changes must follow maker-checker flow.

Relevant states:

- `Draft`
- `PendingApproval`
- `Approved`
- `Rejected`
- `Active`
- `Superseded`
- `RolledBack`

## Canary rollout

Enable `RuleControlPlaneOptions.EnableCanary` and roll out by tenant while preserving an active fallback version.

## Cross-node hot reload

Pair `AddMRuleEngineWithPostgres(...)` with `AddMRuleEngineWithRedisHotReload(...)` to publish ruleset change events across nodes.

## Decision table authoring loop

Use the widget-backed editor for business authoring, then export JSON or DMN when a downstream system needs a portable artifact.
