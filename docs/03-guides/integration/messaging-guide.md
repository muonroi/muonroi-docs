# Messaging Guide

`Muonroi.Messaging.MassTransit` is the Commercial messaging package built on [MassTransit](https://masstransit.io/). It wires tenant context, security, observability, outbox reliability, quota enforcement, and rule-based routing into a single coherent pipeline — all behind a single `AddMessageBus()` call.

---

## 1. Prerequisites

| Requirement | Notes |
|-------------|-------|
| License tier | `Premium.MessageBus` feature required |
| Transport | RabbitMQ or Kafka |
| Packages | `Muonroi.Messaging.MassTransit`, `Muonroi.Messaging.Abstractions` |

---

## 2. Registration

```csharp
// Program.cs
builder.Services.AddMessageBus(builder.Configuration, consumersAssembly: typeof(Program).Assembly);

// Optional: persistent outbox relay
builder.Services.AddOutboxRelay();
```

`AddMessageBus` registers:
- All consumers from the specified assembly
- The full filter pipeline (see §4)
- OpenTelemetry tracing + metrics
- Health checks for the configured transport

---

## 3. Configuration

### `appsettings.json`

```json
{
  "MessageBusConfigs": {
    "BusType": "RabbitMq",
    "RabbitMq": {
      "Host": "localhost",
      "Port": 5672,
      "VirtualHost": "/",
      "Username": "guest",
      "Password": "guest",
      "HeartbeatSeconds": 30,
      "PublisherConfirmation": true,
      "UseSsl": false,
      "UseQuorumQueues": false
    },
    "Kafka": {
      "Host": "localhost:9092",
      "Topic": "muonroi-events",
      "GroupId": "consumer-group",
      "ClientId": "muonroi-messagebus",
      "SecurityProtocol": "SaslSsl",
      "SaslMechanism": "ScramSha256",
      "SaslUsername": "user",
      "SaslPassword": "password"
    },
    "Runtime": {
      "RetryCount": 3,
      "RetryIntervalMs": 500,
      "PrefetchCount": 32,
      "ConcurrentMessageLimit": 16,
      "EnableInMemoryOutbox": true,
      "EndpointPrefix": "my-service"
    },
    "OutboxRelay": {
      "Enabled": true,
      "PollingIntervalMs": 5000,
      "BatchSize": 100
    },
    "MaskAccessTokenInHeaders": false,
    "EnableQuotaEnforcement": false,
    "EnableRuleEngineRouting": true,
    "EnableRedisRoutingTable": true
  }
}
```

> **Note — Two outbox mechanisms:**
> - `Runtime.EnableInMemoryOutbox = true` activates MassTransit's per-message in-memory deduplication. It survives restarts only within a single bus transaction. It is **not** the persistent outbox.
> - `OutboxRelay.Enabled = true` activates the EF Core persistent outbox (`EventOutbox` table). Use this when you need guaranteed-at-least-once delivery across application restarts.

---

## 4. Filter Pipeline

Every message flows through a fixed pipeline registered globally by `AddMessageBus`.

### Consume pipeline

```
AmqpContextConsumeFilter       → Extracts headers → ISystemExecutionContext
TenantContextConsumeFilter     → Validates tenant policy
RuleEngineRoutingFilter        → Runs IMessageRouter<T> + Redis FEEL routes (if EnableRuleEngineRouting)
EcsConsumeLoggingFilter        → OTel trace + metrics + IMLogContext scopes
↓ Consumer.HandleAsync
```

### Publish pipeline

```
MuonroiContextPublishFilter    → Stamps all context headers automatically
TenantQuotaMessagingFilter     → Checks quota (if EnableQuotaEnforcement)
EcsPublishLoggingFilter        → OTel trace + metrics
↓ Transport
```

### Send pipeline

```
MuonroiContextSendFilter       → Same as publish filter for direct sends
TenantQuotaMessagingFilter     → Checks quota (if EnableQuotaEnforcement)
EcsSendLoggingFilter           → OTel trace + metrics
↓ Transport
```

---

## 5. Publishing Messages

### Automatic (recommended)

`MuonroiContextPublishFilter` automatically stamps every publish with the current context. Simply inject `IPublishEndpoint` and call `Publish`:

```csharp
public class OrderHandler(IPublishEndpoint publisher)
{
    public async Task Handle(CreateOrderCommand cmd, CancellationToken ct)
    {
        await publisher.Publish(new OrderCreated { OrderId = cmd.OrderId }, ct);
        // Headers auto-stamped: TenantId, UserId, CorrelationId, SourceType, SentAt
    }
}
```

### Explicit context override

When you need to publish with an explicit context (e.g. background jobs, scheduled tasks):

```csharp
await publisher.PublishWithAuthContext(message, _contextAccessor, _tenantPolicy, ct);
// or with a pre-built context:
await publisher.PublishWithContext(message, executionContext, _tenantPolicy, ct);
```

### Access token masking

When `MaskAccessTokenInHeaders: true`, the raw `AccessToken` is replaced by a SHA-256 signature of `UserId:TenantId:CorrelationId`:

```
X-Muonroi-Identity-Sig: <base64-sha256>
```

Downstream consumers can verify identity from `UserId` + `TenantId` headers without holding the raw token.

---

## 6. Consuming Messages — `MuonroiConsumerBase<T>`

Extend `MuonroiConsumerBase<T>` to get tenant context, logging, and license validation pre-wired:

```csharp
public class OrderCreatedConsumer(
    ISystemExecutionContextAccessor contextAccessor,
    IMLog<OrderCreated> log,
    ILicenseGuard? licenseGuard = null)
    : MuonroiConsumerBase<OrderCreated>(contextAccessor, log, licenseGuard)
{
    protected override async Task HandleAsync(
        ConsumeContext<OrderCreated> context,
        ISystemExecutionContext executionContext,
        CancellationToken cancellationToken)
    {
        Log.Info("Processing order {OrderId} for tenant {TenantId}",
            context.Message.OrderId, executionContext.TenantId);

        // business logic here
    }
}
```

`MuonroiConsumerBase<T>` guarantees:
- `LicenseGuard.EnsureFeature(Premium.MessageBus)` before any processing
- `executionContext` is already resolved by the consume filter pipeline
- `OperationCanceledException` re-thrown cleanly (no error log)
- All other exceptions logged via `IMLog<T>` with `MessageType`, `TenantId`, `MessageId`, then re-thrown for MassTransit retry

---

## 7. Persistent Outbox

Use the persistent outbox when you need to save a domain change and enqueue a message in the same database transaction.

### Step 1 — Inherit `MEventOutboxDbContext`

```csharp
public class MyDbContext(DbContextOptions<MyDbContext> options, IMediator mediator)
    : MEventOutboxDbContext(options, mediator)
```

### Step 2 — Save atomically

```csharp
// In a handler or service:
await _dbContext.SaveWithOutboxAsync(new OrderShipped { OrderId = orderId }, _jsonService, ct);
// Saves entity changes + adds EventOutbox row in one SaveChangesAsync call
```

### Step 3 — Register the relay

```csharp
builder.Services.AddMessageBus(builder.Configuration, ...);
builder.Services.AddOutboxRelay(); // starts OutboxRelayBackgroundService
```

The relay polls `EventOutbox` rows with `Status = Pending`, publishes them via `IPublishEndpoint`, and marks them `Published` or `Failed`.

### Outbox table schema

| Column | Type | Notes |
|--------|------|-------|
| `Id` | int | PK |
| `EventName` | nvarchar(512) | CLR type short name |
| `EventType` | nvarchar(512) | Assembly-qualified name for deserialization |
| `EventContent` | nvarchar(max) | JSON payload |
| `Status` | int | `Pending(0)`, `Published(1)`, `Failed(2)` |
| `ErrorMessage` | nvarchar(2000) | Set on relay failure |
| `CreationTime` | datetime2 | Indexed |

---

## 8. Tenant Quota Enforcement

Enable `EnableQuotaEnforcement: true` in config to activate `TenantQuotaMessagingFilter`. Requires `ITenantQuotaTracker` registered (see [Quota Guide](../multi-tenancy/multi-tenant-quota-guide.md)).

Supported quota keys for messaging:

| `QuotaType` | Window | Behaviour when exceeded |
|-------------|--------|------------------------|
| `MessagesPerMinute` | 1 min rolling | Throws `QuotaExceededException` — message not sent |
| `MessagesPerDay` | 24 h rolling | Throws `QuotaExceededException` — message not sent |

```csharp
// Registration
builder.Services.AddTenantQuotaManagement();

// appsettings
"MessageBusConfigs": {
  "EnableQuotaEnforcement": true
}
```

`QuotaExceededException` is **not** retried by MassTransit (it is not a transient infrastructure error). The message is dropped and the quota violation is logged.

---

## 9. Rule Engine Routing

Enable `EnableRuleEngineRouting: true` to evaluate explicit routing decisions before the message reaches your consumer.

### DI-based routing

```csharp
public sealed class OrderCreatedRouter : IMessageRouter<OrderCreated>
{
    public int Order => 0;
    public string Code => "order.route";

    public Task<IRoutingDecision> RouteAsync(
        OrderCreated message,
        IRoutingContext context,
        CancellationToken ct = default)
    {
        if (context.TenantId == "acme")
        {
            return Task.FromResult(RoutingDecision.RedirectTo(
                "rabbitmq://localhost/acme-orders",
                "Tenant-specific routing"));
        }

        return Task.FromResult(RoutingDecision.PassThrough);
    }
}

builder.Services.AddMessageRouter<OrderCreated, OrderCreatedRouter>();
```

### Redis-backed dynamic routing

Enable `EnableRedisRoutingTable: true` to merge DI routers with routes stored in `IRedisRoutingTableStore`. Each route entry contains:
- `MessageType`
- `TenantId`
- `RuleCode`
- `Order`
- `TargetAddress`
- `FeelExpression`
- `IsActive`

When `FeelExpression` is present, it is compiled once and reused on later evaluations. Matching routes redirect the message and preserve Muonroi context headers on the outgoing send operation.

### Backward compatibility and rejects

Legacy `IMessageRoutingRule<T>` registrations still work and preserve the old fail-fast behavior. Use `RoutingDecision.DeadLetter("reason")` when a router should intentionally fault and stop the consume pipeline.

---

## 10. Rule-Triggered Notifications

`MRuleEngineBehavior<TRequest, TResponse>` can now publish mediator notifications automatically after a rule passes and executes.

### Attribute-based notification emit

```csharp
[MEmitOnPass(typeof(FraudDetectedNotification))]
public sealed class FraudCheckRule : IRule<OrderContext>
{
    public string Code => "fraud.check";
    public HookPoint HookPoint => HookPoint.BeforeRule;
    public int Order => 0;

    public Task<RuleResult> EvaluateAsync(OrderContext ctx, FactBag facts, CancellationToken ct)
        => Task.FromResult(RuleResult.Passed());

    public Task ExecuteAsync(OrderContext context, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
```

### Context-aware notification payloads

When the notification requires runtime values from the rule context, implement `IRuleNotificationFactory<TContext>`:

```csharp
public sealed class FraudCheckRule : IRule<OrderContext>, IRuleNotificationFactory<OrderContext>
{
    public INotification BuildNotification(OrderContext context)
        => new FraudDetectedNotification(context.OrderId, context.TenantId);
}
```

Notification publish failures are logged, but they do not abort the main request flow.

---

## 11. Saga Support — `MSagaDbContext`

For long-running workflows, extend `MSagaDbContext` to get tenant-aware saga state persistence:

```csharp
public class OrderSagaDbContext(
    DbContextOptions<OrderSagaDbContext> options,
    IMediator mediator,
    IMDateTimeService dateTimeService,
    ISystemExecutionContextAccessor contextAccessor)
    : MSagaDbContext(options, mediator, dateTimeService: dateTimeService, executionContextAccessor: contextAccessor)
{
    public DbSet<OrderSagaState> OrderSagas { get; set; }
}
```

`MSagaDbContext` automatically:
- Stamps `CreationTime` and `LastModificationTime` via `IMDateTimeService`
- Injects `TenantId` from `ISystemExecutionContextAccessor` on new saga instances
- Adds a `HasIndex("TenantId")` for all saga entities implementing `IMuonroiSaga`

```csharp
// Saga state must implement IMuonroiSaga
public class OrderSagaState : IMuonroiSaga
{
    public Guid CorrelationId { get; set; }
    public string? TenantId { get; set; }
    public DateTime CreationTime { get; set; }
    public DateTime? LastModificationTime { get; set; }

    // your saga state fields
    public string CurrentState { get; set; } = string.Empty;
}
```

---

## 12. Observability

`AddMessageBus` registers OpenTelemetry sources automatically:

| Source | Operations |
|--------|-----------|
| `MassTransit` | W3C trace context propagation (auto) |
| `Muonroi.BuildingBlock.MessageBus` | `messagebus.consume`, `messagebus.publish`, `messagebus.send` |

Each activity includes tags:

```
messaging.operation    = consume | publish | send
messaging.message_type = Muonroi.Orders.OrderCreated
messaging.destination  = rabbitmq://localhost/order-created
messaging.system       = rabbitmq | kafka
tenant.id              = <tenant-id>
correlation.id         = <correlation-id>
```

Metrics exported:

| Metric | Unit | Description |
|--------|------|-------------|
| `messagebus_messages_total` | count | Total processed messages |
| `messagebus_errors_total` | count | Total failed operations |
| `messagebus_operation_duration_ms` | ms | Operation latency histogram |

All metrics are tagged with `tenant.id` for per-tenant dashboards.

---

## 13. Health Checks

`AddMessageBus` registers a health check named `rabbitmq` or `kafka` depending on `BusType`. Expose it via the standard endpoint:

```csharp
app.MapHealthChecks("/health");
```

---

## 14. Transport Notes

### RabbitMQ

| Config field | Default | Notes |
|---|---|---|
| `HeartbeatSeconds` | 30 | Applied to AMQP connection |
| `PublisherConfirmation` | `true` | Recommended for durability |
| `UseQuorumQueues` | `false` | Enable for HA deployments |
| `UseSsl` | `false` | Set `SslServerName` when enabled |

### Kafka

| Config field | Notes |
|---|---|
| `SecurityProtocol` | `Plaintext`, `Ssl`, `SaslPlaintext`, `SaslSsl` |
| `SaslMechanism` | `Plain`, `ScramSha256`, `ScramSha512` |
| `GroupId` | Consumer group — should be unique per service |

> Kafka consumers use `UsingInMemory` as the base MassTransit bus. This is the standard MassTransit pattern for Rider-based transports. The in-memory bus handles internal mechanics (sagas, fault handling) while Kafka handles actual message delivery.
