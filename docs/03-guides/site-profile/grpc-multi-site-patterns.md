---
title: gRPC Multi-Site Patterns
sidebar_label: gRPC Patterns
sidebar_position: 8
---

# gRPC Multi-Site Patterns

Muonroi provides first-class support for gRPC in multi-site environments. Whether your sites share a single `.proto` contract or have completely unique ones, the system handles request routing and service resolution automatically.

## Site Code Resolution

The `SiteCodeGrpcInterceptor` is responsible for extracting the site code from incoming gRPC requests. It checks for the site code in the following order:
1.  **gRPC Metadata**: A specific key (e.g., `x-site-code`).
2.  **HTTP Header Fallback**: An optional HTTP header (e.g., `x-site-code`).

### Configuration
Enable the interceptor in your `Program.cs`:

```csharp
builder.Services.AddSiteGrpcServices(options =>
{
    options.MetadataKey = "x-site-code";
    options.HttpHeaderFallbackKey = "x-site-code";
    options.Required = true; // Reject requests without a site code
});
```

---

## Pattern 1: Shared Proto with DI Dispatch

This is the most common pattern (used by ~90% of sites). All sites share the same `.proto` definition, but the implementation of the RPCs differs per site.

### 1. Create the Dispatcher
Create a thin "dispatcher" class that inherits from the proto-generated base class. It uses the `SiteGrpcDispatchHelper` to route calls to the correct site-specific handler.

```csharp
public class OrderGrpcDispatcher : OrderService.OrderServiceBase
{
    private readonly SiteGrpcDispatchHelper<OrderService.OrderServiceBase> _helper;

    public OrderGrpcDispatcher(SiteGrpcDispatchHelper<OrderService.OrderServiceBase> helper)
        => _helper = helper;

    public override Task<CreateOrderReply> CreateOrder(CreateOrderRequest request, ServerCallContext context)
        => _helper.DispatchAsync(context, (handler, ctx) => handler.CreateOrder(request, ctx));
}
```

### 2. Register Handlers
Register each site's implementation as a **keyed gRPC handler**.

```csharp
// Program.cs
services.AddSiteGrpcHandler<OrderService.OrderServiceBase, SharedOrderService>("default");
services.AddSiteGrpcHandler<OrderService.OrderServiceBase, BravoOrderService>("BRAVO");

// Register the dispatcher itself
services.AddSiteGrpcDispatcher<OrderService.OrderServiceBase>();
app.MapGrpcService<OrderGrpcDispatcher>();
```

---

## Pattern 2: Per-Site Proto

Use this pattern when a specific site (like a legacy integration) has a completely different `.proto` contract that is not shared with other sites.

### 1. Mark with [SiteGrpcService]
Apply the `[SiteGrpcService]` attribute to your implementation class.

```csharp
[SiteGrpcService(SiteIds.TCI)]
public class TciOrderGrpcService : TciOrder.TciOrderBase 
{
    public override async Task<TciReply> ProcessTciOrder(TciRequest request, ServerCallContext context)
    {
        // TCI-specific implementation
    }
}
```

### 2. Map Services
Call `MapSiteGrpcServices()` in your `Program.cs`. This will automatically discover and register all classes marked with the attribute.

```csharp
app.MapSiteGrpcServices();
```

---

## Pattern 3: Unified Facade Client

In "Aggregate" or "Gateway" projects, you may need to call multiple downstream gRPC services (one shared, several site-specific) through a single interface. The `[GenerateSiteGrpcFacade]` attribute automates this.

### 1. Define the Facade
```csharp
[GenerateSiteGrpcFacade(
    SharedClient = typeof(OrderServiceClient),
    ExtendClients = new[] { typeof(TciOrderServiceClient) })]
public partial interface ITciOrderClient { }
```

### 2. Use the Facade
The system resolves the correct underlying client based on the site context of the *current* request.

```csharp
public class MyAggregateService(ITciOrderClient orderClient)
{
    public async Task ProcessAsync()
    {
        // This will call either the shared OrderServiceClient 
        // OR the TciOrderServiceClient depending on the active site.
        await orderClient.CreateAsync(new OrderRequest());
    }
}
```

---

## Pattern 4: Site-Specific REST Controllers

For non-gRPC projects, you can use `AddSiteControllers()` to support per-site Web API controllers.

```csharp
// In Program.cs
builder.Services.AddSiteControllers();

// In Bravo project
[SiteController(SiteIds.BRAVO)]
public class BravoOrderController : OrderControllerBase { ... }
```

## Decision Table

| Requirement | Recommended Pattern |
| :--- | :--- |
| Same contract, different logic | Shared Proto + DI Dispatch |
| Unique contract for one site | Per-Site Proto + `[SiteGrpcService]` |
| Unified client for multiple protos | `[GenerateSiteGrpcFacade]` |
| Per-site REST API | `AddSiteControllers` |

## Next Steps

- [Site Profile Overview](site-profile-overview.md) — Understanding the multi-site architecture.
- [Service Overrides](service-override-patterns.md) — Customizing internal business logic.
- [Site Profile Attributes](site-profile-attributes.md) — Reference for all gRPC-related attributes.
