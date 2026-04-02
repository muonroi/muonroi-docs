---
title: DbContext and Entity Configuration
sidebar_label: DbContext & Entities
sidebar_position: 3
---

# DbContext and Entity Configuration

Site Profile uses a specialized pattern for Entity Framework Core that allows multiple sites to share the same core logic while diverging in their database schemas.

## Base DbContext Pattern

To share logic across sites, we use a base `DbContext` that contains shared entity configurations.

```csharp
// In MyProject.Core/Infrastructure/OrderContextBase.cs
public abstract class OrderContextBase<TContext> : DbContext 
    where TContext : DbContext
{
    protected OrderContextBase(DbContextOptions<TContext> options) : base(options)
    {
    }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Apply shared configurations from the Core assembly
        modelBuilder.ApplyConfigurationsFromAssembly(typeof(OrderContextBase<>).Assembly);
        
        // Allow sites to add their own configurations
        ConfigureSiteSpecific(modelBuilder);
    }

    protected abstract void ConfigureSiteSpecific(ModelBuilder modelBuilder);
}
```

## Creating a Site DbContext

Each site must have a unique `DbContext` class. This class should be `sealed` and inherit from the base context.

```csharp
// In MyProject.Sites.Alpha/AlphaOrderContext.cs
public sealed class AlphaOrderContext : OrderContextBase<AlphaOrderContext>
{
    public AlphaOrderContext(DbContextOptions<AlphaOrderContext> options)
        : base(options)
    {
    }

    protected override void ConfigureSiteSpecific(ModelBuilder modelBuilder)
    {
        // Apply Alpha-specific overrides
        modelBuilder.Entity<OrderDetailEntity>()
            .Property(e => e.Name)
            .HasMaxLength(300); // Override base 200 length
    }
}
```

## Entity Inheritance Patterns

Entities in a Site Profile project typically follow one of two patterns:

1.  **Shared Entity**: Use the same entity class across all sites, but use EF Core Fluent API to map it to different column names or constraints.
2.  **Site-Specific Subclass**: Create a subclass for a site if it requires additional properties that do not exist in other sites.

```csharp
// Base Entity (Core)
public class OrderDetailBase
{
    public long Id { get; set; }
    public string Name { get; set; } = string.Empty;
}

// Site-Specific Entity (Bravo Site)
public class OrderDetailBravo : OrderDetailBase
{
    public string BravoTrackingRef { get; set; } = string.Empty; // Extra column
}
```

## EF Configuration Override Patterns

### Column Name Override
Use `HasColumnName` in the site-specific `ConfigureSiteSpecific` method to map properties to legacy or custom column names.

```csharp
// Site Bravo maps 'BookingNo' to 'BRAVO_BKG_ID'
modelBuilder.Entity<OrderDetailEntity>()
    .Property(e => e.BookingNo)
    .HasColumnName("BRAVO_BKG_ID");
```

### Column Constraint Override
Override lengths, nullability, or default values as needed per site.

```csharp
// Site Alpha allows longer descriptions
modelBuilder.Entity<OrderDetailEntity>()
    .Property(e => e.Description)
    .HasMaxLength(2000);
```

### Index Override
Sites can define their own indices to optimize for their specific data distributions.

```csharp
// Site Bravo adds a unique index on ContainerNo
modelBuilder.Entity<OrderDetailEntity>()
    .HasIndex(e => e.ContainerNo)
    .IsUnique();
```

### Attribute-Based Column Mapping ([SiteColumn])

Instead of overriding `ConfigureSiteSpecific()`, you can decorate entity properties
with `[SiteColumn]` attributes:

```csharp
public class BravoOrder
{
    [SiteColumn(Name = "BOOKING_NUMBER", MaxLength = 25)]
    public string? BookingNo { get; set; }
}
```

Then apply in the DbContext:

```csharp
modelBuilder.ApplySiteColumnOverrides<BravoOrder>(SiteIds.BRAVO);
```

See [Site Profile Attributes](./site-profile-attributes.md#sitecolumn--property-level-column-mapping) for full parameter reference.

### Virtual Configuration Groups
To make base configurations more maintainable, use virtual methods to group columns that sites commonly override together.

```csharp
// In MyProject.Core/EntityConfigurations/OrderDetailConfigBase.cs
public class OrderDetailConfigBase : IEntityTypeConfiguration<OrderDetailEntity>
{
    public void Configure(EntityTypeBuilder<OrderDetailEntity> builder)
    {
        ConfigureCommonFields(builder);
        ConfigureSiteSpecificFields(builder);
    }

    protected virtual void ConfigureCommonFields(EntityTypeBuilder<OrderDetailEntity> builder) { ... }
    
    // Sites override this method to handle their specific column naming groups
    protected virtual void ConfigureSiteSpecificFields(EntityTypeBuilder<OrderDetailEntity> builder) { ... }
}
```

## AddSiteDbContext — Coexisting Safely

Standard EF Core registration (`AddDbContext<T>`) registers a non-generic `DbContextOptions` which can cause conflicts in multi-site environments. Muonroi provides `AddSiteDbContext<T>` to register only the generic `DbContextOptions<T>`, allowing multiple sites to coexist safely in the same container.

```csharp
// Internally used by [GenerateSiteProfile]
services.AddSiteDbContext<AlphaOrderContext>();
```

**Key Benefits:**
- **Isolation**: Sites do not leak their DB configurations to each other.
- **Connection Resolution**: Connection strings are resolved per-request via `ITenantConnectionStringFactory`.
- **Autofac Compatibility**: Avoids "last-registration-wins" issues with non-generic options.

## Ecosystem Base Class: MDbContext

The Muonroi ecosystem provides `MDbContext` as a base class for standard tenant-scoped projects. It includes:

- **Tenant-scoped query filters** — automatically applies `WHERE TenantId = @current` to all `ITenantScoped` entities
- **`IMLog` integration** — structured logging via Muonroi's logging abstractions
- **Soft-delete support** — `IsDeleted` filter applied globally

### When to Use MDbContext vs Raw DbContext

| Scenario | Recommended Base | Reason |
|----------|-----------------|--------|
| Standard tenant-scoped project (shared schema) | `MDbContext` | Get tenant filters, logging, soft-delete for free |
| Site Profile project (schemas diverge per site) | Raw `DbContext` | Each site's DbContext has different entity configurations; `MDbContext` tenant filters may conflict with site-level isolation |
| Aggregate/gateway project (no DB) | Neither | Use `SkipDbContextRegistration = true` |

```csharp
// Standard multi-tenant project — use MDbContext
public class AppDbContext : MDbContext<AppDbContext>
{
    // Tenant filters, IMLog, soft-delete all auto-configured
}

// Site Profile project — use raw DbContext base
public abstract class OrderContextBase<TContext> : DbContext
    where TContext : DbContext
{
    // Each site overrides ConfigureSiteSpecific() with its own column mappings
    protected abstract void ConfigureSiteSpecific(ModelBuilder modelBuilder);
}
```

:::tip
If your project uses Site Profile **and** needs tenant isolation within each site, consider applying tenant filters manually in `ConfigureSiteSpecific()` rather than inheriting from `MDbContext`. This gives you full control over which entities get which filters.
:::

## Schema Validation at Startup

:::note Planned feature — not yet implemented
Schema validation at startup is planned but not yet available in the current release.
When implemented, it will check that the database schema matches the EF Core model
for all registered site DbContexts, preventing runtime errors due to schema drift.
:::

## Source Files
- `samples/TestProject.Service/src/TestProject.Service.Core/Infrastructure/ContextBase.cs`
- `samples/TestProject.Service/src/TestProject.Service.Core/Infrastructure/EntityConfigurations/OrderDetailConfigBase.cs`
- `samples/TestProject.Service/src/TestProject.Service.Sites.Alpha/AlphaOrderContext.cs`
- `samples/TestProject.Service/src/TestProject.Service.Sites.Bravo/BravoOrderContext.cs`
- `src/Muonroi.Tenancy.SiteProfile.Web/SiteProfileDbContextExtensions.cs`

## Next Steps

- [Service Overrides](service-override-patterns.md) — Customizing business logic.
- [Column Mapping Guide](site-column-map-guide.md) — Advanced Dapper and EF mapping.
- [SQL Builder Guide](sql-builder-guide.md) — Building site-aware raw SQL queries.
