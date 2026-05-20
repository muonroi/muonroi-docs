---
title: Observability & Diagnostics Packages
sidebar_label: Observability
sidebar_position: 11
---

# Observability & Diagnostics Packages

Muonroi provides a comprehensive set of NuGet packages for structured logging, distributed tracing, diagnostics, and OpenTelemetry metrics integration.

:::tip **Quick Start**
Register observability with `AddObservability(configuration)` and structured logging with `AddMuonroiLogging()`:

```csharp
var builder = WebApplicationBuilder.CreateBuilder(args);

builder.Services.AddMuonroiLogging();
builder.Services.AddObservability(builder.Configuration);

var app = builder.Build();
app.Run();
```
:::

---

## Muonroi.Logging.Abstractions

**NuGet:** `Muonroi.Logging.Abstractions` | **Tier:** OSS | **Distribution:** NuGet.org | **Target:** `net8.0`

Core abstraction layer for structured logging. Provides interfaces and conventions for all logging infrastructure.

### Purpose

Defines the contract for structured, context-aware logging with causal chain tracing support. Extends .NET's `ILogger<T>` with convenience methods and scope management for property-based correlation.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IMLog<T>` | interface | Generic structured logger (extends `ILogger<T>`) with helper methods |
| `IMLog` | interface | Untyped structured logger (extends `ILogger`) |
| `IMLogFactory` | interface | Factory for creating `IMLog` instances |
| `IMLogContext` | interface | Context scope manager for property propagation |
| `IMLogContextScope` | interface | Disposable scope for log context |
| `LogPropertyConventions` | class | Standard property key constants |

### IMLog\<T\> vs ILogger\<T\>

**IMLog\<T\>** extends `ILogger<T>` with convenience methods and better structured logging patterns:

```csharp
// ILogger<T> (bare)
logger.LogInformation("User {UserId} logged in", userId);

// IMLog<T> (Muonroi)
log.Info("User logged in", new { UserId = userId });
log.BeginProperty("user.id", userId);
log.Warn("High latency detected", new { DurationMs = 5000 });
log.Error(ex, "Execution failed");
```

**Key differences:**

| Feature | `ILogger<T>` | `IMLog<T>` |
|---------|------------|----------|
| Structured methods | `LogInformation`, `LogError`, etc. | `Info()`, `Error()`, `Warn()`, `Debug()` |
| Property scopes | Requires manual scope construction | `BeginProperty(key, value)` |
| Trace integration | None | Records to active `ITraceSession` |
| Causal context | No built-in support | Via `BeginProperty()` |

### DI Registration

```csharp
using Muonroi.Logging;

var builder = WebApplicationBuilder.CreateBuilder(args);

// Register Muonroi logging
builder.Logging.AddMuonroiLogging();

var app = builder.Build();
```

The `AddMuonroiLogging()` extension registers:
- `IMLogContext` — singleton context scope manager
- `IMLog<T>` → `MLog<T>` — generic logger implementation
- `IMLogFactory` → `MLogFactory` — factory service
- `ILogScopeFactory` — scope factory for context mirroring

### Usage Example

```csharp
using Muonroi.Logging.Abstractions;

public class OrderProcessor(IMLog<OrderProcessor> log)
{
    public async Task ProcessOrderAsync(string orderId, string tenantId)
    {
        // Begin a property scope
        using (log.BeginProperty(LogPropertyConventions.TenantId, tenantId))
        using (log.BeginProperty("order.id", orderId))
        {
            log.Info("Processing order", new { OrderId = orderId, TenantId = tenantId });

            try
            {
                var result = await ExecuteOrderAsync(orderId);
                log.Info("Order completed successfully", new { Status = result.Status });
            }
            catch (Exception ex)
            {
                log.Error(ex, "Order processing failed", new { OrderId = orderId });
                throw;
            }
        }
    }
}
```

### LogPropertyConventions

Standard property keys for consistent structure logging across the ecosystem:

```csharp
public static class LogPropertyConventions
{
    public const string TenantId = "TenantId";         // Tenant identifier
    public const string UserId = "UserId";             // User identifier
    public const string CorrelationId = "CorrelationId"; // Request correlation ID
    public const string TraceSessionId = "TraceSessionId"; // Active trace session
    public const string RuleCode = "RuleCode";         // Rule execution code
    public const string RequestName = "RequestName";   // HTTP request name
}
```

---

## Muonroi.Logging

**NuGet:** `Muonroi.Logging` | **Tier:** OSS | **Dependency:** Muonroi.Logging.Abstractions | **Target:** `net8.0`

Default implementation of structured logging with execution context integration and trace session recording.

### Purpose

Provides production-ready `IMLog<T>` implementation that integrates with .NET's logging framework, automatically enriches logs with execution context (tenant, user, correlation ID), and records structured events to active trace sessions.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MLog<T>` | class | Implementation of `IMLog<T>` with context enrichment |
| `MLogContext` | class | Scope-based context property storage |
| `MLogContextScope` | class | Disposable scope wrapper |
| `MLogFactory` | class | Factory for creating `MLog<T>` instances |
| `MLogScopeFactory` | class | Scope factory for context mirroring |

### Architecture

```
MLog<T>
  ├─ ILogger<T> (inner)
  ├─ ISystemExecutionContextAccessor (tenant/user/correlation)
  ├─ IMLogContext (scope management)
  └─ IMTraceContext (trace session recording)
```

When a log method is called:
1. Automatic execution scope is applied (tenant, user, correlation ID properties)
2. Inner `ILogger<T>` logs the message (via Serilog, Console, etc.)
3. If an active trace session exists, the message is recorded to the session

### DI Registration

```csharp
using Muonroi.Logging;

var builder = WebApplicationBuilder.CreateBuilder(args);

// Add base logging
builder.Logging.AddConsole();

// Add Muonroi structured logging
builder.Logging.AddMuonroiLogging();

var app = builder.Build();
```

After registration, inject `IMLog<T>` into services:

```csharp
public class MyService(IMLog<MyService> log)
{
    // log is fully initialized with context
}
```

### Usage Example

```csharp
using Muonroi.Logging.Abstractions;
using Muonroi.Core.Abstractions.Context;

public class PaymentService(
    IMLog<PaymentService> log,
    ISystemExecutionContextAccessor contextAccessor)
{
    public async Task<PaymentResult> ProcessPaymentAsync(string orderId, decimal amount)
    {
        // Automatic context enrichment (tenant, user, correlation ID)
        log.Info("Starting payment processing", new { OrderId = orderId, Amount = amount });

        try
        {
            // Manual property scope
            using (log.BeginProperty("payment.order_id", orderId))
            using (log.BeginProperty("payment.amount", amount))
            {
                var result = await CallPaymentGatewayAsync(orderId, amount);
                
                log.Info("Payment successful", new { 
                    TransactionId = result.TransactionId,
                    Status = result.Status 
                });
                
                return result;
            }
        }
        catch (Exception ex)
        {
            log.Error(ex, "Payment processing failed");
            throw;
        }
    }
}
```

### Log Methods

All methods in `IMLog<T>` automatically log to the underlying provider and record to the active trace session:

- **`Info(template, ...args)`** — Informational message
- **`Warn(template, ...args)`** — Warning message
- **`Error(ex, template, ...args)`** — Error with exception
- **`Debug(template, ...args)`** — Debug message
- **`InfoTrace(template, ...args)`** — Info with explicit trace override
- **`BeginProperty(key, value)`** → `IMLogContextScope` — Property scope

---

## Muonroi.Diagnostics

**NuGet:** `Muonroi.Diagnostics` | **Tier:** OSS | **Dependency:** Muonroi.Core.Abstractions | **Target:** `net8.0`

Causal chain tracing for debugging and auditability. Records execution flow as hierarchical nodes with full state snapshots.

### Purpose

Provides in-memory and Redis-backed trace session storage for capturing complete execution traces, including fact snapshots (FactBag state), line-level variable tracing, branch conditions, and exceptions. Used for debugging rules, tracing multi-tenant execution, and compliance audits.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IMTraceContext` | interface | Facade for creating/accessing trace sessions |
| `ITraceSession` | interface | Active trace session for recording events |
| `MTraceContext` | class | Implementation of `IMTraceContext` |
| `MTraceSession` | class | Session state: nodes, events, snapshots |
| `MTraceSessionScope` | class | Disposable session scope |
| `ITraceSessionStore` | interface | Persistence layer (in-memory or Redis) |
| `InMemoryTraceSessionStore` | class | Volatile storage |
| `RedisTraceSessionStore` | class | Distributed Redis-backed storage |

### Causal Chain Tracing Concepts

A trace session captures the execution flow as a **causal chain**: a tree of named nodes (functions, rules, decisions) with:

- **Hierarchy** — parent-child relationships for sub-calls
- **Timing** — start/end times and duration
- **Events** — log messages and annotations
- **State** — input/output fact snapshots (before/after state)
- **Line traces** — variable values and branch conditions (if enabled)
- **Errors** — exception details and failure reasons

Example trace tree:
```
RuleOrchestrator.Execute (root)
  ├─ Rule_001.Evaluate
  │   ├─ Condition.Check (line 12: if balance > 1000)
  │   ├─ FactBag.CoerceValue (before: {balance: "999"}, after: {balance: 999})
  │   └─ [Event] Rule matched
  ├─ Rule_001.Execute
  │   ├─ ApprovalService.SendAsync
  │   └─ [Event] Approval sent
  └─ Rule_002.Evaluate
      └─ [Error] Null reference exception
```

### DI Registration

Choose in-memory or Redis storage:

```csharp
using Muonroi.Diagnostics;

var builder = WebApplicationBuilder.CreateBuilder(args);

// Option 1: In-memory (development)
builder.Services.AddMuonroiDiagnostics();

// Option 2: Redis-backed (production)
builder.Services.AddMuonroiDiagnosticsRedis();

var app = builder.Build();
```

### Usage Example: Creating Trace Sessions

```csharp
using Muonroi.Core.Abstractions.Diagnostics;

public class RuleExecutor(IMTraceContext traceContext)
{
    public async Task<RuleResult> ExecuteAsync(string ruleId, string tenantId)
    {
        // Begin a trace session
        using var traceScope = traceContext.Begin(
            sessionId: Guid.NewGuid().ToString(),
            tenantId: tenantId,
            userId: "user123",
            lineTraceEnabled: true  // Enable variable tracing
        );

        var session = traceContext.Current;
        if (session != null)
        {
            // Record a named node (e.g., rule evaluation)
            using (session.BeginNode("Rule_001.Evaluate", MTraceNodeType.Rule))
            {
                // Record an event
                session.Record("Evaluating rule condition", new { RuleId = ruleId });

                // Record fact snapshots
                session.RecordFactSnapshot("before", new Dictionary<string, object?>
                {
                    { "amount", 5000 },
                    { "status", "pending" }
                });

                // Execute rule logic
                var result = await EvaluateRuleAsync(ruleId);

                // Record output snapshot
                session.RecordFactSnapshot("after", new Dictionary<string, object?>
                {
                    { "approved", result.Approved },
                    { "reason", result.Reason }
                });

                // Record line traces (if enabled)
                session.RecordLineTrace(
                    line: 42,
                    variable: "approved",
                    value: result.Approved,
                    sourceMember: "EvaluateCondition"
                );

                if (!result.Success)
                {
                    session.MarkFailed("Rule evaluation failed", new InvalidOperationException("..."));
                }
            }
        }

        return ruleResult;
    }
}
```

### Recording Fact Snapshots

Use `RecordFactSnapshot()` to capture the state of the FactBag before and after operations:

```csharp
var session = traceContext.Current;

// Before operation
session.RecordFactSnapshot("before", factBag.AsReadOnly());

// Perform operation
factBag.Set("user.tier", "premium");
factBag.Set("user.quota", 10000);

// After operation
session.RecordFactSnapshot("after", factBag.AsReadOnly());
```

The snapshot is stored as JSON for visibility in trace exports.

### Recording Line Traces

When `lineTraceEnabled=true`, capture variable values at specific lines:

```csharp
session.RecordLineTrace(
    line: 25,
    variable: "balance",
    value: account.Balance,
    sourceMember: "CalculateBalance"
);
```

Also record branch conditions:

```csharp
bool approved = amount <= limit;
session.RecordBranchTrace(
    line: 30,
    condition: "amount <= limit",
    taken: approved
);
```

### Exporting Trace Sessions

Export a session to JSON for external analysis:

```csharp
if (session != null)
{
    var record = session.Export();
    string json = jsonService.Serialize(record);
    // Store in database, send to logging backend, etc.
}
```

The exported record includes:
```json
{
  "sessionId": "abc123",
  "tenantId": "tenant-x",
  "userId": "user123",
  "startedAt": "2024-01-15T10:30:45Z",
  "durationMs": 125.5,
  "hasErrors": false,
  "nodes": [
    {
      "nodeId": "node-1",
      "name": "Rule_001.Evaluate",
      "type": "Rule",
      "startedAt": "2024-01-15T10:30:45Z",
      "durationMs": 50.2,
      "inputFactsJson": "{...}",
      "outputFactsJson": "{...}",
      "lineTraces": [...],
      "events": [...]
    }
  ]
}
```

### MCausalChainOptions

Configure causal chain behavior via `MCausalChainOptions`:

```csharp
public class MCausalChainOptions
{
    /// <summary>Enable line-level variable tracing.</summary>
    public bool EnableLineTracing { get; set; } = false;

    /// <summary>Maximum depth of trace tree.</summary>
    public int MaxDepth { get; set; } = 100;

    /// <summary>Maximum events per node.</summary>
    public int MaxEventsPerNode { get; set; } = 1000;

    /// <summary>Fact snapshot JSON size limit (bytes).</summary>
    public int MaxFactSnapshotSize { get; set; } = 10240;
}
```

---

## Muonroi.Diagnostics.Generator

**NuGet:** `Muonroi.Diagnostics.Generator` | **Tier:** OSS | **Target:** `netstandard2.0` (source generator)

Roslyn source generator for automatic trace instrumentation of methods.

### Purpose

Generates trace wrapper code for methods decorated with `[MTraceable]` attribute, eliminating boilerplate for creating trace nodes and recording exceptions.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `TraceableGenerator` | class | `IIncrementalGenerator` — finds and instruments `[MTraceable]` methods |
| `TraceableSyntaxRewriter` | class | AST rewriter for injecting trace begin/end calls |
| `MTraceableAttribute` | attribute | Marks methods for trace instrumentation |

### How It Works

The generator scans for methods with `[MTraceable]` attribute and generates wrapper methods that:

1. Create a trace node with the method name
2. Call the original method
3. Record the result or exception
4. Clean up the node scope

### Usage

Decorate a method with `[MTraceable]`:

```csharp
using Muonroi.Core.Abstractions.Diagnostics;

public partial class OrderService
{
    [MTraceable]
    public async Task<OrderResult> ProcessOrderAsync(string orderId)
    {
        // Original implementation
        // Generated code will wrap this with:
        // using var scope = traceContext.Current?.BeginNode("ProcessOrderAsync", MTraceNodeType.Custom);
        return await ExecuteAsync(orderId);
    }
}
```

At build time, the generator creates:

```csharp
// Generated: OrderService_Traces.g.cs
partial class OrderService
{
    public void ProcessOrderAsync_TraceWrapper()
    {
        using var scope = MTraceContextHolder.Current.Value?.BeginNode(
            "ProcessOrderAsync",
            MTraceNodeType.Custom
        );
        ProcessOrderAsync();
    }
}
```

---

## Muonroi.Observability

**NuGet:** `Muonroi.Observability` | **Tier:** OSS | **Dependency:** Muonroi.Logging.Abstractions, Muonroi.Diagnostics | **Target:** `net8.0`

OpenTelemetry integration with tenant-aware instrumentation, metrics, and log sanitization.

### Purpose

Centralizes OpenTelemetry setup for distributed tracing, metrics collection, and structured logging enrichment. Integrates with rule engine, gRPC services, message bus, and distributed cache. Provides tenant-aware span tagging and activity source discovery.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `OtelSetup` | class | Main extension method `AddObservability()` |
| `MuonroiMetrics` | class | Centralized meter with standard counters |
| `MuonroiTraceProcessor` | class | Custom OpenTelemetry processor for exception tagging |
| `TenantIdEnricher` | class | BaseProcessor for adding tenant.id to spans |
| `OpenTelemetryConfigs` | class | Configuration binding from appsettings |
| `ILogSanitizer` | interface | Log payload sanitization (PII removal) |
| `LogSanitizer` | class | Default implementation |
| `MLogEntry` | class | Structured log entry model |

### DI Registration

```csharp
using Muonroi.Observability;

var builder = WebApplicationBuilder.CreateBuilder(args);

// Register observability (tracing, metrics, logs)
builder.Services.AddObservability(builder.Configuration);

var app = builder.Build();
```

The `AddObservability()` method wires:

1. **Tracing**
   - AspNetCore instrumentation
   - gRPC client instrumentation
   - HTTP client instrumentation
   - MassTransit sources
   - Custom activity sources (discovered via `ITelemetryDescriptor`)

2. **Metrics**
   - AspNetCore metrics
   - Runtime metrics
   - MassTransit meters
   - Custom meters (discovered via `ITelemetryDescriptor`)
   - `MuonroiMetrics.Meter` — standard Muonroi metrics

3. **Processors**
   - `TenantActivityEnricher` — adds `tenant.id` tag to all spans
   - `MuonroiTraceProcessor` — tags exceptions with category/error code

4. **Exporters**
   - OTLP (OpenTelemetry Protocol) — gRPC or HTTP
   - Jaeger
   - Zipkin
   - Prometheus (metrics only)

### Configuration (appsettings.json)

```json
{
  "OpenTelemetry": {
    "Enabled": true,
    "ServiceName": "my-app",
    "ServiceVersion": "1.0.0",
    "Environment": "production",
    "OtlpEndpoint": "http://otel-collector:4317",
    "Tracing": {
      "Enabled": true,
      "BatchSize": 512,
      "ExportIntervalMilliseconds": 5000
    },
    "Metrics": {
      "Enabled": true,
      "IntervalMilliseconds": 60000
    }
  }
}
```

Configuration keys:

| Key | Type | Default | Purpose |
|-----|------|---------|---------|
| `Enabled` | bool | true | Master switch for all observability |
| `ServiceName` | string | app name | Service identifier in traces |
| `ServiceVersion` | string | app version | Version tag |
| `Environment` | string | "production" | Environment label |
| `OtlpEndpoint` | string | null | OpenTelemetry Protocol endpoint |
| `Tracing.Enabled` | bool | true | Enable distributed tracing |
| `Tracing.BatchSize` | int | 512 | Spans per batch |
| `Tracing.ExportIntervalMilliseconds` | int | 5000 | Flush interval |
| `Metrics.IntervalMilliseconds` | int | 60000 | Metrics export interval |

### Standard Metrics (MuonroiMetrics)

All metrics are available via the centralized `MuonroiMetrics.Meter`:

```csharp
// Counter: Guard violations
MuonroiMetrics.GuardViolations.Add(1, new TagList { { "violation.type", "null_check" } });

// Counter: Total exceptions
MuonroiMetrics.ExceptionCount.Add(1, new TagList { { "category", "validation" } });

// Counter: Retry attempts
MuonroiMetrics.RetryAttemptCount.Add(1, new TagList { { "service", "payment" } });
```

### IMTraceContext Integration

The `IMTraceContext` is automatically available after registration. Use it to create custom trace sessions:

```csharp
public class MyService(IMTraceContext traceContext)
{
    public async Task DoWorkAsync()
    {
        using var scope = traceContext.Begin(
            sessionId: Guid.NewGuid().ToString(),
            tenantId: "tenant-123",
            userId: "user456",
            lineTraceEnabled: false
        );

        var session = traceContext.Current;
        if (session != null)
        {
            using (session.BeginNode("WorkPhase1", MTraceNodeType.Custom))
            {
                session.Record("Starting phase 1");
                // Do work
            }
        }
    }
}
```

### ITelemetryDescriptor Discovery

The OtelSetup uses reflection to discover activity sources and meters from `ITelemetryDescriptor` implementations. This allows decentralized telemetry registration:

```csharp
// In a sub-package
public class MyTelemetryDescriptor : ITelemetryDescriptor
{
    public IReadOnlyList<string> ActivitySourceNames => new[] { "My.Custom.Source" };
    public IReadOnlyList<string> MeterNames => new[] { "My.Custom.Meter" };
}

// Automatically discovered and registered by OtelSetup
```

### Log Sanitization

The `ILogSanitizer` removes sensitive data (PII, credentials) from logs before export:

```csharp
public interface ILogSanitizer
{
    string Sanitize(string input);
    object? SanitizeObject(object? obj);
}
```

Implementations detect and redact:
- Email addresses
- Phone numbers
- Credit card numbers
- API keys / tokens
- Passwords

### TenantIdEnricher

Automatically adds tenant context to all OpenTelemetry spans via `ISystemExecutionContextAccessor`:

```csharp
// Before: span has no tenant.id tag
activity.SetTag("request.path", "/api/orders");

// After OtelSetup registers TenantActivityEnricher:
activity.SetTag("request.path", "/api/orders");
activity.SetTag("tenant.id", "tenant-xyz");  // Auto-added
```

---

## Integration: Complete Example

Here's a complete example using all packages together:

```csharp
using Muonroi.Logging;
using Muonroi.Diagnostics;
using Muonroi.Observability;
using Muonroi.Logging.Abstractions;
using Muonroi.Core.Abstractions.Diagnostics;

var builder = WebApplicationBuilder.CreateBuilder(args);

// 1. Add structured logging
builder.Logging.AddMuonroiLogging();

// 2. Add diagnostics (trace sessions)
builder.Services.AddMuonroiDiagnostics();  // or AddMuonroiDiagnosticsRedis()

// 3. Add observability (OpenTelemetry, metrics, exporters)
builder.Services.AddObservability(builder.Configuration);

var app = builder.Build();

app.MapPost("/api/orders", ProcessOrderEndpoint);
app.Run();

// Endpoint
async Task<IResult> ProcessOrderEndpoint(
    HttpContext httpContext,
    IMLog<Program> log,
    IMTraceContext traceContext,
    OrderService orderService)
{
    var correlationId = httpContext.TraceIdentifier;
    var tenantId = httpContext.User.FindFirst("tenant_id")?.Value ?? "unknown";

    // Begin trace session for full execution tracing
    using var traceScope = traceContext.Begin(
        sessionId: Guid.NewGuid().ToString(),
        tenantId: tenantId,
        userId: httpContext.User.Identity?.Name,
        lineTraceEnabled: false
    );

    // Log with automatic context enrichment
    using (log.BeginProperty(LogPropertyConventions.CorrelationId, correlationId))
    using (log.BeginProperty(LogPropertyConventions.TenantId, tenantId))
    {
        log.Info("Processing order", new { CorrelationId = correlationId });

        try
        {
            var result = await orderService.ProcessAsync("ORD-001", 5000m);

            log.Info("Order processed successfully", new { OrderId = "ORD-001", Status = result.Status });

            // Export trace session
            var session = traceContext.Current;
            if (session != null)
            {
                var traceRecord = session.Export();
                // Store in database for audit trail
            }

            return Results.Ok(result);
        }
        catch (Exception ex)
        {
            log.Error(ex, "Order processing failed");

            var session = traceContext.Current;
            if (session != null)
            {
                var traceRecord = session.Export();
                // Log exception with full trace context
            }

            return Results.BadRequest(new { Error = ex.Message });
        }
    }
}

public class OrderService(IMLog<OrderService> log, IMTraceContext traceContext)
{
    public async Task<OrderResult> ProcessAsync(string orderId, decimal amount)
    {
        using (log.BeginProperty("order.id", orderId))
        using (log.BeginProperty("order.amount", amount))
        {
            var session = traceContext.Current;

            using (session?.BeginNode("ValidateOrder", MTraceNodeType.Rule))
            {
                log.Info("Validating order");

                if (amount <= 0)
                {
                    session?.MarkFailed("Invalid amount");
                    throw new InvalidOperationException("Amount must be positive");
                }
            }

            using (session?.BeginNode("ApproveOrder", MTraceNodeType.Rule))
            {
                log.Info("Approving order");
                await Task.Delay(100);
            }

            log.Info("Order processing complete");
            return new OrderResult { Status = "approved" };
        }
    }
}

public record OrderResult
{
    public string Status { get; set; } = string.Empty;
}
```

---

## Best Practices

1. **Always use IMLog\<T\>** — It's fully integrated with tenant context and trace sessions.
2. **Begin trace sessions at request boundaries** — HTTP endpoints, message handlers, background jobs.
3. **Use BeginProperty() for correlation** — Tenant, user, correlation ID should be in scope.
4. **Record fact snapshots in rule execution** — Before/after FactBag state is critical for debugging.
5. **Enable line tracing selectively** — It's verbose; use only for high-priority debugging.
6. **Export trace sessions** — Store them in a database for audit trails and compliance.
7. **Use MuonroiMetrics for custom counters** — Keeps all metrics under one meter.
8. **Set OtlpEndpoint in appsettings** — So traces and metrics flow to your observability backend.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                       Application                        │
└──┬──────────────────────────────────────────────────────┘
   │
   ├─ IMLog<T> ──────────────────────────────────────────┐
   │  (structured logging with context)                  │
   │                                                     │
   └─► MLog<T>                                          │
       ├─ ILogger<T> (logs to Serilog/Console)         │
       └─ IMTraceContext.Current ──────────────────────┼──┐
          (records to active trace session)             │  │
                                                        │  │
   ├─ IMTraceContext                                   │  │
   │  (creates/accesses trace sessions)                │  │
   │                                                     │  │
   └─► MTraceContext                                   │  │
       └─ MTraceSession (hierarchical nodes)           │  │
          ├─ RecordFactSnapshot()                       │  │
          ├─ RecordLineTrace()                          │  │
          ├─ BeginNode() → MTraceNodeRecord             │  │
          └─ Export() → JSON                            │  │
                                                        │  │
   ├─ OpenTelemetry (OtelSetup.AddObservability())     │  │
   │                                                     │  │
   ├─► TracerProvider                                   │  │
   │   ├─ ActivitySource: Muonroi.RuleEngine           │  │
   │   ├─ Processors: TenantActivityEnricher           │◄──┘
   │   │           MuonroiTraceProcessor               │
   │   └─ Exporters: OTLP, Jaeger, Zipkin              │
   │                                                     │
   └─► MeterProvider                                    │
       ├─ Meter: Muonroi.Ecosystem.Core                 │
       ├─ Counters: GuardViolations, ExceptionCount     │
       └─ Exporters: OTLP, Prometheus                   │
```

---

## See Also

- [Observability Guide](../../04-operations/observability-guide.md) — Complete observability setup and configuration
- [appsettings Configuration](../appsettings-guide.md) — OpenTelemetry configuration reference
- [Rule Engine Fundamentals](../../03-guides/rule-engine/rule-engine-guide.md) — How traces integrate with rule execution
- [Troubleshooting Guide](../../04-operations/troubleshooting-guide.md) — Using logs and traces for debugging
