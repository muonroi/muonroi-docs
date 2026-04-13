---
title: Rule Engine Guide
sidebar_label: Rule Engine Guide
sidebar_position: 1
---

# Rule Engine Guide

The Muonroi Rule Engine is a **dependency-aware execution pipeline** that evaluates and executes rules in topologically sorted order, sharing a single fact bag across all rules. It separates condition evaluation (Phase 1) from side effects (Phase 2), enabling safe composition, auditability, and compensation strategies.

## What is the Rule Engine?

The Rule Engine orchestrates the execution of multiple rules (`IRule<TContext>`), automatically resolving dependencies via depth-first topological sort (Kahn's algorithm). For each rule that matches execution criteria:

1. **Quota Check** — validates tenant concurrency and evaluation limits
2. **EvaluateAsync** (Phase 1) — evaluate conditions, compute output facts (pure, side-effect-free)
3. **ExecuteAsync** (Phase 2) — run side effects (DB writes, API calls) only if evaluation passed
4. **Telemetry** — record rule metrics via OpenTelemetry

The shared `FactBag` dictionary flows through the entire pipeline, allowing rules to read facts set by prior rules and write new facts for downstream rules.

## Core Architecture

### RuleOrchestrator Pipeline

```csharp
RuleOrchestrator<TContext>
  │
  ├─ ExecuteAsync(context, filterPoint?, cancellationToken)
  │    │
  │    ├─ Create FactBag (single instance)
  │    ├─ Order rules via DFS topological sort
  │    │
  │    └─ FOR EACH rule (in dependency order):
  │         │
  │         ├─ Check quota (concurrent executions, evals/sec)
  │         ├─ Fire IHookHandler.BeforeRule
  │         ├─ Call rule.EvaluateAsync(context, factBag, ct)  [Phase 1]
  │         │    ├─ Evaluate condition
  │         │    └─ Write facts (facts.Set<T>(key, value))
  │         │
  │         ├─ [if EvaluateAsync succeeded]
  │         │    └─ Call rule.ExecuteAsync(context, ct)  [Phase 2]
  │         │         └─ Side effects run here
  │         │
  │         ├─ Fire IHookHandler.AfterRule / Error
  │         └─ Record telemetry
  │
  └─ Return FactBag
```

### FactBag: Shared State

The `FactBag` is a thread-safe `Dictionary<string, object?>` wrapper passed to every rule. It holds:

- **Input context facts** — copied from the execution context
- **Output facts** — computed by rules during Phase 1
- **Graph keys** — special `__graph.node.{nodeId}.*` keys for flow-graph tracking

**Key methods:**

```csharp
public class FactBag
{
    public T? Get<T>(string key);                      // Retrieve + auto-coerce
    public bool TryGet<T>(string key, out T? value);   // Safe retrieval
    public void Set<T>(string key, T value);           // Write fact
    public bool Remove(string key);                    // Remove fact
    public IReadOnlyDictionary<string, object?> AsReadOnly();  // Snapshot
}
```

**Auto-coercion:** `Get<T>()` handles `JsonElement` conversion (useful when external engines like Microsoft RulesEngine feed facts as JSON).

## Two-Phase Execution (Critical Design)

Every rule follows a strict two-phase pattern to separate pure evaluation from side effects:

### Phase 1: EvaluateAsync — Pure Condition + Output

Executed unconditionally for every rule. **Must not** perform side effects (DB writes, API calls).

```csharp
public Task<RuleResult> EvaluateAsync(TContext ctx, FactBag facts, CancellationToken ct)
{
    // Phase 1: Pure evaluation only
    bool isValid = ctx.Amount > 0 && ctx.Items.Count > 0;
    facts.Set("order.valid", isValid);

    if (!isValid)
        return Task.FromResult(RuleResult.Fail("Order amount must be > 0"));

    return Task.FromResult(RuleResult.Pass());
}
```

### Phase 2: ExecuteAsync — Side Effects Only

Runs **only if Phase 1 succeeded** (`RuleResult.Pass()`). This is where you write to databases, call external APIs, send notifications.

```csharp
public Task ExecuteAsync(TContext context, CancellationToken cancellationToken = default)
{
    // Phase 2: Side effects only (runs only if EvaluateAsync passed)
    return _orderRepository.SaveAsync(context.Order, cancellationToken);
}
```

**Why separate?**

- **Auditability** — you can trace which conditions would have fired without committing side effects
- **Dry-run testing** — run Phase 1 only to preview results
- **Compensation** — revert Phase 2 actions (via `ICompensatableRule<TContext>`) without re-evaluating
- **Safety** — prevent partial writes from failed conditions

## Execution Modes

Control how the orchestrator handles rule failures via the `ExecutionMode` enum:

### AllOrNothing (default)

Stops on the **first failure**. No compensation. Fastest for fail-fast scenarios.

```csharp
services.AddMRuleEngine(options => {
    options.ExecutionMode = ExecutionMode.AllOrNothing;
});
```

**Behavior:**
- Rule A succeeds → Rule B fails → stop, return failure
- No Phase 2 for rules after the failure

### BestEffort

**Continues executing** all rules despite failures. Aggregates all errors. Best for batch processing.

```csharp
services.AddMRuleEngine(options => {
    options.ExecutionMode = ExecutionMode.BestEffort;
});
```

**Behavior:**
- Rule A fails → continue to Rule B → Rule B succeeds → continue
- Returns all facts + combined errors

### CompensateOnFailure

Stops on failure, then **reverses Phase 2 actions** of previously executed rules in **LIFO order** (reverse dependency order).

Requires rules to implement `ICompensatableRule<TContext>`:

```csharp
public interface ICompensatableRule<in TContext> : IRule<TContext>
{
    Task CompensateAsync(TContext context, CancellationToken cancellationToken);
}
```

**Example:**

```csharp
public class CreateOrderRule : ICompensatableRule<OrderContext>
{
    public Task ExecuteAsync(OrderContext ctx, CancellationToken ct)
    {
        return _db.InsertOrderAsync(ctx.Order, ct);  // Phase 2
    }

    public Task CompensateAsync(OrderContext ctx, CancellationToken ct)
    {
        return _db.DeleteOrderAsync(ctx.Order.Id, ct);  // Undo Phase 2
    }
}
```

## Dependency Resolution

Rules declare dependencies via `IRule<TContext>` properties:

```csharp
public interface IRule<in TContext>
{
    string Code { get; }                        // Unique code
    int Order { get; } => 0;                    // Execution order (same level)
    IReadOnlyList<string> DependsOn { get; }    // Rule codes this depends on
    IEnumerable<Type> Dependencies { get; }     // Types this depends on
    HookPoint HookPoint { get; } => HookPoint.BeforeRule;
}
```

**Orchestration flow:**

1. Collect all rules + their dependencies
2. Build dependency graph
3. Run DFS topological sort (Kahn's algorithm)
4. Detect cycles → throw `InvalidOperationException`
5. Execute in topologically sorted order

**Example:**

```csharp
public class ValidateOrderRule : IRule<OrderContext>
{
    public string Code => "validate-order";
    public int Order => 1;
    public IReadOnlyList<string> DependsOn => [];
}

public class CreateOrderRule : IRule<OrderContext>
{
    public string Code => "create-order";
    public int Order => 2;
    public IReadOnlyList<string> DependsOn => ["validate-order"];  // Must run after validate-order
}
```

## Code Examples

### Minimal Rule

```csharp
using Muonroi.RuleEngine.Abstractions;

public class OrderValidationRule : IRule<OrderContext>
{
    public string Code => "order-validation";

    public Task<RuleResult> EvaluateAsync(OrderContext ctx, FactBag facts, CancellationToken ct)
    {
        if (ctx.Amount <= 0)
            return Task.FromResult(RuleResult.Fail("Amount must be positive"));

        facts.Set("order.valid", true);
        return Task.FromResult(RuleResult.Pass());
    }
}
```

### Rule with Side Effects

```csharp
public class CreateOrderRule : IRule<OrderContext>
{
    private readonly IOrderRepository _repo;

    public CreateOrderRule(IOrderRepository repo) => _repo = repo;

    public string Code => "create-order";
    public IReadOnlyList<string> DependsOn => ["order-validation"];

    public Task<RuleResult> EvaluateAsync(OrderContext ctx, FactBag facts, CancellationToken ct)
    {
        if (!facts.TryGet<bool>("order.valid", out var valid) || !valid)
            return Task.FromResult(RuleResult.Fail("Order not valid"));

        return Task.FromResult(RuleResult.Pass());
    }

    public async Task ExecuteAsync(OrderContext context, CancellationToken ct)
    {
        // Phase 2: This runs only if Phase 1 passed
        var orderId = await _repo.InsertOrderAsync(context.Order, ct);
        // Optionally write result facts for downstream rules
    }
}
```

### Rule with Compensation

```csharp
public class SendNotificationRule : ICompensatableRule<OrderContext>
{
    private readonly INotificationService _notificationService;

    public SendNotificationRule(INotificationService service) => _notificationService = service;

    public string Code => "send-notification";

    public Task<RuleResult> EvaluateAsync(OrderContext ctx, FactBag facts, CancellationToken ct)
    {
        return Task.FromResult(RuleResult.Pass());
    }

    public Task ExecuteAsync(OrderContext context, CancellationToken ct)
    {
        return _notificationService.SendOrderConfirmationAsync(context.Order.Id, ct);
    }

    public Task CompensateAsync(OrderContext context, CancellationToken ct)
    {
        // Called if a later rule fails (CompensateOnFailure mode)
        return _notificationService.SendOrderCancelledAsync(context.Order.Id, ct);
    }
}
```

## Dependency Injection & Registration

### Basic Setup

```csharp
var builder = WebApplicationBuilder.CreateBuilder(args);

// Rule engine with PostgreSQL storage (for runtime rulesets)
builder.Services.AddMRuleEngineWithPostgres(
    connectionString: configuration.GetConnectionString("Default"),
    options =>
    {
        options.RequireApproval = true;
        options.NotifyOnStateChange = true;
        options.ExecutionMode = ExecutionMode.BestEffort;
    });

// Optional: Enable Redis-backed hot reload
builder.Services.AddMRuleEngineWithRedisHotReload(
    configuration.GetConnectionString("Redis"));

// Optional: FEEL expression support
builder.Services.AddFeelWeb();
```

### Code-First Rules

Use the RuleGen CLI tool with `[MExtractAsRule(...)]` attributes:

```csharp
[MExtractAsRule(Namespace = "MyApp.Rules", ClassName = "GeneratedOrderRules")]
public class OrderService
{
    [MRule(Code = "calc-discount", Order = 10)]
    public decimal CalculateDiscount(decimal amount)
    {
        return amount > 1000 ? amount * 0.1m : 0;
    }
}

// After RuleGen runs, a class is generated:
// GeneratedOrderRules : IRule<RuleContext> { ... }
```

### Register Rules in DI

```csharp
builder.Services.AddScoped<ValidateOrderRule>();
builder.Services.AddScoped<CreateOrderRule>();
builder.Services.AddScoped<SendNotificationRule>();
```

## Usage: Executing Rules

### Using RulesEngineService (Runtime Rulesets)

```csharp
public class OrderService
{
    private readonly RulesEngineService _rulesEngine;

    public OrderService(RulesEngineService rulesEngine)
        => _rulesEngine = rulesEngine;

    public async Task<OrderResult> ProcessOrderAsync(Order order)
    {
        var context = new OrderContext { Order = order };

        // Dry-run: evaluate without side effects
        var dryRun = await _rulesEngine.DryRunAsync("order-workflow", context);
        if (!dryRun.IsSuccess)
            throw new InvalidOperationException(dryRun.ErrorSummary);

        // Execute: both Phase 1 + Phase 2
        var result = await _rulesEngine.ExecuteAsync("order-workflow", context);

        return new OrderResult
        {
            Success = result.IsSuccess,
            OrderId = dryRun.OutputFacts.Get<string>("order.id"),
            Traces = result.Traces
        };
    }
}
```

### Using `RuleOrchestrator<TContext>` (Code-First)

```csharp
public class OrderProcessor
{
    private readonly RuleOrchestrator<OrderContext> _orchestrator;

    public OrderProcessor(RuleOrchestrator<OrderContext> orchestrator)
        => _orchestrator = orchestrator;

    public async Task<FactBag> ProcessAsync(Order order, CancellationToken ct)
    {
        var context = new OrderContext { Order = order };

        // Execute all rules in dependency order
        var facts = await _orchestrator.ExecuteAsync(context, cancellationToken: ct);

        return facts;
    }
}
```

## Quota Enforcement

Multi-tenant quota is automatically enforced during execution:

| Quota Type | Description | Default Limit |
|------------|-------------|---------------|
| `ConcurrentExecutions` | Max parallel rule executions per tenant | 10 |
| `RuleEvaluationsPerSecond` | Max evals per second per tenant | 100 |
| `RuleExecutionsPerDay` | Max total evals per day per tenant | 100,000 |

If quota is exceeded, `QuotaExceededException` is thrown and Phase 2 is not executed.

```csharp
// Example: Inject ITenantQuotaTracker to check quotas manually
public class MyService(ITenantQuotaTracker quotaTracker)
{
    public async Task CheckQuotaAsync(string tenantId)
    {
        bool allowed = await quotaTracker.CheckQuotaAsync(
            tenantId,
            QuotaType.RuleEvaluationsPerSecond,
            5,  // Request 5 evals
            CancellationToken.None);

        if (!allowed)
            throw new QuotaExceededException();
    }
}
```

## Hooks & Events

Rules support **hook points** for cross-cutting concerns (logging, metrics, validation):

```csharp
public enum HookPoint
{
    BeforeRule,      // Before EvaluateAsync
    AfterRule,       // After ExecuteAsync
    Error            // If exception occurs
}

public interface IHookHandler<in TContext>
{
    Task HandleAsync(
        HookPoint point,
        IRule<TContext> rule,
        RuleResult result,
        FactBag facts,
        TContext context,
        TimeSpan? duration,
        CancellationToken token);
}
```

**Example:**

```csharp
public class TelemetryHook : IHookHandler<OrderContext>
{
    private readonly ITelemetryService _telemetry;

    public async Task HandleAsync(HookPoint point, IRule<OrderContext> rule, RuleResult result,
        FactBag facts, OrderContext context, TimeSpan? duration, CancellationToken token)
    {
        if (point == HookPoint.AfterRule && result.IsSuccess)
        {
            await _telemetry.RecordAsync(new RuleMetric
            {
                RuleName = rule.Name,
                DurationMs = duration?.TotalMilliseconds ?? 0,
                Success = true
            });
        }
    }
}
```

## Telemetry & Tracing

Rules emit **OpenTelemetry metrics** and **distributed traces** automatically:

- **Meter:** `RuleEngineTelemetry.RulesMatched` (counter)
- **Meter:** `RuleEngineTelemetry.RuleEvalDuration` (histogram)
- **Activity:** Named after rule `Name`, tagged with `rule.id`, `rule.set.version`, `tenant.id`

Configure exporter in `Program.cs`:

```csharp
builder.Services
    .AddOpenTelemetry()
    .WithTracing(b => b
        .AddSource(RuleEngineTelemetry.ActivitySourceName)
        .AddConsoleExporter()
        .AddJaegerExporter())
    .WithMetrics(b => b
        .AddMeter(RuleEngineTelemetry.MeterName)
        .AddPrometheusExporter());
```

## Best Practices

1. **Keep EvaluateAsync Pure** — no DB writes, API calls, or mutations
2. **Write Facts Consistently** — use kebab-case keys like `order.valid`, `customer.tier`
3. **Declare Dependencies Explicitly** — do not rely on rule ordering alone
4. **Compensate Stateful Operations** — implement `ICompensatableRule<TContext>` for CreateOrderRule, SendNotificationRule
5. **Test Phase 1 & 2 Separately** — verify conditions work independently from side effects
6. **Use Dry-Run Before Activation** — validate rule logic via `/api/v1/rulesets/{workflow}/dry-run`
7. **Monitor Quota Usage** — alert when tenants approach limits

## See Also

- [Decision Table Guide](../decision-table-guide.md) — runtime-managed rules with FEEL
- [Rule Engine Advanced Patterns](../rule-engine-advanced-patterns.md) — custom evaluators, flow graphs
- [FEEL Reference](../feel-reference.md) — expression syntax for decision tables
- [Control Plane API](../../04-api/control-plane-api.md) — ruleset CRUD + dry-run endpoints
