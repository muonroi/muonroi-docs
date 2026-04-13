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

### Dispatcher Implementation

The dispatcher class extends the proto-generated base and delegates each RPC to the
site-resolved handler via `SiteGrpcDispatchHelper`:

```csharp
public class OrderGrpcDispatcher : AggregateRpc.AggregateRpcBase
{
    private readonly SiteGrpcDispatchHelper<AggregateRpc.AggregateRpcBase> _helper;

    public OrderGrpcDispatcher(SiteGrpcDispatchHelper<AggregateRpc.AggregateRpcBase> helper)
        => _helper = helper;

    public override Task<HandleContainerReply> HandleContainer(
        HandleContainerRequest request, ServerCallContext context)
        => _helper.DispatchAsync(context, (handler, ctx) =>
            handler.HandleContainer(request, ctx));

    public override Task<GetContainersReply> GetContainers(
        GetContainersRequest request, ServerCallContext context)
        => _helper.DispatchAsync(context, (handler, ctx) =>
            handler.GetContainers(request, ctx));
}
```

Each RPC is a one-liner that delegates to the site-resolved handler.

### Registration

```csharp
// Register site-specific handlers (keyed by site ID)
services.AddSiteGrpcHandler<AggregateRpc.AggregateRpcBase,
    SharedOrderGrpcService>("default");
services.AddSiteGrpcHandler<AggregateRpc.AggregateRpcBase,
    BravoOrderGrpcService>(SiteIds.BRAVO);

// Register the dispatcher infrastructure
services.AddSiteGrpcDispatcher<AggregateRpc.AggregateRpcBase>();

// Map the dispatcher as the gRPC endpoint
app.MapGrpcService<OrderGrpcDispatcher>();
```

---

## Pattern 2: Per-Site Proto

Use this pattern when a specific site (like a legacy integration) has a completely different `.proto` contract that is not shared with other sites.

### 1. Mark with [SiteGrpcService]
Apply the `[SiteGrpcService]` attribute to your implementation class.

```csharp
[SiteGrpcService(SiteIds.BRAVO, Reason = "Bravo has unique container validation RPCs")]
public class BravoGrpcService : BravoAggregateRpc.BravoAggregateRpcBase
{
    public override async Task<BravoValidateReply> ValidateBooking(
        BravoValidateRequest request, ServerCallContext context)
    {
        // TCI-specific implementation
    }
}
```

The `Reason` parameter is optional — it documents *why* this service needs a separate proto,
useful for team onboarding and code reviews.

### 2. Map Services
Call `MapSiteGrpcServices()` in your `Program.cs`. This will automatically discover and register all classes marked with the attribute.

### Mapping Per-Site Services

Per-site gRPC services are auto-discovered from assemblies:

```csharp
// Scan specific assemblies for [SiteGrpcService] types
app.MapSiteGrpcServices(typeof(BravoGrpcService).Assembly);

// Or use the source-generated registry (discovers all [SiteGrpcService] in the project)
app.MapSiteGrpcServices(SiteGrpcServiceRegistry.GetAllSiteGrpcServices);
```

### Proto File Location

Site-specific `.proto` files live inside the site project:

```
Sites/Bravo/
└── Protos/
    └── service.bravo.proto    # Bravo-specific messages and RPCs
```

Reference in the `.csproj`:

```xml
<ItemGroup>
  <Protobuf Include="Protos\service.bravo.proto" GrpcServices="Server" />
</ItemGroup>
```

:::tip Shared vs Per-Site Proto
Most sites (20/22 in production) use the shared proto. Create a per-site proto only when the
site has fundamentally different message structures or RPCs that cannot be represented as
optional fields in the shared proto.
:::

---

## Fallback Behavior

When the site code is not found or not provided:

| Configuration | Behavior |
|---------------|----------|
| `Required = false` (default) | Falls back to `"default"` site handler |
| `Required = true` | Returns gRPC `INVALID_ARGUMENT` error |

The fallback chain: exact site key → `"default"` key → error if no default registered.

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

## Complete Program.cs Example

Below is a full, copyable `Program.cs` showing all registrations in the correct order for a gRPC multi-site application:

```csharp
using MyProject.Core;
using MyProject.Sites.Default;
using MyProject.Sites.Bravo;

var builder = WebApplication.CreateBuilder(args);

// 1. Site infrastructure (must come first — discovers all site profiles)
builder.Services.AddSiteInfrastructure(builder.Configuration, options =>
{
    options.SiteCodeAccessor = sp =>
        sp.GetRequiredService<IWorkContextAccessor>().WorkContext?.SiteCode;
    options.SiteAssemblies =
    [
        typeof(DefaultSiteProfile).Assembly,
        typeof(BravoSiteProfile).Assembly,
    ];
});

// 2. gRPC site services (interceptor + dispatch infrastructure)
builder.Services.AddSiteGrpcServices(options =>
{
    options.MetadataKey = "x-site-code";
    options.HttpHeaderFallbackKey = "x-site-code";
    options.Required = true;
});

// 3. Register site-specific gRPC handlers (keyed by site ID)
builder.Services.AddSiteGrpcHandler<AggregateRpc.AggregateRpcBase,
    SharedOrderGrpcService>("default");
builder.Services.AddSiteGrpcHandler<AggregateRpc.AggregateRpcBase,
    BravoOrderGrpcService>(SiteIds.BRAVO);

// 4. Register dispatcher infrastructure
builder.Services.AddSiteGrpcDispatcher<AggregateRpc.AggregateRpcBase>();

// 5. Per-request resolved services
builder.Services.AddSiteResolvedService<IOrderService>();
builder.Services.AddSiteResolvedService<ISiteColumnMap>();

builder.Services.AddGrpc();

var app = builder.Build();

// 6. Map the shared-proto dispatcher
app.MapGrpcService<OrderGrpcDispatcher>();

// 7. Map per-site proto services (auto-discovers [SiteGrpcService] types)
app.MapSiteGrpcServices(typeof(BravoSiteProfile).Assembly);

app.Run();
```

**Registration order matters:**
1. `AddSiteInfrastructure` — discovers profiles and registers keyed DbContexts
2. `AddSiteGrpcServices` — sets up the interceptor and dispatch helper
3. Handler registrations — keyed by site ID
4. `AddSiteGrpcDispatcher` — wires up the dispatch helper for the proto base type
5. `MapGrpcService` — exposes the shared dispatcher endpoint
6. `MapSiteGrpcServices` — exposes per-site proto endpoints

## Source Files
- `src/Muonroi.Tenancy.SiteProfile.Grpc/SiteCodeGrpcInterceptor.cs`
- `src/Muonroi.Tenancy.SiteProfile.Grpc/SiteGrpcDispatchHelper.cs`
- `src/Muonroi.Tenancy.SiteProfile.Grpc/SiteGrpcServiceAttribute.cs`
- `samples/TestProject.Aggregate/src/TestProject.Aggregate.Host/v1/Services/OrderGrpcDispatcher.cs`
- `samples/TestProject.Service/src/TestProject.Service.Host/Program.cs`

## Next Steps

- [Site Profile Overview](site-profile-overview.md) — Understanding the multi-site architecture.
- [Service Overrides](service-override-patterns.md) — Customizing internal business logic.
- [Site Profile Attributes](site-profile-attributes.md) — Reference for all gRPC-related attributes.
