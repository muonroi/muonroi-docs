---
title: Site Profile Attributes
sidebar_label: Attributes & Generators
sidebar_position: 5
---

# Site Profile Attributes

Site Profile relies on a set of custom attributes and Roslyn source generators to automate Dependency Injection registration and boilerplate code generation.

## [GenerateSiteProfile] — The Core Attribute

This is the most important attribute. It marks a partial class as a Site Profile and triggers the generation of the `RegisterServices` method.

### Usage
```csharp
[GenerateSiteProfile(SiteIds.BRAVO, typeof(BravoOrderContext))]
public partial class BravoSiteProfile : ISiteProfile
{
    public string SiteId => SiteIds.BRAVO;
}
```

### Parameters
- **`SiteId`**: The unique string identifier for the site (used as the DI key).
- **`DbContextType`**: The site-specific `DbContext` class to be registered.
- **`SkipDbContextRegistration`**: (Optional) Set to `true` if you want to handle `DbContext` registration manually.

### What it Generates
The source generator creates a partial implementation of your profile class containing:
1.  **`RegisterServices`**: A method that registers the site's `DbContext`, any behaviors, and calls `RegisterAdditionalServices`.
2.  **`SiteIds` Constants**: Automatically adds the new `SiteId` to a generated constants class.
3.  **`SiteDbContextTypeRegistry`**: Updates a global registry used by migration runners to find all site contexts.

---

## [SiteProfileAlias] — Reusing Services

Use this attribute when a new site is identical in logic to an existing site (usually the `DEFAULT` site) but needs its own database or connection string.

### Usage
```csharp
[SiteProfileAlias(SiteIds.DEFAULT)]
[GenerateSiteProfile(SiteIds.CHARLIE, typeof(CharlieOrderContext))]
public partial class CharlieSiteProfile : ISiteProfile { ... }
```

### Effect
The generator emits code that aliases all keyed services registered for the `TargetSiteId` (e.g., `DEFAULT`) to also be available under the current `SiteId` (e.g., `CHARLIE`). This eliminates the need to manually re-register shared services.

---

## [SiteProfileBehavior] — Cross-Cutting Concerns

Behaviors allow you to apply reusable DI registrations (like auditing, caching, or quota enforcement) to multiple sites.

### Usage
```csharp
[SiteProfileBehavior(typeof(SiteAuditBehavior))]
[SiteProfileBehavior(typeof(SiteQuotaBehavior))]
[GenerateSiteProfile(SiteIds.ALPHA, typeof(AlphaOrderContext))]
public partial class AlphaSiteProfile : ISiteProfile { ... }
```

### Implementing a Behavior
A behavior must implement the `ISiteProfileBehavior` interface.

```csharp
public class SiteAuditBehavior : ISiteProfileBehavior
{
    public void Apply(IServiceCollection services, IConfiguration configuration, string siteId)
    {
        services.AddKeyedScoped<IAuditLogger, SiteAuditLogger>(siteId);
    }
}
```

---

## [GenerateSiteGrpcFacade] — Unified gRPC Clients

In "Aggregate" projects that need to call both shared and site-specific gRPC services, this attribute generates a unified facade client.

### Usage
```csharp
[GenerateSiteGrpcFacade(
    SharedClient = typeof(OrderServiceClient),
    ExtendClients = new[] { typeof(TciOrderServiceClient) })]
public partial interface ITciOrderClient { }
```

### Effect
The generator creates a concrete `TciOrderClientFacade` that combines all RPC methods from both clients into a single interface. It automatically dispatches calls to the correct underlying client based on the current site context.

---

## [SiteGrpcService] — Per-Site Proto Registration

Mark a gRPC service implementation as site-specific. This is useful when a site has a completely different `.proto` contract.

### Usage
```csharp
[SiteGrpcService(SiteIds.TCI)]
public class TciOrderGrpcService : TciOrder.TciOrderBase 
{
    // Implementation of TCI-specific gRPC contract
}
```

### Effect
The `MapSiteGrpcServices()` extension in `Program.cs` will automatically discover and route requests to this service when the `TCI` site code is detected.

---

## Attribute Summary Table

| Attribute | Target | Purpose |
| :--- | :--- | :--- |
| `[GenerateSiteProfile]` | Class | Generates `RegisterServices()` and registers `DbContext`. |
| `[SiteProfileAlias]` | Class | Reuses all keyed services from a target site. |
| `[SiteProfileBehavior]` | Class | Applies reusable DI logic (Auditing, Quotas, etc.). |
| `[GenerateSiteGrpcFacade]` | Interface | Combines shared and site-specific gRPC clients. |
| `[SiteGrpcService]` | Class | Registers a site-specific gRPC service endpoint. |

## Next Steps

- [Site Column Map Guide](site-column-map-guide.md) — Mapping properties to columns.
- [SQL Builder Guide](sql-builder-guide.md) — Building site-aware queries.
- [gRPC Multi-Site Patterns](grpc-multi-site-patterns.md) — Deep dive into gRPC dispatching.
