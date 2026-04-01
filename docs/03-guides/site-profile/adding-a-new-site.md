---
title: Adding a New Site
sidebar_label: Adding a New Site
sidebar_position: 2
---

# Adding a New Site

This guide provides a step-by-step walkthrough for creating a new site variant in your Muonroi application.

## Prerequisites

- An existing project with a `Core` library and a `Host` project.
- The following NuGet packages installed in your site project:
  - `Muonroi.Tenancy.SiteProfile`
  - `Muonroi.Tenancy.SiteProfile.Web` (if using EF Core or Dapper)

## Step 1: Define the Site ID

First, add a unique identifier for your new site in a shared constants file.

```csharp
// In MyProject.Core/Constants/SiteIds.cs
public static class SiteIds
{
    public const string DEFAULT = "DEFAULT";
    public const string ALPHA = "ALPHA";
    public const string BRAVO = "BRAVO";  // ← Your new site ID
}
```

## Step 2: Create the Site Project

We recommend creating a dedicated project for each site to keep dependencies isolated.

**Recommended File Structure:**

```text
MyProject.Sites.Bravo/
├── BravoSiteProfile.cs              # DI entry point with [GenerateSiteProfile]
├── BravoSiteProfile.Additional.cs   # Partial method for custom DI registrations
├── BravoOrderContext.cs             # Site-specific DbContext
├── Entities/
│   └── OrderDetailBravo.cs          # Site-specific entity (inherits base)
│   └── OrderDetailBravoConfig.cs    # EF Core configuration overrides
├── Services/
│   └── BravoOrderService.cs         # Business logic overrides (optional)
├── Hooks/
│   └── BravoValidationHook.cs       # Pipeline hooks (optional)
├── Grpc/                            # Site-specific gRPC implementations
│   └── BravoGrpcService.cs          # [SiteGrpcService] implementation
├── Protos/                          # Per-site .proto definitions
│   └── service.bravo.proto          # Site-specific proto file
└── BravoColumnMap.cs                # Column name overrides for Dapper (optional)
```

## Step 3: Create the Site Profile

The `SiteProfile` class is the entry point for site-specific configuration. Use the `[GenerateSiteProfile]` attribute to trigger the source generator, which handles the boilerplate DI registration.

```csharp
using Muonroi.Tenancy.SiteProfile;
using MyProject.Core.Constants;

namespace MyProject.Sites.Bravo;

[GenerateSiteProfile(SiteIds.BRAVO, typeof(BravoOrderContext))]
public partial class BravoSiteProfile : ISiteProfile
{
    public string SiteId => SiteIds.BRAVO;
}
```

## Step 4: Create the Site-Specific DbContext

Each site must have its own `DbContext` type to allow EF Core to manage different schema configurations independently.

```csharp
using Microsoft.EntityFrameworkCore;
using MyProject.Core.Infrastructure;

namespace MyProject.Sites.Bravo;

public sealed class BravoOrderContext : OrderContextBase<BravoOrderContext>
{
    public BravoOrderContext(DbContextOptions<BravoOrderContext> options)
        : base(options)
    {
    }

    protected override void ConfigureSiteSpecific(ModelBuilder modelBuilder)
    {
        // Add site-specific EF Core configurations here
        modelBuilder.ApplyConfiguration(new OrderDetailBravoConfig());
    }
}
```

## Step 5: Register Additional Services

Use the `RegisterAdditionalServices` partial method to register keyed services specific to this site. These services will be resolved when the request context matches the `SiteId`.

```csharp
// In BravoSiteProfile.Additional.cs
public partial class BravoSiteProfile
{
    partial void RegisterAdditionalServices(IServiceCollection services, IConfiguration configuration)
    {
        // Register a site-specific service override
        services.AddKeyedScoped<IOrderService, BravoOrderService>(SiteIds.BRAVO);
        
        // Register a pipeline hook
        services.AddSiteStepHook<IOrderService>(SiteIds.BRAVO, "Create", SiteStepHookPhase.Before, 
            sp => sp.GetRequiredService<BravoValidationHook>());
    }
}
```

## Step 6: Register the Site in the Host Project

In your `Program.cs`, register the site assembly so the system can discover and initialize it.

```csharp
// In MyProject.Host/Program.cs
builder.Services.AddMultiSiteProfiles(config =>
{
    // Register the assembly containing the site profiles
    config.AddSiteServices(typeof(BravoSiteProfile).Assembly);
    config.AddSiteServices(typeof(DefaultSiteProfile).Assembly);
});
```

## Step 7: Configure Connection Strings

Add the site-specific connection string to your `appsettings.json`.

```json
{
  "TenantConfigs": {
    "BRAVO": {
      "ConnectionString": "Server=my-db;Database=bravo_db;User Id=user;Password=pass;"
    }
  }
}
```

## Special Site Patterns

### Minimal Site (Zero Overrides)
If a site uses the standard schema and logic, its profile is extremely simple:

```csharp
[GenerateSiteProfile(SiteIds.DEFAULT, typeof(DefaultOrderContext))]
public partial class DefaultSiteProfile : ISiteProfile {
    public string SiteId => SiteIds.DEFAULT;
}
```

### Alias Site (Reusing Another Site's Logic)
If a site (e.g., `CHARLIE`) is identical to another site (e.g., `DEFAULT`) but requires a different database or connection string, use the `[SiteProfileAlias]` attribute.

```csharp
[SiteProfileAlias(SiteIds.DEFAULT)]
[GenerateSiteProfile(SiteIds.CHARLIE, typeof(CharlieOrderContext))]
public partial class CharlieSiteProfile : ISiteProfile {
    public string SiteId => SiteIds.CHARLIE;
}
```
*Charlie will now reuse all keyed service registrations from DEFAULT automatically.*

## Aggregate Site (No DbContext)

For aggregate/gateway projects that orchestrate via gRPC instead of owning a database,
use `SkipDbContextRegistration = true` and pass `typeof(object)` as the DbContext type:

```csharp
[GenerateSiteProfile(SiteIds.BRAVO, typeof(object), SkipDbContextRegistration = true)]
public partial class BravoAggSiteProfile : ISiteProfile
{
    public string SiteId => SiteIds.BRAVO;
}
```

The `RegisterAdditionalServices` partial method registers handlers instead of services:

```csharp
public partial class BravoAggSiteProfile
{
    partial void RegisterAdditionalServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddKeyedScoped<IRequestHandler<CreateOrderCommand, CreateOrderResponse>,
            BravoCreateOrderHandler>(SiteIds.BRAVO);
    }
}
```

:::tip When to use
Use `SkipDbContextRegistration = true` when your project:
- Calls downstream services via gRPC (no direct DB access)
- Acts as an API gateway or orchestrator
- Uses MediatR command handlers instead of repository services
:::

## File Reference Summary

| File | Required? | Purpose |
| :--- | :--- | :--- |
| `SiteProfile.cs` | **Yes** | DI entry point and metadata. |
| `SiteProfile.Additional.cs` | **Yes** | Place for custom keyed service registrations. |
| `OrderContext.cs` | **Yes** | Site-specific database context. |
| `Entity + Config` | **Yes** | Defines schema divergence (column names, constraints). |
| `Services/` | No | Override business logic for this site. |
| `Hooks/` | No | Intercept pipeline steps (Before/After/Replace). |
| `Grpc/` | No | Site-specific gRPC service implementation ([SiteGrpcService]). |
| `Protos/` | No | Per-site .proto files (only when shared proto is insufficient). |
| `ColumnMap.cs` | No | Overrides for Dapper-based queries. |

## Source Files
- `samples/TestProject.Service/src/TestProject.Service.Sites.Default/` (Minimal example)
- `samples/TestProject.Service/src/TestProject.Service.Sites.Bravo/` (Full override example)
- `samples/TestProject.Service/src/TestProject.Service.Sites.Charlie/` (Alias example)
- `samples/TestProject.Service/src/TestProject.Service.Host/Program.cs`

## Next Steps

- [DbContext & Entities](dbcontext-and-entity-configuration.md) — Deep dive into schema configuration.
- [Service Overrides](service-override-patterns.md) — Patterns for logic customization.
- [Site Profile Attributes](site-profile-attributes.md) — Reference for all available attributes.
