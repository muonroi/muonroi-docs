---
title: Messaging & Integration Packages
sidebar_label: Messaging & Integration
sidebar_position: 9
---

# Messaging & Integration Packages

Comprehensive reference for Muonroi's async messaging, external integrations, and service communication packages. These packages layer tenant awareness, security, observability, and resilience into RabbitMQ, Kafka, HTTP, gRPC, and SignalR transports.

---

## Muonroi.Messaging.Abstractions

**NuGet:** `Muonroi.Messaging.Abstractions` | **Tier:** OSS/Commercial | **Distribution:** NuGet public feed

### Purpose

Defines core abstractions for message-driven architectures: events, routing contracts, outbox patterns, and saga support. No transport dependencies — purely interfaces and domain models.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `DomainEvent` | Abstract class | Base for in-process events; implements `INotification` for MediatR |
| `IntegrationEvent` | Abstract class | Base for cross-service events (published to message bus) |
| `IMessageRouter<TMessage>` | Interface | Custom routing logic before message reaches consumer |
| `IRoutingDecision` / `RoutingDecision` | Interface + record | Routing outcome: pass-through, redirect, or reject |
| `IMuonroiMessageEnvelope` / `MuonroiMessageEnvelope` | Interface + class | Standardized message headers: tenant, user, correlation, token |
| `IMuonroiSaga` | Interface | Extends `MassTransit.ISaga` + `ITenantScoped` — requires `TenantId`, `CreationTime`, `LastModificationTime` |
| `IMessageRoutingRule<T>` | Interface | Legacy routing contract (backward compatible) |
| `IOutboxRelayService` | Interface | Exposes outbox relay operations |
| `EventOutbox` | Entity | Persistent outbox table schema: `Id`, `EventName`, `EventType`, `EventContent`, `Status`, `ErrorMessage`, `CreationTime` |
| `EventOutboxStatus` | Enum | `Pending`, `Published`, `Failed` |
| `IEventOutboxStore` | Interface | Manages `EventOutbox` persistence |
| `IdempotentAttribute` | Attribute | Marks message handlers for idempotency enforcement |

### Integration Event Base

```csharp
public abstract class IntegrationEvent
{
    public string AggregateId { get; protected set; } = string.Empty;
    public DateTime OccurredOn { get; } = DateTime.UtcNow;
}
```

### Domain Event Example

```csharp
public class OrderCreatedDomainEvent : DomainEvent
{
    public string OrderId { get; init; }
    public string CustomerId { get; init; }
}
```

### DI Registration

```csharp
// No explicit registration required — used by dependent packages
// Muonroi.Messaging.MassTransit consumes these abstractions
```

---

## Muonroi.Messaging.MassTransit

**NuGet:** `Muonroi.Messaging.MassTransit` | **Tier:** Commercial | **Feature:** `Premium.MessageBus` | **Distribution:** Private NuGet feed

### Purpose

Production-ready message bus implementation on MassTransit. Wires tenant context, security, quota enforcement, rule-based routing, persistent outbox, and saga support into a single cohesive pipeline for RabbitMQ and Kafka.

### Key Components

#### Core Registration

| Class | Purpose |
|-------|---------|
| `MassTransitHandler` | DI extension methods: `AddMessageBus()`, `AddOutboxRelay()` |
| `BusType` | Enum: `RabbitMq`, `Kafka` |
| `MessageBusConfigs` | Configuration POCO with runtime, outbox relay, quota, routing options |
| `MessageBusRuntimeConfigs` | Retry policy, prefetch, deduplication, endpoint naming |
| `OutboxRelayConfigs` | Polling interval, batch size, retry thresholds |

#### Consume Filters

Applied in order to every incoming message:

| Filter | Responsibility |
|--------|-----------------|
| `AmqpContextConsumeFilter<T>` | Extracts headers → resolves `ISystemExecutionContext` (tenant, user, correlation) |
| `TenantContextConsumeFilter<T>` | Validates tenant policy; enforces multi-tenant constraints |
| `RuleEngineRoutingFilter<T>` | Evaluates `IMessageRouter<T>` + Redis FEEL routes (if enabled) |
| `EcsConsumeLoggingFilter<T>` | OpenTelemetry tracing + metrics + structured logging |

#### Publish/Send Filters

| Filter | Responsibility |
|--------|-----------------|
| `MuonroiContextPublishFilter<T>` | Auto-stamps all context headers (tenant, user, token, correlation) |
| `MuonroiContextSendFilter<T>` | Same as publish for direct sends |
| `TenantQuotaMessagingFilter<T>` | Enforces quota limits (if enabled) |
| `EcsPublishLoggingFilter<T>` | OpenTelemetry tracing for outbound publishes |
| `EcsSendLoggingFilter<T>` | OpenTelemetry tracing for direct sends |

#### Consumer Base Class

```csharp
public abstract class MuonroiConsumerBase<TMessage>(
    ISystemExecutionContextAccessor contextAccessor,
    IMLog<TMessage> log,
    ILicenseGuard? licenseGuard = null)
    : IConsumer<TMessage>
    where TMessage : class
```

Guarantees:
- License feature check: `Premium.MessageBus` before any processing
- `ISystemExecutionContext` pre-resolved by filter pipeline
- Standardized error logging with tenant, user, message ID
- `OperationCanceledException` re-thrown cleanly (no error log)

#### Outbox Relay

| Class | Purpose |
|-------|---------|
| `OutboxRelayBackgroundService` | IHostedService polling `EventOutbox` rows; publishes `Pending` → `Published`/`Failed` |
| `MEventOutboxDbContext` | DbContext base with `SaveWithOutboxAsync()` for atomic save + outbox insertion |

#### Bus Configuration

| Configurator | Transport | Purpose |
|---|---|---|
| `RabbitMqBusConfigurator` | RabbitMQ | AMQP endpoint setup, publisher confirmation, heartbeat |
| `KafkaBusConfigurator` | Kafka | Topic naming, consumer group, SASL auth |

### Configuration Schema

```json
{
  "MessageBusConfigs": {
    "BusType": "RabbitMq|Kafka",
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
      "SecurityProtocol": "SaslSsl|Plaintext|Ssl|SaslPlaintext",
      "SaslMechanism": "Plain|ScramSha256|ScramSha512",
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
      "BatchSize": 100,
      "MaxRetryFailedCount": 5
    },
    "MaskAccessTokenInHeaders": false,
    "EnableQuotaEnforcement": false,
    "EnableRuleEngineRouting": false,
    "EnableRedisRoutingTable": false
  }
}
```

### DI Registration

```csharp
// Program.cs
builder.Services.AddMessageBus(
    builder.Configuration,
    consumersAssembly: typeof(Program).Assembly);

// Optional: persistent outbox relay
builder.Services.AddOutboxRelay();
```

### Usage Examples

#### Publishing Messages (Auto-Context)

```csharp
public class OrderService(IPublishEndpoint publisher)
{
    public async Task CreateOrderAsync(CreateOrderCommand cmd, CancellationToken ct)
    {
        // Headers auto-stamped by MuonroiContextPublishFilter:
        // TenantId, UserId, CorrelationId, SourceType, SentAt, AccessToken
        await publisher.Publish(
            new OrderCreated { OrderId = cmd.OrderId, Amount = cmd.Amount },
            ct);
    }
}
```

#### Publishing with Explicit Context

```csharp
public class BackgroundJobService(
    IPublishEndpoint publisher,
    ISystemExecutionContextAccessor contextAccessor,
    ITenantContextPolicy tenantPolicy)
{
    public async Task ProcessAsync(CancellationToken ct)
    {
        await publisher.PublishWithAuthContext(
            new OrderProcessed { OrderId = "123" },
            contextAccessor,
            tenantPolicy,
            ct);
    }
}
```

#### Consuming Messages

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
            context.Message.OrderId,
            executionContext.TenantId);

        // Business logic: save to database, trigger downstream tasks, etc.
        await Task.Delay(100, cancellationToken);
    }
}
```

#### Persistent Outbox Pattern

```csharp
public class MyDbContext(DbContextOptions<MyDbContext> options, IMediator mediator)
    : MEventOutboxDbContext(options, mediator)
{
    public DbSet<Order> Orders => Set<Order>();
}

// In handler or service:
public async Task PlaceOrderAsync(PlaceOrderCommand cmd, CancellationToken ct)
{
    var order = new Order { Id = cmd.OrderId, Amount = cmd.Amount };
    _dbContext.Orders.Add(order);

    // Atomic: saves entity + enqueues EventOutbox row in one transaction
    await _dbContext.SaveWithOutboxAsync(
        new OrderCreated { OrderId = cmd.OrderId },
        _jsonService,
        ct);
}
```

#### Saga State Persistence

```csharp
public class OrderSagaDbContext(
    DbContextOptions<OrderSagaDbContext> options,
    IMediator mediator,
    IMDateTimeService dateTimeService,
    ISystemExecutionContextAccessor contextAccessor)
    : MSagaDbContext(options, mediator, dateTimeService: dateTimeService, executionContextAccessor: contextAccessor)
{
    public DbSet<OrderSagaState> OrderSagas => Set<OrderSagaState>();
}

public class OrderSagaState : IMuonroiSaga
{
    public Guid CorrelationId { get; set; }
    public string? TenantId { get; set; }
    public DateTime CreationTime { get; set; }
    public DateTime? LastModificationTime { get; set; }
    public string CurrentState { get; set; } = "Pending";
    public Guid OrderId { get; set; }
}
```

#### Custom Message Routing

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
        if (context.TenantId == "acme-corp")
        {
            return Task.FromResult(RoutingDecision.RedirectTo(
                "rabbitmq://rabbitmq-acme/acme-orders",
                "Route to tenant-specific broker"));
        }

        return Task.FromResult(RoutingDecision.PassThrough);
    }
}

// DI registration:
builder.Services.AddMessageRouter<OrderCreated, OrderCreatedRouter>();
```

### Observability

**OpenTelemetry Sources:**

| Source | Activities | Meter | Attributes |
|--------|-----------|-------|-----------|
| `MassTransit` | W3C context propagation (auto) | - | - |
| `Muonroi.BuildingBlock.MessageBus` | `messagebus.consume`, `messagebus.publish`, `messagebus.send` | `messagebus_messages_total`, `messagebus_errors_total`, `messagebus_operation_duration_ms` | `messaging.operation`, `messaging.message_type`, `messaging.destination`, `messaging.system`, `tenant.id`, `correlation.id` |

### Health Checks

```csharp
app.MapHealthChecks("/health");
// Health check registered as "rabbitmq" or "kafka" depending on BusType
```

---

## Muonroi.Integration.Abstractions

**NuGet:** `Muonroi.Integration.Abstractions` | **Tier:** OSS | **Distribution:** NuGet public feed

### Purpose

Core contracts for external service integrations: connectors (HTTP, Email, Slack, etc.), credential/config management, and rule engine task execution.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IServiceTaskConnector` | Interface | Core connector contract: `ExecuteAsync()`, `TestConnectionAsync()`, `GetConfigSchema()`, `Metadata` |
| `ConnectorMetadata` | Class | Connector identity: type, display name, category, icon, description, credential requirement |
| `ConnectorContext` | Class | Execution context: `Config` (JsonDocument), `Credentials` (dict), `TenantId`, `RuleEngineContext` |
| `ConnectorResult` | Class | Execution outcome: `Success`, `OutputFacts`, `ErrorMessage`, `StatusCode`, `Duration` |
| `ConnectorResilienceOptions` | Class | Retry, circuit breaker, timeout configuration |
| `IConnectorRegistry` | Interface | Discovers + resolves connectors by type |
| `IConnectorConfigStore` | Interface | Persists connector configurations |
| `IConnectorCredentialStore` | Interface | Persists encrypted connector credentials |

### ConnectorResult Examples

```csharp
// Success with output facts
ConnectorResult.Ok(
    new() { ["apiResponse"] = jsonData, ["httpStatusCode"] = 200 },
    statusCode: 200,
    duration: TimeSpan.FromMilliseconds(150));

// Failure
ConnectorResult.Fail(
    "API returned 500: Internal Server Error",
    statusCode: 500,
    duration: TimeSpan.FromMilliseconds(2000));
```

---

## Muonroi.Integration.Connectors

**NuGet:** `Muonroi.Integration.Connectors` | **Tier:** Commercial | **Distribution:** Private NuGet feed

### Purpose

Production connectors for common external services: HTTP/REST, Slack, Email (SMTP), Redis, SQL databases. Each implements `IServiceTaskConnector` with metadata, execution, and connection testing.

### Built-in Connectors

#### HttpConnector

**Type:** `"http"`

Executes HTTP/REST requests (GET, POST, PUT, DELETE, PATCH) with header/body templating and response mapping.

**Config Schema:**
```json
{
  "url": "https://api.example.com/data",
  "method": "POST",
  "headers": {
    "X-Custom": "value"
  },
  "body": "{{ json(items) }}",
  "contentType": "application/json",
  "responseMapping": {
    "userId": "user.id",
    "userName": "user.name"
  },
  "timeout": 30
}
```

**Credentials:**
```json
{
  "authorization": "Bearer token123",
  "apiKey": "key123",
  "apiKeyHeader": "X-API-Key"
}
```

**Output Facts:**
- `httpStatusCode`: int
- `httpResponseBody`: string
- `httpSuccess`: bool
- Mapped properties per `responseMapping`

#### SlackWebhookConnector

**Type:** `"slack"`

Sends messages to Slack via incoming webhooks. Supports channel override.

**Config Schema:**
```json
{
  "text": "Order #{{ orderId }} approved by {{ userName }}",
  "channel": "#orders"
}
```

**Credentials:**
```json
{
  "webhookUrl": "https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX"
}
```

**Output Facts:**
- `slackSent`: bool

#### SmtpConnector

**Type:** `"email"`

Sends emails via configured SMTP server. Supports template rendering.

**Config Schema:**
```json
{
  "to": "{{ customerEmail }}",
  "cc": "support@example.com",
  "subject": "Order Confirmation #{{ orderId }}",
  "body": "Thank you for your order...",
  "isHtml": true
}
```

**Credentials:**
```json
{
  "smtpHost": "smtp.example.com",
  "smtpPort": 587,
  "username": "noreply@example.com",
  "password": "password123",
  "fromAddress": "noreply@example.com",
  "enableTls": true
}
```

#### RedisConnector

**Type:** `"redis"`

Executes Redis commands (GET, SET, LPUSH, HSET, etc.) with key/value templating.

**Config Schema:**
```json
{
  "command": "SET",
  "key": "user:{{ userId }}",
  "value": "{{ json(userData) }}",
  "ttlSeconds": 3600
}
```

**Output Facts:**
- `redisResult`: string (command result)
- `redisSuccess`: bool

#### SqlQueryConnector

**Type:** `"sql"`

Executes SQL queries (SELECT, INSERT, UPDATE) with parameterized statements.

**Config Schema:**
```json
{
  "query": "SELECT * FROM orders WHERE customer_id = @customerId",
  "parameters": {
    "@customerId": "{{ customerId }}"
  },
  "timeout": 30
}
```

**Output Facts:**
- `sqlRows`: array of row objects (SELECT)
- `sqlRowsAffected`: int (INSERT/UPDATE)

### DI Registration

```csharp
// Automatic registration
services.AddConnectorRegistry();
// Registers: HttpConnector, SlackWebhookConnector, SmtpConnector, RedisConnector, SqlQueryConnector
```

### Custom Connector Example

```csharp
public sealed class CustomApiConnector : IServiceTaskConnector
{
    public ConnectorMetadata Metadata => new()
    {
        Type = "custom-api",
        DisplayName = "Custom API",
        Category = "API",
        Description = "Connects to proprietary API",
        RequiresCredentials = true
    };

    public async Task<ConnectorResult> ExecuteAsync(ConnectorContext context, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();
        var apiKey = context.Credentials.GetValueOrDefault("apiKey");
        var url = context.Config.RootElement.GetProperty("url").GetString();

        try
        {
            var client = new HttpClient();
            client.DefaultRequestHeaders.Add("Authorization", $"Bearer {apiKey}");
            var response = await client.GetAsync(url, ct);
            sw.Stop();

            if (response.IsSuccessStatusCode)
            {
                var content = await response.Content.ReadAsStringAsync(ct);
                return ConnectorResult.Ok(
                    new() { ["response"] = content },
                    (int)response.StatusCode,
                    sw.Elapsed);
            }

            return ConnectorResult.Fail("API error", (int)response.StatusCode, sw.Elapsed);
        }
        catch (Exception ex)
        {
            sw.Stop();
            return ConnectorResult.Fail(ex.Message, duration: sw.Elapsed);
        }
    }

    public async Task<bool> TestConnectionAsync(ConnectorContext context, CancellationToken ct)
    {
        try
        {
            var result = await ExecuteAsync(context, ct);
            return result.Success;
        }
        catch { return false; }
    }

    public JsonElement GetConfigSchema()
    {
        var schema = JsonDocument.Parse("""
        {
            "type": "object",
            "properties": {
                "url": { "type": "string", "format": "uri" }
            },
            "required": ["url"]
        }
        """);
        return schema.RootElement.Clone();
    }
}

// Register custom connector:
builder.Services.AddSingleton<IServiceTaskConnector, CustomApiConnector>();
```

---

## Muonroi.Integration.Persistence

**NuGet:** `Muonroi.Integration.Persistence` | **Tier:** Commercial | **Distribution:** Private NuGet feed

### Purpose

EF Core persistence layer for connector configurations and encrypted credentials. Provides tenant-scoped storage with automatic query filtering.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `ConnectorDbContext` | DbContext | EF context for configs + credentials; applies `TenantId` query filter |
| `ConnectorConfigEntity` | Entity | Schema: `Id`, `TenantId`, `ConnectorType`, `Name`, `ConfigJson`, `CredentialId`, `Status`, `CreatedAt` |
| `ConnectorCredentialEntity` | Entity | Schema: `Id`, `TenantId`, `Name`, `EncryptedValues`, `CreatedAt` |
| `EfConnectorConfigStore` | Class | Implements `IConnectorConfigStore` via EF |
| `EfConnectorCredentialStore` | Class | Implements `IConnectorCredentialStore` via EF; handles encryption/decryption |
| `ConnectorPersistenceRegistration` | Class | DI extension: `AddConnectorPersistence()` |

### DI Registration

```csharp
builder.Services.AddConnectorPersistence(builder.Configuration);
// Registers ConnectorDbContext, EfConnectorConfigStore, EfConnectorCredentialStore
```

### Usage

```csharp
public class ConnectorService(
    IConnectorConfigStore configStore,
    IConnectorCredentialStore credentialStore)
{
    public async Task SaveConnectorAsync(string tenantId, string type, JsonDocument config, CancellationToken ct)
    {
        var entity = new ConnectorConfigEntity
        {
            Id = Guid.NewGuid().ToString(),
            TenantId = tenantId,
            ConnectorType = type,
            Name = "My HTTP Connector",
            ConfigJson = config.RootElement.GetRawText(),
            Status = "active"
        };

        await configStore.AddAsync(entity, ct);
        await configStore.SaveChangesAsync(ct);
    }
}
```

---

## Muonroi.Grpc

**NuGet:** `Muonroi.Grpc` | **Tier:** Commercial | **Feature:** `Premium.Grpc` | **Distribution:** Private NuGet feed

### Purpose

gRPC service registration (server + named clients) with built-in tenant awareness, auth context forwarding, resilience policies (retry, timeout, circuit breaker), and OpenTelemetry tracing.

### Key Components

#### Server

| Class | Purpose |
|-------|---------|
| `GrpcServerInterceptor` | Server-side interceptor: tenant resolution, auth validation |
| `GrpcServerExtensions` | `AddGrpcServer()` DI extension |

#### Client

| Class | Purpose |
|-------|---------|
| `GrpcClientAuthInterceptor` | Client-side interceptor: forwards auth token + tenant ID |
| `GrpcClientTelemetryInterceptor` | Client-side interceptor: OpenTelemetry tracing |
| `GrpcHandler` | Named client factory |
| `GrpcRateLimiter` | Server-side rate limiting per API key / tenant |

#### Configuration

| Class | Purpose |
|-------|---------|
| `GrpcServicesConfig` | Root config container |
| `GrpcServerConfig` | Server options: message sizes, compression, gRPC-Web, mTLS, rate limiting |
| `GrpcClientDefaultsConfig` | Default client options: timeout, retries, backoff, message sizes, forwarding flags |
| `GrpcServiceConfig` | Per-service client options: URI, retry policy, forwarding overrides |
| `GrpcMethodPolicyConfig` | Per-method policy: timeout, retry, backoff |
| `GrpcRateLimitConfig` | Server rate limiting: RPM per API key / tenant |

### Configuration Schema

```json
{
  "GrpcServicesConfig": {
    "Server": {
      "EnableDetailedErrors": true,
      "MaxSendMessageSizeBytes": 104857600,
      "MaxReceiveMessageSizeBytes": 104857600,
      "ResponseCompressionAlgorithm": "gzip",
      "ResponseCompressionLevel": "Optimal",
      "EnableGrpcWeb": false,
      "EnableGrpcWebForAllServices": false,
      "EnableJsonTranscoding": false,
      "RequireMutualTls": false,
      "AllowedClientCertificateThumbprints": [],
      "RateLimit": {
        "Enabled": true,
        "RequestsPerMinutePerApiKey": 600,
        "RequestsPerMinutePerTenant": 1200
      }
    },
    "ClientDefaults": {
      "TimeoutSeconds": 10,
      "RetryCount": 3,
      "InitialBackoffSeconds": 1,
      "MaxBackoffSeconds": 8,
      "LoadBalancingPolicy": "pick_first",
      "MaxReceiveMessageSizeBytes": 104857600,
      "MaxSendMessageSizeBytes": 104857600,
      "ForwardAuthToken": false,
      "ForwardTenantId": true
    },
    "Services": {
      "PaymentService": {
        "Uri": "https://payment.example.com:5001",
        "TimeoutSeconds": 20,
        "RetryCount": 5,
        "ForwardAuthToken": true,
        "Methods": {
          "ProcessPayment": {
            "TimeoutSeconds": 30
          }
        }
      }
    }
  }
}
```

### DI Registration

```csharp
services.AddGrpcServer();
services.AddGrpcClients(configuration, new Dictionary<string, Type>
{
    { "PaymentService", typeof(Payment.PaymentClient) },
    { "NotificationService", typeof(Notification.NotificationClient) }
});
```

### BaseGrpcService Usage

```csharp
public class PaymentGrpcService(
    ISystemExecutionContextAccessor contextAccessor,
    ILicenseGuard licenseGuard,
    PaymentClient client)
    : BaseGrpcService(contextAccessor, licenseGuard: licenseGuard)
{
    private readonly PaymentClient _client = client;

    public async Task<PaymentResponse> ProcessPaymentAsync(decimal amount, CancellationToken ct)
    {
        return await CallGrpcServiceAsync(
            nameof(ProcessPaymentAsync),
            meta => _client.ProcessPaymentAsync(
                new PaymentRequest { Amount = amount },
                meta),
            null);
    }
}
```

**What `CallGrpcServiceAsync` provides:**
- Metadata creation: correlation ID, tenant ID, API key, auth token
- Retry policy: exponential backoff, max 3 attempts
- Timeout: 10 seconds by default
- Circuit breaker: opens after 5 failures, half-open after 30 seconds
- OpenTelemetry tracing: activity per call with status tags
- License validation: `Premium.Grpc` feature check
- Telemetry: request duration, status code, tenant ID

### Forwarded Metadata

When enabled in config, gRPC client calls automatically append:

```
authorization: Bearer <token>                    (if ForwardAuthToken = true)
x-tenant-id: <tenant-id>                         (if ForwardTenantId = true)
x-correlation-id: <correlation-id>               (always, when present)
```

Existing headers are preserved and not overwritten.

---

## Muonroi.Http

**NuGet:** `Muonroi.Http` | **Tier:** Commercial | **Distribution:** Private NuGet feed

### Purpose

HTTP/REST client infrastructure with resilience, auth context forwarding, correlation ID propagation, and standardized error handling.

### Key Components

| Class | Purpose |
|-------|---------|
| `BaseApiService` | Abstract base for API services with resilience pipeline support |
| `AuthenticateHeaderHandler` | DelegatingHandler: auto-injects Authorization header |
| `CorrelationIdHandler` | DelegatingHandler: auto-injects X-Correlation-ID header |

### DI Registration

```csharp
services.AddHttpClient<IPaymentApi, PaymentApiService>()
    .AddHttpMessageHandler<AuthenticateHeaderHandler>()
    .AddHttpMessageHandler<CorrelationIdHandler>();
```

### BaseApiService Usage

```csharp
public class PaymentApiService(
    IHttpClientFactory httpClientFactory,
    IAuthenticateInfoContext authContext,
    IMLog<BaseApiService> logger)
    : BaseApiService(httpClientFactory, authContext, logger)
{
    public async Task<PaymentResponse> ChargeAsync(
        decimal amount,
        ResiliencePipeline<HttpResponseMessage> pipeline,
        CancellationToken ct)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "https://api.payment.com/charges")
        {
            Content = new StringContent(
                JsonSerializer.Serialize(new { amount }),
                Encoding.UTF8,
                "application/json")
        };

        return await SendAsync<PaymentResponse>(
            "PaymentClient",
            request,
            pipeline,
            ct);
    }
}
```

---

## Muonroi.SignalR

**NuGet:** `Muonroi.SignalR` | **Tier:** Commercial | **Distribution:** Private NuGet feed

### Purpose

SignalR hub registration with tenant-aware connection filtering, automatic context resolution, and multi-tenant enforcement.

### Key Components

| Class | Purpose |
|-------|---------|
| `SignalRServiceCollectionExtensions` | `AddSignalRWithTenant()` DI extension |
| `TenantHubFilter` | `IHubFilter`: resolves + validates tenant ID for each hub invocation |
| `MUiEngineHub` | Schema change notification hub (rule engine runtime hot-reload) |
| `IUiEngineSchemaNotifier` | Sends schema changes to connected clients |

### DI Registration

```csharp
services.AddSignalRWithTenant(configuration);
// Automatically configures tenant filtering if MultiTenantConfigs:Enabled = true
```

### Custom Hub Example

```csharp
public class ChatHub(ISystemExecutionContextAccessor contextAccessor) : Hub
{
    public async Task SendMessage(string message)
    {
        string? tenantId = contextAccessor.Get().TenantId;
        string userId = contextAccessor.Get().UserId ?? "unknown";

        // Broadcast to all clients in tenant context
        await Clients.All.SendAsync("Receive", tenantId, userId, message);
    }

    public async Task JoinGroup(string groupName)
    {
        string? tenantId = contextAccessor.Get().TenantId;
        string groupKey = $"{tenantId}:{groupName}";
        await Groups.AddToGroupAsync(Context.ConnectionId, groupKey);
    }
}

// Startup:
app.MapHub<ChatHub>("/hubs/chat");
```

### Tenant Validation

When `MultiTenantConfigs.Enabled = true`:

1. `TenantHubFilter` resolves tenant from headers/claims
2. Claims tenant ID is validated against resolved tenant ID (if present)
3. Missing tenant ID throws `HubException("Tenant ID is required.")`
4. Tenant mismatch throws `HubException("Tenant mismatch.")`
5. `TenantContext.CurrentTenantId` is set for the invocation

### Schema Notifier (Rule Engine Integration)

```csharp
public class RuleEngineSchemaService(IUiEngineSchemaNotifier notifier)
{
    public async Task NotifySchemaChange(string tenantId, CancellationToken ct)
    {
        await notifier.NotifySchemaChangeAsync(tenantId, ct);
        // Sends real-time update to all connected UI clients for the tenant
    }
}
```

---

## Related Guides

- [Messaging Guide](../../03-guides/integration/messaging-guide.md) — End-to-end messaging patterns
- [gRPC Guide](../../03-guides/integration/grpc-guide.md) — Service-to-service communication
- [SignalR Guide](../../03-guides/integration/signalr-guide.md) — Real-time connections
- [Multi-Tenancy Guide](../../03-guides/multi-tenancy/multi-tenant-guide.md) — Tenant isolation
- [Rule Engine Guide](../../03-guides/rule-engine/rule-engine-guide.md) — Routing + integration tasks
