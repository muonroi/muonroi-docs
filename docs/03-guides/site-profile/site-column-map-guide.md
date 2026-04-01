---
title: Site Column Map Guide
sidebar_label: Column Mapping
sidebar_position: 6
---

# Site Column Map Guide

The `ISiteColumnMap` interface is a core component of the Site Profile system. It provides a bridge between C# property names and site-specific database column names, allowing your application to query diverging schemas without changing business logic.

## What is ISiteColumnMap?

`ISiteColumnMap` maps property names to database columns at runtime. It has three primary capabilities:
1.  **Rename**: Map a property to a custom column name.
2.  **Remove**: Exclude a property from queries if the column doesn't exist for a site.
3.  **Add**: Include extra columns that exist only for a specific site.

## Default Mapping Convention

Muonroi provides a `DefaultSiteColumnMap` that follows the ecosystem's standard naming convention: **PascalCase** property names are converted to **UPPER_SNAKE_CASE** column names.

- `BookingNo` → `BOOKING_NO`
- `ContainerNo` → `CONTAINER_NO`
- `Id` → `ID`

Most sites should inherit from `DefaultSiteColumnMap` and override only the columns that diverge from this convention.

## Customizing Mappings (The Bravo Example)

The following example demonstrates how to implement a custom column map for a site named "Bravo".

```csharp
using Muonroi.Tenancy.SiteProfile.Web.Dapper;

namespace MyProject.Sites.Bravo;

public sealed class BravoColumnMap : DefaultSiteColumnMap
{
    // Define extra columns specific to this site
    private static readonly SiteExtraColumn[] s_extras =
    [
        // Params: PropertyName, ColumnName, ClrType, IsNullable
        new("TrackingReference", "BRAVO_TRACKING_REF", typeof(string), true),
    ];

    public override string Column(string propertyName) => propertyName switch
    {
        // 1. RENAME: Bravo uses BOOKING_NUMBER instead of the standard BOOKING_NO
        "BookingNo" => "BOOKING_NUMBER",
        
        // Use default convention for all other properties
        _ => base.Column(propertyName)
    };

    // 2. REMOVE: Bravo does not have the 'LegacyField' column
    public override bool HasColumn(string propertyName) => propertyName != "LegacyField";

    // 3. ADD: Bravo has a tracking reference column not in the core entity
    public override IReadOnlyList<SiteExtraColumn> ExtraColumns => s_extras;
}
```

## Registration

Column maps require **two registrations**: the keyed singleton and the site resolver.

```csharp
// Step 1: Register site-specific column maps (keyed by site ID)
services.AddKeyedSingleton<ISiteColumnMap, BravoColumnMap>(SiteIds.BRAVO);
services.AddKeyedSingleton<ISiteColumnMap, TciColumnMap>(SiteIds.TCI);
// DEFAULT uses DefaultSiteColumnMap automatically (no registration needed)

// Step 2: Register the site resolver (resolves correct map per request)
services.AddSiteResolvedService<ISiteColumnMap>();
```

:::warning Both lines are required
`AddKeyedSingleton` registers the map for a specific site.
`AddSiteResolvedService` registers the factory that resolves the correct map based on the current site code at request time.
Without `AddSiteResolvedService`, injecting `ISiteColumnMap` will fail.
:::

### Registration in SiteProfile

Alternatively, register in `RegisterAdditionalServices` inside each site profile:

```csharp
public partial class BravoSiteProfile
{
    partial void RegisterAdditionalServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddKeyedSingleton<ISiteColumnMap, BravoColumnMap>(SiteIds.BRAVO);
    }
}
```

The `AddSiteResolvedService<ISiteColumnMap>()` call is typically made once in `Program.cs` or
in a shared infrastructure setup method.

### Default Fallback

Sites without a custom `ISiteColumnMap` registration automatically fall back to
`DefaultSiteColumnMap` (PascalCase → UPPER_SNAKE_CASE convention). You do not need to
explicitly register `DefaultSiteColumnMap` for the default site.

## Two-Layer Mapping Architecture

Muonroi uses column mapping at two different layers to ensure consistency:

| Layer | Technology | Mechanism |
| :--- | :--- | :--- |
| **Persistence** | EF Core | `IEntityTypeConfiguration<T>` in the site's `DbContext`. |
| **Raw SQL** | Dapper | `ISiteColumnMap` used by `SiteSqlBuilder`. |

:::warning Sync Required
It is critical to keep your EF Core configurations and your `ISiteColumnMap` in sync. If you rename a column in EF Core, you must also rename it in your `ISiteColumnMap` to ensure Dapper queries behave correctly.
:::

## Impact on Queries

- **`SiteSqlBuilder.Select()`**: Automatically filters out columns where `HasColumn()` returns false.
- **`SiteSqlBuilder.Col()`**: Returns the mapped column name (e.g., `BOOKING_NUMBER`).
- **`InterpolateMarkers()`**: Replaces `[[PropertyName]]` with the mapped column name and throws if the column is removed.

## Source Files
- `src/Muonroi.Tenancy.SiteProfile.Web/Dapper/ISiteColumnMap.cs`
- `src/Muonroi.Tenancy.SiteProfile.Web/Dapper/DefaultSiteColumnMap.cs`
- `src/Muonroi.Tenancy.SiteProfile.Web/Dapper/SiteExtraColumn.cs`
- `samples/TestProject.Service/src/TestProject.Service.Sites.Bravo/BravoColumnMap.cs`

## Next Steps

- [SQL Builder Guide](sql-builder-guide.md) — Using column maps in raw SQL.
- [DbContext & Entities](dbcontext-and-entity-configuration.md) — Configuring EF Core mappings.
- [Service Overrides](service-override-patterns.md) — Customizing the logic that calls these queries.
