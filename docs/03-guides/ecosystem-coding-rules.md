---
title: "Ecosystem Coding Rules"
sidebar_label: "Coding Rules"
sidebar_position: 100
---

# Ecosystem Coding Rules

The Muonroi ecosystem enforces **wrapper-first design** across the building block libraries. This ensures:

- **Multi-tenancy safety** — no direct `DateTime.Now` calls leak timing into global state
- **License enforcement** — premium features (gRPC, message bus, distributed cache) are explicitly guarded
- **Data isolation** — all ORM access flows through `MDbContext` with multi-tenant filters
- **Standardized logging** — consistent structured logging across all packages with scope management
- **Testability** — all dependencies are injected interfaces, never hard-coded framework APIs

Roslyn code analyzers (`MBB001`–`MBB007` for building block, `MRG001`–`MRG010` for RuleGen) enforce these rules at compile time with detailed diagnostics.

---

## Why Wrapper-First Design?

Raw framework APIs leak implementation details into business logic. The Muonroi ecosystem abstracts these details:

| Problem | Solution | Benefit |
|---------|----------|---------|
| `DateTime.Now` is global, thread-unsafe, non-deterministic | `IMDateTimeService` | Testable time, supports time mocking |
| `JsonSerializer` is namespace-heavy, not injectable | `IMJsonSerializeService` | Custom serialization strategies, consistent date handling |
| Direct `DbContext` usage bypasses multi-tenant filters | Inherit `MDbContext` | Automatic tenant isolation, audit trails |
| `ILogger` requires per-type registration, no scope sharing | `IMLog<T>` | Fluent API, property scopes, tenant context carryover |
| Raw `AsyncLocal` scattered across codebase | `ISystemExecutionContextAccessor` | Centralized tenant/user propagation, controlled scope |

---

## MBB Analyzer Rules (Building Block)

These rules apply to all packages in **Muonroi.BuildingBlock**.

### MBB001: Forbidden `DateTime.Now` / `UtcNow`

**Rule**: Never call `DateTime.Now` or `DateTime.UtcNow` directly. Use `IMDateTimeService` instead.

**Why**: Enables time-mocking for tests, ensures consistent time across async flows, supports time-aware features like grace periods.

**Code Pair**:

```csharp
// ❌ Incorrect — triggers MBB001
public class OrderProcessor
{
    public void ProcessOrder(Order order)
    {
        order.CreatedAt = DateTime.UtcNow;  // Hard-coded global time
        _logger.Info($"Order created at {DateTime.Now}");
    }
}
```

```csharp
// ✅ Correct
public class OrderProcessor
{
    private readonly IMDateTimeService _dateTimeService;

    public OrderProcessor(IMDateTimeService dateTimeService)
    {
        _dateTimeService = dateTimeService;
    }

    public void ProcessOrder(Order order)
    {
        order.CreatedAt = _dateTimeService.UtcNow();
        _logger.Info($"Order created at {_dateTimeService.Now()}");
    }
}
```

**Interface Methods**:
- `DateTime Now()` — current local time
- `DateTime UtcNow()` — current UTC time
- `DateTime Today()` — current local date
- `DateTime UtcToday()` — current UTC date
- `double NowTs()` — current Unix timestamp
- `double UtcNowTs()` — current UTC timestamp

---

### MBB002: Forbidden `JsonSerializer` Static Methods

**Rule**: Never call `System.Text.Json.JsonSerializer` static methods directly. Use `IMJsonSerializeService` instead.

**Why**: Allows custom serialization logic (date formats, case sensitivity, null handling), ensures consistency across the codebase.

**Exception**: Adapters in `*.Adapters.*` namespaces are allowed to use raw `JsonSerializer` (they are infrastructure boundaries).

**Code Pair**:

```csharp
// ❌ Incorrect — triggers MBB002
public class WebhookHandler
{
    public void OnWebhookReceived(string payload)
    {
        var options = new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase };
        var data = JsonSerializer.Deserialize<WebhookData>(payload, options);
    }
}
```

```csharp
// ✅ Correct
public class WebhookHandler
{
    private readonly IMJsonSerializeService _jsonService;

    public WebhookHandler(IMJsonSerializeService jsonService)
    {
        _jsonService = jsonService;
    }

    public void OnWebhookReceived(string payload)
    {
        var data = _jsonService.Deserialize<WebhookData>(payload);
    }
}
```

---

### MBB003: Forbidden Raw `DbContext` Inheritance

**Rule**: Never inherit from `Microsoft.EntityFrameworkCore.DbContext` directly. Inherit from `MDbContext` instead.

**Why**: `MDbContext` automatically applies:
- Multi-tenant filters (via `ITenantScoped`)
- Soft-delete filters
- Audit trail capture
- Unit of work tracking
- Identity/role management

**Code Pair**:

```csharp
// ❌ Incorrect — triggers MBB003
public class ApplicationDbContext : DbContext
{
    public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options)
        : base(options) { }

    public DbSet<Order> Orders { get; set; }
    public DbSet<Customer> Customers { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        // Manual tenant filtering — error-prone!
    }
}
```

```csharp
// ✅ Correct
public class ApplicationDbContext : MDbContext
{
    public ApplicationDbContext(
        DbContextOptions<ApplicationDbContext> options,
        IMediator mediator,
        IMLog<ApplicationDbContext> logger)
        : base(options, mediator, logger) { }

    public DbSet<Order> Orders { get; set; }
    public DbSet<Customer> Customers { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        // MDbContext automatically filters by TenantId for ITenantScoped entities
    }
}
```

**DI Registration**:
```csharp
services.AddMDbContext<ApplicationDbContext>(configuration);
```

---

### MBB004: Forbidden `AsyncLocal<T>` Outside Context Package

**Rule**: `AsyncLocal<T>` may only be instantiated in packages ending with `.Context*` (e.g., `Muonroi.Execution.Context`).

**Why**: `AsyncLocal` is a global-state mechanism. Confining it to a dedicated context package ensures tenant/user propagation is controlled and auditable.

**Code Pair**:

```csharp
// ❌ Incorrect — triggers MBB004 (in business logic)
namespace Muonroi.OrderProcessing.Services
{
    public class OrderService
    {
        private static readonly AsyncLocal<Guid> _tenantId = new();

        public void SetTenant(Guid tenantId) => _tenantId.Value = tenantId;
    }
}
```

```csharp
// ✅ Correct — use injected accessor
namespace Muonroi.OrderProcessing.Services
{
    public class OrderService
    {
        private readonly ISystemExecutionContextAccessor _contextAccessor;

        public OrderService(ISystemExecutionContextAccessor contextAccessor)
        {
            _contextAccessor = contextAccessor;
        }

        public Guid GetCurrentTenantId() => _contextAccessor.TenantId;
    }
}
```

```csharp
// ✅ Also Correct — in context package (infrastructure only)
namespace Muonroi.Execution.Context.Internals
{
    internal static class TenantContextStorage
    {
        private static readonly AsyncLocal<Guid> _tenantId = new();

        internal static void Set(Guid tenantId) => _tenantId.Value = tenantId;
        internal static Guid Get() => _tenantId.Value;
    }
}
```

---

### MBB005: Abstractions Must Not Reference Infrastructure

**Rule**: Packages ending with `.Abstractions` must not reference:
- `EntityFrameworkCore`
- `Hangfire`, `Quartz`
- `MassTransit`, `RabbitMQ.Client`, `Confluent.Kafka`
- `Serilog`

**Why**: Abstraction packages define contracts. Infrastructure references create circular dependencies and force consumers to install unneeded packages.

**Code Pair**:

```csharp
// ❌ Incorrect — triggers MBB005
// File: Muonroi.Orders.Abstractions.csproj (references EntityFrameworkCore)
namespace Muonroi.Orders.Abstractions
{
    public interface IOrderRepository
    {
        Task<Order> GetByIdAsync(int id, DbContext context);
    }
}
```

```csharp
// ✅ Correct — abstractions only
namespace Muonroi.Orders.Abstractions
{
    public interface IOrderRepository
    {
        Task<Order> GetByIdAsync(int id);
    }
}

// Infrastructure implementation (separate package)
namespace Muonroi.Orders.Infrastructure
{
    public class OrderRepository : IOrderRepository
    {
        private readonly ApplicationDbContext _context;

        public async Task<Order> GetByIdAsync(int id)
        {
            return await _context.Orders.FindAsync(id);
        }
    }
}
```

---

### MBB006: Missing `EnsureFeatureOrThrow` Guard

**Rule**: Registration methods for premium features must call `EnsureFeatureOrThrow()` before service registration.

**Premium Features**: `AddMassTransit`, `AddGrpcServer`, `AddRedis`, `AddMessageBus`, `AddRuleEngineStore`, `AddObservability`.

**Why**: License tiers control feature availability. Registering a premium feature without tier verification allows Free-tier tenants to access Enterprise-only infrastructure.

**Code Pair**:

```csharp
// ❌ Incorrect — triggers MBB006
public static IServiceCollection AddPremiumMessaging(this IServiceCollection services, IConfiguration config)
{
    services.AddMassTransit(x =>
    {
        x.AddConsumer<OrderCreatedConsumer>();
    });
    return services;
}
```

```csharp
// ✅ Correct — tier check before premium registration
public static IServiceCollection AddPremiumMessaging(
    this IServiceCollection services,
    IConfiguration config,
    ILicenseGuard licenseGuard)
{
    licenseGuard.EnsureFeatureOrThrow("message-bus");

    services.AddMassTransit(x =>
    {
        x.AddConsumer<OrderCreatedConsumer>();
    });
    return services;
}
```

---

### MBB007: Forbidden `Serilog.LogContext.PushProperty`

**Rule**: Never call `Serilog.LogContext.PushProperty()` directly. Use `IMLogContext` instead.

**Why**: `LogContext` is a static global store. `IMLogContext` provides scoped properties without polluting the global state, critical for multi-tenant logging.

**Code Pair**:

```csharp
// ❌ Incorrect — triggers MBB007
public class OrderService
{
    public void ProcessOrder(int orderId)
    {
        LogContext.PushProperty("orderId", orderId);
        _logger.Info("Processing order");
        LogContext.Pop();
    }
}
```

```csharp
// ✅ Correct
public class OrderService
{
    private readonly IMLogContext _logContext;

    public OrderService(IMLogContext logContext)
    {
        _logContext = logContext;
    }

    public void ProcessOrder(int orderId)
    {
        using var scope = _logContext.PushProperty("orderId", orderId);
        _logger.Info("Processing order");
    }
}
```

---

## MRG Analyzer Rules (RuleGen)

These rules apply when using **RuleGen** (code-first rule authoring).

### MRG001: Duplicate Rule Code

**Rule**: Each rule class must have a unique `Code` property within a workflow.

**Why**: Rule dependency graphs (`DependsOn`) reference rules by code. Duplicate codes cause ambiguous references and silent failures.

**Example**:

```csharp
// ❌ Incorrect
[MExtractAsRule(Namespace = "Order.Processing")]
public class ValidateOrderRule : IRuleDefinition<OrderContext>
{
    public string Code => "VALIDATE_ORDER";
    // ...
}

[MExtractAsRule(Namespace = "Order.Processing")]
public class ValidatePaymentRule : IRuleDefinition<OrderContext>
{
    public string Code => "VALIDATE_ORDER";  // Duplicate!
}
```

```csharp
// ✅ Correct
[MExtractAsRule(Namespace = "Order.Processing")]
public class ValidateOrderRule : IRuleDefinition<OrderContext>
{
    public string Code => "VALIDATE_ORDER";
}

[MExtractAsRule(Namespace = "Order.Processing")]
public class ValidatePaymentRule : IRuleDefinition<OrderContext>
{
    public string Code => "VALIDATE_PAYMENT";  // Unique
}
```

---

### MRG002: Invalid Hook Point

**Rule**: The `HookPoint` property must match one of the defined enum values.

**Why**: Invalid hook points are silently ignored, causing rules to never execute.

**Valid Hook Points**: `OnStart`, `OnInputValidation`, `OnProcessing`, `OnCompletion`, `OnError`.

---

### MRG003: Non-Interface Dependencies

**Rule**: Rule dependencies should be interfaces, not concrete types.

**Why**: Concrete type dependencies are harder to mock in tests and violate DI principles.

**Code Pair**:

```csharp
// ⚠ Warning — MRG003
public class CalculatePriceRule : IRuleDefinition<OrderContext>
{
    private readonly PricingService _pricing;  // Concrete type

    public CalculatePriceRule(PricingService pricing)
    {
        _pricing = pricing;
    }
}
```

```csharp
// ✅ Preferred
public class CalculatePriceRule : IRuleDefinition<OrderContext>
{
    private readonly IPricingService _pricing;  // Interface

    public CalculatePriceRule(IPricingService pricing)
    {
        _pricing = pricing;
    }
}
```

---

### MRG004: Helper Method Extraction Failed

**Rule**: Only private methods in the same class can be extracted as helper methods.

**Why**: The code generator cannot introspect external types safely. Keep helper methods local to the rule.

---

### MRG005: Missing `DependsOn` Reference

**Rule**: If a rule declares `DependsOn("OTHER_RULE")`, another rule with that code must exist.

**Why**: Dangling dependencies cause execution graph errors and make the rule unreachable.

---

### MRG006: Order Without `DependsOn`

**Rule**: The `Order` property is ignored. Rule execution order is determined by the `DependsOn` dependency graph, not by arbitrary ordering.

**Why**: The `RuleOrchestrator` uses topological sort (Kahn's algorithm) on dependency graphs. Setting `Order` without dependencies is a no-op.

**Code Pair**:

```csharp
// ⚠ Warning — MRG006
public class Rule1 : IRuleDefinition<MyContext>
{
    public int Order => 1;  // Ignored!
    public List<string> DependsOn => new();
}
```

```csharp
// ✅ Correct — use DependsOn for ordering
public class Rule2 : IRuleDefinition<MyContext>
{
    public List<string> DependsOn => new() { "RULE1" };  // Execute after Rule1
}
```

---

### MRG007: FactBag Dependency Risk

**Rule**: If a rule reads a fact key, it must declare a `DependsOn` path to the rule that produces it.

**Why**: Prevents silent failures when the producing rule hasn't executed yet, leading to null/missing fact values.

**Code Pair**:

```csharp
// ⚠ Warning — MRG007
public class ApplyDiscountRule : IRuleDefinition<OrderContext>
{
    public async Task<RuleResult> EvaluateAsync(FactBag facts)
    {
        var orderTotal = facts.Get<decimal>("order.total");  // Depends on CalculateTotalRule
        return RuleResult.Success();
    }

    public List<string> DependsOn => new();  // Missing dependency!
}

public class CalculateTotalRule : IRuleDefinition<OrderContext>
{
    public string Code => "CALC_TOTAL";

    public async Task<RuleResult> EvaluateAsync(FactBag facts)
    {
        facts.Set("order.total", 100m);
        return RuleResult.Success();
    }
}
```

```csharp
// ✅ Correct
public class ApplyDiscountRule : IRuleDefinition<OrderContext>
{
    public string Code => "APPLY_DISCOUNT";

    public async Task<RuleResult> EvaluateAsync(FactBag facts)
    {
        var orderTotal = facts.Get<decimal>("order.total");
        return RuleResult.Success();
    }

    public List<string> DependsOn => new() { "CALC_TOTAL" };  // Declare dependency
}
```

---

### MRG008: Nullable To Non-Nullable Assignment

**Rule**: Assigning a nullable value to a non-nullable string field requires null-coalescing or explicit guards.

**Why**: Prevents `NullReferenceException` at runtime.

**Code Pair**:

```csharp
// ⚠ Warning — MRG008
public class ProcessOrderRule : IRuleDefinition<OrderContext>
{
    public async Task<RuleResult> EvaluateAsync(FactBag facts)
    {
        string? orderId = facts.Get<string?>("order.id");
        string displayId = orderId;  // May assign null!
        return RuleResult.Success();
    }
}
```

```csharp
// ✅ Correct
public async Task<RuleResult> EvaluateAsync(FactBag facts)
{
    string? orderId = facts.Get<string?>("order.id");
    string displayId = orderId ?? "UNKNOWN";  // Guard with ??
    return RuleResult.Success();
}
```

---

### MRG009: Fact Guard Throws `InvalidOperationException`

**Rule**: When guarding missing facts, return `RuleResult.Failure()` instead of throwing `InvalidOperationException`.

**Why**: Exceptions add diagnostic noise and are harder to handle in orchestrators. Failures are first-class and logged at appropriate levels.

**Code Pair**:

```csharp
// ⚠ Warning — MRG009
public class ApplyDiscountRule : IRuleDefinition<OrderContext>
{
    public async Task<RuleResult> EvaluateAsync(FactBag facts)
    {
        var orderId = facts.Get<string?>("order.id");
        if (orderId == null)
            throw new InvalidOperationException("Order ID is missing");  // Creates first-chance exception
        return RuleResult.Success();
    }
}
```

```csharp
// ✅ Correct
public async Task<RuleResult> EvaluateAsync(FactBag facts)
{
    var orderId = facts.Get<string?>("order.id");
    if (orderId == null)
        return RuleResult.Failure("Order ID is missing");  // Clean, logged failure
    return RuleResult.Success();
}
```

---

### MRG010: Invalid FEEL Expression

**Rule**: FEEL expressions in decision tables must be syntactically valid.

**Why**: Invalid FEEL prevents the decision table from evaluating, causing silent failures or exceptions.

**Valid FEEL Syntax**:
- Comparisons: `input > 100`, `name = "John"`, `status in ("active", "pending")`
- Boolean: `input > 100 and output < 500`, `not (flag = true)`
- Range: `age >= 18 and age <= 65`
- Functions: `sum(items)`, `count(list)`, `max(values)`

---

## Rule Summary Table

| ID | Category | Rule | Severity | Exception |
|----|----|------|----------|-----------|
| MBB001 | DateTime | Forbidden `DateTime.Now/UtcNow` | Error | Infrastructure/wrapper packages |
| MBB002 | JSON | Forbidden `JsonSerializer` static | Error | `*.Adapters.*` namespaces |
| MBB003 | ORM | Raw `DbContext` inheritance | Error | None |
| MBB004 | Async | `AsyncLocal<T>` outside context | Error | `.Context.*` packages |
| MBB005 | Architecture | Infrastructure in abstractions | Error | None |
| MBB006 | Licensing | Missing tier guard on premium | Error | Free features |
| MBB007 | Logging | `Serilog.LogContext.PushProperty` | Error | None |
| MRG001 | Code | Duplicate rule code | Error | None |
| MRG002 | Code | Invalid hook point | Error | None |
| MRG003 | DI | Non-interface dependencies | Warning | None |
| MRG004 | Generation | Helper extraction failed | Warning | None |
| MRG005 | Dependencies | Missing `DependsOn` reference | Warning | None |
| MRG006 | Ordering | `Order` without `DependsOn` | Warning | None |
| MRG007 | FactBag | Missing dependency path | Warning | None |
| MRG008 | Nullability | Nullable-to-non-nullable assign | Warning | None |
| MRG009 | Error Handling | Exception instead of failure | Warning | None |
| MRG010 | FEEL | Invalid FEEL expression | Error | None |

---

## Required Wrapper Patterns

### Dependency Injection

All wrappers are registered through extension methods on `IServiceCollection`:

```csharp
// Program.cs or Startup.cs
var services = new ServiceCollection();

// Core wrappers
services.AddSingleton<IMDateTimeService, DefaultDateTimeService>();
services.AddSingleton<IMJsonSerializeService, DefaultJsonSerializeService>();
services.AddSingleton<IMLogFactory, LoggerFactory>();
services.AddScoped<IMLogContext, LogContext>();

// Data access
services.AddMDbContext<ApplicationDbContext>(configuration);
services.AddScoped(typeof(IMRepository<>), typeof(MRepository<>));

// Execution context
services.AddScoped<ISystemExecutionContextAccessor, SystemExecutionContextAccessor>();

// Build
var serviceProvider = services.BuildServiceProvider();
```

### Using Wrappers in Services

```csharp
public class OrderService
{
    private readonly IMDateTimeService _dateTime;
    private readonly IMJsonSerializeService _json;
    private readonly IMLog<OrderService> _logger;
    private readonly IMRepository<Order> _orderRepository;
    private readonly ISystemExecutionContextAccessor _contextAccessor;

    public OrderService(
        IMDateTimeService dateTime,
        IMJsonSerializeService json,
        IMLog<OrderService> logger,
        IMRepository<Order> orderRepository,
        ISystemExecutionContextAccessor contextAccessor)
    {
        _dateTime = dateTime;
        _json = json;
        _logger = logger;
        _orderRepository = orderRepository;
        _contextAccessor = contextAccessor;
    }

    public async Task CreateOrderAsync(CreateOrderDto dto)
    {
        var tenantId = _contextAccessor.TenantId;  // Implicit multi-tenancy
        var now = _dateTime.UtcNow();

        var order = new Order
        {
            Id = Guid.NewGuid(),
            CreatedAt = now,
            TenantId = tenantId,
            Items = dto.Items
        };

        using var logScope = _logger.BeginProperty("orderId", order.Id);
        _logger.Info("Creating order for tenant {tenantId}", tenantId);

        await _orderRepository.AddAsync(order);
    }
}
```

---

## Verifying Compliance

### IDE Integration

All analyzers are packaged in **`Muonroi.RuleEngine.SourceGenerators`** and auto-loaded by Visual Studio / Rider:

- Errors (MBB001–MBB007, MRG001–MRG010) appear as red squiggles
- Warnings (MRG003–MRG009) appear as yellow squiggles
- Hover for detailed explanations and code fix suggestions

### Build-Time Verification

```bash
dotnet build
# Roslyn analyzers run during compilation
# Warnings/errors surface in the build log
```

### CI/CD

Add to your build pipeline:

```bash
dotnet build /p:TreatWarningsAsErrors=true
# Fail CI if any analyzer rule violations exist
```

---

## Cross-References

- **[Roslyn Analyzers Reference](../05-reference/roslyn-analyzers.md)** — Detailed diagnostic codes and fix strategies
- **[RuleGen Guide](../01-getting-started/first-rule.md)** — How to author rules with code-first approach
- **[Architecture Overview](../02-concepts/architecture-overview.md)** — Why these rules enforce tenant safety
- **[Building Block Packages](../05-reference/package-reference.md)** — Full package reference and wrapper interfaces

---

## Related Topics

- [License Governance & Feature Gates](./license-governance/license-activation.md)
- [Data Isolation Strategies](./multi-tenancy/multi-tenant-guide.md)
