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

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `siteId` | `string` | Required | Unique site identifier (e.g., `"BRAVO"`) |
| `dbContextType` | `Type` | Required | The site's DbContext type. Use `typeof(object)` for aggregate projects |
| `SkipDbContextRegistration` | `bool` | `false` | Set to `true` for projects without a DbContext (aggregates, gateways) |

When `SkipDbContextRegistration = true`:
- No `AddSiteDbContext<T>()` call is generated
- `typeof(object)` is used as the DbContext type parameter (placeholder)
- Only `RegisterAdditionalServices()` is called for custom DI

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

:::danger Schema Divergence Risk
Alias sites share **all** service implementations with their source site — including `ISiteColumnMap`, `SiteSqlBuilder` queries, and DbContext configurations. This means:

- If the alias site's database has **different column names** than the source site, all Dapper queries will generate wrong SQL
- If the alias site is **missing tables or columns** that the source site expects, queries will fail at runtime
- If the alias site has **extra columns** not in the source site, those columns will be silently ignored

**Rule:** Only use `[SiteProfileAlias]` when the alias site's database schema is **identical** to the source site's schema. Different connection strings and data are fine — different schemas are not.

If schemas differ, create a full site profile with its own column map and DbContext:

```csharp
// Wrong — Delta has different column names but aliases Default
[SiteProfileAlias(SiteIds.DEFAULT)]
[GenerateSiteProfile(SiteIds.DELTA, typeof(DeltaOrderContext))]
public partial class DeltaSiteProfile : ISiteProfile { }

// Correct — Delta gets its own column map and service overrides
[GenerateSiteProfile(SiteIds.DELTA, typeof(DeltaOrderContext))]
public partial class DeltaSiteProfile : ISiteProfile { }
```
:::

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

## [SiteColumn] — Property-Level Column Mapping

An alternative to fluent API overrides in `OnModelCreating()`. Decorate entity properties
directly with column metadata:

```csharp
public class BravoOrder
{
    public long Id { get; set; }

    [SiteColumn(Name = "BOOKING_NUMBER", MaxLength = 25)]
    public string? BookingNo { get; set; }

    [SiteColumn(IsRequired = true, DefaultValue = "N")]
    public string? Status { get; set; }

    // No attribute → uses UPPER_SNAKE_CASE convention: CONTAINER_NO
    public string? ContainerNo { get; set; }
}
```

### Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `Name` | `string?` | Override column name |
| `MaxLength` | `int?` | Column max length constraint |
| `IsRequired` | `bool` | NOT NULL constraint |
| `DefaultValue` | `string?` | SQL default value |
| `HasColumnType` | `string?` | Database type override (e.g., `"decimal(18,4)"`) |
| `Ignore` | `bool` | Completely exclude property from EF mapping |

### Applying

```csharp
protected override void ConfigureSiteSpecific(ModelBuilder modelBuilder)
{
    modelBuilder.ApplySiteColumnOverrides<BravoOrder>(SiteIds.BRAVO);
}
```

:::tip When to use [SiteColumn] vs fluent API
- **[SiteColumn]**: Best when column differences are simple (name, length, required) and you want them visible on the entity
- **Fluent API**: Best for complex configurations (indexes, relationships, computed columns)
- Both can be used together — fluent API overrides [SiteColumn] if both are set
:::

**Package:** `Muonroi.EntityFrameworkCore.Configuration`

---

## Attribute Summary Table

| Attribute | Target | Purpose |
| :--- | :--- | :--- |
| `[GenerateSiteProfile]` | Class | Generates `RegisterServices()` and registers `DbContext`. |
| `[SiteProfileAlias]` | Class | Reuses all keyed services from a target site. |
| `[SiteProfileBehavior]` | Class | Applies reusable DI logic (Auditing, Quotas, etc.). |
| `[GenerateSiteGrpcFacade]` | Interface | Combines shared and site-specific gRPC clients. |
| `[SiteGrpcService]` | Class | Registers a site-specific gRPC service endpoint. |
| `[SiteColumn]` | Property | Direct EF Core column mapping on entity properties. |

## Source Files
- `src/Muonroi.Tenancy.SiteProfile/GenerateSiteProfileAttribute.cs`
- `src/Muonroi.Tenancy.SiteProfile/SiteProfileAliasAttribute.cs`
- `src/Muonroi.Tenancy.SiteProfile/ISiteProfileBehavior.cs`
- `src/Muonroi.Tenancy.SiteProfile.Grpc/SiteGrpcServiceAttribute.cs`
- `src/Muonroi.Tenancy.SiteProfile.Grpc/GenerateSiteGrpcFacadeAttribute.cs`
- `src/Muonroi.EntityFrameworkCore.Configuration/SiteColumnAttribute.cs`

## Next Steps

- [Site Column Map Guide](site-column-map-guide.md) — Mapping properties to columns.
- [SQL Builder Guide](sql-builder-guide.md) — Building site-aware queries.
- [gRPC Multi-Site Patterns](grpc-multi-site-patterns.md) — Deep dive into gRPC dispatching.
