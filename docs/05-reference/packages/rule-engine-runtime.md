---
title: Rule Engine Runtime Packages
sidebar_label: Rule Engine Runtime
sidebar_position: 7
---

# Rule Engine Runtime Packages

This page documents the runtime execution packages that make up the Muonroi Rule Engine stack. These packages handle rule storage, approval workflow, canary deployment, hot-reload, CEP windowing, decision table execution, NRules bridging, AI-driven scenario proliferation, and EF Core persistence.

---

## Muonroi.RuleEngine.Runtime

**NuGet:** `Muonroi.RuleEngine.Runtime` | **Tier:** Commercial (Licensed+) | **Distribution:** GitHub Packages

### Purpose

Core runtime layer. Provides `RulesEngineService` — the primary façade for loading, executing, validating, and dry-running workflow rulesets. Supports three ruleset shapes: legacy Microsoft RulesEngine JSON, code-based (rule codes that resolve to DI-registered `IRule<TContext>`), and flow-graph (BPMN-style node/edge JSON parsed by `RuleGraphParser`). Includes runtime caching, Redis pub/sub hot-reload, FEEL and Liquid rule adapters, audit signing, and canary rollout support.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `RulesEngineService` | Service (scoped) | Main façade — `ExecuteAsync`, `ExecuteWithResultAsync`, `DryRunAsync`, `SaveRuleSetAsync`, `SetActiveVersionAsync`, `GetVersionDetailsAsync` |
| `RuleEngine<T>` | Service | Code-first engine for registering and executing `IRule<T>` instances with dependency ordering |
| `IRuleSetStore` | Interface | Ruleset persistence contract (`SaveAsync`, `GetAsync`, `GetVersionsAsync`, `SetActiveVersionAsync`) |
| `IRuleSetAuditStore` | Interface | Audit trail persistence (`AppendAsync`, `QueryAsync`) |
| `IRuleSetApprovalService` | Interface | Maker-checker approval workflow |
| `ICanaryRolloutService` | Interface | Canary version targeting per tenant |
| `IRuleActivationStrategy<T>` | Interface | Pluggable rule activation filter |
| `IRuleSetSigner` | Interface | HMAC/RSA ruleset signing |
| `FileRuleSetStore` | Implementation | File-system ruleset store (all tiers) |
| `FileRuleSetAuditStore` | Implementation | File-system audit store |
| `RuleSetRuntimeCache` | Implementation | `IMemoryCache`-backed per-tenant ruleset cache with invalidation |
| `WorkflowCacheTelemetry` | Service | OTel metrics: hit/miss counters, eviction counter, cache size gauge, hot-reload lag histogram |
| `RuleSetStatus` | Enum | Ruleset lifecycle states |
| `RuleControlPlaneOptions` | Options | `RequireApproval`, `NotifyOnStateChange`, `EnableCanary`, audit signing keys |
| `RuleStoreConfigs` | Options | `RootPath`, `EnableRuntimeCache`, `RuleChangeChannel` |
| `FeelRuleAdapter<T>` | Adapter | FEEL expression → FactBag output |
| `LiquidRuleAdapter<T>` | Adapter | Liquid/Scriban template rules |
| `GraphRuleDispatchAdapter<T>` | Adapter | Flow-graph node dispatch with branching |
| `DecisionTableRuleAdapter<T>` | Adapter | Inline decision table node in a flow graph |
| `SubFlowRuleAdapter<T>` | Adapter | Recursive sub-flow calls within a flow graph |
| `ConnectorRuleAdapter<T>` | Adapter | External service connector nodes |
| `JavaScriptRuleAdapter<T>` | Adapter | Jint-based JavaScript condition nodes |
| `RuleGraphParser` | Service | Parses flow-graph JSON using Kahn's topological sort |
| `HmacSha256RuleSetSigner` | Implementation | HMAC-SHA256 ruleset signing |
| `RsaRuleSetAuditSigner` | Implementation | RSA audit trail signing |
| `InMemoryRuleSetChangeNotifier` | Implementation | In-process hot-reload notifications |
| `RedisRuleSetChangeNotifier` | Implementation | Redis pub/sub cross-node hot-reload |
| `ExternalJsonRule` | Implementation | JSON-serialized rule definition |
| `MRuleContextJsonRegistry` | Service | Type-safe context deserialization registry |
| `RuleSetDefinitionValidator` | Service | Validates ruleset JSON structure before persistence |

### RuleSetStatus Lifecycle

```
Draft → PendingApproval → Active → Archived
         ↓ (rejected)
       Rejected
```

- **Draft** — ruleset saved but not yet submitted for review.
- **PendingApproval** — submitted; awaiting maker-checker approval.
- **Active** — current live version served to all rule executions.
- **Archived** — superseded version retained for audit history.
- **Rejected** — approval was denied; returned to Draft or discarded.

When `RuleControlPlaneOptions.RequireApproval = true`, a ruleset must pass through `IRuleSetApprovalService.ApproveAsync()` before `SetActiveVersionAsync` will serve it to callers.

### Canary Deployment

`ICanaryRolloutService` assigns a specific ruleset version to a named tenant cohort. When `RulesEngineService` resolves a workflow, it calls `GetCanaryVersionForTenantAsync(workflowName, tenantId)` first; if a canary version is assigned the canary version is loaded, bypassing the default active version. All other tenants continue using the active version.

Enable with:

```csharp
services.Configure<RuleControlPlaneOptions>(o => o.EnableCanary = true);
services.TryAddScoped<ICanaryRolloutService, CanaryRolloutService>(); // provided by EFCore package
```

### DI Registration

```csharp
// File-backed store (all tiers — Free, Licensed, Enterprise)
services.AddRuleEngineStore(configuration, configure: o =>
{
    o.RootPath = "rules";
    o.EnableRuntimeCache = true;
    o.RuleChangeChannel = "rule-change";
});

// Optional: Redis cross-node hot-reload
services.AddMRuleEngineWithRedisHotReload(
    configuration.GetConnectionString("Redis")!);

// Optional: CloudEvents bridge for ruleset lifecycle events
services.AddRuleEventBridge();
```

### Usage Example

```csharp
// Inject RulesEngineService (scoped)
public class OrderHandler(RulesEngineService rulesEngine)
{
    public async Task ProcessAsync(OrderContext ctx, CancellationToken ct)
    {
        // Dry-run to validate before committing
        FactBag preview = await rulesEngine.DryRunAsync(
            "order-workflow",
            json: await rulesEngine.GetRuleSetAsync("order-workflow") ?? "",
            context: JsonSerializer.SerializeToElement(ctx),
            contextType: typeof(OrderContext).FullName,
            ct);

        // Full execution (Phase 1 + Phase 2)
        OrchestratorResult result = await rulesEngine.ExecuteWithResultAsync(
            "order-workflow", ctx, ct);

        if (!result.IsSuccess)
            throw new InvalidOperationException(string.Join("; ", result.Errors));

        string? orderId = result.Facts.Get<string>("order.id");
    }
}
```

---

## Muonroi.RuleEngine.Runtime.Web

**NuGet:** `Muonroi.RuleEngine.Runtime.Web` | **Tier:** Commercial (Licensed+) | **Distribution:** GitHub Packages

### Purpose

ASP.NET web layer for the runtime engine. Exposes REST endpoints for ruleset lifecycle management (CRUD, activate, validate, dry-run, audit), a SignalR hub for real-time hot-reload notifications, and the rule flow contract discovery endpoint. Requires `LicenseTier.Licensed` or above.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `RuntimeRuleSetController` | Controller | REST endpoints for ruleset management |
| `MRuleFlowContractController` | Controller | Rule flow schema discovery |
| `MRuleFlowExecuteController` | Controller | Direct flow-graph execution |
| `RuleSetChangeHub` | SignalR hub | Real-time ruleset change notifications to clients |
| `RuleSetHubNotifier` | Hosted service | Subscribes to `IRuleSetChangeNotifier` and pushes to SignalR hub |
| `RuleDryRunService` | Service | Dry-run execution without side effects |
| `IMRuleFlowContractProvider` | Interface | Rule flow JSON schema provider |
| `RuleSetHotReloadClient` | Client | Subscribes to a remote `RuleSetChangeHub` |

### Key REST Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/v1/rule-engine/rulesets` | List all workflows with version summaries |
| `GET` | `/api/v1/rule-engine/rulesets/{workflow}/versions` | Paginated version details (`limit`, `offset`) |
| `GET` | `/api/v1/rule-engine/rulesets/{workflow}/export` | Export ruleset JSON for a workflow/version |
| `POST` | `/api/v1/rule-engine/rulesets/{workflow}` | Save a new ruleset version |
| `POST` | `/api/v1/rule-engine/rulesets/{workflow}/activate/{version}` | Activate a specific version |
| `POST` | `/api/v1/rule-engine/rulesets/{workflow}/validate` | Validate a ruleset definition (no save) |
| `POST` | `/api/v1/rule-engine/rulesets/{workflow}/dry-run` | Dry-run a ruleset against a context payload |
| `GET` | `/api/v1/rule-engine/rulesets/{workflow}/audit` | Paginated audit history for a workflow |
| `GET` | `/api/v1/rule-flow/contract` | Rule flow JSON schema for the UI designer |

### SignalR Hub

```
wss://{host}/hubs/rule-set-change
```

Clients subscribe to receive `RuleSetChangeEvent` messages when a ruleset is saved, activated, or invalidated. Used by the UI engine for hot-reload without page refresh.

### DI Registration

```csharp
builder.Services.AddRuleEngineRuntimeWeb(builder.Configuration);

// Map SignalR hub (in app.MapHub calls)
app.MapHub<RuleSetChangeHub>("/hubs/rule-set-change");
```

### Usage Example

```csharp
// POST /api/v1/rule-engine/rulesets/order-workflow
{
  "ruleSet": { /* workflow JSON */ },
  "activateAfterSave": true,
  "actor": "alice@example.com"
}

// POST /api/v1/rule-engine/rulesets/order-workflow/dry-run
{
  "ruleSet": { /* workflow JSON */ },
  "context": { "amount": 500, "customerId": "c-123" },
  "contextType": "MyApp.OrderContext"
}
```

---

## Muonroi.RuleEngine.CEP

**NuGet:** `Muonroi.RuleEngine.CEP` | **Tier:** Commercial (Licensed+) | **Distribution:** GitHub Packages

### Purpose

Complex Event Processing (CEP) engine for stateful, time-windowed rule evaluation. Evaluates decisions that depend on event sequences, time correlation keys (user ID, session ID, device ID), or burst thresholds. Ships with in-memory window state, durable config storage via EF Core, and a REST/simulation controller.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `CepEngine<T>` | Service | Core windowing engine — `AddEvent(key, value, timestamp)` returns the active window |
| `CepEvent<T>` | Record | Event container: `Key`, `Timestamp`, `Value` |
| `WindowType` | Enum | `Sliding`, `Tumbling` |
| `CepWindowBuilder` | Static builder | Fluent DSL for `CepConfig` and `CepWindow<T>` creation |
| `CepWindow<T>` | Runtime wrapper | Binds `CepConfig` to a typed payload with key selector |
| `CepConfig` | Model | Persisted config: `WindowType`, `WindowSize`, `TimeToLive`, `CorrelationKey`, `TenantId` |
| `ICepConfigRepository` | Interface | Config CRUD contract |
| `InMemoryCepConfigRepository` | Implementation | Process-local config storage |
| `EfCoreCepConfigRepository` | Implementation | Postgres/SQL Server config storage |
| `CepConfigDatabaseMigrator` | Hosted service | Auto-migrates CEP config table at startup |
| `CepController` | Controller | REST CRUD + simulation for CEP configs |
| `CepMetrics` | Service | OTel: `cep.events.processed`, `cep.window.evaluations`, `cep.window.event.count`, `cep.config.reads/writes` |

### Window Types

**Sliding** — answers "what happened in the last X time units relative to this event?" Events from `now - windowSize` to `now` are included. Use for burst detection, rate limits, fraud spikes.

**Tumbling** — answers "which fixed bucket does this event belong to?" The window boundary is computed as `floor(event.Ticks / windowSize.Ticks) * windowSize.Ticks`. Use for fixed reporting buckets, billing summaries, non-overlapping aggregations.

**Session** — grouping by inactivity gap (host-defined; not built-in to the package — implement as a key-expiry wrapper around `CepEngine<T>`).

### Key REST Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/v1/rule-engine/cep` | List all CEP configs ordered by name |
| `GET` | `/api/v1/rule-engine/cep/{id}` | Get one config by ID |
| `PUT` | `/api/v1/rule-engine/cep/{id}` | Save or update a config |
| `DELETE` | `/api/v1/rule-engine/cep/{id}` | Delete a config |
| `POST` | `/api/v1/rule-engine/cep/{id}/simulate` | Simulate event batches against a config |

### DI Registration

```csharp
// In-memory config store (default)
builder.Services.AddControllers();
builder.Services.AddCepWeb();

// Postgres config persistence
builder.Services.AddCepWeb(options =>
{
    options.PostgresConnectionString = builder.Configuration
        .GetConnectionString("RuleEngineDb");
    options.Schema = "ruleengine";
});
```

### Usage Example

```csharp
// Low-level engine (no ASP.NET required)
var engine = new CepEngine<TransactionEvent>(
    TimeSpan.FromSeconds(30),
    WindowType.Sliding,
    ttl: TimeSpan.FromMinutes(2));

IReadOnlyList<CepEvent<TransactionEvent>> window = engine.AddEvent(
    key: "customer-42",
    value: new TransactionEvent(250m, "card"),
    timestamp: DateTime.UtcNow);

if (window.Count >= 3)
{
    // threshold crossed — trigger rule engine evaluation
}

// Fluent builder approach
CepConfig config = CepWindowBuilder
    .Named("fraud-window")
    .ForTenant("tenant-a")
    .Sliding(TimeSpan.FromSeconds(30))
    .KeepEventsFor(TimeSpan.FromMinutes(2))
    .CorrelateBy("customerId")
    .Build();

CepWindow<TransactionEvent> window2 = CepWindowBuilder
    .For<TransactionEvent>(config)
    .CorrelateBy(evt => evt.CustomerId)
    .Build();

IReadOnlyList<CepEvent<TransactionEvent>> events = window2.Add(txEvent, DateTime.UtcNow);
```

---

## Muonroi.RuleEngine.NRules

**NuGet:** `Muonroi.RuleEngine.NRules` | **Tier:** Commercial | **Distribution:** GitHub Packages

> **Status: Frozen.** This package is no longer actively developed. New implementations should use `Muonroi.RuleEngine.Runtime` instead. The package is preserved for projects that already depend on NRules.

### Purpose

Thin integration bridge between the Muonroi ecosystem and [NRules](https://github.com/NRules/NRules) — a .NET production rules engine with Rete algorithm. Loads rule definitions from assemblies, compiles them into a session factory, and fires rules against inserted facts. Supports per-rule enable/disable toggles and version pinning via `RuleOptions`.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `NRulesEngine` | Service (singleton) | Loads assemblies, compiles NRules session factory, executes `Fire(facts[])` |
| `RuleAttribute` | Attribute | `[Rule(Name, Version)]` — names and versions a rule class for toggle support |
| `RuleOptions` | Options | Per-rule enable/disable flags and version pinning |

### NRules Integration Pattern

NRules rules are declared using the standard NRules `Rule` base class. The `[RuleAttribute]` metadata integrates with `RuleOptions` to allow runtime toggling without code changes.

```csharp
[Rule(Name = "HighValueOrder", Version = "1.0")]
public class HighValueOrderRule : Rule
{
    public override void Define()
    {
        OrderContext order = default!;

        When()
            .Match<OrderContext>(() => order, o => o.Amount > 1000);

        Then()
            .Do(_ => order.ApplyDiscount(0.10m));
    }
}
```

### DI Registration

```csharp
// Register NRulesEngine (frozen API — prefer RuleEngine.Runtime for new work)
#pragma warning disable CS0618
builder.Services.AddNRulesEngine(
    configure: options =>
    {
        options.Rules["HighValueOrder"] = new RuleConfig { Enabled = true, Version = "1.0" };
    },
    typeof(HighValueOrderRule).Assembly);
#pragma warning restore CS0618
```

### Usage Example

```csharp
public class OrderService(NRulesEngine engine)
{
    public void Apply(OrderContext order)
    {
        engine.Fire(order); // inserts facts, fires matching rules
    }
}
```

---

## Muonroi.RuleEngine.DecisionTable

**NuGet:** `Muonroi.RuleEngine.DecisionTable` | **Tier:** Commercial (Licensed+) | **Distribution:** GitHub Packages

### Purpose

DMN-style decision table engine. Tables are organized as a grid of input conditions (FEEL unary tests) and output expressions, evaluated according to a hit policy. Supports import from Excel and DMN 1.3 XML, export to JSON/XML/CSV, version snapshots, overlap/gap detection, and integration into flow graph nodes via `DecisionTableRuleAdapter`.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IDecisionTableExecutor` | Interface | `ExecuteAsync(table, inputFacts, ct) → DecisionTableExecutionResult` |
| `DecisionTableExecutor` | Implementation | Hit policy dispatch: Unique, Any, First, All, Collect, RuleOrder, Priority, CollectSum, CollectMin, CollectMax, CollectCount |
| `DecisionTable` | Model | Table definition: `Id`, `Name`, `HitPolicy`, `InputColumns`, `OutputColumns`, `Rows`, `Version`, `TenantId` |
| `HitPolicy` | Enum | 9 hit policies matching DMN 1.3 |
| `DecisionTableExecutionResult` | Record | Matched rows + computed output values |
| `IDecisionTableStore` | Interface | `CreateAsync`, `ReadAsync`, `UpdateAsync`, `DeleteAsync`, `ListAsync`, `UpsertAsync` |
| `InMemoryDecisionTableStore` | Implementation | Volatile in-process store |
| `EfCoreDecisionTableStore` | Implementation | Postgres/SQL Server persistent store |
| `DecisionTableDbContext` | EF context | Schema for table and row persistence |
| `DecisionTableDatabaseMigrator` | Hosted service | Auto-migrates at startup |
| `IFeelCellEvaluator` | Interface | `Evaluate(expr, actual, dataType) → bool` |
| `FullFeelCellEvaluator` | Implementation | Complete FEEL support (`> 100`, `[1..10]`, `"Gold","Silver"`, `-`, arithmetic) |
| `SimplifiedFeelCellEvaluator` | Implementation | Subset dialect for simple unary tests |
| `DecisionTableValidator` | Service | Structural validation |
| `OverlapDetector` | Service | Single-column condition overlaps |
| `MultiColumnOverlapDetector` | Service | Multi-column conflict detection |
| `GapDetector` | Service | Input coverage gap detection |
| `RedundancyDetector` | Service | Redundant row detection |
| `ExcelToDecisionTableConverter` | Utility | Excel → DecisionTable model |
| `DmnImporter` / `DmnExporter` | Utilities | DMN 1.3 XML import/export |
| `DecisionTableDiffer` | Service | Version diff with row/cell-level change tracking |

### DI Registration

```csharp
// In-memory store
services.AddDecisionTableEngine();

// Postgres store
services.AddDecisionTableEngine(options =>
{
    options.PostgresConnectionString = configuration.GetConnectionString("RuleEngineDb");
});

// SQL Server store
services.AddDecisionTableEngine(options =>
{
    options.SqlServerConnectionString = configuration.GetConnectionString("RuleEngineDb");
});
```

### Usage Example

```csharp
// Execute a decision table
var executor = services.GetRequiredService<IDecisionTableExecutor>();
var store    = services.GetRequiredService<IDecisionTableStore>();

DecisionTable table = await store.ReadAsync("discount-table-001", ct);

DecisionTableExecutionResult result = await executor.ExecuteAsync(
    table,
    inputFacts: new Dictionary<string, object?>
    {
        ["CustomerType"] = "Gold",
        ["OrderAmount"]  = 750m
    },
    ct);

// result.MatchedRows  — rows that matched
// result.OutputValues — computed output key/value pairs
decimal discount = (decimal)(result.OutputValues["Discount"] ?? 0);
```

---

## Muonroi.RuleEngine.DecisionTable.Web

**NuGet:** `Muonroi.RuleEngine.DecisionTable.Web` | **Tier:** Commercial (Licensed+) | **Distribution:** GitHub Packages

### Purpose

ASP.NET web layer for decision table management. Exposes REST endpoints for CRUD, FEEL evaluation, validation, export/import, and DMN compatibility. Requires `LicenseTier.Licensed` or above. Contributes a UI manifest entry to the Muonroi UI engine catalog.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `DecisionTableController` | Controller | Main CRUD + execution endpoints |
| `DecisionTableFeelController` | Controller | Evaluate a FEEL expression against sample data |
| `DecisionTableValidationController` | Controller | Validate table structure and FEEL syntax |
| `DecisionTableExportController` | Controller | Export as JSON, DMN XML, or CSV |
| `DecisionTableCompatControllerBase` | Base | Shared response shaping |

### Key REST Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/v1/decision-tables` | List tables (paged, filterable by tenant) |
| `POST` | `/api/v1/decision-tables` | Create a new decision table |
| `GET` | `/api/v1/decision-tables/{id}` | Get a table by ID |
| `PUT` | `/api/v1/decision-tables/{id}` | Update a table |
| `DELETE` | `/api/v1/decision-tables/{id}` | Delete a table |
| `POST` | `/api/v1/decision-tables/{id}/execute` | Execute a table against input facts |
| `POST` | `/api/v1/decision-tables/{id}/feel` | Evaluate a FEEL expression with sample input |
| `POST` | `/api/v1/decision-tables/validate` | Validate table structure |
| `GET` | `/api/v1/decision-tables/{id}/export` | Export (`?format=json\|dmn\|csv`) |
| `POST` | `/api/v1/decision-tables/import` | Import from Excel or DMN XML (`multipart/form-data`) |
| `GET` | `/api/v1/decision-tables/{id}/versions` | Version history |
| `GET` | `/api/v1/decision-tables/{id}/versions/{v1}/diff/{v2}` | Column/row diff between two versions |

### DI Registration

```csharp
builder.Services.AddDecisionTableWeb(options =>
{
    options.PostgresConnectionString = builder.Configuration
        .GetConnectionString("RuleEngineDb");
});
```

### Usage Example

```http
POST /api/v1/decision-tables/discount-table-001/execute
Content-Type: application/json

{
  "customerType": "Gold",
  "orderAmount": 750
}
```

Response:
```json
{
  "matchedRows": [1],
  "outputs": { "Discount": 15, "FreeShipping": true }
}
```

---

## Muonroi.RuleEngine.EntityFrameworkCore

**NuGet:** `Muonroi.RuleEngine.EntityFrameworkCore` | **Tier:** Commercial (Licensed+) | **Distribution:** GitHub Packages

### Purpose

EF Core persistence layer for the rule engine runtime. Replaces the file-backed `FileRuleSetStore` with `PostgresRuleSetStore`, provides approval workflow via `RuleSetApprovalService`, canary deployment via `CanaryRolloutService`, and Postgres row-level security (RLS) via `TenantRlsConnectionInterceptor`. Manages the `RuleEngineDbContext` with versioned migrations.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `PostgresRuleSetStore` | Implementation | Postgres-backed `IRuleSetStore` |
| `PostgresRuleSetAuditStore` | Implementation | Postgres-backed `IRuleSetAuditStore` |
| `RuleSetApprovalService` | Implementation | `IRuleSetApprovalService` — maker-checker approval workflow |
| `CanaryRolloutService` | Implementation | `ICanaryRolloutService` — version targeting per tenant |
| `RuleEngineDbContext` | EF context | Tables: `RuleSetRecords`, `RuleSetAuditRecords`, `TenantRuleAssignments`, `TenantQuotaOverrides` |
| `TenantRlsConnectionInterceptor` | Interceptor | Sets `app.current_tenant_id` session variable for Postgres RLS policies |
| `TenantQuotaOverrideRecord` | Entity | Per-tenant quota overrides for concurrency and evaluation limits |
| `TenantRuleAssignmentRecord` | Entity | Canary version assignments keyed by `(TenantId, WorkflowName)` |

### Migrations

| Migration | Description |
|-----------|-------------|
| `20260306055106_InitialRuleControlPlane` | Initial schema: rulesets, audit, assignments |
| `20260325000000_AddRowLevelSecurityPolicies` | Postgres RLS policies for tenant isolation |

### DI Registration

```csharp
// Replaces FileRuleSetStore with Postgres; registers approval + canary services
builder.Services.AddMRuleEngineWithPostgres(
    connectionString: builder.Configuration.GetConnectionString("RuleEngineDb")!,
    configureOptions: options =>
    {
        options.RequireApproval = true;
        options.NotifyOnStateChange = true;
        options.EnableCanary = true;
        // Optional: inline PEM for audit signing
        // options.AuditPrivateKeyPemPath = "/run/secrets/audit-rsa.pem";
    });

// Optional: enable Redis cross-node hot-reload
builder.Services.AddMRuleEngineWithRedisHotReload(
    builder.Configuration.GetConnectionString("Redis")!);

// Optional: enable approval workflow explicitly
builder.Services.AddMRuleEngineApprovalWorkflow();

// Optional: enable canary rollout explicitly
builder.Services.AddMCanaryRollout();
```

---

## Muonroi.RuleEngine.Proliferation

**NuGet:** `Muonroi.RuleEngine.Proliferation` | **Tier:** Commercial (Enterprise) | **Distribution:** GitHub Packages

### Purpose

AI-powered scenario proliferation engine. Analyzes a ruleset definition and uses a language model (Ollama, OpenAI, or Claude) to autonomously generate test scenarios, execute them against the rule engine, analyze failures, deduplicate scenarios (hash and vector-semantic), and produce coverage reports. Designed for CI/CD pipeline gates and continuous rule quality assurance. Ships with in-memory store; replace with `Muonroi.RuleEngine.Proliferation.Persistence` for Postgres durability.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IRuleProliferationBrain` | Interface | `AnalyzeAsync(seedRuleCode, ruleSetJson, executionResult, factBagSnapshot, context, ct) → ProliferationPlan` |
| `OllamaProliferationBrain` | Implementation | Ollama local LLM backend |
| `OpenAiProliferationBrain` | Implementation | OpenAI API backend |
| `ClaudeProliferationBrain` | Implementation | Anthropic Claude API backend |
| `CompositeProliferationBrain` | Implementation | Sequential or parallel multi-brain fallback chain |
| `IScenarioExecutor` | Interface | Executes generated scenarios against the runtime |
| `ScenarioExecutor` | Implementation | Internal rule engine executor |
| `ExternalScenarioExecutor` | Implementation | HTTP-based executor for external project rulesets |
| `RoutingScenarioExecutor` | Implementation | Routes between internal and external execution |
| `IProliferationStore` | Interface | Scenario and result persistence |
| `InMemoryProliferationStore` | Implementation | Volatile in-process store |
| `ProliferationWorker` | Hosted service | Background worker that drains the proliferation queue |
| `NeuronScenario` | Record | Generated scenario: `Id`, `SeedRuleCode`, `ScenarioName`, `Type`, `Scope`, `InputFacts`, `ExpectedBehavior`, `Status` |
| `ScenarioResult` | Record | Execution result: `IsSuccess`, `MatchesExpectation`, `OutputFacts`, `Errors`, `Duration` |
| `ProliferationPlan` | Record | Brain output: `SeedRuleCode`, `Scope`, `Scenarios`, `AiModelUsed`, `GenerationDuration` |
| `ProliferationStats` | Record | Aggregate pass/fail/coverage statistics |
| `CiRunResult` | Record | CI/CD gate result with coverage thresholds |
| `ScenarioStatus` | Enum | `Pending`, `Running`, `Passed`, `Failed`, `Error`, `Skipped` |
| `ProliferationScope` | Enum | `Rule`, `Workflow`, `CrossRule` |
| `IScenarioDeduplicator` | Interface | Hash-based or vector-semantic deduplication |
| `InputHashDeduplicator` | Implementation | SHA-256 hash deduplication |
| `VectorSemanticDeduplicator` | Implementation | Ollama embedding + cosine similarity deduplication |
| `IBudgetAllocator` | Interface | Coverage-weighted scenario budget allocation |
| `CoverageWeightedBudgetAllocator` | Implementation | Allocates more budget to low-coverage branches |
| `ICoverageTracker` | Interface | Tracks field, node, and edge coverage across runs |
| `IFailureAnalyzer` | Interface | Classifies failures and proposes follow-up scenarios |
| `ChaosScenarioGenerator` | Service | Generates edge-case and chaos scenarios |
| `NaturalLanguageRuleConverter` | Service | Translates natural language descriptions into ruleset JSON |
| `TestReportExporter` | Service | Exports reports as TRX, xUnit XML, or custom formats |
| `ProliferationOptions` | Options | `BrainProvider`, `CompositeBrains`, `CompositeMode`, `AiTimeoutSeconds`, `EnableSemanticDedup`, `EnableInfraAwareBudget` |

### DI Registration

```csharp
builder.Services.AddMProliferationEngine(builder.Configuration);

// appsettings.json
{
  "Proliferation": {
    "BrainProvider": "ollama",
    "OllamaBaseUrl": "http://localhost:11434",
    "OllamaModel": "llama3",
    "AiTimeoutSeconds": 120,
    "EnableSemanticDedup": true,
    "EnableInfraAwareBudget": false,
    "CompositeBrains": "",
    "CompositeMode": "sequential"
  }
}
```

### Usage Example

```csharp
// Trigger a proliferation run
var brain = services.GetRequiredService<IRuleProliferationBrain>();
var executor = services.GetRequiredService<IScenarioExecutor>();
var store = services.GetRequiredService<IProliferationStore>();

string ruleSetJson = await rulesEngine.GetRuleSetAsync("fraud-detection") ?? "";

ProliferationPlan plan = await brain.AnalyzeAsync(
    seedRuleCode: "detect-fraud",
    ruleSetJson: ruleSetJson,
    executionResult: null,
    factBagSnapshot: null,
    context: new ProliferationContext
    {
        Scope = ProliferationScope.Workflow,
        RemainingBudget = 20,
        TenantId = "tenant-a"
    });

foreach (NeuronScenario scenario in plan.Scenarios)
{
    ScenarioResult result = await executor.ExecuteAsync(scenario);
    await store.SaveResultAsync(result);
}

ProliferationStats stats = await store.GetStatsAsync("detect-fraud");
Console.WriteLine($"Pass rate: {stats.Passed}/{stats.TotalScenarios}");
```

---

## Muonroi.RuleEngine.Proliferation.Persistence

**NuGet:** `Muonroi.RuleEngine.Proliferation.Persistence` | **Tier:** Commercial (Enterprise) | **Distribution:** GitHub Packages

### Purpose

Postgres persistence layer for the proliferation engine. Replaces the in-memory `InMemoryProliferationStore` with `PostgresProliferationStore` backed by `ProliferationDbContext`. Persists generated scenarios (`NeuronScenarioEntity`), execution results (`ScenarioResultEntity`), and rule lineage (`RuleLineageEntity`) across application restarts. Required in production when CI runs must retain history and coverage data across deployments.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `PostgresProliferationStore` | Implementation | Postgres-backed `IProliferationStore` |
| `ProliferationDbContext` | EF context | Tables: `NeuronScenarios`, `ScenarioResults`, `RuleLineage` |
| `NeuronScenarioEntity` | Entity | Persisted scenario: id, seed rule code, input facts (JSONB), status |
| `ScenarioResultEntity` | Entity | Execution result: success, match, output facts (JSONB), errors, duration |
| `RuleLineageEntity` | Entity | Scenario lineage: parent ID, depth, reason |

### DI Registration

```csharp
// Call after AddMProliferationEngine — replaces the in-memory store
builder.Services.AddMProliferationEngine(builder.Configuration);
builder.Services.AddMProliferationPostgres(
    builder.Configuration.GetConnectionString("RuleEngineDb")!);
```

### Usage Example

After registering `AddMProliferationPostgres`, the `IProliferationStore` resolved from DI is the Postgres-backed implementation. No application code changes are needed — usage is identical to the in-memory store.

```csharp
// Postgres store is injected automatically
var store = services.GetRequiredService<IProliferationStore>();

await store.SaveScenarioAsync(scenario);
await store.SaveResultAsync(result);
ProliferationStats stats = await store.GetStatsAsync(seedRuleCode: "detect-fraud");
```

The `ProliferationDbContext` uses Npgsql and stores `InputFacts`/`OutputFacts` as `jsonb` columns for efficient querying. Apply EF Core migrations using `dotnet ef database update` or `DbContext.Database.MigrateAsync()` at startup.

---

## Package Dependency Map

```
Muonroi.RuleEngine.Runtime
  └─ Muonroi.RuleEngine.Core (orchestrator, quota, tracing)
       └─ Muonroi.RuleEngine.Abstractions (IRule, FactBag, RuleResult)

Muonroi.RuleEngine.Runtime.Web
  └─ Muonroi.RuleEngine.Runtime

Muonroi.RuleEngine.EntityFrameworkCore
  └─ Muonroi.RuleEngine.Runtime (stores approval, canary)

Muonroi.RuleEngine.DecisionTable
  └─ Muonroi.RuleEngine.Abstractions

Muonroi.RuleEngine.DecisionTable.Web
  └─ Muonroi.RuleEngine.DecisionTable

Muonroi.RuleEngine.CEP
  └─ Muonroi.Core.Abstractions

Muonroi.RuleEngine.NRules  [frozen]
  └─ NRules (external)

Muonroi.RuleEngine.Proliferation
  └─ Muonroi.RuleEngine.Runtime

Muonroi.RuleEngine.Proliferation.Persistence
  └─ Muonroi.RuleEngine.Proliferation
```

## See Also

- [Rule Engine Guide](../../03-guides/rule-engine/rule-engine-guide.md)
- [Decision Table Guide](../../03-guides/rule-engine/decision-table-guide.md)
- [CEP Engine Guide](../../03-guides/rule-engine/cep-engine.md)
