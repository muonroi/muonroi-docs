# CEP Engine Guide

Complex Event Processing (CEP) fills the gap between single-request rules and behavior that only becomes meaningful over time. Use the Muonroi CEP package when a decision depends on a sequence of events, a time window, or a correlation key such as customer id, account id, session id, or device id.

Use stateless rules when a single payload already contains everything needed to decide. Use CEP when the answer depends on "how many times", "within how long", or "for which correlated stream".

Examples that fit CEP well:

- fraud detection: more than `N` transactions in `X` seconds
- operational alerting: repeated failures inside a short sliding window
- session behavior: too many login attempts for the same user or IP
- IoT monitoring: repeated threshold breaches for one device
- notification suppression: collapse bursts of equivalent events into one action

Examples that do not need CEP:

- a loan approval decision based on one application payload
- a price calculation using only the current cart
- a permission check for one request

## What ships today

The current package exposes four main pieces:

- `CepEngine<T>` in `Muonroi.RuleEngine.CEP` for in-memory event window evaluation
- `ICepConfigRepository` plus `InMemoryCepConfigRepository` and `EfCoreCepConfigRepository` for tenant-aware config CRUD
- `CepWindowBuilder` for readable DSL-style configuration and runtime window construction
- `CepController` under `/api/v1/rule-engine/cep` for CRUD and simulation
- `AddCepWeb()` for registering the repository, controller, database migrator, and UI manifest contributor

The current implementation is still intentionally explicit, but it is no longer only a demo surface:

- event windows are held in memory per `CepEngine<T>` instance
- config storage flows through `ICepConfigRepository`
- the default repository is tenant-aware and process-local in memory
- hosts can switch config persistence to PostgreSQL or SQL Server without changing controller contracts
- OpenTelemetry-style activity and meter hooks are emitted through `CepMetrics`
- simulation sorts incoming events by timestamp before evaluation
- supported window types are `Sliding` and `Tumbling`

That means the package is useful today for operator tooling, embedded CEP logic, and production hosts that need durable CEP configuration. Event windows themselves are still in-memory runtime state. If you need cross-node event buffering or distributed window coordination, add those concerns in the host application around the package instead of assuming they exist in the package already.

## Core concepts

### Events

An event is a payload plus:

- a correlation key
- a UTC timestamp

The runtime type is:

```csharp
public record CepEvent<T>(string Key, DateTime Timestamp, T Value);
```

The key is what isolates one stream from another. If you use customer id as the key, each customer gets a separate window. If you use device id, each device gets a separate window.

### Window size

`windowSize` defines how much history participates in the current evaluation.

Examples:

- `TimeSpan.FromSeconds(30)` for rapid fraud bursts
- `TimeSpan.FromMinutes(5)` for operational error spikes
- `TimeSpan.FromHours(1)` for slower quota or abuse signals

### Time to live (TTL)

`ttl` controls how long old events remain in the internal list before pruning. If you omit it, the engine uses `windowSize`.

In practice:

- use `ttl == windowSize` when the active window is all you care about
- use a larger `ttl` only when you need slightly longer retention for replay-like behavior

### Correlation key

Choose the smallest key that matches the decision boundary.

Good keys:

- `account-123`
- `user-42`
- `tenant-a:terminal-9`

Bad keys:

- `"default"` for all traffic in a multi-tenant stream
- a random GUID per event when you actually need user-level correlation

## Quick start in code

The low-level engine does not require ASP.NET. You can use it in an app service, message consumer, or background job.

```csharp
using Muonroi.RuleEngine.CEP;

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
    Console.WriteLine("Fraud alert candidate.");
}
```

Typical host-level pattern:

1. receive event
2. choose correlation key
3. append to `CepEngine<T>`
4. inspect returned window
5. trigger a Muonroi rule evaluation or business action

## ASP.NET quick start

Register the web endpoints in an ASP.NET host:

```csharp
using Muonroi.RuleEngine.CEP;

builder.Services.AddControllers();
builder.Services.AddCepWeb();
```

`AddCepWeb()` registers:

- `ICepConfigRepository` with the in-memory tenant-aware repository
- the controller assembly
- the CEP UI manifest contributor used by the UI engine catalog

To persist CEP configs in PostgreSQL or SQL Server, pass options:

```csharp
using Muonroi.RuleEngine.CEP;

builder.Services.AddCepWeb(options =>
{
    options.PostgresConnectionString = builder.Configuration.GetConnectionString("RuleEngineDb");
    options.Schema = "ruleengine";
});
```

Supported built-in persistence modes:

- default: `InMemoryCepConfigRepository`
- PostgreSQL: `EfCoreCepConfigRepository`
- SQL Server: `EfCoreCepConfigRepository`

When a relational connection string is configured, `AddCepWeb()` also wires `CepConfigDatabaseMigrator` so the CEP config table is created or migrated at startup.

The controller base route is:

```text
/api/v1/rule-engine/cep
```

## Window types

### Sliding window

Sliding windows answer "what happened in the last X time units relative to this event?"

Current implementation:

```csharp
private List<CepEvent<T>> GetSliding(List<CepEvent<T>> list, DateTime current)
{
    DateTime start = current - windowSize;
    return [.. list.Where(e => e.Timestamp > start && e.Timestamp <= current)];
}
```

Use sliding windows for:

- fraud spikes
- repeated retries
- burst detection
- rate limits

### Tumbling window

Tumbling windows answer "which fixed bucket does this event belong to?"

Current implementation:

```csharp
private List<CepEvent<T>> GetTumbling(List<CepEvent<T>> list, DateTime current)
{
    long windowTicks = windowSize.Ticks;
    long startTicks = current.Ticks / windowTicks * windowTicks;
    DateTime start = new(startTicks, DateTimeKind.Utc);
    DateTime end = start + windowSize;
    return [.. list.Where(e => e.Timestamp >= start && e.Timestamp < end)];
}
```

Use tumbling windows for:

- fixed reporting buckets
- batch notifications per minute
- billing or quota summaries that should not overlap

### Choosing between them

| Need | Prefer |
| --- | --- |
| "last 30 seconds from now" | Sliding |
| "current minute bucket" | Tumbling |
| overlapping alert conditions | Sliding |
| non-overlapping aggregation buckets | Tumbling |

## Out-of-order events

The current engine supports out-of-order arrival by inserting events into the per-key list using a binary search. That matters if your source transport retries or delivers late messages.

Operational implications:

- you still need trustworthy UTC timestamps
- if timestamps are wrong, the engine will still sort them and produce wrong windows deterministically
- late events can change the apparent count of the current returned window

If the event source can be minutes late, choose a TTL that reflects that reality and test the behavior explicitly.

## CEP controller API

The built-in controller is useful for operator-facing tooling and manual simulation. It now reads and writes through `ICepConfigRepository`, so hosts can replace the default repository without changing controller contracts.

### List configs

```http
GET /api/v1/rule-engine/cep
```

Returns all config entries ordered by `Name`.

### Get one config

```http
GET /api/v1/rule-engine/cep/{id}
```

Returns `404` if the config id does not exist.

### Save or update a config

```http
PUT /api/v1/rule-engine/cep/{id}
Content-Type: application/json

{
  "name": "fraud-window",
  "windowType": "Sliding",
  "windowSizeSeconds": 30,
  "timeToLiveSeconds": 120
}
```

Validation rules enforced by the controller:

- `name` is required
- `windowType` must parse to the `WindowType` enum

The controller stamps `UpdatedAtUtc` using `IMDateTimeService.UtcNow()`.

### Simulate a config

```http
POST /api/v1/rule-engine/cep/{id}/simulate
Content-Type: application/json

{
  "events": [
    {
      "key": "customer-42",
      "timestampUtc": "2026-03-09T10:00:00Z",
      "payload": { "amount": 120, "channel": "card" }
    },
    {
      "key": "customer-42",
      "timestampUtc": "2026-03-09T10:00:10Z",
      "payload": { "amount": 140, "channel": "card" }
    }
  ]
}
```

Response shape:

- `config.id`
- `config.name`
- `processedEvents`
- `windows[]`

Each `windows[]` item includes:

- `key`
- `timestampUtc`
- `count`

The current simulation endpoint is intentionally count-oriented. If you need richer simulation output, extend the host API with domain-specific summaries rather than overloading the generic package.

## Production persistence

The package now supports durable CEP configuration out of the box through `EfCoreCepConfigRepository`.

What becomes durable when you configure PostgreSQL or SQL Server:

- CEP config CRUD done through `CepController`
- tenant-scoped config lookup through `ICepConfigRepository`
- restart-safe config storage

What remains in-memory runtime state:

- event buffers inside each `CepEngine<T>` instance
- active window membership and counts
- cross-node correlation behavior

Recommended production pattern:

1. keep `CepEngine<T>` close to the service that owns the event stream
2. persist CEP configs with `AddCepWeb(options => ...)`
3. reload or resolve config through `ICepConfigRepository` when operator changes are applied
4. use the controller simulation flow as an operator convenience layer
5. use the `FraudDetection` sample as the reference host when bootstrapping a CEP-backed API

A small host-level record usually works well:

```csharp
public sealed record TenantCepConfig(
    string TenantId,
    string ConfigId,
    string Name,
    string WindowType,
    int WindowSizeSeconds,
    int TimeToLiveSeconds);
```

If you need multi-node state, externalize event buffering and coordination. The package gives you durable config, not distributed window state.

## Observability and OpenTelemetry

The CEP package publishes a dedicated `ActivitySource` and `Meter` through `CepMetrics`.

Built-in telemetry:

- `ActivitySource("Muonroi.CEP")`
- counter `cep.events.processed`
- counter `cep.window.evaluations`
- histogram `cep.window.event.count`
- counter `cep.config.reads`
- counter `cep.config.writes`

What you can observe today:

- ASP.NET request traces around `CepController` through your normal host instrumentation
- CEP evaluation traces and metrics through `CepMetrics`
- your own application counters around emitted alerts, dropped events, or matched windows

Recommended host instrumentation:

```csharp
builder.Services.AddMuonroiOpenTelemetry(builder.Configuration);
```

Then add custom counters around host-specific CEP decisions:

```csharp
private static readonly Meter Meter = new("MyCompany.Cep");
private static readonly Counter<long> Alerts = Meter.CreateCounter<long>("cep.alerts");
```

Practical metrics to track:

- `cep.events.processed`
- `cep.window.evaluations`
- `cep.alerts.emitted`
- `cep.simulation.requests`
- `cep.late.events`

Cross-reference the platform-level observability setup in [Observability Guide](../../04-operations/observability-guide.md).

## Multi-tenant isolation

There are two different isolation layers to think about:

### Event-key isolation inside one engine instance

`CepEngine<T>` isolates streams by the `key` argument. Events for `tenant-a:user-1` do not mix with `tenant-a:user-2`.

### Tenant isolation at the host boundary

The package now persists CEP configs in a tenant-aware way through `ICepConfigRepository`. If you are hosting CEP for many tenants:

- include tenant id in the correlation key or engine partition when the stream itself is multi-tenant
- let `ICepConfigRepository` resolve config by current execution context tenant
- never reuse a generic `"default"` runtime key across unrelated tenants
- secure admin APIs with tenant-aware authorization

Good pattern:

```text
config id: tenant-a/fraud-window
event key: tenant-a:customer-42
```

Bad pattern:

```text
config id: fraud-window
event key: customer-42
```

## Integrating CEP with the rule engine

CEP is usually a trigger, not the final decision engine. A typical flow is:

1. CEP receives events
2. active window crosses a threshold
3. the app creates a fact payload
4. Muonroi rule engine evaluates the downstream rule set
5. the app emits an alert or action

Example:

```csharp
IReadOnlyList<CepEvent<TransactionEvent>> window = cepEngine.AddEvent(
    request.CustomerId,
    request,
    request.TimestampUtc);

if (window.Count >= 3)
{
    Dictionary<string, object?> facts = new(StringComparer.OrdinalIgnoreCase)
    {
        ["transactionCountInWindow"] = window.Count,
        ["customerId"] = request.CustomerId,
        ["channel"] = request.Channel
    };

    // Then pass facts into your Muonroi ruleset or orchestrator.
}
```

This pairing works especially well when:

- CEP decides whether a burst is suspicious
- stateless rules decide what to do next
- decision tables decide which escalation path to take

Cross-reference the core rules runtime in [Rule Engine Guide](./rule-engine-guide.md).

## Troubleshooting

### Window counts look too low

Check:

- timestamps are UTC
- the correct correlation key is used
- `windowSizeSeconds` is large enough for the expected burst

### Counts jump unexpectedly

Likely causes:

- out-of-order events arriving late
- a tumbling window was used where a sliding window was expected
- different tenants or users accidentally share the same key

### Config disappears after restart

That is expected with the current built-in controller. Persist config in the host application if you need durability.

### Multi-node instances disagree

That is also expected if each node keeps its own in-memory engine state. Use a shared state strategy in your host architecture when you scale out.

## Recommended next reading

- [Rule Engine Guide](./rule-engine-guide.md)
- [Rule Engine Testing Guide](./rule-engine-testing-guide.md)
- [Observability Guide](../../04-operations/observability-guide.md)
