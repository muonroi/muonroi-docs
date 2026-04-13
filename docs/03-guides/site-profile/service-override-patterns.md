---
title: Service Override Patterns
sidebar_label: Service Overrides
sidebar_position: 4
---

# Service Override Patterns

Site Profile provides multiple ways to customize business logic per site, ranging from simple inheritance to composable pipeline hooks.

## Overview of Patterns

| Pattern | Best For... | Mechanism |
| :--- | :--- | :--- |
| **Virtual Method Override** | Replacing entire method logic. | Standard C# inheritance (`override`). |
| **Pipeline Hooks** | Pre/post-processing or conditional logic. | `ISiteStepHook` interfaces (composable). |
| **Keyed Strategy** | Swapping specific algorithms or providers. | Keyed Dependency Injection. |

---

## Pattern 1: Virtual Method Override

The most straightforward way to customize logic is by inheriting from a base service and overriding virtual methods.

### 1. Define the Base Service
In your `Core` project, create an abstract base class with `virtual` methods.

```csharp
// MyProject.Core/Services/OrderServiceBase.cs
public abstract class OrderServiceBase : IOrderService
{
    public virtual async Task<CreateOrderResult> CreateAsync(OrderRequest request)
    {
        // Default implementation logic
        return new CreateOrderResult { Success = true };
    }
}
```

### 2. Override in the Site Project
In your site-specific project, inherit from the base service and override only what needs to change.

```csharp
// MyProject.Sites.Bravo/BravoOrderService.cs
public sealed class BravoOrderService : OrderServiceBase
{
    public override async Task<CreateOrderResult> CreateAsync(OrderRequest request)
    {
        // Custom logic for Bravo site
        var result = await base.CreateAsync(request);
        result.Message = "BRAVO-Created";
        return result;
    }
}
```

### 3. Register as a Keyed Service
In your `SiteProfile.Additional.cs`, register the override using the site's ID as the key.

```csharp
services.AddKeyedScoped<IOrderService, BravoOrderService>(SiteIds.BRAVO);
```

---

## Pattern 2: Pipeline Hooks (ISiteStepHook)

Pipeline hooks allow you to inject logic before, after, or instead of a specific step without modifying the base class. This is ideal for cross-cutting concerns like site-specific validation or data enrichment.

### 1. Implement ISiteStepHook
Create a hook class that implements the `ExecuteAsync` method.

```csharp
// MyProject.Sites.Bravo/Hooks/BravoValidateOrderHook.cs
public sealed class BravoValidateOrderHook : ISiteStepHook
{
    public Task ExecuteAsync(FactBag facts, CancellationToken ct)
    {
        var bookingNo = facts.Get<string>("order.booking_no");
        if (string.IsNullOrEmpty(bookingNo))
            throw new InvalidOperationException("BRAVO requires a booking number.");
            
        return Task.CompletedTask;
    }
}
```

### 2. Register the Hook
Register the hook in your `SiteProfile.Additional.cs` using the `AddSiteStepHook` extension.

```csharp
services.AddSiteStepHook<IOrderService>(
    SiteIds.BRAVO, 
    "CreateOrder", 
    SiteStepHookPhase.Before, 
    sp => sp.GetRequiredService<BravoValidateOrderHook>()
);
```

### Implementing a Hook

A hook receives a `FactBag` — a dictionary that carries data between pipeline steps:

```csharp
// Before hook: validates business rules before order mapping
public sealed class BravoValidateOrderHook : ISiteStepHook
{
    public Task ExecuteAsync(FactBag facts, CancellationToken cancellationToken = default)
    {
        var bookingNo = facts.Get<string>("order.booking_no");
        if (string.IsNullOrEmpty(bookingNo))
            throw new InvalidOperationException("BRAVO requires order.booking_no");

        facts.Set("bravo.validated", true);
        return Task.CompletedTask;
    }
}

// After hook: enriches entity with site-specific metadata
public sealed class BravoEnrichOrderHook : ISiteStepHook
{
    public Task ExecuteAsync(FactBag facts, CancellationToken cancellationToken = default)
    {
        facts.Set("bravo.enriched", true);
        facts.Set("bravo.enriched_at", DateTime.UtcNow.ToString("O"));
        return Task.CompletedTask;
    }
}
```

### Injecting MSitePipeline in a Service

The base service optionally injects `MSitePipeline<T>` — it's `null` for sites that don't register hooks:

```csharp
public class CreateOrderServiceBase<TContext, TOrderDetail>
{
    protected readonly MSitePipeline<CreateOrderServiceBase<TContext, TOrderDetail>>? Pipeline;

    public CreateOrderServiceBase(
        TContext writeContext,
        // ... other dependencies
        MSitePipeline<CreateOrderServiceBase<TContext, TOrderDetail>>? pipeline = null)
    {
        Pipeline = pipeline;
    }

    protected virtual async Task<TOrderDetail> MapOrderDetailCreateAsync(/* params */)
    {
        var orderDetail = new TOrderDetail();
        // ... base mapping logic

        // Run pipeline hooks if registered
        if (Pipeline is not null)
        {
            var facts = new FactBag();
            facts.Set("orderDetail", orderDetail);
            await Pipeline.RunStepAsync("MapOrderDetailCreate", facts);
            orderDetail = facts.Get<TOrderDetail>("orderDetail");
        }

        return orderDetail;
    }
}
```

:::info MSitePipeline is optional
Sites that don't register hooks don't need to inject `MSitePipeline`. The `= null` default
parameter makes it opt-in. Base service checks `Pipeline is not null` before running steps.
:::

### 3. Use the Pipeline in the Service
Inject `MSitePipeline<T>` into your service and call `RunStep`.

```csharp
public class OrderService(MSitePipeline<IOrderService> pipeline)
{
    public async Task CreateOrderAsync(FactBag facts)
    {
        await pipeline.RunStep("CreateOrder", facts, async (f, ct) => 
        {
            // Core logic goes here
            await _repository.SaveAsync(f.Get<Order>("order"));
        });
    }
}
```

---

## Pattern 3: Keyed Strategy

Use keyed DI to swap out specific strategies or providers based on the site.

### 1. Define the Strategy Interface
```csharp
public interface IOperMethodStrategy
{
    string Normalize(string input);
}
```

### 2. Implement Site-Specific Strategy
```csharp
public class TciOperMethodStrategy : IOperMethodStrategy
{
    public string Normalize(string input) => input == "HSLA" ? "HXLA" : input;
}
```

### 3. Register and Resolve
Register the strategy for the site and use `AddSiteResolvedService<T>` to create a dispatcher that resolves the correct one at runtime.

```csharp
// Registration
services.AddKeyedSingleton<IOperMethodStrategy, TciOperMethodStrategy>("TCI");
services.AddSiteResolvedService<IOperMethodStrategy>();

// Injection in Service
public class MyService(IOperMethodStrategy strategy) { ... }
```

---

## Pattern 4: Keyed Command Handler (CQRS)

For aggregate projects using MediatR, override behavior by registering site-specific
command handlers with keyed DI:

### Base Handler

```csharp
// Core: shared handler logic
public class CreateOrderHandlerBase
    : IRequestHandler<CreateOrderCommand, CreateOrderResponse>
{
    public virtual async Task<CreateOrderResponse> Handle(
        CreateOrderCommand request, CancellationToken ct)
    {
        // Shared validation, TOS lookups, gRPC delegation
        var client = _grpcClientFactory.CreateFacadeForCurrentSite<IDefaultFcdClient>();
        return await client.CreateV4Async(request.ToGrpcRequest(), ct);
    }
}
```

### Site-Specific Handler

```csharp
// Bravo: adds pre-flight booking validation
public sealed class BravoCreateOrderHandler : CreateOrderHandlerBase
{
    public override async Task<CreateOrderResponse> Handle(
        CreateOrderCommand request, CancellationToken ct)
    {
        // Bravo-specific: validate booking via site-specific RPC
        var client = _grpcClientFactory.CreateFacadeForCurrentSite<IBravoFcdClient>();
        var validation = await client.ValidateBookingAsync(request.BookingNo, ct);

        if (!validation.IsValid)
            return CreateOrderResponse.Fail(validation.Message);

        // Delegate to shared flow
        return await base.Handle(request, ct);
    }
}
```

### Registration

```csharp
// In BravoAggSiteProfile.Additional.cs
partial void RegisterAdditionalServices(IServiceCollection services, IConfiguration configuration)
{
    services.AddKeyedScoped<IRequestHandler<CreateOrderCommand, CreateOrderResponse>,
        BravoCreateOrderHandler>(SiteIds.BRAVO);
}
```

:::info When to use
Use keyed command handlers when:
- Your project uses MediatR (CQRS pattern)
- You're in an aggregate/gateway project (no direct DB access)
- Different sites need different orchestration flows
- You want to intercept or extend the command pipeline per site
:::

---

## Combining Patterns

Complex sites (like the `TCI` site in our ecosystem) often use all three patterns together to manage their unique requirements:

1.  **Virtual Override**: `TciCreateOrderService` overrides the core `CreateAsync` method to use a custom `SqlBuilder`.
2.  **Pipeline Hook**: `TciMapOrderDetailAfterHook` is registered to enrich the Order entity with site-specific metadata after it's mapped from the database.
3.  **Keyed Strategy**: `TciOperMethodStrategy` is injected into the core service to normalize legacy operation codes (`HSLA` → `HXLA`) specifically for TCI database records.

---

## Comparison Table

| Criteria | Virtual Override | Pipeline Hook | Keyed Strategy | Command Handler |
|----------|-----------------|---------------|----------------|-----------------|
| **Best for** | Replace method logic | Pre/post-process | Swap algorithm | Orchestration flow |
| **Project type** | Service | Service | Service | Aggregate |
| **Composable** | ❌ Single override | ✅ Multiple stack | ❌ Single impl | ❌ Single override |
| **Requires base change** | No | No | No | No |
| **Testing** | Easy (Mock service) | Easy (Check FactBag) | Easy (Mock strategy) | Easy (Mock handler) |

## Source Files
- `samples/TestProject.Service/src/TestProject.Service.Core/Services/OrderServiceBase.cs`
- `samples/TestProject.Service/src/TestProject.Service.Sites.Bravo/BravoOrderService.cs`
- `samples/TestProject.Service/src/TestProject.Service.Sites.Bravo/BravoPipelineHooks.cs`
- `src/Muonroi.Tenancy.SiteProfile.Web/Pipeline/ISiteStepHook.cs`
- `src/Muonroi.Tenancy.SiteProfile.Web/Pipeline/MSitePipeline.cs`

## Next Steps

- [Site Profile Attributes](site-profile-attributes.md) — Automating service registration.
- [Column Mapping Guide](site-column-map-guide.md) — Mapping data across different schemas.
- [gRPC Multi-Site Patterns](grpc-multi-site-patterns.md) — Overriding gRPC handlers.
