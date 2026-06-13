---
title: Core & Foundation Packages
sidebar_label: Core & Foundation
sidebar_position: 1
---

# Core & Foundation Packages

The Core & Foundation packages provide essential abstractions, utilities, and patterns for building applications on the Muonroi ecosystem. These packages establish the foundational infrastructure for dependency injection, execution context management, entity mapping, and inter-component communication via mediator patterns.

## Muonroi.Core.Abstractions

**NuGet:** `Muonroi.Core.Abstractions` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Defines the ecosystem contract interfaces and models for date/time services, JSON serialization, execution context management, diagnostics, and system configuration. This package is the cornerstone abstraction layer.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IMDateTimeService` | interface | Provides local and UTC time, dates, and timestamps |
| `IMJsonSerializeService` | interface | JSON serialization/deserialization abstraction |
| `ISystemExecutionContext` | interface | Carries tenant ID, user ID, correlation ID, permissions, authentication state |
| `SystemExecutionContext` | class | Default implementation with `Empty` static instance and `With()` builder |
| `ISystemExecutionContextAccessor` | interface | Get/Set/Clear current execution context via `AsyncLocal<T>` |
| `SystemExecutionContextAccessor` | class | Default accessor implementation |
| `ILogScopeFactory` | interface | Creates logging scopes with properties |
| `IMTraceContext` | interface | Starts/manages diagnostic trace sessions |
| `ITraceSession` | interface | Active trace context with session metadata |
| `IContextResolver` | interface | Resolves context from requests |
| `ITenantContextPolicy` | interface | Tenant context validation/resolution policy |
| `IMEcosystemRegistry` | interface | Registry for ecosystem capabilities and metadata |
| `MCapability` | enum (`[Flags]`) | Bit-flags for ecosystem capability detection: `None=0`, `Logging=1`, `RuleEngine=2`, `MultiTenant=4`, `Auth=8`, `Governance=16`. Bits 5–15 reserved for consumer-defined extensions. |
| `EcosystemServiceCollectionExtensions` | static | `GetOrCreateRegistry(IServiceCollection)` — ensures `IMEcosystemRegistry` singleton and registers startup capability logging (idempotent); `AddEcosystemStartupLog(IServiceCollection)` — registers `MEcosystemStartupFilter` as `IStartupFilter` (idempotent). |

### DI Registration

```csharp
// Automatic with CoreServiceCollectionExtensions
services.AddCoreServices(
    configuration,
    isSecretDefault: true,
    secretKey: "your-secret-key",
    paginationConfigs: null,
    tokenConfig: null
);

// Or manual registration
services.AddSingleton<IMDateTimeService, MDateTimeService>();
services.AddSingleton<IMJsonSerializeService, MJsonSerializeService>();
services.AddSingleton<ISystemExecutionContextAccessor, SystemExecutionContextAccessor>();
```

### Usage Example

```csharp
public class MyService(
    ISystemExecutionContextAccessor contextAccessor,
    IMDateTimeService dateTimeService)
{
    public async Task ProcessAsync(CancellationToken ct)
    {
        var context = contextAccessor.Get();
        Console.WriteLine($"TenantId: {context.TenantId}");
        Console.WriteLine($"UserId: {context.UserId}");
        Console.WriteLine($"IsAuthenticated: {context.IsAuthenticated}");
        Console.WriteLine($"Permissions: {string.Join(", ", context.Permissions)}");
        
        var now = dateTimeService.UtcNow();
        var timestamp = dateTimeService.UtcNowTs();
    }
}

// Accessing execution context in request handlers
var currentContext = contextAccessor.Get();
if (!string.IsNullOrEmpty(currentContext.TenantId))
{
    // Tenant-scoped operation
}
```

---

## Muonroi.Core

**NuGet:** `Muonroi.Core` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Provides runtime implementations of core abstractions, extension methods, and timing utilities. Includes helpers for cryptography, string manipulation, generic type operations, and pagination.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MDateTimeService` | class | Implements `IMDateTimeService` using `DateTime.Now`, `DateTime.UtcNow` |
| `CoreServiceCollectionExtensions` | static | Extension methods for DI registration |
| `MJsonSerializeService` | class | Implements `IMJsonSerializeService` using System.Text.Json |
| `Clock` | class | Clock provider abstraction |
| `IClockProvider` | interface | Strategy for clock implementations |
| `UtcClockProvider` | class | Returns UTC time |
| `LocalClockProvider` | class | Returns local time |
| `MSequentialGuidGenerator` | class | Generates sequential GUID values |
| `MStringExtension` | static | String manipulation: encryption, decryption, slug generation |
| `MDateTimeExtension` | static | DateTime helpers: timestamp conversion, UTC rounding |
| `MCryptographyExtension` | static | Encryption/decryption with AES |

### DI Registration

```csharp
// Register core services with configuration
var services = new ServiceCollection();
services.AddCoreServices(
    configuration: config,
    isSecretDefault: true,
    secretKey: "your-aes-key",
    paginationConfigs: new MPaginationConfig { DefaultPageSize = 20 },
    tokenConfig: new MTokenInfo { ... }
);
```

### Usage Example

```csharp
// In a service
public class OrderService(IMDateTimeService dateTimeService)
{
    public void LogOrderCreation()
    {
        var now = dateTimeService.UtcNow();
        var ts = dateTimeService.UtcNowTs();
        Console.WriteLine($"Order created at: {now} (ts: {ts})");
    }
}

// String extension usage
var encrypted = "plaintext".EncryptAes("key", "iv");
var decrypted = encrypted.DecryptAes("key", "iv");

// Configuration decryption
string redisHost = MStringExtension.DecryptConfigurationValue(
    config, 
    "{{encrypted-value}}", 
    isSecretDefault: true, 
    secretKey: "key",
    projectSeed: "seed"
);
```

---

## Muonroi.Services.Abstractions

**NuGet:** Not published (internal only)

### Purpose

Provides the `MServiceBase<TEntity, TDto>` template class that establishes shared CRUD and service patterns for site-specific implementations. Leverages EF Core and mapper abstractions.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MServiceBase<TEntity, TDto>` | abstract class | Template base for CRUD services with hook extension points |

### Template Method Hooks

The `MServiceBase<TEntity, TDto>` provides virtual hook methods for customization:

| Hook | When Called | Purpose |
|------|-------------|---------|
| `ValidateAsync` | Before create/update | Business rule validation |
| `ApplyDefaultValues` | After mapping, before create | Set site-specific defaults |
| `BeforeCreate` | Before saving new entity | Pre-save enrichment (e.g., generate codes) |
| `AfterCreate` | After entity saved | Post-save side effects (e.g., notifications) |
| `BeforeUpdate` | Before saving updates | Pre-update enrichment or change detection |
| `AfterUpdate` | After update saved | Post-update side effects |

### Usage Example

```csharp
// Define your entity and DTO
public class Product : IEntityBase
{
    public int Id { get; set; }
    public string Name { get; set; }
    public decimal Price { get; set; }
}

public class ProductDto
{
    public string Name { get; set; }
    public decimal Price { get; set; }
}

// Define your mapper
public class ProductMapper : IEntityMapper<Product, ProductDto>
{
    public ProductDto ToDto(Product entity) => 
        new() { Name = entity.Name, Price = entity.Price };
    
    public Product ToEntity(ProductDto dto) => 
        new() { Name = dto.Name, Price = dto.Price };
    
    public void ApplyUpdate(Product entity, ProductDto dto)
    {
        entity.Name = dto.Name;
        entity.Price = dto.Price;
    }
}

// Create site service
public class ProductService : MServiceBase<Product, ProductDto>
{
    public ProductService(DbContext context, IEntityMapper<Product, ProductDto> mapper)
        : base(context, mapper) { }
    
    protected override async Task ValidateAsync(Product entity, CancellationToken ct)
    {
        if (entity.Price <= 0)
            throw new ArgumentException("Price must be positive");
    }
    
    protected override void ApplyDefaultValues(Product entity)
    {
        entity.CreatedAt = DateTime.UtcNow;
    }
    
    protected override async Task AfterCreate(Product entity, CancellationToken ct)
    {
        // Publish event, send notification, etc.
        await Task.CompletedTask;
    }
}

// Usage
var service = new ProductService(context, mapper);
var dto = new ProductDto { Name = "Widget", Price = 9.99m };
var created = await service.CreateAsync(dto);
var retrieved = await service.GetByIdAsync<int>(created.Id);
```

---

## Muonroi.Mapper

**NuGet:** Not published (internal only)

### Purpose

Provides a reflection-based object mapping implementation using cached mapping actions. Scans assemblies for `IMapFrom<T>` implementations and builds mappings at startup.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IMapper` | interface | Mapping contract: `Map<T>`, `Map<TSource, TDest>` |
| `SimpleMapper` | class | Reflection-based mapper with cached `Action<object, object>` |
| `MappingConfiguration` | class | Registry of cached mappings, built from `IMapFrom<T>` types |
| `MapperServiceCollectionExtensions` | static | `ConfigureMapper()` DI registration |

### DI Registration

```csharp
// Scan all assemblies in AppDomain
services.ConfigureMapper();

// Or scan specific assemblies
services.ConfigureMapper(typeof(MyEntity).Assembly, typeof(MyDto).Assembly);
```

### Usage Example

```csharp
// Define source
public class UserEntity
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string Email { get; set; }
}

// Define destination implementing IMapFrom
public class UserDto : IMapFrom<UserEntity>
{
    public int Id { get; set; }
    public string Name { get; set; }
    public string Email { get; set; }
}

// In service
public class UserService(IMapper mapper)
{
    public UserDto MapUser(UserEntity entity)
    {
        return mapper.Map<UserDto>(entity);
    }
    
    public void UpdateEntity(UserEntity entity, UserDto dto)
    {
        mapper.Map(dto, entity);
    }
}
```

---

## Muonroi.Mapping.Abstractions

**NuGet:** Not published (internal only)

### Purpose

Defines the contract for entity-DTO mapping with a template method base class. Supports core field mapping (required) and site-specific field mapping (optional via virtual overrides).

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IEntityMapper<TEntity, TDto>` | interface | Mapping contract: `ToDto`, `ToEntity`, `ApplyUpdate` |
| `EntityMapperBase<TEntity, TDto>` | abstract class | Template implementation supporting core + site-specific mappings |

### Abstract Methods (Implement These)

```csharp
protected abstract void MapCoreToDto(TEntity entity, TDto dto);
protected abstract void MapCoreToEntity(TDto dto, TEntity entity);
```

### Virtual Methods (Override for Site-Specific Fields)

```csharp
protected virtual void MapSiteSpecificToDto(TEntity entity, TDto dto) { }
protected virtual void MapSiteSpecificToEntity(TDto dto, TEntity entity) { }
```

### Usage Example

```csharp
public class OrderMapper : EntityMapperBase<Order, OrderDto>
{
    protected override void MapCoreToDto(Order entity, OrderDto dto)
    {
        dto.OrderNumber = entity.OrderNumber;
        dto.Total = entity.Total;
    }
    
    protected override void MapCoreToEntity(OrderDto dto, Order entity)
    {
        entity.OrderNumber = dto.OrderNumber;
        entity.Total = dto.Total;
    }
    
    // Override for site-specific fields (optional)
    protected override void MapSiteSpecificToDto(Order entity, OrderDto dto)
    {
        dto.CustomField = entity.SiteSpecificField;
    }
}

// Usage
var mapper = new OrderMapper();
var entity = new Order { OrderNumber = "ORD-001", Total = 100m };
var dto = mapper.ToDto(entity);
```

---

## Muonroi.Mediator

**NuGet:** Not published (internal only)

### Purpose

Implements the Mediator pattern for command/query dispatch with cross-cutting concerns (authorization, tenant validation, rule engine execution, diagnostics). Provides base handler class and pipeline behaviors.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IMediator` | interface | Command/query dispatch: `Send<T>`, `Publish<T>`, `CreateStream<T>` |
| `IRequest<TResponse>` | interface | Marker for requests expecting a response |
| `IRequest` | interface | Marker for void requests (`Unit` response) |
| `IRequestHandler<TRequest, TResponse>` | interface | Handler contract: `Handle(request, ct)` |
| `INotification` | interface | Marker for notifications (events) |
| `INotificationHandler<TNotification>` | interface | Handler contract for notifications |
| `IPipelineBehavior<TRequest, TResponse>` | interface | Pipeline middleware contract |
| `IStreamRequest<TResponse>` | interface | Marker for streaming responses |
| `MBaseCommandHandler` | abstract class | Base class for all handlers with ecosystem wrappers |
| `Unit` | struct | Void response marker |

### Pipeline Behaviors (Built-In)

| Behavior | Purpose |
|----------|---------|
| `LoggingBehavior<T, R>` | Logs request/response via `IMLog` |
| `ValidationBehavior<T, R>` | Validates request via `IValidator<T>` (FluentValidation) |
| `MTenantValidationBehavior<T, R>` | Ensures `IMTenantRequest<T>` has tenant context |
| `MRuleEngineBehavior<T, R>` | Executes rules for `IMRuleRequest<T, TCtx>` |
| `MAuthorizationBehavior<T, R>` | Checks `[MAuthorize]` attribute permissions |
| `MDiagnosticsBehavior<T, R>` | Traces execution via `IMTraceContext` |
| `MExceptionHandlerBehavior<T, R>` | Handles exceptions via `IRequestExceptionHandler<T, R, Ex>` |
| `MPreProcessorBehavior<T, R>` | Runs `IRequestPreProcessor<T>` |
| `MPostProcessorBehavior<T, R>` | Runs `IRequestPostProcessor<T, R>` |

### Request Markers

```csharp
// Standard request/response
public class CreateOrderCommand : IRequest<OrderResult>
{
    public string OrderNumber { get; set; }
}

// Void request
public class DeleteOrderCommand : IRequest
{
    public int OrderId { get; set; }
}

// Tenant-scoped request (validates tenant context)
public class ListOrdersQuery : IMTenantRequest<List<OrderDto>>
{
    public int PageNumber { get; set; }
}

// Rule-enabled request (executes rules with context)
public class ValidateOrderCommand : IMRuleRequest<bool, OrderValidationContext>
{
    public int OrderId { get; set; }
    
    public OrderValidationContext BuildRuleContext()
    {
        return new OrderValidationContext { OrderId = OrderId };
    }
    
    public ExecutionMode RuleExecutionMode => ExecutionMode.AllOrNothing;
}
```

### Handler Implementation

```csharp
public class CreateOrderHandler : MBaseCommandHandler, IRequestHandler<CreateOrderCommand, OrderResult>
{
    private readonly IOrderRepository _orderRepository;
    
    public CreateOrderHandler(
        IMapper mapper,
        IAuthenticateInfoContext tokenInfo,
        IMLog<CreateOrderHandler> logger,
        IMediator mediator,
        ISystemExecutionContextAccessor contextAccessor,
        IMDateTimeService dateTimeService,
        IOrderRepository orderRepository)
        : base(mapper, tokenInfo, logger, mediator, contextAccessor, dateTimeService)
    {
        _orderRepository = orderRepository;
    }
    
    public async Task<OrderResult> Handle(CreateOrderCommand request, CancellationToken ct)
    {
        Logger.Info($"Creating order for tenant {CurrentTenantId}");
        
        var order = new Order 
        { 
            OrderNumber = request.OrderNumber,
            TenantId = CurrentTenantId,
            CreatedBy = CurrentUserId,
            CreatedAt = DateTimeService.UtcNow()
        };
        
        await _orderRepository.AddAsync(order, ct);
        
        LogInfo("Order created successfully");
        
        return new OrderResult { OrderId = order.Id };
    }
}
```

### DI Registration

```csharp
// Register mediator (assumes FluentValidation for validators)
services.AddMediatorWithBehaviors(
    typeof(CreateOrderHandler).Assembly,  // Handler assembly
    typeof(CreateOrderCommand).Assembly   // Request/response assembly
);
```

### Usage Example

```csharp
// In controller or service
public class OrdersController(IMediator mediator)
{
    [HttpPost]
    public async Task<IActionResult> CreateOrder(CreateOrderCommand command, CancellationToken ct)
    {
        var result = await mediator.Send(command, ct);
        return Ok(result);
    }
    
    [HttpGet]
    public async Task<IActionResult> ListOrders(ListOrdersQuery query, CancellationToken ct)
    {
        var orders = await mediator.Send(query, ct);
        return Ok(orders);
    }
    
    [HttpPost("validate")]
    public async Task<IActionResult> ValidateOrder(ValidateOrderCommand command, CancellationToken ct)
    {
        // Runs rules before handler
        var isValid = await mediator.Send(command, ct);
        return Ok(new { IsValid = isValid });
    }
}
```

---

## Muonroi.BuildingBlock.Shared

**NuGet:** Not published (internal only)

### Purpose

Placeholder for shared utilities and constants across building block implementations. Currently empty; reserved for future shared infrastructure.

---

## Muonroi.BuildingBlock.All

**NuGet:** Not published (internal only)

### Purpose

Meta-package providing convenient access to all building block packages via transitive dependencies. Simplifies consumer DI registration.

---

## Cross-Package Dependencies

| Package | Depends On |
|---------|-----------|
| `Muonroi.Core` | `Muonroi.Core.Abstractions` |
| `Muonroi.Mediator` | `Muonroi.Core.Abstractions`, `Muonroi.Mapper`, `Muonroi.RuleEngine.Abstractions` |
| `Muonroi.Services.Abstractions` | `Muonroi.Core.Abstractions`, `Muonroi.Mapping.Abstractions`, EF Core |
| `Muonroi.Mapper` | `Muonroi.Core.Abstractions` |
| `Muonroi.Mapping.Abstractions` | (none, pure interface) |

---

## Ecosystem Principles

These packages embody the Muonroi ecosystem principles:

1. **Dependency Injection First** — All services resolve via DI; no static ambient state
2. **Async by Default** — All I/O operations are async/cancellable
3. **Execution Context** — Tenant ID, user ID, permissions flow via `ISystemExecutionContextAccessor`
4. **Mapper Abstraction** — Decouples domain entities from DTOs via `IEntityMapper<T, TDto>`
5. **Mediator Pattern** — Centralizes cross-cutting concerns (auth, validation, rules) via pipeline behaviors
6. **Extension Points** — Template methods and virtual overrides enable site-specific customization

---

## Next Steps

- **Rule Engine Integration**: See [Rule Engine Guide](../../03-guides/rule-engine/rule-engine-guide.md) for executing rules in mediator pipelines
- **Multi-Tenancy**: See [Tenant Isolation](../../03-guides/multi-tenancy/tenant-isolation.md) for tenant-scoped service registration
- **Authentication**: See [Auth Setup](../../03-guides/identity-access/auth-module-guide.md) for permissions integration
