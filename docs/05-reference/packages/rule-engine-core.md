---
title: Rule Engine Core Packages
sidebar_label: Rule Engine Core
sidebar_position: 6
---

# Rule Engine Core Packages

The Muonroi Rule Engine is spread across five focused packages. Each has a distinct responsibility: abstractions define the contracts, core provides the execution runtime, rules hosts the FEEL evaluator and legacy adapters, testing delivers test scaffolding, and source generators enforce code quality at compile time.

## Package Hierarchy

```
Muonroi.RuleEngine.Abstractions   ← contracts, enums, FactBag
        ↑
Muonroi.RuleEngine.Core           ← RuleOrchestrator, MRuleEngineBuilder, workflow
        ↑
Muonroi.Rules                     ← FEEL evaluator, runtime ruleset store, legacy adapters
        ↑
Muonroi.RuleEngine.Testing        ← MRuleTestBuilder, Spy, assertions (test-only)

Muonroi.RuleEngine.SourceGenerators  ← compile-time generators + Roslyn analyzers (build-only)
```

| Package | Target | Tier | Reference |
|---------|--------|------|-----------|
| `Muonroi.RuleEngine.Abstractions` | `net8.0` | OSS | NuGet.org |
| `Muonroi.RuleEngine.Core` | `net8.0` | OSS | NuGet.org |
| `Muonroi.Rules` | `net8.0` | OSS | NuGet.org |
| `Muonroi.RuleEngine.Testing` | `net8.0` | OSS | NuGet.org |
| `Muonroi.RuleEngine.SourceGenerators` | `netstandard2.0` | OSS | NuGet.org |

---

## Muonroi.RuleEngine.Abstractions

**NuGet:** `Muonroi.RuleEngine.Abstractions` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Defines every contract, model, and enum that the rule engine depends on. Consumers only need this package if they are authoring rules or implementing custom orchestrators. It has no infrastructure dependencies.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IRule<TContext>` | interface | Core rule contract — evaluate + execute a context |
| `IMRuleOrchestrator<TContext>` | interface | Orchestrator contract — entry point for rule execution |
| `FactBag` | class | Shared key/value dictionary flowing through the entire pipeline |
| `RuleResult` | record | Immutable result of rule evaluation: `IsSuccess`, `Errors` |
| `OrchestratorResult` | record | Full execution summary: `IsSuccess`, `Facts`, `RuleResults`, `Errors`, `CompensationErrors` |
| `MFactBagAwareRule<TContext>` | abstract class | Base for rules that need typed FactBag access via helpers |
| `ICompensatableRule<TContext>` | interface | Extends `IRule<TContext>` with `CompensateAsync` for LIFO rollback |
| `IHookHandler<TContext>` | interface | Cross-cutting hook invoked at `HookPoint` lifecycle events |
| `IRuleEventListener<TContext>` | interface | Observability sink for `OnRuleMatchedAsync` / `OnRuleFiredAsync` |
| `IRuleFactory` | interface | Factory for rule instance creation |
| `IRuleContext` | interface | Marker for valid context types |
| `ITenantQuotaTracker` | interface | Checks and increments per-tenant execution quotas |
| `MExtractAsRuleAttribute` | attribute | Marks a method for extraction by `ExtractAsRuleGenerator` |
| `MRuleCatalogEntryAttribute` | attribute | Registers a rule in the auto-generated rule catalog |
| `TenantRuleGroupAttribute` | attribute | Groups rules under a keyed tenant scope |
| `RuleGroupAttribute` | attribute | Groups rules under a named scope for keyed DI registration |
| `IRuleAuthoringManifestProvider` | interface | Provides rule schema metadata for design-time tools |
| `IContextFactory<TContext>` | interface | Creates a context from a `FactBag` |
| `IContextProjector` | interface | Projects a context back into facts |

### Key Enums

| Enum | Values | When to use |
|------|--------|-------------|
| `ExecutionMode` | `AllOrNothing` (0), `BestEffort` (1), `CompensateOnFailure` (2) | Controls how the orchestrator responds to rule failures |
| `HookPoint` | `BeforeRule`, `AfterRule`, `Error`, `BeforeValidateInput`, `BeforeMap`, `BeforePersist`, `AfterPersist`, `OnSuccess`, `OnFailure`, `BeforeCreate`, `AfterCreate`, `BeforeUpdate`, `AfterUpdate`, `BeforeDelete`, `AfterDelete` | Lifecycle interception points |
| `RuleType` | `Validation`, `Business`, `EmptyTypes` | Distinguishes read-only validation from state-modifying business rules |

### IRule&lt;TContext&gt; Contract

```csharp
public interface IRule<in TContext>
{
    string Code { get; }                           // Unique, stable identifier
    int Order => 0;                                // Tie-break when dependencies are equal
    IReadOnlyList<string> DependsOn => [];         // Rule codes that must run first
    HookPoint HookPoint => HookPoint.BeforeRule;   // Execution lifecycle slot
    RuleType Type => RuleType.Validation;          // Validation vs Business

    // Phase 1 — pure, no side effects
    Task<RuleResult> EvaluateAsync(TContext ctx, FactBag facts, CancellationToken ct);

    // Phase 2 — side effects, runs only when Phase 1 passed
    Task ExecuteAsync(TContext context, CancellationToken cancellationToken = default);

    string Name => GetType().Name;                 // Display name
    IEnumerable<Type> Dependencies => [];          // DI type dependencies
}
```

### FactBag

Thread-safe dictionary passed to every rule in the pipeline. Supports auto-coercion of `JsonElement` values produced by external engines.

```csharp
public class FactBag
{
    public T? Get<T>(string key);                        // Retrieve with auto-coerce
    public bool TryGet<T>(string key, out T? value);     // Safe retrieval
    public void Set<T>(string key, T value);             // Write / overwrite
    public bool Remove(string key);                      // Delete
    public IReadOnlyDictionary<string, object?> AsReadOnly();  // Snapshot
    public IEnumerable<string> Keys { get; }
    public object? this[string key] { get; set; }        // Indexer
}
```

**Reserved key prefixes:**

| Prefix | Written by | Purpose |
|--------|-----------|---------|
| `__graph.node.{nodeId}.executed` | `GraphRuleDispatchAdapter` | Node was executed |
| `__graph.node.{nodeId}.passed` | `GraphRuleDispatchAdapter` | Node passed evaluation |
| `__graph.node.{nodeId}.result` | `GraphRuleDispatchAdapter` | Node output payload |
| `__node.{code}.{path}` | `FeelRuleAdapter` | Scoped FEEL output field |

### RuleResult

```csharp
public sealed record RuleResult(bool IsSuccess, IReadOnlyList<string> Errors)
{
    public static RuleResult Passed();                     // Success — Phase 2 will run
    public static RuleResult Success();                    // Alias for Passed()
    public static RuleResult Failure(params string[] errors); // Fail — Phase 2 skipped
}
```

### MFactBagAwareRule&lt;TContext&gt;

Abstract base for compiled rules that consume output from upstream FEEL/DecisionTable/flow-graph nodes. Override `EvaluateCoreAsync` instead of `EvaluateAsync`.

```csharp
public abstract class MFactBagAwareRule<TContext> : IRule<TContext>
{
    protected T? ReadFact<T>(string path);           // Read from FactBag
    protected void WriteFact<T>(string path, T value); // Write to FactBag
    protected bool NodePassed(string nodeId);         // __graph.node.{id}.passed
    protected bool NodeExecuted(string nodeId);       // __graph.node.{id}.executed
    protected T? NodeResult<T>(string nodeId);        // __graph.node.{id}.result

    protected abstract Task<RuleResult> EvaluateCoreAsync(TContext ctx, CancellationToken ct);
}
```

### MExtractAsRuleAttribute

Applied to a method to trigger compile-time rule extraction by `ExtractAsRuleGenerator`.

```csharp
[AttributeUsage(AttributeTargets.Method)]
public class MExtractAsRuleAttribute(string code) : Attribute
{
    public string Code { get; }
    public int Order { get; set; }
    public HookPoint HookPoint { get; set; } = HookPoint.BeforeRule;
    public string[] DependsOn { get; set; } = [];
    public string? Expression { get; set; }       // Inline FEEL expression
    public bool UseFactBagAware { get; set; }      // Inherit MFactBagAwareRule instead of IRule
}
```

### Usage Example

```csharp
using Muonroi.RuleEngine.Abstractions;

// Minimal validation rule
public class OrderAmountRule : IRule<OrderContext>
{
    public string Code => "order-amount";

    public Task<RuleResult> EvaluateAsync(OrderContext ctx, FactBag facts, CancellationToken ct)
    {
        if (ctx.Amount <= 0)
            return Task.FromResult(RuleResult.Failure("Amount must be positive"));

        facts.Set("order.amount.valid", true);
        return Task.FromResult(RuleResult.Passed());
    }
}

// Rule depending on upstream result
public class PersistOrderRule : IRule<OrderContext>
{
    private readonly IOrderRepository _repo;

    public PersistOrderRule(IOrderRepository repo) => _repo = repo;

    public string Code => "persist-order";
    public IReadOnlyList<string> DependsOn => ["order-amount"];
    public RuleType Type => RuleType.Business;

    public Task<RuleResult> EvaluateAsync(OrderContext ctx, FactBag facts, CancellationToken ct)
    {
        if (!facts.TryGet<bool>("order.amount.valid", out var valid) || !valid)
            return Task.FromResult(RuleResult.Failure("Order not valid"));

        return Task.FromResult(RuleResult.Passed());
    }

    public Task ExecuteAsync(OrderContext context, CancellationToken ct)
        => _repo.SaveAsync(context.Order, ct);
}

// Compensatable rule (used with ExecutionMode.CompensateOnFailure)
public class NotifyRule : ICompensatableRule<OrderContext>
{
    private readonly INotificationService _ns;

    public NotifyRule(INotificationService ns) => _ns = ns;

    public string Code => "notify";
    public IReadOnlyList<string> DependsOn => ["persist-order"];

    public Task<RuleResult> EvaluateAsync(OrderContext ctx, FactBag facts, CancellationToken ct)
        => Task.FromResult(RuleResult.Passed());

    public Task ExecuteAsync(OrderContext ctx, CancellationToken ct)
        => _ns.SendConfirmationAsync(ctx.Order.Id, ct);

    // Called in reverse order if a later rule fails
    public Task CompensateAsync(OrderContext ctx, FactBag facts, CancellationToken ct)
        => _ns.SendCancellationAsync(ctx.Order.Id, ct);
}
```

---

## Muonroi.RuleEngine.Core

**NuGet:** `Muonroi.RuleEngine.Core` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Houses the concrete execution runtime: `RuleOrchestrator<TContext>`, the fluent `MRuleEngineBuilder<TContext>`, DI registration helpers, workflow support, tracing infrastructure, and event bridging.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `RuleOrchestrator<TContext>` | class | Executes rules in dependency order with quota, tracing, and hook support |
| `MRuleEngineBuilder<TContext>` | class | Fluent builder for registering rules, hooks, and listeners |
| `MRuleEngineOptions` | class | A/B routing configuration between traditional and rule-engine execution paths |
| `DefaultRuleFactory<TContext>` | class | Resolves rule instances from the DI container |
| `IMRuleExecutionRouter<TContext>` | interface | Routes execution to traditional code or orchestrator based on `MRuleEngineOptions` |
| `MRuleExecutionRouter<TContext>` | class | Default router implementation |
| `IMRuleWorkflowRunner<TContext>` | interface | Runs multi-step workflows mixing rule tasks, service tasks, and gateways |
| `MRuleWorkflowRunner<TContext>` | class | Traverses `MRuleWorkflowDefinition<TContext>` steps with cycle detection |
| `MRuleWorkflowDefinition<TContext>` | class | Immutable workflow: `Name`, `StartStepId`, `Steps` |
| `MRuleWorkflowStep<TContext>` | class | Single workflow step: Id, StepType, transitions |
| `IRuleExecutionTracer` | interface | Persists `RuleTraceEntry` records for debugger mode |
| `IRuleTraceStore` | interface | Trace persistence backend |
| `IRuleDebuggerModeService` | interface | Toggles per-tenant debugger mode |
| `RuleTraceEntry` | record | Full trace record: rule name, phase, elapsed, facts JSON, exception |
| `RuleAuditLogger` | class | Writes structured audit log entries |
| `AuditTrailHook<TContext>` | class | `IHookHandler<TContext>` that writes to `RuleAuditLogger` |

### RuleOrchestrator&lt;TContext&gt; Pipeline

The orchestrator resolves all registered `IRule<TContext>` instances, sorts them by their `DependsOn` graph (Kahn's topological sort), then executes each in order:

1. **Quota check** — `ITenantQuotaTracker.CheckQuotaAsync` for concurrent executions and evals-per-second
2. **Hook: BeforeRule** — fires registered `IHookHandler<TContext>`
3. **Phase 1: EvaluateAsync** — pure condition evaluation + fact writes
4. **Phase 2: ExecuteAsync** — side effects, only if Phase 1 returned `Passed()`
5. **Hook: AfterRule / Error**
6. **Listener: OnRuleFiredAsync** — notifies `IRuleEventListener<TContext>` with fact changes

Execution behavior is controlled by `ExecutionMode` (inherited from `MRuleEngineOptions`):

| Mode | Behavior |
|------|----------|
| `AllOrNothing` | Stop on first failure, no compensation |
| `BestEffort` | Continue after failures, aggregate all errors |
| `CompensateOnFailure` | Stop on failure, call `CompensateAsync` in LIFO order |

### MRuleEngineOptions

Controls runtime A/B routing between traditional code and the rule orchestrator:

```csharp
public sealed class MRuleEngineOptions
{
    public RuleExecutionMode ExecutionMode { get; set; } = RuleExecutionMode.Rules;
    public double TraditionalWeight { get; set; } = 0.5;
    public double RulesWeight { get; set; } = 0.5;
    public bool LogDifferences { get; set; } = true;
}
```

### DI Registration

```csharp
// Register core rule engine infrastructure
builder.Services.AddMRuleEngine<OrderContext>(options =>
{
    // No ExecutionMode here — this is A/B routing, not the orchestrator failure mode
    // To set AllOrNothing/BestEffort/CompensateOnFailure configure the orchestrator directly
})
.AddRule<OrderAmountRule>()
.AddRule<PersistOrderRule>()
.AddRule<NotifyRule>()
.AddHook<TelemetryHook>()
.AddListener<AuditListener>();

// Scan assemblies automatically
builder.Services.AddRulesFromAssemblies(typeof(OrderAmountRule).Assembly);

// Configure workflow options
builder.Services.ConfigureRuleWorkflow(opts => opts.MaxSteps = 100);
```

### Workflow Support

`MRuleWorkflowRunner<TContext>` executes workflows defined as step graphs. Steps are typed (`Rule`, `Service`, `Gateway`, `End`) and can transition to any step based on runtime results.

```csharp
var workflow = new MRuleWorkflowDefinition<OrderContext>(
    name: "order-processing",
    startStepId: "validate",
    steps:
    [
        MRuleWorkflowStep<OrderContext>.Rule("validate", nextStepId: "persist"),
        MRuleWorkflowStep<OrderContext>.Rule("persist", nextStepId: "notify"),
        MRuleWorkflowStep<OrderContext>.Rule("notify", nextStepId: null) // End
    ]);

var result = await workflowRunner.ExecuteAsync(context, workflow, ct);
```

### Tracing

`RuleTraceEntry` captures a full record per execution event:

| Field | Description |
|-------|-------------|
| `TraceId` | Unique entry identifier |
| `TenantId` / `UserId` / `CorrelationId` | Execution context |
| `RuleName` / `RuleSetVersion` | Rule identity |
| `Phase` | `BeforeEval`, `AfterEval`, `AfterExec`, `Error`, `Compensate` |
| `ElapsedMs` | Duration |
| `InputFactsJson` / `OutputFactsJson` | Fact snapshots |
| `ChangedFactKeys` | Keys mutated by the rule |

### Usage Example

```csharp
// Inject and use directly
public class OrderProcessor(RuleOrchestrator<OrderContext> orchestrator)
{
    public async Task<FactBag> ProcessAsync(Order order, CancellationToken ct)
    {
        var context = new OrderContext { Order = order };
        return await orchestrator.ExecuteAsync(context, cancellationToken: ct);
    }
}

// Custom hook
public class TelemetryHook : IHookHandler<OrderContext>
{
    public Task HandleAsync(
        HookPoint point, IRule<OrderContext> rule, RuleResult result,
        FactBag facts, OrderContext context, TimeSpan? duration,
        CancellationToken cancellationToken = default)
    {
        if (point == HookPoint.AfterRule)
        {
            // record metrics
        }
        return Task.CompletedTask;
    }
}
```

---

## Muonroi.Rules

**NuGet:** `Muonroi.Rules` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Provides the FEEL (Friendly Enough Expression Language) evaluator, feature flag evaluation, a file/in-memory ruleset store, change notification infrastructure, and rule linting. The `RulesEngineService` in this package is a legacy adapter to Microsoft RulesEngine and is deprecated — use `Muonroi.RuleEngine.Runtime` for new work.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `FeelEvaluator` | static class | Evaluates FEEL expressions against a variable dictionary |
| `FeelParser` | class | Parses FEEL expressions into an AST |
| `FeelStandardLibrary` | class | Built-in FEEL functions (date, time, string, math, list) |
| `FeatureFlagEvaluator` | class | Evaluates feature flags against a context |
| `IRuleSetStore` | interface | CRUD for ruleset JSON definitions |
| `FileRuleSetStore` | class | File-system backed `IRuleSetStore` |
| `IRuleSetRuntimeCache` | interface | In-memory cache for hot-loaded rulesets |
| `RuleSetRuntimeCache` | class | Default cache implementation |
| `IRuleSetChangeNotifier` | interface | Pub/sub for ruleset change events |
| `InMemoryRuleSetChangeNotifier` | class | In-process notifier |
| `RedisRuleSetChangeNotifier` | class | Redis pub/sub notifier (requires StackExchange.Redis) |
| `IRuleSetSigner` | interface | Signs ruleset definitions (HMAC/RSA) |
| `HmacSha256RuleSetSigner` | class | HMAC-SHA256 signing |
| `IRuleActivationStrategy<T>` | interface | Controls which ruleset version is active |
| `PercentageRuleActivationStrategy` | class | Percentage-based canary activation |
| `RuleLinter` | class | Static analysis of rule definitions for common mistakes |
| `ExternalJsonRule` | class | Wraps a JSON-defined rule for execution by `RuleOrchestrator` |
| `RulesEngineService` | class | **Deprecated** — legacy Microsoft RulesEngine adapter |
| `FeelController` / `FeelControllerBase` | class | REST endpoint: `POST /api/v1/feel` for expression evaluation |
| `FeelWebExtensions` | static class | `AddFeelWeb()` DI registration |
| `DecisionTableExporter` / `DecisionTableImporter` | class | Export/import decision tables |
| `IBusinessRule` | interface | Contract for business-level rule definitions |
| `BusinessRuleExtensions` | static class | Extension helpers for `IBusinessRule` |

### FeelEvaluator

Evaluates the FEEL subset used throughout the rule engine adapters.

```csharp
// Boolean evaluation
bool passed = FeelEvaluator.Evaluate(
    "amount >= 1000 and status in (\"active\", \"trial\")",
    new Dictionary<string, object>
    {
        ["amount"] = 1500,
        ["status"] = "active"
    });

// Value evaluation
object? discount = FeelEvaluator.EvaluateValue(
    "if tier = \"gold\" then 0.15 else 0.05",
    new Dictionary<string, object> { ["tier"] = "gold" });
```

**Supported FEEL constructs:**

| Construct | Example |
|-----------|---------|
| Arithmetic | `amount * 0.1` |
| Comparison | `score >= 80` |
| Range | `age in [18..65]` |
| In-list | `status in ("active", "trial")` |
| Regex | `email matches ".*@example\\.com"` |
| If-then-else | `if x > 0 then "positive" else "non-positive"` |
| And / Or | `a and b`, `a or b` |
| Not | `not(a)` |

### DI Registration

```csharp
// FEEL REST endpoint + evaluator
builder.Services.AddFeelWeb();

// Core rule engine + runtime store
builder.Services.AddRuleEngine<OrderContext>()
    .AddRule<OrderAmountRule>();

// Optional: Redis change notification
builder.Services.AddSingleton<IRuleSetChangeNotifier, RedisRuleSetChangeNotifier>();
```

---

## Muonroi.RuleEngine.Testing

**NuGet:** `Muonroi.RuleEngine.Testing` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Provides test scaffolding for rule unit tests and integration-style orchestrator tests. No external test framework dependency — works with xUnit, NUnit, MSTest, or any assertion library.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MRuleTestBuilder<TContext>` | class | Fluent builder for rule and orchestrator tests |
| `MRuleTestResult` | record | Result: `IsSuccess`, `Facts`, `RuleResult`, `Exception`, `ExecutedRuleCodes` |
| `MRuleOrchestratorSpy<TContext>` | class | Wraps `RuleOrchestrator<TContext>` and captures execution records |
| `MRuleExecutionRecord` | record | Per-rule record: `RuleCode`, `IsSuccess`, `Duration`, `Changes` |
| `MFactBagAssertions` | static class | Extension `.MShould()` / `.Should()` on `FactBag` |
| `MFactBagAssertion` | class | Fluent assertion: `Contain(key, value)`, `NotContain(key)` |

### MRuleTestBuilder&lt;TContext&gt;

Three entry points cover single-rule, instance-based, and full-orchestrator testing:

```csharp
// Entry point 1: test a single rule by type (DI-resolved)
MRuleTestBuilder<TContext>.ForRule<TRule>()

// Entry point 2: test a pre-constructed rule instance
MRuleTestBuilder<TContext>.ForRule(ruleInstance)

// Entry point 3: test the full orchestration pipeline
MRuleTestBuilder<TContext>.ForOrchestrator(builder => builder
    .AddRule<RuleA>()
    .AddRule<RuleB>())
```

**Builder methods:**

| Method | Purpose |
|--------|---------|
| `.WithContext(action)` | Mutate the default context |
| `.WithContext(instance)` | Replace the context entirely |
| `.WithFact(key, value)` | Seed the `FactBag` before execution |
| `.WithService<T>(instance)` | Register a mock/stub dependency |
| `.ExecuteAsync()` | Run and return `MRuleTestResult` |

### MRuleOrchestratorSpy&lt;TContext&gt;

Wraps `RuleOrchestrator<TContext>` and captures a per-rule execution log.

```csharp
var spy = new MRuleOrchestratorSpy<OrderContext>(
    rules: [new OrderAmountRule(), new PersistOrderRule(fakeRepo)]);

FactBag facts = await spy.ExecuteAsync(context);

// Inspect execution records
foreach (MRuleExecutionRecord rec in spy.ExecutionRecords)
{
    Console.WriteLine($"{rec.RuleCode}: {rec.IsSuccess} in {rec.Duration.TotalMs}ms");
    foreach (var (key, (oldVal, newVal)) in rec.Changes)
        Console.WriteLine($"  {key}: {oldVal} -> {newVal}");
}
```

### MFactBagAssertions

```csharp
facts.MShould()
    .Contain("order.amount.valid", true)
    .Contain("order.discount")       // key exists, any value
    .NotContain("order.error");
```

### Usage Example

```csharp
// Test a single rule
[Fact]
public async Task OrderAmountRule_FailsWhenAmountIsZero()
{
    MRuleTestResult result = await MRuleTestBuilder<OrderContext>
        .ForRule<OrderAmountRule>()
        .WithContext(ctx => ctx.Amount = 0)
        .ExecuteAsync();

    Assert.False(result.IsSuccess);
    Assert.Contains("Amount must be positive", result.RuleResult!.Errors);
}

// Test the full orchestrator pipeline
[Fact]
public async Task Pipeline_WritesDiscountFact()
{
    var fakeRepo = new FakeOrderRepository();

    MRuleTestResult result = await MRuleTestBuilder<OrderContext>
        .ForOrchestrator(b => b
            .AddRule<OrderAmountRule>()
            .AddRule<PersistOrderRule>())
        .WithContext(ctx => ctx.Amount = 500)
        .WithService<IOrderRepository>(fakeRepo)
        .ExecuteAsync();

    Assert.True(result.IsSuccess);
    result.Facts.MShould().Contain("order.amount.valid", true);
}

// Test with a spy for execution order verification
[Fact]
public async Task Rules_ExecuteInDependencyOrder()
{
    var spy = new MRuleOrchestratorSpy<OrderContext>(
        rules: [new PersistOrderRule(fakeRepo), new OrderAmountRule()]);

    await spy.ExecuteAsync(new OrderContext { Amount = 100 });

    Assert.Equal("order-amount", spy.ExecutionRecords[0].RuleCode);
    Assert.Equal("persist-order", spy.ExecutionRecords[1].RuleCode);
}
```

---

## Muonroi.RuleEngine.SourceGenerators

**NuGet:** `Muonroi.RuleEngine.SourceGenerators` | **Tier:** OSS | **Distribution:** NuGet.org | **Target:** `netstandard2.0`

### Purpose

Ships as a Roslyn `IIncrementalGenerator` and a set of Roslyn analyzers. It runs entirely at build time with no runtime footprint. It performs two jobs: (1) generates rule classes and DI registration code from `[MExtractAsRule]`-annotated methods, and (2) enforces ecosystem coding standards through diagnostic warnings.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `ExtractAsRuleGenerator` | `IIncrementalGenerator` | Extracts `[MExtractAsRule]` methods into `{Code}Rule.g.cs` files |
| `RuleRegistrationGenerator` | `IIncrementalGenerator` | Generates `AddMGeneratedRules()` DI extension from all discovered `IRule<T>` implementors |
| `RuleCatalogRegistrationGenerator` | `IIncrementalGenerator` | Generates the rule catalog manifest for design-time authoring tools |
| `FeelExpressionSyntaxValidator` | class | Validates the `Expression` property of `[MExtractAsRule]` at compile time |
| `Polyfills` | class | `IsExternalInit` polyfill for `netstandard2.0` record support |

### Diagnostic Codes

#### RuleGen Diagnostics (MRG — Rule Authoring)

| Code | Severity | Description |
|------|----------|-------------|
| `MRG001` | Error | Duplicate rule code across two `[MExtractAsRule]` methods |
| `MRG002` | Error | Invalid `HookPoint` value in attribute |
| `MRG003` | Warning | Rule dependency field is a concrete type, not an interface |
| `MRG004` | Warning | Private helper method referenced by rule could not be extracted |
| `MRG005` | Warning | `DependsOn` references a rule code that was not found in the compilation |
| `MRG006` | Warning | `Order` is set without a corresponding `DependsOn` (ordering by code alone is unreliable) |
| `MRG007` | Warning | Rule reads a `FactBag` key but has no declared dependency path to the producer |
| `MRG008` | Warning | Nullable value assigned to non-nullable string — add null-coalescing guard |
| `MRG009` | Warning | Fact guard throws `InvalidOperationException` — prefer `RuleResult.Failure` |
| `MRG010` | Error | Inline `Expression` FEEL string is syntactically invalid |

#### Ecosystem Analyzers (MBB — Governance)

| Code | Severity | Description |
|------|----------|-------------|
| `MBB001` | Warning | `DateTime.Now` / `DateTime.UtcNow` used directly — use `IMDateTimeService` |
| `MBB002` | Warning | `JsonSerializer` used directly — use `IMJsonSerializeService` |
| `MBB003` | Warning | `DbContext` inherited directly — must inherit `MDbContext` |
| `MBB004` | Warning | `AsyncLocal<T>` used outside the context package — use `ISystemExecutionContextAccessor` |
| `MBB005` | Warning | Abstractions assembly references an infrastructure dependency |
| `MBB006` | Warning | DI registration method is missing a startup tier guard (`EnsureFeatureOrThrow`) |
| `MBB007` | Warning | `Serilog.Context.LogContext` used directly — use `IMLogContext.PushProperty()` |
| `MBB008` | Warning | Cross-capability reference missing `IMEcosystemRegistry.Has(MCapability.X)` guard |
| `MBB009` | Warning | Raw exception (`Exception`, `ArgumentException`, etc.) thrown in Muonroi namespace — use `MException` wrapper |
| `MBB010` | Warning | Public method parameter missing `MGuard.NotNull()` call |

**Code fixes available:** `MBB001` (auto-replace with `IMDateTimeService`), `MBB002` (auto-replace with `IMJsonSerializeService`), `MBB008` (add ecosystem capability guard), `MBB009` (wrap in `MException`), `MBB010` (add `MGuard.NotNull()`).

### How ExtractAsRuleGenerator Works

1. The incremental pipeline scans all method declarations with attributes.
2. For each method annotated with `[MExtractAsRule("code")]`, it resolves attribute arguments (Code, Order, HookPoint, DependsOn, Expression, UseFactBagAware) via semantic analysis.
3. It infers the `TContext` type from the first non-`FactBag`, non-`CancellationToken` parameter.
4. It extracts interface dependencies from class fields referenced inside the method body.
5. It copies private helper methods called by the annotated method into the generated file.
6. If `Expression` is set, `FeelExpressionSyntaxValidator` validates it and reports `MRG010` on failure.
7. Duplicate codes are reported as `MRG001` errors; no file is emitted for the duplicates.
8. `GeneratedRuleSourceWriter.Render(definition)` emits `{CodeIdentifier}Rule.g.cs`.

### Usage Example

```csharp
// 1. Annotate methods in your service class
public class OrderService
{
    private readonly IOrderRepository _repo;

    [MExtractAsRule("validate-order", Order = 10)]
    public RuleResult ValidateOrder(OrderContext ctx, FactBag facts)
    {
        if (ctx.Amount <= 0)
            return RuleResult.Failure("Amount must be positive");

        facts.Set("order.valid", true);
        return RuleResult.Passed();
    }

    [MExtractAsRule("persist-order",
        Order = 20,
        DependsOn = ["validate-order"],
        UseFactBagAware = true)]
    public async Task<RuleResult> PersistOrder(OrderContext ctx, FactBag facts, CancellationToken ct)
    {
        if (!facts.TryGet<bool>("order.valid", out var valid) || !valid)
            return RuleResult.Failure("Order not valid");

        await _repo.SaveAsync(ctx.Order, ct);
        return RuleResult.Passed();
    }
}
```

The generator emits two files at compile time:

```
// ValidateOrderRule.g.cs — implements IRule<OrderContext>
// PersistOrderRule.g.cs  — inherits MFactBagAwareRule<OrderContext>
```

```csharp
// 2. Register generated rules
builder.Services.AddRuleEngine<OrderContext>()
    .AddRule<ValidateOrderRule>()
    .AddRule<PersistOrderRule>();

// Or use the auto-generated extension (from RuleRegistrationGenerator)
builder.Services.AddMGeneratedRules();
```

### Build Property

Set `MuonroiRuleGenDiagnosticsOnly=true` in your `.csproj` to run analyzers without emitting generated source files:

```xml
<PropertyGroup>
  <MuonroiRuleGenDiagnosticsOnly>true</MuonroiRuleGenDiagnosticsOnly>
</PropertyGroup>
```

---

## See Also

- [Rule Engine Guide](../../03-guides/rule-engine/rule-engine-guide.md) — two-phase execution, dependency resolution, execution modes
- [Decision Table Guide](../../03-guides/rule-engine/decision-table-guide.md) — FEEL-based runtime decision tables
- [FEEL Reference](../../03-guides/rule-engine/feel-reference.md) — full expression syntax
- [Control Plane API](../../03-guides/control-plane/control-plane-overview.md) — ruleset CRUD, dry-run, canary endpoints
