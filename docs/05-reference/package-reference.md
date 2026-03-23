---
title: Package Reference
sidebar_label: NuGet & npm Packages
sidebar_position: 2
---

# Package Reference

This guide lists all 62 official packages in the Muonroi ecosystem, organized by category and distribution channel.

## .NET Packages (54 total)

### Overview

| Distribution | Count | License |
|---|---|---|
| **NuGet.org** (OSS) | 18 | MIT |
| **GitHub Packages** (Commercial) | 28 | Proprietary |
| **Private Feed** (Internal) | 8 | Proprietary |

---

### Core & Foundation (6 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.Core.Abstractions` | OSS | NuGet.org | Abstract interfaces: IMDateTimeService, IMJsonSerializeService, ISystemExecutionContextAccessor, ILogScopeFactory |
| `Muonroi.Core` | OSS | NuGet.org | Runtime helpers, wrappers, and common utilities |
| `Muonroi.Logging.Abstractions` | OSS | NuGet.org | `IMLog<T>` interface (inherits `ILogger<T>`), logging scope contracts |
| `Muonroi.Logging` | OSS | NuGet.org | `IMLog<T>` implementation with structured logging |
| `Muonroi.Auditing.Abstractions` | OSS | NuGet.org | IAuditedEntity, IAuditingService contracts |
| `Muonroi.Auditing` | OSS | NuGet.org | Audit trail implementation, change tracking |

### Data & Entity Framework (4 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.Data.EntityFrameworkCore` | OSS | NuGet.org | MDbContext base class, MEntity, ITenantScoped, query filters, migrations infrastructure |
| `Muonroi.Data.Dapper` | OSS | NuGet.org | Lightweight Dapper extension helpers for micro-queries |
| `Muonroi.Data.EntityFrameworkCore.Postgres` | OSS | NuGet.org | PostgreSQL-specific EF extensions, schema generation, full-text search |
| `Muonroi.Data.EntityFrameworkCore.SqlServer` | OSS | NuGet.org | SQL Server-specific EF extensions (legacy, for migration) |

### Authentication & Authorization (6 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.Auth.Abstractions` | OSS | NuGet.org | IAuthenticationService, IAuthorizationService, IPermissionService contracts |
| `Muonroi.Auth` | OSS | NuGet.org | JWT Bearer authentication, permission evaluation |
| `Muonroi.Auth.Web` | Commercial | GitHub Packages | HTTP middleware for auth (authentication, tenant resolution, permission evaluation) |
| `Muonroi.AuthZ` | Commercial | GitHub Packages | Rule-driven authorization engine (Track 7). IMPolicyDecisionService, RuleEngineAuthorizationHandler |
| `Muonroi.Governance.Abstractions` | OSS | NuGet.org | ILicenseGuard, LicensePayload, LicenseState enums, ILicenseGuardEnhancer contracts |
| `Muonroi.Governance` | OSS | NuGet.org | OSS governance implementation, license state tracking |

### Rule Engine (8 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.RuleEngine.Abstractions` | OSS | NuGet.org | `IRule<TContext>`, RuleResult, FactBag, MFactBagAwareRule, ExecutionMode, ICompensatableRule |
| `Muonroi.RuleEngine.Core` | OSS | NuGet.org | RuleOrchestrator, IMRuleWorkflowRunner, MRuleWorkflowDefinition, DI wiring (`AddRuleEngine<T>`) |
| `Muonroi.RuleEngine.Runtime` | OSS | NuGet.org | `RuleEngine<T>`, topological sort, execution plan caching, rule registration |
| `Muonroi.RuleEngine.DecisionTable` | OSS | NuGet.org | DecisionTableExecutor, IFeelCellEvaluator, hit policies (First/Unique/Collect/Priority), OverlapDetector |
| `Muonroi.RuleEngine.Runtime.Web` | Commercial | GitHub Packages | Web integration: RuleSetChangeHub (SignalR), RuntimeRuleSetController, RuleDryRunService, HTTP endpoints |
| `Muonroi.RuleEngine.DecisionTable.Web` | Commercial | GitHub Packages | Decision table web integration: CRUD endpoints, validation, DI wiring (AddDecisionTableWeb) |
| `Muonroi.RuleEngine.Proliferation` | Commercial | GitHub Packages | Rule proliferation engine (Track 9): IRuleProliferationBrain, OllamaProliferationBrain, ScenarioExecutor |
| `Muonroi.RuleEngine.Proliferation.Persistence` | Commercial | GitHub Packages | Proliferation persistence: ProliferationDbContext, EF Core models for scenarios, lineage, results |

### Multi-Tenancy (3 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.Tenancy.Abstractions` | OSS | NuGet.org | ITenantContext, ITenantIdResolver, ITenantScoped marker, TenantQuota model, TenantIsolationStrategy enum |
| `Muonroi.Tenancy.Core` | OSS | NuGet.org | TenantContext (AsyncLocal), DefaultTenantIdResolver, TenantSchemaSelector, ContextMirrorScope, TenantQuotaTracker |
| `Muonroi.Tenancy` | OSS | NuGet.org | TenantResolutionMiddleware, RedisTenantCache, multi-tenant configuration |

### Decision Support (3 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.RuleEngine.Feel` | OSS | NuGet.org | FEEL expression language parser, validator, compiler (FeelExpressionCompiler) |
| `Muonroi.RuleEngine.Liquid` | OSS | NuGet.org | Liquid template language support in rules |
| `Muonroi.RuleEngine.GraphFlow` | OSS | NuGet.org | Flow graph (BPMN) support: RuleGraphParser (Kahn's algorithm), GraphRuleDispatchAdapter, node routing |

### Enterprise & Security (5 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.Governance.Enterprise` | Commercial | GitHub Packages | Enterprise license enforcement: EnterpriseLicenseGuardEnhancer, AntiTamperDetector, CodeIntegrityVerifier, HMAC chain signing (HmacFingerprintSigner), LicenseHeartbeatService |
| `Muonroi.Caching.Abstractions` | OSS | NuGet.org | IDistributedCache contract extensions |
| `Muonroi.Caching.Redis` | Commercial | GitHub Packages | Redis cache implementation, distributed lock patterns, hot-reload cache invalidation |
| `Muonroi.Caching.InMemory` | OSS | NuGet.org | In-memory cache (development/testing only, not thread-safe for production) |
| `Muonroi.Connectors.Abstractions` | OSS | NuGet.org | IConnector, IConnectorRegistry, ConnectorResult contracts |

### Connectors & Integrations (8 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.Connectors.Http` | Commercial | GitHub Packages | HTTP/REST connector, support for GET/POST/PUT/DELETE with headers, auth, retries |
| `Muonroi.Connectors.Database` | Commercial | GitHub Packages | SQL query connector (connection string per tenant, parameterized queries) |
| `Muonroi.Connectors.ServiceBus` | Commercial | GitHub Packages | Azure Service Bus / RabbitMQ message publishing |
| `Muonroi.Connectors.AzureStorage` | Commercial | GitHub Packages | Blob/Table storage read/write |
| `Muonroi.Connectors.Crm` | Commercial | GitHub Packages | Dynamics 365 / Salesforce CRM connector |
| `Muonroi.Connectors.Ai` | Commercial | GitHub Packages | LLM connectors (OpenAI, Claude, Ollama) |
| `Muonroi.Connectors.Registry` | Commercial | GitHub Packages | Connector discovery, validation, metadata management |
| `Muonroi.Connectors.Testing` | Commercial | GitHub Packages | Mock connectors and test helpers |

### Code Generation (5 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.RuleGen` | OSS | NuGet.org | CLI tool for rule extraction: ExtractCommand, VerifyCommand, GenerateTestsCommand |
| `Muonroi.RuleEngine.SourceGenerators` | OSS | NuGet.org | Incremental source generators: ExtractAsRuleGenerator, RuleRegistrationGenerator, analyzers MBB001-MBB007 |
| `Muonroi.RuleEngine.Roslyn` | OSS | NuGet.org | Roslyn semantic analysis: RoslynRuleExtractor, CSharpCompilation helpers |
| `Muonroi.CodeAnalysis.Analyzers` | OSS | NuGet.org | DiagnosticAnalyzers (MBB001-MBB007): DateTime, JSON, DbContext, AsyncLocal violations |
| `Muonroi.CodeAnalysis.CodeFixes` | OSS | NuGet.org | CodeFixProviders for analyzer violations (auto-correction in IDE) |

### Workflow & JSON Rules (4 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.RuleEngine.JsonRules` | OSS | NuGet.org | JSON-based rule definitions (import/export), parser, validator |
| `Muonroi.RuleEngine.Bpmn` | OSS | NuGet.org | BPMN 2.0 workflow support: StartTask, RuleTask, ServiceTask, ExclusiveGateway, EndTask, SubFlow |
| `Muonroi.RuleEngine.Bpmn.Web` | Commercial | GitHub Packages | BPMN web integration: flow designer endpoints, validation, execution tracking |
| `Muonroi.Workflow.Runtime` | Commercial | GitHub Packages | Workflow execution engine: MRuleWorkflowRunner, step execution, compensation LIFO, state persistence |

### Testing & Diagnostics (4 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.Testing.Abstractions` | OSS | NuGet.org | ITestableRule, ITestContext, test scenario models |
| `Muonroi.Testing` | OSS | NuGet.org | xUnit/NUnit rule testing helpers, mock FactBag, rule assertions |
| `Muonroi.Diagnostics` | Commercial | GitHub Packages | Runtime diagnostics: rule execution trace, performance metrics, debugging tools |
| `Muonroi.Diagnostics.OpenTelemetry` | Commercial | GitHub Packages | OTel integration: ActivitySource, Meter, Histogram for rule metrics |

### VSIX & Tooling (3 packages)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.VisualStudio.Extension` | Commercial | Private Feed | Visual Studio Code Lens for [MExtractAsRule], integrated diagnostics layer |
| `Muonroi.VisualStudio.ProjectTemplate` | OSS | Private Feed | VS project template for Muonroi-enabled applications |
| `Muonroi.CommandLine.Tools` | Commercial | Private Feed | Global CLI tools (dotnet muonroi-rulegen install-templates, etc.) |

### License Server (1 package)

| Package | Tier | Distribution | Purpose |
|---|---|---|---|
| `Muonroi.LicenseServer.Client` | Commercial | GitHub Packages | License activation/validation client SDK (used by consumer apps) |

---

## npm Packages (8 total)

### Overview

| Distribution | Count | License |
|---|---|---|
| **npmjs.org** (Public) | 8 | MIT / Proprietary |

---

### UI Engine Core (4 packages - OSS)

| Package | License | Version | Purpose |
|---|---|---|---|
| `@muonroi/ui-engine-core` | MIT | ^2.0.0 | Runtime resolution, manifest schema v1/v2, component registry, Zustand store factories |
| `@muonroi/ui-engine-react` | MIT | ^2.0.0 | React integration: createRoot in shadow DOM, Lit + React hybrid, useState/useEffect helpers |
| `@muonroi/ui-engine-angular` | MIT | ^2.0.0 | Angular integration: dependency injection, component bindings, change detection |
| `@muonroi/ui-engine-primeng` | MIT | ^2.0.0 | PrimeNG component bindings: DataTable, Form, Button, Dialog wrappers for Muonroi components |

### UI Engine Rule Components (4 packages - Commercial)

| Package | License | Version | Purpose |
|---|---|---|---|
| `@muonroi/ui-engine-rule-components` | Proprietary | ^2.0.0 | 23 Lit custom elements (mu-*): RuleEditor, DecisionTableEditor, FlowDesigner, etc. Includes MLicenseVerifier browser JWT validation |
| `@muonroi/ui-engine-rule-components-primeng` | Proprietary | ^2.0.0 | PrimeNG-styled Muonroi components (dark theme, responsive layout) |
| `@muonroi/ui-engine-signalr` | Proprietary | ^2.0.0 | SignalR HubConnection manager: rule-changes, auth-rules, multi-tenant subscriptions |
| `@muonroi/ui-engine-sync` | Proprietary | ^2.0.0 | Real-time sync client: undo/redo (50-action stack), version diff, decision table virtualization (44px rows) |

---

## Package Tier & License Map

### Free Tier Features
Available via:
- `Muonroi.Core`
- `Muonroi.RuleEngine.Abstractions`
- `Muonroi.RuleEngine.Core`
- `Muonroi.RuleEngine.Runtime`
- `Muonroi.RuleEngine.DecisionTable`
- `@muonroi/ui-engine-core`
- `@muonroi/ui-engine-react`
- `@muonroi/ui-engine-angular`
- `@muonroi/ui-engine-primeng`

Free tier allowed actions: `api.validate`, basic rule evaluation, decision tables

### Licensed Tier Features
Additional packages needed:
- `Muonroi.RuleEngine.Runtime.Web`
- `Muonroi.RuleEngine.DecisionTable.Web`
- `Muonroi.Connectors.*`

Licensed tier allowed actions: `vsix.publish`, `vsix.watch`, `vsix.explorer`, `cp.publish` (control plane)

### Enterprise Tier Features
Additional packages needed:
- `Muonroi.Governance.Enterprise`
- `Muonroi.AuthZ`
- `Muonroi.Caching.Redis`
- `Muonroi.Diagnostics.OpenTelemetry`
- `@muonroi/ui-engine-rule-components`
- `@muonroi/ui-engine-signalr`
- `@muonroi/ui-engine-sync`

Enterprise tier allowed actions: `rule-engine`, `multi-tenant`, `advanced-auth`, `audit-trail`, `anti-tampering`, gRPC, distributed cache

---

## Installation Guide

### NuGet.org (OSS Packages)

```bash
dotnet add package Muonroi.Core
dotnet add package Muonroi.RuleEngine.Runtime
dotnet add package Muonroi.Tenancy
```

### GitHub Packages (Commercial)

First, configure GitHub token:

```bash
dotnet nuget add source \
  --name github \
  --username YOUR_GITHUB_USERNAME \
  --password YOUR_GITHUB_PAT \
  https://nuget.pkg.github.com/muonroi/index.json
```

Then install:

```bash
dotnet add package Muonroi.RuleEngine.Runtime.Web \
  --source github
```

### npm Registry

```bash
npm install @muonroi/ui-engine-core
npm install @muonroi/ui-engine-rule-components  # Commercial
```

For commercial packages, ensure `.npmrc` contains:

```
@muonroi:registry=https://npm.pkg.github.com
```

---

## Version Compatibility

All packages follow semantic versioning: MAJOR.MINOR.PATCH

| Muonroi Version | .NET Target | Node | TypeScript |
|---|---|---|---|
| 2.x | .NET 8+ | 18+ | 5.0+ |
| 1.x | .NET 6+ | 16+ | 4.9+ |

Cross-package compatibility within same major version is guaranteed.

---

## Known Dependencies

### Implicit Transitive Dependencies

When installing `Muonroi.RuleEngine.Runtime.Web`, you automatically get:
- Muonroi.RuleEngine.Runtime
- Muonroi.RuleEngine.Core
- Muonroi.RuleEngine.Abstractions
- Muonroi.Auth.Web
- Muonroi.Tenancy
- Muonroi.Caching.Abstractions
- Microsoft.EntityFrameworkCore

When installing `Muonroi.Governance.Enterprise`, you automatically get:
- Muonroi.Governance
- Muonroi.Governance.Abstractions
- System.Reflection (for assembly verification)

### External Dependencies

| Package | Requires |
|---|---|
| `Muonroi.RuleEngine.Runtime.Web` | ASP.NET Core 8+, EF Core 8+, SignalR |
| `Muonroi.Caching.Redis` | StackExchange.Redis |
| `@muonroi/ui-engine-rule-components` | lit, zustand, monaco-editor |

---

## Support & Updates

- **OSS Packages** (NuGet.org): Community support, regular updates, security patches
- **Commercial Packages** (GitHub): Priority support, quarterly updates, guaranteed SLA
- **npm Packages**: Published to public registry, pinned to stable versions

For detailed package documentation, see individual guides:
- Rule Engine: [rule-engine-guide.md](../../03-guides/rule-engine/rule-engine-guide.md)
- Multi-Tenancy: [tenant-isolation.md](../../03-guides/multi-tenancy/tenant-isolation.md)
- License Server: [license-setup.md](../../03-guides/license/license-setup.md)

