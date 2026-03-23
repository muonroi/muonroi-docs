---
title: Introduction
sidebar_label: Introduction
sidebar_position: 1
---

# Welcome to Muonroi

Muonroi is an open-core rule engine ecosystem designed for modern decision automation, multi-tenant deployments, and enterprise governance. Built on a **rule-engine-centric architecture**, it powers complex business logic evaluation, flow orchestration, decision tables, and autonomous workflow automation.

## The 4-Repo Ecosystem

Muonroi is organized as four tightly integrated repositories:

### Public — Open Source (Apache 2.0)

**muonroi-building-block** (.NET)
- 54 NuGet packages providing core libraries for rule evaluation, decision tables, multi-tenancy, governance, logging, and infrastructure.
- Shared across all consumer applications and the control plane.
- No external dependencies on commercial licensing.

**muonroi-ui-engine** (TypeScript/React)
- 8 npm packages delivering manifest-driven UI components and decision table widgets.
- 23 Lit custom elements (`mu-*` prefix) with Zustand state management.
- ETag-cached, SignalR-integrated runtime for hot schema reloading.

### Private — Commercial Services

**muonroi-control-plane** (ASP.NET 8)
- REST API + 31 MCP tools for ruleset management, approval workflows, canary rollouts, tenant quotas, and audit trails.
- Dashboard UI for rule authoring, FEEL expression validation, decision table editing, and deployment control.
- Multi-tenant support with role-based access, SignalR hot-reload broadcasting, and production-grade governance.

**muonroi-license-server** (C# / RSA-2048)
- Issues `MRR-{base64url}` license keys and signed activation proofs.
- Supports online heartbeat, offline verification via HMAC chain, and feature-based access control.
- Revocation tracking with grace periods and anti-tampering detection.

---

## Current Status (2026-03-20)

| Track | Scope | Status |
|-------|-------|--------|
| 0–3 | Foundation: rule engine, decision tables, FEEL, basic workflow | ✓ Complete |
| 4–6 | Tenancy, governance, observability, multi-provider adapters | ✓ Complete |
| 7 | Rule-driven authorization (PDP/PEP + OpenFGA/OPA) | ✓ Complete |
| 8 | Connector registry, dual expression engine (FEEL + Scriban), templates | ✓ Complete |
| 9 | **Rule Proliferation Engine** — AI-driven test scenario generation, coverage analysis, regression detection, fuzzy deduplication, chaos mode, composite brain | 🔄 Phase 1–7 Done (144 tests) |

---

## Core Features at a Glance

### Rule Engine & Execution

- **Pipeline Orchestration**: FactBag-based data flow with DFS topological sort and two-phase execution (evaluate + execute).
- **Flow Graphs**: DAG support with Kahn's algorithm, multi-edge routing (always/on-true/on-false/on-error), and compensation-on-failure (LIFO reversal).
- **Execution Modes**: AllOrNothing (strict), BestEffort (aggregate), CompensateOnFailure (rollback), plus shadow mode for A/B comparison.
- **3-Level Caching**: RuntimeCache (per-tenant TTL) → WorkflowCache (static 2048 limit) → ReflectionRuleCache (TContext indexing).

### Decision Tables & FEEL

- **Hit Policies**: First, Unique, Collect, Priority with forward-propagation output logic.
- **FEEL Expressions**: Full Feel (Friendly Enough Expression Language) support with cell autocomplete and inline validation.
- **Virtualized Editing**: 44px rows, 45 visible at once, undo/redo (50-action stack), version diff side-by-side.
- **Persistence**: PostgreSQL-backed storage with approval workflow and audit trails.

### Multi-Tenancy & Governance

- **AsyncLocal Propagation**: Header/path/subdomain resolution → TenantContext.CurrentTenantId automatic scope.
- **3 Isolation Strategies**: Shared schema (EF query filters) | Separate schema (PostgreSQL SearchPath) | Separate database.
- **Quota Enforcement**: 13 configurable limits (requests/day, concurrent rules, workflows) with 4 tier presets (Free/Starter/Professional/Enterprise).
- **Role-Based Access**: Tenant → user-context → rule evaluation for CRUD and action permissions.

### Canary Deployment & Hot-Reload

- **Gradual Rollout**: Target % of traffic or specific tenants, real-time monitoring with SignalR status push.
- **Instant Invalidation**: SaveAsync → invalidate caches → publish RuleSetChangeEvent → browser reconnect.
- **Version Awareness**: RulesEngineService auto-selects active or canary version per tenant before cache lookup.
- **Auth Rules Hot-Reload**: AuthRuleChangeHub broadcasts updates; PDP reevaluates without restart.

### Enterprise Security

- **License Verification**: HMAC chain with key derivation (license + projectSeed + salt + serverNonce).
- **Offline Activation**: Signed ActivationProof (tier, features, expiry) for air-gapped production.
- **Anti-Tampering**: CodeIntegrityVerifier (SHA256 assembly hashes), anti-debugger/profiler/breakpoint detection at startup.
- **Fail-Closed Design**: Revocation grace period (24h), heartbeat nonce rotation, enterprise features degrade to Free on expiry.

### Proliferation Engine (Track 9)

- **AI Scenario Generation**: Multi-provider support (Claude/ChatGPT/Qwen/Ollama) with token budgeting and failure recovery.
- **Coverage Analysis**: Rule lineage tracing, gap detection, unused rule identification.
- **Regression Detection**: Baseline comparison with historical rule behavior, mutation testing.
- **Fuzzy Deduplication**: Semantic grouping of similar scenarios, chaos mode for edge case discovery.
- **Composite Brain**: Parallel multi-provider evaluation with vote reconciliation and confidence scoring.

---

## Quick Start

**Install the core library:**
```bash
dotnet add package Muonroi.RuleEngine
```

**Configure in Program.cs:**
```csharp
services.AddRuleEngine(configuration);
services.AddLicenseProtection(configuration);
services.AddMEnterpriseGovernance(configuration);
```

**Activate your license:**
```bash
curl -X POST https://license.truyentm.xyz/api/v1/activate \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"MRR-xxxxx","machineFingerprint":"..."}'
```

**Create and execute your first rule:**
See [Quickstart](./quickstart.md) for a complete working example.

---

## Next Steps

Start with these guides in order:

1. **[Quickstart](./quickstart.md)** — 5-minute working rule engine setup
2. **[Architecture Overview](../02-concepts/architecture-overview.md)** — Understand repo roles and runtime shape
3. **[Rule Engine Guide](../03-guides/rule-engine/rule-engine-guide.md)** — Deep dive into execution, caching, and rollout patterns
4. **[Decision Table Guide](../03-guides/rule-engine/decision-table-guide.md)** — Master FEEL, hit policies, and persistence
5. **[Ecosystem Coding Rules](../03-guides/ecosystem-coding-rules.md)** — Wrapper-first patterns and best practices
6. **[Multi-Tenancy Guide](../03-guides/multi-tenancy-guide.md)** — Isolation, quota, and resolution
7. **[License & Governance](../03-guides/license-governance-guide.md)** — Activation, heartbeat, and HMAC verification

For production deployments, also review:
- [Canary Rollout](../03-guides/deployment/canary-rollout.md)
- [Hot-Reload Patterns](../03-guides/deployment/hot-reload-patterns.md)
- [Proliferation Engine](../04-advanced/proliferation-engine.md) (Track 9)

---

## Documentation Standards

This repository is the **single source of truth** for developer-facing documentation:

- All guides reflect current capabilities as of 2026-03-20
- Package READMEs remain in their source roots; deeper guides belong here
- Historical upgrade notes are intentionally removed for clarity
- Each markdown file maps to a live feature or operational process

**Have questions?** Check the [FAQ](./faq.md) or open an issue on GitHub.

**Want to contribute?** See [Contributing](../06-contributing/contributing.md) for guidelines.
