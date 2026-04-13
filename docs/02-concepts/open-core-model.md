---
title: Open Core Model
sidebar_label: Open Core Model
sidebar_position: 2
---

# Open Core Model

Muonroi uses an **open-core packaging model** that separates free OSS libraries from commercial services and enterprise governance features. This document explains the layered distribution, feature matrix, and enforcement mechanisms across the entire ecosystem.

---

## Overview

The open-core model enables:
- **OSS foundation** — Core rule engine abstractions, decision tables, multi-tenancy context, and data access patterns (Apache 2.0)
- **Commercial layer** — REST APIs, SignalR hot-reload, advanced integrations, and web UI components (Muonroi Commercial License)
- **Private services** — Control Plane API (SaaS), License Server, and Dashboard (Muonroi Proprietary License)

No circular dependencies exist: OSS packages never depend on Commercial packages.

---

## Ecosystem Scope

### Public Open-Source (Apache 2.0)
- **muonroi-building-block** — 54 NuGet packages covering:
  - Rule engine abstractions and core orchestration
  - Decision table evaluation with FEEL expressions
  - Multi-tenancy context propagation (AsyncLocal)
  - Data access wrappers (MDbContext, Dapper, EntityFramework)
  - Ecosystem integrations (caching, logging, resilience, background jobs)

- **muonroi-ui-engine** — 8 npm packages covering:
  - TypeScript runtime resolver with ETag caching
  - 23 Lit custom elements (mu-* prefix) with virtual rendering
  - Zustand state management stores (vanilla, framework-agnostic)
  - Flow designer and decision table widgets (React hybrid)
  - FEEL autocomplete and expression editor

### Commercial Distribution (Private Feed)
- 24 Muonroi.* packages requiring a valid commercial license:
  - Advanced governance, enterprise caching, messaging, background jobs
  - REST runtime surfaces, web decision tables, business rules modeling
  - AuthZ, gRPC, service discovery, secrets management, BFF layer

### Private Services (Muonroi Proprietary)
- **muonroi-control-plane** — 31 MCP tools + 13 dashboard pages for rule management, approval workflows, canary deployments, and audit trails
- **muonroi-license-server** — License key generation, activation proof issuance, heartbeat management, feature gating (`MRR-{24-byte}` key format, RSA-2048)

---

## Feature Matrix

| Feature | OSS | Commercial | Private |
|---------|-----|------------|---------|
| **Rule Engine Abstractions** (IRuleDefinition, IFactBag contract) | Yes | — | — |
| **Rule Orchestrator** (DFS topo sort, 2-phase execution) | Yes | — | — |
| **Decision Table Engine** (hit policies, FEEL evaluator, versioning) | Yes | — | — |
| **FEEL Evaluator** (expression parser, built-in functions) | Yes | — | — |
| **Multi-Tenancy Context** (AsyncLocal, ContextMirrorScope) | Yes | — | — |
| **Data Access Wrappers** (MDbContext, IMRepository, Dapper adapters) | Yes | — | — |
| **License Protection Base** (LicenseStore, NoopEnhancer) | Yes | — | — |
| **Rule Source Generator** (RuleGen CLI, Roslyn analyzers MBB001–MBB007) | Yes | — | — |
| **REST API Endpoints** (RuleFlowExecuteController, DecisionTableController) | — | Yes | — |
| **SignalR Hot-Reload** (ruleset-changes, auth-rule-changes hubs) | — | Yes | — |
| **Enterprise Governance** (AntiTamperDetector, HMAC chain, fail-closed) | — | Yes | — |
| **Caching.Redis** (distributed cache, cache invalidation events) | — | Yes | — |
| **Messaging.MassTransit** (distributed messaging, saga coordination) | — | Yes | — |
| **Advanced AuthZ** (OpenFGA, OPA, rule-driven authorization) | — | Yes | — |
| **UI Engine Catalog** (npm registry, component versioning) | — | Yes | — |
| **Control Plane API** (31 MCP tools, ruleset CRUD, approval workflows) | — | — | Yes |
| **Control Plane Dashboard** (13 pages, rule authoring, deployment UI) | — | — | Yes |
| **License Server** (key generation, activation, heartbeat, revocation) | — | — | Yes |

---

## OSS Layer

### Packages
Licensed under **Apache 2.0**, published to public NuGet and npm registries.

**NuGet (22 core packages):**
- Core abstractions: `Muonroi.Core`, `Muonroi.Governance.Abstractions`
- Rule engine: `Muonroi.RuleEngine.Abstractions`, `Muonroi.RuleEngine.Core`, `Muonroi.RuleEngine.DecisionTable`, `Muonroi.RuleEngine.SourceGenerators`, `Muonroi.RuleEngine.Testing`, `Muonroi.RuleEngine.NRules`, `Muonroi.RuleEngine.CEP`
- Multi-tenancy: `Muonroi.Tenancy.Abstractions`, `Muonroi.Tenancy.Core`, `Muonroi.Tenancy`
- Data access: `Muonroi.Data.Abstractions`, `Muonroi.Data.Dapper`, `Muonroi.Data.EntityFrameworkCore`
- Integration: `Muonroi.AspNetCore`, `Muonroi.Logging.Abstractions`, `Muonroi.Auth`, `Muonroi.Http`, `Muonroi.Resilience`, `Muonroi.Mapper`, `Muonroi.Mediator`, `Muonroi.Observability`, `Muonroi.BuildingBlock.Shared`

**npm (8 packages):**
- Core: `@muonroi/ui-engine-core`, `@muonroi/ui-engine-runtime`
- Components: `@muonroi/ui-engine-rule-components`, `@muonroi/ui-engine-decision-table`
- Tools: `@muonroi/ui-engine-flow-designer`, `@muonroi/ui-engine-expression-editor`
- Patterns: `@muonroi/ui-engine-theming`, `@muonroi/ui-engine-testing`

### Core Capabilities
- **Rule execution** — pipeline, quota enforcement, output derivation
- **Decision tables** — multiple hit policies (First, Unique, Collect, Priority), cell evaluation
- **Multi-tenancy** — tenant context resolution (headers, URL, subdomain), EF query filters
- **Data isolation** — 3 strategies (SharedSchema, SeparateSchema, SeparateDatabase)
- **Ecosystem wrappers** — `IMLog<T>`, `IMDateTimeService`, `IMJsonSerializeService`, `IMRepository<T>`
- **Testing helpers** — fact bag mocking, rule result assertions, time mocking

---

## Commercial Layer

### Packages
Licensed under **Muonroi Commercial License**, distributed through private feed.

**NuGet (24 packages):**
- Governance: `Muonroi.Governance.Enterprise` (HMAC chain, anti-tamper)
- Caching: `Muonroi.Caching.Redis` (distributed invalidation)
- Messaging: `Muonroi.Messaging.MassTransit` (saga orchestration)
- Background jobs: `Muonroi.BackgroundJobs.Hangfire`, `Muonroi.BackgroundJobs.Quartz`
- Real-time: `Muonroi.SignalR` (hot-reload hubs)
- Advanced features: `Muonroi.AuthZ`, `Muonroi.Grpc`, `Muonroi.Secrets`, `Muonroi.Bff`
- Integrations: `Muonroi.ServiceDiscovery.Consul`
- Web surfaces: `Muonroi.RuleEngine.Runtime.Web`, `Muonroi.RuleEngine.DecisionTable.Web`, `Muonroi.UiEngine.Catalog`

### Key Features
- **REST endpoints** — RuleFlow execute, DecisionTable evaluate, versioning APIs
- **SignalR hubs** — RuleSetChangeHub, AuthRuleChangeHub (broadcast to all connected clients on deployment)
- **Enterprise governance** — CodeIntegrityVerifier (SHA256 assembly hashes), AntiTamperDetector (debugger/profiler detection), HMAC chain verification
- **Distributed caching** — Redis invalidation, 3-level cache strategy (RuntimeCache → WorkflowCache → ReflectionRuleCache)
- **Policy decision** — OpenFGA (/check) and OPA (/v1/data/authz/allow) integrations
- **UI components** — Premium Lit elements, catalog versioning, license gating

---

## Private Services Layer

### Control Plane
**31 MCP tools** + **13 dashboard pages**:
- Ruleset CRUD, versioning, export/import
- Approval workflows (submit → review → approve/reject → activate)
- Canary deployments (percentage-based, tenant-targeted rollouts)
- Audit trails (per-workflow and per-tenant history)
- Decision table UI, FEEL autocomplete, dry-run testing
- Flow designer with node library toolbar and version selector

Hosted at `https://cp.truyentm.xyz` with PostgreSQL backend and Redis caching.

### License Server
**RSA-2048 key generation**, activation proof issuance, heartbeat management:
- Generates license keys in `MRR-{base64url}` format
- Issues time-signed activation proofs for offline verification
- Manages revocation, grace periods (24h default), and feature gating
- Provides admin endpoints for key generation, revocation, and whitelist management

Hosted at `https://license.truyentm.xyz` with PostgreSQL backend.

---

## Tier Enforcement

### Startup Registration

#### OSS Applications (Base License Protection)

```csharp
// Program.cs
services.AddLicenseProtection(configuration);
```

Registers:
- `LicenseStore` (reads from file or environment variable)
- `LicenseVerifier` (validates key format and expiry)
- `ILicenseGuard` (scoped service for feature checks)
- `NoopLicenseGuardEnhancer` (no anti-tamper, no HMAC chain)

**appsettings.json:**
```json
{
  "LicenseConfigs": {
    "Mode": "Offline",
    "LicenseFilePath": "licenses/license.key",
    "ActivationProofPath": "licenses/activation_proof.json"
  }
}
```

#### Enterprise Deployments (Full Governance)

```csharp
// Program.cs
services.AddMEnterpriseGovernance(configuration);
```

Registers (in addition to `AddLicenseProtection`):
1. **CodeIntegrityVerifier** — SHA256 hashes of all assemblies, prevents binary tampering
2. **AntiTamperDetector** — Runtime detection of debuggers, profilers, hooks, and breakpoints
3. **EnterpriseLicenseGuardEnhancer** — Fail-closed mode, HMAC chain verification
4. **LicenseHeartbeatService** — Periodic nonce rotation and revocation checks
5. **ChainSubmissionHostedService** — Optional server-side chain validation

**appsettings.json:**
```json
{
  "LicenseConfigs": {
    "Mode": "Online",
    "EnableAntiTampering": true,
    "FailMode": "Hard",
    "Online": {
      "Endpoint": "https://license.truyentm.xyz",
      "EnableHeartbeat": true,
      "HeartbeatIntervalMinutes": 240,
      "RevocationGraceHours": 24
    }
  }
}
```

### Feature Gates at Runtime

All feature checks use `ILicenseGuard`:

```csharp
public class MyService(ILicenseGuard guard)
{
    public void AdvancedOperation()
    {
        guard.EnsureValid("rule-engine");        // Throws if not licensed
        bool hasMultiTenant = guard.HasFeature("multi-tenant");
        LicenseTier tier = guard.Tier;           // Free | Licensed | Enterprise
    }
}
```

Fail-closed behavior: if license check fails at startup, service registration fails immediately rather than silently degrading.

---

## Boundary Enforcement

### Roslyn Code Analyzers

The ecosystem enforces **wrapper-first design** at compile time using Roslyn analyzers:

| Analyzer | Rule | Scope |
|----------|------|-------|
| **MBB001** | Forbidden `DateTime.Now` / `DateTime.UtcNow` — use `IMDateTimeService` | Building Block |
| **MBB002** | Forbidden direct `JsonSerializer` — use `IMJsonSerializeService` | Building Block |
| **MBB003** | Forbidden direct `DbContext` — inherit `MDbContext` | Building Block |
| **MBB004** | Forbidden `ILogger<T>` without scope — use `IMLog<T>` | Building Block |
| **MBB005** | OSS packages must not depend on Commercial packages | Building Block |
| **MBB006** | No private service endpoints in OSS code (CircuitBreaker: fail-closed on missing Control Plane) | Building Block |
| **MBB007** | License guard check required before premium features (gRPC, message bus, cache) | Building Block |

Run diagnostics with:
```bash
dotnet build /p:TreatWarningsAsErrors=true
# or
scripts/check-modular-boundaries.ps1  # PowerShell verification
```

### Dependency Graph Rule
- **OSS** depends on: nothing (standalone)
- **Commercial** depends on: OSS only
- **Private services** depend on: OSS + Commercial

Circular dependencies are forbidden at all levels.

---

## License Keys and Activation

### Key Format
- Format: `MRR-{24-byte base64url}` (51–54 characters)
- Example: `MRR-AQID-BAQE-BAQE-BAQE-BAQE`

### Activation Flow
1. Application reads license key from file or env var (`MUONROI_LICENSE_KEY`)
2. Startup → `LicenseActivator` POSTs to `https://license.truyentm.xyz/api/v1/activate`
3. License Server verifies key, generates signed activation proof
4. Proof saved to `licenses/activation_proof.json` for offline verification
5. Heartbeat background service polls every 4 hours (configurable)

### Offline Verification
Activation proofs are signed with rotating keys. Clients can verify:
- Tier (Free, Licensed, Enterprise)
- Valid date range
- Features (comma-separated string)
- Machine fingerprint
- Heartbeat nonce (for anti-replay)

Public key is bundled with the application.

### Failure Modes
- **Grace period** — License expires but heartbeat not yet called: operate normally for 24 hours (configurable)
- **Hard fail** — After grace period expires: throw exception on first guard check
- **Soft fail** — Degrade to Free tier features only
- **Offline mode** — No heartbeat (air-gapped deployment): use activation proof indefinitely

---

## See Also

- [Architecture Overview](./architecture-overview.md) — Detailed system diagrams and component descriptions
- [License Capability Model](../03-guides/license-governance/license-capability-model.md) — Three-tier feature matrix by tier
- [Tier Enforcement](../03-guides/license-governance/tier-enforcement.md) — Startup pipeline, grace periods, and degradation strategies
- [Ecosystem Coding Rules](../03-guides/ecosystem-coding-rules.md) — MBB analyzer rules and wrapper-first design patterns
- [OSS Boundary](../06-resources/OSS-BOUNDARY.md) — Complete package dependency list and verification script
