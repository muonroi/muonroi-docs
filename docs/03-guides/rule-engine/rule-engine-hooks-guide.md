---
title: Rule Engine Hooks Guide
sidebar_label: Hooks Guide
sidebar_position: 13
---

# Rule Engine Hooks Guide

Hook handlers enable you to inject cross-cutting concerns into the rule execution lifecycle. They run at specific execution points and can observe, log, audit, measure, or react to rule behavior without modifying your rule logic.

## Overview

Hooks integrate with the rule pipeline at key lifecycle points:

```
BeforeRule → Evaluate → Execute → AfterRule
     ↓                                    ↓
  Hook runs                           Hook runs
                ↑
             Error Hook (on exception)
```

Use hooks to:
- **Audit** — capture decisions for compliance or debugging
- **Log** — structure execution traces with rule metadata
- **Measure** — emit duration and performance metrics
- **React** — notify external systems on rule outcomes
- **Normalize** — standardize error responses

## Hook Points

The engine invokes hooks at nine execution points:

| Point | Phase | When | Result Available |
|-------|-------|------|-------------------|
| `BeforeRule` | Pre-evaluation | Before `EvaluateAsync()` | No (pass `Passed()`) |
| `AfterRule` | Post-execution | After `ExecuteAsync()` with duration | Yes, with elapsed time |
| `Error` | Exception | When rule throws during eval or exec | Yes (failure + duration) |
| `BeforeValidateInput` | Input validation | Before input schema validation | No |
| `BeforeMap` | Mapping | Before mapping request to domain objects | No |
| `BeforePersist` | Persistence | Before database write | No |
| `AfterPersist` | Persistence | After database write | Yes |
| `OnSuccess` | Outcome | After rule succeeds | Yes |
| `OnFailure` | Outcome | After rule fails | Yes |

For most use cases, focus on **BeforeRule**, **AfterRule**, and **Error**.

## `IHookHandler<TContext>` Interface

Hooks implement a single method:

```csharp
public interface IHookHandler<TContext>
{
    Task HandleAsync(
        HookPoint point,
        IRule<TContext> rule,
        RuleResult result,
        FactBag facts,
        TContext context,
        TimeSpan? duration = null,
        CancellationToken cancellationToken = default);
}
```

**Parameters:**

- `point` — which hook point is executing (BeforeRule, AfterRule, Error, etc.)
- `rule` — the current `IRule<TContext>` being executed
- `result` — the evaluation result (`IsSuccess`, `Errors` list)
- `facts` — the `FactBag` containing all decision data
- `context` — the execution context (your domain object)
- `duration` — elapsed time (null for BeforeRule, populated for AfterRule/Error)
- `cancellationToken` — for async cleanup

## Execution Order

1. All hooks matching the point execute **in registration order** (DI container order)
2. `BeforeRule` → rule `EvaluateAsync` → rule `ExecuteAsync` → `AfterRule`
3. If an exception occurs, `Error` hook fires instead of `AfterRule`
4. A **single hook exception stops the pipeline** unless you catch it internally

## Built-in Hooks

### AuditTrailHook

Captures rule execution events for compliance and troubleshooting:

```csharp
public sealed class AuditTrailHook<TContext>(
    IMLog<AuditTrailHook<TContext>> logger,
    Func<TContext, object?>? projector = null) : IHookHandler<TContext>
{
    public Task HandleAsync(
        HookPoint point,
        IRule<TContext> rule,
        RuleResult result,
        FactBag facts,
        TContext context,
        TimeSpan? duration = null,
        CancellationToken cancellationToken = default)
    {
        // Optional: minimize sensitive fields using projector
        object? minimal = projector?.Invoke(context);

        logger?.Info(
            "Audit {Point} {Rule} Success:{Success} Duration:{Duration}ms Context:{@Context} Facts:{@Facts}",
            point,
            rule.Name,
            result.IsSuccess,
            duration?.TotalMilliseconds ?? 0,
            minimal ?? context,
            facts);

        return Task.CompletedTask;
    }
}
```

Use a **projector** to strip PII before logging:

```csharp
Func<OrderContext, object?> projector = ctx => new
{
    ctx.OrderId,
    ctx.CustomerId,
    // Omit ctx.CreditCard, ctx.SSN, etc.
};

services.AddSingleton<IHookHandler<OrderContext>>(
    new AuditTrailHook<OrderContext>(logger, projector));
```

## Implementation Patterns

### Pattern 1: Structured Logging

Logs rule execution with context and decision data:

```csharp
public sealed class LoggingHook<TContext>(IMLog<LoggingHook<TContext>> logger)
    : IHookHandler<TContext>
{
    public async Task HandleAsync(
        HookPoint point,
        IRule<TContext> rule,
        RuleResult result,
        FactBag facts,
        TContext context,
        TimeSpan? duration = null,
        CancellationToken token = default)
    {
        // Avoid logging before evaluation
        if (point == HookPoint.BeforeRule)
        {
            logger?.Debug("Starting rule {Rule}", rule.Name);
            return;
        }

        string outcome = result.IsSuccess ? "PASS" : "FAIL";
        string elapsed = duration?.TotalMilliseconds.ToString("F2") ?? "N/A";

        if (point == HookPoint.AfterRule)
        {
            logger?.Info(
                "Rule {Rule} {Outcome} in {Elapsed}ms | Facts: {@Facts}",
                rule.Name,
                outcome,
                elapsed,
                facts);
        }
        else if (point == HookPoint.Error)
        {
            logger?.Warn(
                "Rule {Rule} ERROR after {Elapsed}ms | Errors: {Errors}",
                rule.Name,
                elapsed,
                string.Join("; ", result.Errors));
        }

        await Task.CompletedTask;
    }
}
```

Register it:

```csharp
services.AddSingleton<IHookHandler<OrderContext>, LoggingHook<OrderContext>>();
```

### Pattern 2: Metrics & Performance

Emit duration metrics for monitoring and alerting:

```csharp
public sealed class MetricsHook<TContext>(
    IMeterService meterService) : IHookHandler<TContext>
{
    public async Task HandleAsync(
        HookPoint point,
        IRule<TContext> rule,
        RuleResult result,
        FactBag facts,
        TContext context,
        TimeSpan? duration = null,
        CancellationToken token = default)
    {
        if (point == HookPoint.BeforeRule || duration is null)
            return;

        string ruleId = rule.Code ?? rule.Name ?? "unknown";
        double ms = duration.Value.TotalMilliseconds;

        // Emit histogram
        meterService.RecordDuration($"rule.execution.{ruleId}", ms);

        // Alert on slow rules
        if (ms > 1000)
        {
            meterService.IncrementCounter($"rule.slow.{ruleId}");
        }

        // Track outcomes
        string status = result.IsSuccess ? "pass" : "fail";
        meterService.IncrementCounter($"rule.{ruleId}.{status}");

        await Task.CompletedTask;
    }
}
```

### Pattern 3: Error Normalization

Standardizes exceptions with correlation IDs and context:

```csharp
public sealed class ErrorNormalizationHook<TContext>(
    IMLog<ErrorNormalizationHook<TContext>> logger,
    ICorrelationIdProvider correlationProvider) : IHookHandler<TContext>
{
    public async Task HandleAsync(
        HookPoint point,
        IRule<TContext> rule,
        RuleResult result,
        FactBag facts,
        TContext context,
        TimeSpan? duration = null,
        CancellationToken token = default)
    {
        if (point != HookPoint.Error)
            return;

        string correlationId = correlationProvider.GetId();
        string ruleId = rule.Code ?? rule.Name ?? "unknown";

        // Create normalized error envelope
        var normalizedError = new
        {
            CorrelationId = correlationId,
            RuleId = ruleId,
            Timestamp = DateTime.UtcNow,
            Duration = duration?.TotalMilliseconds,
            Errors = result.Errors,
            ContextType = context?.GetType().Name ?? "unknown",
            FactCount = facts?.Count ?? 0
        };

        logger?.Error(
            "Rule {Rule} failed with correlation {CorrelationId}: {@Error}",
            ruleId,
            correlationId,
            normalizedError);

        // Could also persist to exception database or send to observability service
        await Task.CompletedTask;
    }
}
```

### Pattern 4: Notification & Reaction

Publishes events to external systems (messaging, webhooks, notifications):

```csharp
public sealed class NotificationHook<TContext>(
    IMessagePublisher publisher) : IHookHandler<TContext>
{
    public async Task HandleAsync(
        HookPoint point,
        IRule<TContext> rule,
        RuleResult result,
        FactBag facts,
        TContext context,
        TimeSpan? duration = null,
        CancellationToken token = default)
    {
        if (point != HookPoint.AfterRule)
            return;

        // Only notify on specific rules or outcomes
        if (rule.Name == "ApproveHighValueOrder" && !result.IsSuccess)
        {
            await publisher.PublishAsync(
                new OrderApprovalFailedEvent
                {
                    RuleId = rule.Code,
                    Timestamp = DateTime.UtcNow,
                    Duration = duration,
                    Errors = result.Errors,
                    Facts = facts
                },
                cancellationToken: token);
        }

        await Task.CompletedTask;
    }
}
```

## Dependency Injection & Registration

Register hooks in order of execution:

```csharp
// Program.cs or Startup.cs
services.AddSingleton<IHookHandler<OrderContext>, LoggingHook<OrderContext>>();
services.AddSingleton<IHookHandler<OrderContext>, AuditTrailHook<OrderContext>>(
    sp => new AuditTrailHook<OrderContext>(
        sp.GetRequiredService<IMLog<AuditTrailHook<OrderContext>>>(),
        projector: ctx => new { ctx.OrderId } // Project sensitive fields
    ));
services.AddSingleton<IHookHandler<OrderContext>, MetricsHook<OrderContext>>();
services.AddSingleton<IHookHandler<OrderContext>, ErrorNormalizationHook<OrderContext>>();
services.AddSingleton<IHookHandler<OrderContext>, NotificationHook<OrderContext>>();
```

The `RuleOrchestrator<TContext>` receives all `IHookHandler<TContext>` via constructor injection:

```csharp
public sealed class RuleOrchestrator<TContext>(
    IEnumerable<IRule<TContext>> rules,
    IEnumerable<IHookHandler<TContext>> hooks,  // ← All registered hooks
    // ... other dependencies
)
```

Hooks execute in the order registered with DI.

## Hook Filtering by Point

To avoid unnecessary work, check the hook point:

```csharp
public async Task HandleAsync(
    HookPoint point,
    IRule<TContext> rule,
    RuleResult result,
    FactBag facts,
    TContext context,
    TimeSpan? duration = null,
    CancellationToken token = default)
{
    // Only process certain points
    switch (point)
    {
        case HookPoint.BeforeRule:
            // Pre-execution setup
            break;

        case HookPoint.AfterRule:
            // Post-execution, duration available
            break;

        case HookPoint.Error:
            // Exception handling
            break;

        default:
            // Ignore CRUD hooks, input validation, etc.
            return;
    }

    await Task.CompletedTask;
}
```

## FactBag Contents

The `FactBag` passed to hooks is a `Dictionary<string, object?>` containing:

- **Input facts** — values passed to `ExecuteAsync()`
- **Output facts** — values populated by rules via `OutputFields`
- **Graph keys** — if using flow graphs: `__graph.node.{nodeId}.*`

Access facts:

```csharp
if (facts.TryGetValue("approval_amount", out var amount))
{
    logger?.Info("Approval amount: {Amount}", amount);
}

if (facts.TryGetValue("__graph.node.ApprovalGateway.result", out var decision))
{
    logger?.Info("Gateway decision: {Decision}", decision);
}
```

## Best Practices

1. **Keep hooks fast** — avoid blocking I/O or expensive computation
2. **Use async** — always use `await` and respect `CancellationToken`
3. **Avoid side effects in BeforeRule** — the rule hasn't executed yet
4. **Handle null gracefully** — `rule.Code`, `rule.Name`, `context` may be null
5. **Log categorically** — use different log levels (Debug, Info, Warn, Error)
6. **Minimize context projection** — only keep what you need for compliance
7. **Fail safely** — catch exceptions in hooks to avoid stopping the pipeline
8. **Consider ordering** — logging before metrics before notifications

Example of a defensive hook:

```csharp
public async Task HandleAsync(
    HookPoint point,
    IRule<TContext> rule,
    RuleResult result,
    FactBag facts,
    TContext context,
    TimeSpan? duration = null,
    CancellationToken token = default)
{
    try
    {
        if (point == HookPoint.AfterRule && duration.HasValue)
        {
            await DoWorkAsync(rule, result, duration.Value, token);
        }
    }
    catch (OperationCanceledException) when (token.IsCancellationRequested)
    {
        // Expected if pipeline was cancelled
    }
    catch (Exception ex)
    {
        logger?.Error(ex, "Hook {Point} failed for rule {Rule}", point, rule?.Name);
        // Don't rethrow—continue execution
    }
}
```

## Execution Order Diagram

```
RuleOrchestrator.ExecuteAsync(context)
    ↓
    For each rule in dependency order:
        ↓
        [Quota check]
        ↓
        RunHooks(BeforeRule) ← Hook 1, Hook 2, ... Hook N in order
        ↓
        rule.EvaluateAsync()  ← Condition evaluation
        ↓
        rule.ExecuteAsync()   ← Side effects (if success)
        ↓
        [Measure duration]
        ↓
        RunHooks(AfterRule)   ← Hook 1, Hook 2, ... Hook N with duration
        ↓
        [Telemetry + Activity tags]
        ↓
    (Return)
    ↓
    If exception:
        ↓
        RunHooks(Error)       ← Hook 1, Hook 2, ... Hook N with error result
        ↓
        [Rethrow]
```

## See Also

- [Rule Engine Guide](rule-engine-guide.md) — how rules evaluate and execute
- [Advanced Patterns](rule-engine-advanced-patterns.md) — compensation, flow graphs, decision tables
- [Architecture Overview](../../02-concepts/architecture-overview.md) — deep dive into the pipeline
