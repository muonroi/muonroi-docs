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

## Combining Patterns

Complex sites (like the `TCI` site in our ecosystem) often use all three patterns together to manage their unique requirements:

1.  **Virtual Override**: `TciCreateOrderService` overrides the core `CreateAsync` method to use a custom `SqlBuilder`.
2.  **Pipeline Hook**: `TciMapOrderDetailAfterHook` is registered to enrich the Order entity with site-specific metadata after it's mapped from the database.
3.  **Keyed Strategy**: `TciOperMethodStrategy` is injected into the core service to normalize legacy operation codes (`HSLA` → `HXLA`) specifically for TCI database records.

---

## Comparison Table

| Criteria | Virtual Override | Pipeline Hook | Keyed Strategy |
| :--- | :--- | :--- | :--- |
| **Best for** | Entire logic replacement | Pre/post enrichment | Swapping algorithms |
| **Type Safety** | High (Compile-time) | Medium (String keys) | High (Interfaces) |
| **Composable** | No (Single win) | **Yes** (Stackable) | No (Single win) |
| **Testing** | Easy (Mock service) | Easy (Check FactBag) | Easy (Mock strategy) |

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
