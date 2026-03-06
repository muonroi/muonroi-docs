# Architecture Overview

```text
PUBLIC
  muonroi-building-block   -> .NET OSS + commercial packages
  muonroi-ui-engine        -> npm OSS + commercial UI packages

PRIVATE
  muonroi-control-plane    -> ruleset approval, canary, FEEL, decision tables, dashboard
  muonroi-license-server   -> license issuance and activation proof service
```

## Open-core split

- OSS packages can depend only on OSS packages.
- Commercial packages may depend on OSS packages.
- The boundary is enforced by `scripts/check-modular-boundaries.ps1` and analyzer rules.

## Runtime shape

- `muonroi-building-block` provides the reusable runtime and abstractions.
- `muonroi-control-plane` composes `AddFeelWeb()`, `AddDecisionTableWeb(...)`, and `AddMRuleEngineWithPostgres(...)`.
- `muonroi-ui-engine` provides runtime adapters and the `mu-decision-table` widget.
- `muonroi-license-server` issues `MRR-...` keys and signed activation proofs.

## Enforcement at a glance

- `MBB001`: use `IMDateTimeService`
- `MBB002`: use `IMJsonSerializeService`
- `MBB003`: inherit `MDbContext`
- `MBB004`: keep `AsyncLocal` inside the execution-context package
- `MBB005`: keep abstractions free of infrastructure references
- `MBB006`: add `EnsureFeatureOrThrow(...)` to premium registrations
- `MBB007`: use `IMLogContext` instead of direct Serilog `LogContext`

## Current operational dependencies

- Postgres for ruleset and decision table persistence
- Redis for cross-node ruleset change publication
- SignalR for real-time hot reload notifications
- RSA signing for ruleset audit chains and activation proofs
