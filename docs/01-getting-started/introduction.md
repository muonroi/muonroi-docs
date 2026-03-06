# Introduction

Muonroi is now documented as a 4-repo ecosystem:

- `muonroi-building-block`: .NET packages for rules, decision tables, governance, tenancy, observability, and supporting infrastructure.
- `muonroi-ui-engine`: npm packages and web components for manifest-driven UI and decision table widgets.
- `muonroi-control-plane`: private ASP.NET 8 service for ruleset approval, canary rollout, tenant quotas, FEEL, decision tables, and dashboard hosting.
- `muonroi-license-server`: private service that issues `MRR-...` keys and activation proofs for offline verification.

The ecosystem uses an open-core model:

- OSS packages are published under Apache 2.0.
- Commercial packages remain source-visible but require a Muonroi commercial license.
- Private deployed services consume both OSS and commercial packages but are not mirrored into the public docs tree.

## What is current as of 2026-03-06

- Track 0 through Track 3 are complete.
- Track 4 is in progress.
- FEEL web endpoints are live at `/api/v1/feel`.
- Decision tables are backed by `AddDecisionTableWeb(...)` and can persist through Postgres.
- Rule control plane supports approval workflow, canary rollout, audit signing, and SignalR hot reload.
- License activation produces signed activation proofs for offline production verification.

## Read this set first

1. [Quickstart](./quickstart.md) for a working rule engine setup.
2. [Architecture Overview](../02-concepts/architecture-overview.md) for repo boundaries and runtime shape.
3. [Rule Engine Guide](../03-guides/rule-engine/rule-engine-guide.md) for execution and rollout patterns.
4. [Decision Table Guide](../03-guides/rule-engine/decision-table-guide.md) for editor and persistence flows.
5. [Ecosystem Coding Rules](../03-guides/ecosystem-coding-rules.md) for wrapper-first implementation rules.

## Documentation contract

This repository is the single source of truth for developer-facing docs.

- Historical upgrade notes are intentionally removed.
- Each markdown file maps to a current capability or operational process.
- Package READMEs stay in package roots, but all deeper guides belong here.
