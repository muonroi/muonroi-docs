---
title: Multi-Tenancy Packages
sidebar_label: Multi-Tenancy
sidebar_position: 8
---

# Multi-Tenancy Packages

Comprehensive reference for the Muonroi multi-tenancy system. The platform provides a layered architecture for managing multiple tenants, each with isolated data and per-site schema variants.

## System Architecture

The multi-tenancy system is organized into three conceptual layers:

1. **Abstractions Layer** — Core interfaces and models (NuGet.org)
2. **Core Layer** — Context, resolution, and validation logic (NuGet.org)
3. **Advanced Layer** — Site profiles, infrastructure, and gRPC integration (NuGet.org)
4. **Quota & Licensing** — Usage tracking and feature gating (NuGet.org)

```
┌─────────────────────────────────────────────────────────────────┐
│  Application Layer (Your Code)                                  │
│  - Services, Repositories, Controllers, Handlers                │
└─────────────┬───────────────────────────────────────────────────┘
              │
┌─────────────┴──────────────────────────────────────────────────┐
│  Muonroi.Tenancy.SiteProfile.Web                               │
│  - Per-site DbContext (AddSiteDbContext<T>)                    │
│  - Dapper infrastructure (AddSiteDapperInfrastructure)         │
│  - Repositories (MSiteRepository<TContext, T>)                 │
│  - Services (MSiteService<TContext, TEntity>)                  │
│  - Pipeline hooks, validation, telemetry                       │
└─────────────┬──────────────────────────────────────────────────┘
              │
┌─────────────┴──────────────────────────────────────────────────┐
│  Muonroi.Tenancy.SiteProfile                                   │
│  - ISiteProfile (site definitions)                             │
│  - ISiteProfileResolver (per-request resolution)               │
│  - AddMultiSiteProfiles / AddSiteProfile (DI registration)     │
│  - Site scope override (testing, background jobs)              │
└─────────────┬──────────────────────────────────────────────────┘
              │
┌─────────────┴──────────────────────────────────────────────────┐
│  Muonroi.Tenancy.SiteProfile.Grpc                              │
│  - gRPC-specific dispatchers (site-aware client factories)     │
│  - Interceptors (site code propagation)                        │
│  - Service facades                                             │
└─────────────┬──────────────────────────────────────────────────┘
              │
┌─────────────┴──────────────────────────────────────────────────┐
│  Muonroi.Tenancy + Muonroi.Tenancy.Core                        │
│  - TenantContext (AsyncLocal<string> ambient accessor)         │
│  - TenantResolutionMiddleware (HTTP tenant extraction)         │
│  - Tenant validation & security                                │
│  - Connection string resolution                                │
│  - Redis caching                                               │
└─────────────┬──────────────────────────────────────────────────┘
              │
┌─────────────┴──────────────────────────────────────────────────┐
│  Muonroi.Tenancy.Abstractions                                  │
│  - ITenantContext (interface)                                  │
│  - ITenantIdResolver, ITenantConnectionStringFactory           │
│  - ITenantScoped (marker), ITenantLicenseFeatureGate           │
│  - MultiTenantOptions configuration                            │
└─────────────┬──────────────────────────────────────────────────┘
              │
┌─────────────┴──────────────────────────────────────────────────┐
│  Muonroi.Quota.Abstractions                                    │
│  - ITenantQuotaTracker, ITenantQuotaStore                      │
│  - TenantQuota (limits), TenantQuotaPresets (tiers)            │
│  - QuotaUsage, QuotaType enums                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Muonroi.Tenancy.Abstractions

**NuGet:** `Muonroi.Tenancy.Abstractions` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Core tenant context and configuration interfaces — all other layers depend on these abstractions.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `ITenantContext` | Interface | Get/set current `TenantId` string |
| `ITenantIdResolver` | Interface | Extract tenant ID from `HttpContext` (claims, headers, path, subdomain) |
| `ITenantConnectionStringFactory` | Interface | Resolve database connection string by tenant ID |
| `ITenantScoped` | Interface | Marker for tenant-scoped entities (enables EF global query filters) |
| `ITenantLicenseFeatureGate` | Interface | Feature enablement by license tier |
| `MultiTenantOptions` | Config | Feature flags: `Enabled`, `RequireTenantClaim`, `StrictMode` |
| `TenantConnectionStringsOptions` | Config | Map of tenant IDs to connection strings |

### DI Registration

Typically registered automatically by `AddTenancy()` or `AddSiteDbInfrastructure()`:

```csharp
services.AddScoped<ITenantContext>(sp => new TenantContext());
services.AddScoped<ITenantIdResolver, DefaultTenantIdResolver>();
services.AddScoped<ITenantConnectionStringFactory, DefaultTenantConnectionStringFactory>();
```

### Usage Example

```csharp
// Get current tenant from context
public class MyService
{
    private readonly ITenantContext _tenantContext;

    public MyService(ITenantContext tenantContext)
    {
        _tenantContext = tenantContext;
    }

    public async Task DoWorkAsync()
    {
        string? tenantId = _tenantContext.TenantId;  // Resolves from AsyncLocal<>
        // Use tenantId to filter data, resolve connections, etc.
    }
}
```

---

## Muonroi.Tenancy.Core

**NuGet:** `Muonroi.Tenancy.Core` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Core implementation of tenant context, resolution, and connection string factories. Provides the `AsyncLocal<T>` ambient storage pattern.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `TenantContext` | Class | Static `CurrentTenantId` property backed by `AsyncLocal<string?>`. Failsafe cross-tenant access via `AllowCrossTenantAccess` |
| `DefaultTenantIdResolver` | Class | Multi-strategy tenant resolution: claims → headers → path segments → subdomains |
| `DefaultTenantConnectionStringFactory` | Class | Map-based connection string lookup from configuration |
| `MappingTenantConnectionStringFactory` | Class | Custom mapping function for connection resolution |
| `TenantSecurityValidator` | Class | Static validation: context vs claim vs header matching (fail-closed) |
| `TenantSchemaSelector` | Class | EF Core schema selection per tenant |
| `TenantQuotaTracker` | Class | Quota enforcement (if using in-memory store) |
| `ContextMirrorScope` | Class | Mirrors execution context to log scopes |

### AsyncLocal Pattern

Tenant context is stored in thread-local (async-safe) storage:

```csharp
public class TenantContext : ITenantContext
{
    private static readonly AsyncLocal<string?> Current = new();

    public string? TenantId
    {
        get => Current.Value;
        set => Current.Value = value;
    }

    public static string? CurrentTenantId
    {
        get => Current.Value;
        set => Current.Value = value;
    }
}
```

**Key property:** `TenantContext.AllowCrossTenantAccess` (default: `false`)

When `true`, EF Core global query filters for `ITenantScoped` entities are bypassed. Use only for admin/system operations.

### DI Registration

```csharp
services.AddTenancy(configuration);  // Registers all core services
```

Or manually:

```csharp
services.AddScoped<ITenantContext, TenantContext>();
services.AddScoped<ITenantIdResolver, DefaultTenantIdResolver>();
services.AddScoped<ITenantConnectionStringFactory, DefaultTenantConnectionStringFactory>();
```

### Usage Example

```csharp
// Access tenant anywhere without parameter passing
public class OrderProcessor
{
    public async Task ProcessAsync()
    {
        var tenantId = TenantContext.CurrentTenantId;  // AsyncLocal access
        // Process order for current tenant
    }
}

// Validate tenant cross-checks
TenantSecurityValidator.TryValidate(
    contextTenantId: context.User.FindFirst("tenant_id")?.Value,
    claimTenantId: jwt.Subject,
    headerTenantId: request.Headers["X-Tenant-Id"],
    requireTenantClaim: true,
    out string errorCode);

if (!valid)
{
    return Unauthorized(errorCode);  // MissingTenantContext, TenantMismatch, etc.
}
```

---

## Muonroi.Tenancy

**NuGet:** `Muonroi.Tenancy` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Provides HTTP middleware and Redis caching for tenant context resolution.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `TenantResolutionMiddleware` | Middleware | Extracts tenant from HTTP request, validates, and sets `TenantContext.CurrentTenantId` |
| `RedisTenantCache` | Class | Caches tenant metadata in Redis for fast lookup |
| `TenantResolutionTelemetry` | Class | OpenTelemetry metrics for tenant resolution |

### DI Registration

```csharp
// In Program.cs
var app = builder.Build();
app.UseMiddleware<TenantResolutionMiddleware>();
```

Or automatically via templates:

```csharp
public static void AddTenancy(this WebApplicationBuilder builder)
{
    builder.Services.AddTenancy(builder.Configuration);
}
```

### Tenant Resolution Flow

1. Check `x-tenant-id` header
2. Parse `{tenantId}` from route values
3. Extract from URL path (`/api/tenant/{id}/...`)
4. Parse from subdomain (`tenant-1.myapp.com`)
5. Fallback to JWT claim (`iss` or `sub`)
6. Validate resolved tenant matches JWT claim
7. Set `TenantContext.CurrentTenantId`

---

## Muonroi.Tenancy.SiteProfile

**NuGet:** `Muonroi.Tenancy.SiteProfile` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Multi-site variant support — allows one codebase to serve multiple deployment variants, each with different database schemas, business rules, and column mappings.

### Key Concepts

- **Site**: A deployment variant (e.g., "TCI", "Alpha", "Bravo"). Defines structure and behavior.
- **Tenant**: An organization/customer using the application. Can exist on one or multiple sites.
- **Relationship**: One site → multiple tenants (data isolation). One codebase → multiple sites (schema divergence).

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `ISiteProfile` | Interface | Contract for a site variant. Implement once per site. |
| `GenerateSiteProfileAttribute` | Attribute | Marks class for site profile code generation (`[GenerateSiteProfile(SiteIds.BRAVO, typeof(BravoDbContext))]`) |
| `ISiteProfileResolver` | Interface | Per-request resolver for current site (scoped lifetime) |
| `SiteProfileResolver` | Class | Default implementation holding resolved `ISiteProfile` |
| `SiteProfileScope` | Class | Override site resolution in tests/background jobs via `AsyncLocal<ISiteProfile>` |
| `SiteProfileExtensions` | Class | `AddSiteProfile<T>()`, `AddMultiSiteProfiles()`, `AddSiteResolvedService<T>()` |
| `SiteProfileRegistrationTracker` | Class | Validates all sites registered at startup |
| `SiteProfileStartupValidator` | Hosted Service | Runs validation + logs results |

### ISiteProfile Contract

```csharp
public interface ISiteProfile
{
    string SiteId { get; }                                    // Unique site identifier
    bool IsEnabled => true;                                   // Enable/disable at runtime
    void RegisterServices(IServiceCollection, IConfiguration); // Per-site DI registration
}
```

Implement once per site:

```csharp
[GenerateSiteProfile(SiteIds.BRAVO, typeof(BravoOrderContext))]
public class BravoSiteProfile : ISiteProfile
{
    public string SiteId => SiteIds.BRAVO;

    public void RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        // Register site-specific DbContext
        services.AddSiteDbContext<BravoOrderContext>();

        // Register site-specific repositories
        services.AddKeyedScoped<IOrderRepository, BravoOrderRepository>(SiteId);

        // Register site-specific services
        services.AddKeyedScoped<IOrderService, BravoOrderService>(SiteId);

        // Register custom column mappings for Dapper
        services.AddKeyedSingleton<ISiteColumnMap, BravoColumnMap>(SiteId);
    }
}
```

### Single-Site Deployment (1 binary = 1 site)

```csharp
// Program.cs
services.AddSiteProfile<BravoSiteProfile>(configuration);
```

### Multi-Site Deployment (1 binary = N sites)

```csharp
// Program.cs
services.AddMultiSiteProfiles(
    configuration,
    siteCodeAccessor: sp => sp.GetRequiredService<IHttpContextAccessor>()
        .HttpContext?.Request.Headers["X-Site-Code"].FirstOrDefault() ?? "default",
    assemblies: typeof(Program).Assembly);
```

The `siteCodeAccessor` delegate determines which site handles each request. Return value is matched against site IDs; missing sites fall back to `"default"` (unless `StrictMode = true`).

### Per-Request Service Resolution

Register a scoped factory that automatically resolves site-specific implementations:

```csharp
// Program.cs
services.AddSiteResolvedService<IOrderService>();  // Scoped factory

// In ISiteProfile.RegisterServices():
services.AddKeyedScoped<IOrderService, TciOrderService>(SiteIds.TCI);
services.AddKeyedScoped<IOrderService, BravoOrderService>(SiteIds.BRAVO);

// In your controller/service:
public class OrderController
{
    public OrderController(IOrderService orderService)
    {
        // orderService is automatically resolved to TciOrderService or BravoOrderService
        // based on the current request's site code
    }
}
```

### Testing & Background Jobs

Override site resolution:

```csharp
using (SiteProfileScope.SetCurrent(bravaSiteProfile))
{
    // All ISiteProfileResolver.Current calls return bravaSiteProfile
    var result = await _orderService.ListAsync();
}
```

Or:

```csharp
[Test]
public async Task TestBravoOrders()
{
    var bravo = new BravoSiteProfile();
    SiteProfileScope.SetCurrent(bravo);
    try
    {
        var orders = await _orderService.ListAsync();
        Assert.That(orders, Is.Not.Empty);
    }
    finally
    {
        SiteProfileScope.SetCurrent(null);
    }
}
```

---

## Muonroi.Tenancy.SiteProfile.Web

**NuGet:** `Muonroi.Tenancy.SiteProfile.Web` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Web/API infrastructure for per-site data access, configuration, and pipelines.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `SiteDbInfrastructureOptions` | Config | EF Core per-site setup: tenant resolver, connection string resolver, transforms |
| `SiteProfileDbContextExtensions` | Extensions | `AddSiteDbInfrastructure()`, `AddSiteDbContext<T>()`, `AddSiteMigrationRunner()`, `AddSiteConfiguration()` |
| `SiteDapperInfrastructureOptions` | Config | Dapper per-site setup: write/read connection strings, transforms |
| `SiteProfileDapperExtensions` | Extensions | `AddSiteDapperInfrastructure()`, `AddSiteSqlBuilder()` |
| `ISiteColumnMap` | Interface | Custom column name mappings (e.g., `OrderId` → `ORD_ID` in legacy schema) |
| `DefaultSiteColumnMap` | Class | Fallback: PascalCase → UPPER_SNAKE_CASE |
| `SiteSqlBuilder` | Class | Builds SQL with site-specific column maps |
| `MSiteRepository<TContext, T>` | Class | Site-aware repository base (EF Core write context resolved per-site) |
| `MSiteService<TContext, TEntity>` | Class | Site-aware service base (write context + read Dapper + repository) |
| `ISiteConfiguration` | Interface | Read site-specific config from `appsettings.json` |
| `SiteProfileStateMiddleware` | Middleware | Sets site profile state per request |
| `SiteProfileWebExtensions` | Extensions | `AddSiteProfileWeb()` registers middleware + hot-reload |
| `ISiteProfileChangeHandler` | Interface | Hot-reload: react to profile changes |
| `SiteMigrationRunner` | Hosted Service | Auto-discovers and runs EF migrations for all sites |
| `EfColumnSyncHostedService` | Hosted Service | Syncs column metadata from EF `IModel` at startup |

### Per-Site DbContext (EF Core)

**Problem:** Standard `AddDbContext<T>()` registers both generic `DbContextOptions<T>` AND non-generic `DbContextOptions`. Multiple sites cause Autofac "last wins" conflict on the non-generic registration.

**Solution:** Register only generic options, avoid non-generic conflict:

```csharp
// Program.cs
services.AddSiteDbInfrastructure(o =>
{
    // Delegate to your tenant/site resolution logic
    o.TenantId = sp => sp.GetRequiredService<IWorkContext>().TenantId;
    o.ConnectionString = sp => sp.GetRequiredService<IWorkContext>().ConnectionString;

    // Optional: decrypt connection string
    o.ConnectionStringTransform = cs => Cryptography.Decrypt(_secretKey, cs);

    // Optional: custom database provider config
    o.ConfigureDbContext = (builder, cs) => builder.UseSqlServer(cs);
});

// Register each site's DbContext
services.AddSiteDbContext<TciOrderContext>();
services.AddSiteDbContext<BravoOrderContext>();

// Auto-migrate on startup
services.AddSiteMigrationRunner(o => o.MaxParallelism = 4);
```

Inside `ISiteProfile.RegisterServices()`:

```csharp
public void RegisterServices(IServiceCollection services, IConfiguration configuration)
{
    // BravoOrderContext is scoped — resolved per-request with TenantId-specific connection string
    services.AddSiteDbContext<BravoOrderContext>();
}
```

### Per-Site Dapper (Raw SQL)

Mirrors EF Core pattern for raw SQL data access:

```csharp
// Program.cs
services.AddSiteDapperInfrastructure(o =>
{
    o.WriteConnectionString = sp => sp.GetRequiredService<IWorkContext>().ConnectionString;
    o.ReadConnectionString = sp => sp.GetRequiredService<IWorkContext>().ReadOnlyConnectionString;
    o.ConnectionStringTransform = cs => Cryptography.Decrypt(_secretKey, cs);
});

// Register site-specific Dapper implementations
services.AddSiteResolvedService<IDapper>();
services.AddSiteResolvedService<IDapperRead>();

// Optionally: column mapping for SQL builder
services.AddSiteSqlBuilder();
```

Inside `ISiteProfile.RegisterServices()`:

```csharp
public void RegisterServices(IServiceCollection services, IConfiguration configuration)
{
    services.AddKeyedScoped<IDapper, BravoDapperImpl>(SiteId);
    services.AddKeyedScoped<IDapperRead, BravoDapperReadImpl>(SiteId);

    // Custom column mapping: BravoDB uses different naming
    services.AddKeyedSingleton<ISiteColumnMap, BravoColumnMap>(SiteId);
}
```

### Site-Aware Repositories

```csharp
public class OrderRepository : MSiteRepository<BravoOrderContext, Order>
{
    public OrderRepository(
        BravoOrderContext dbContext,
        ISiteProfileResolver siteResolver,
        IAuthenticateInfoContext authContext,
        ILicenseGuard licenseGuard,
        IMDateTimeService dateTimeService)
        : base(dbContext, siteResolver, authContext, licenseGuard, dateTimeService)
    {
    }

    public async Task<Order?> FindByCodeAsync(string code)
    {
        return await SiteContext.Orders
            .FirstOrDefaultAsync(o => o.Code == code);
    }
}
```

**Key property:** `SiteContext` — type-safe, per-site DbContext.

### Site-Aware Services

```csharp
public class OrderService : MSiteService<BravoOrderContext, Order>
{
    public OrderService(
        BravoOrderContext writeContext,
        IMSiteRepository<BravoOrderContext, Order> repository,
        IDapper readContext,
        ISiteProfileResolver siteResolver)
        : base(writeContext, repository, readContext, siteResolver)
    {
    }

    protected override Order MapCreate(Order entity)
    {
        entity.SiteId = SiteResolver.Current.SiteId;
        return entity;
    }

    public async Task<Order> CreateAsync(Order entity)
    {
        return await base.CreateAsync(entity);  // Calls MapCreate, saves, commits
    }
}
```

**Key properties:**
- `WriteContext` — EF Core DbContext for write operations
- `ReadContext` — Dapper for raw SQL reads
- `SiteResolver` — Current site profile
- `Repository` — Site-aware CRUD + transaction management

### Per-Site Configuration

Read site-specific settings from `appsettings.json`:

```json
{
  "Sites": {
    "bravo": {
      "MaxOrders": 1000,
      "EnablePricing": true,
      "ApiUrl": "https://bravo-api.internal"
    },
    "tci": {
      "MaxOrders": 500,
      "EnablePricing": false
    }
  }
}
```

```csharp
// Program.cs
services.AddSiteConfiguration();  // Scoped ISiteConfiguration

// In your service:
public class OrderService
{
    private readonly ISiteConfiguration _siteConfig;

    public OrderService(ISiteConfiguration siteConfig)
    {
        _siteConfig = siteConfig;
    }

    public async Task<List<Order>> ListAsync()
    {
        var maxOrders = _siteConfig.GetValue<int>("MaxOrders", 1000);
        // Use site-specific setting
    }
}
```

### Column Mapping (Dapper)

Map C# property names to database column names per site:

```csharp
public class BravoColumnMap : ISiteColumnMap
{
    public string GetColumnName(string propertyName)
    {
        return propertyName switch
        {
            nameof(Order.OrderId) => "ORD_ID",
            nameof(Order.CreatedAt) => "CRT_DT",
            _ => propertyName  // Default: use property name as-is
        };
    }
}
```

Register:

```csharp
services.AddKeyedSingleton<ISiteColumnMap, BravoColumnMap>(SiteIds.BRAVO);
```

Used by `SiteSqlBuilder`:

```csharp
var sqlBuilder = sp.GetRequiredService<SiteSqlBuilder>();
string sql = sqlBuilder.BuildSelectQuery<Order>("WHERE CreatedAt > @date");
// Generates: SELECT ... FROM Orders WHERE CRT_DT > @date (via Bravo mapping)
```

### Behaviors & Hooks

Register per-site behaviors for caching, auditing, quota, observability:

```csharp
services.AddScoped<ISiteStepHook, SiteAuditBehavior>();
services.AddScoped<ISiteStepHook, SiteCachingBehavior>();
services.AddScoped<ISiteStepHook, SiteQuotaBehavior>();
services.AddScoped<ISiteStepHook, SiteObservabilityBehavior>();
```

Pipeline execution:

```csharp
// In MSiteService or custom handlers
var pipeline = sp.GetRequiredService<MSitePipeline>();
await pipeline.ExecuteAsync(async () =>
{
    // Your business logic here — behaviors wrap automatically
    return await repository.CreateAsync(entity);
});
```

---

## Muonroi.Tenancy.SiteProfile.Grpc

**NuGet:** `Muonroi.Tenancy.SiteProfile.Grpc` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

gRPC-specific dispatchers, interceptors, and service factories for site-aware microservices.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `ISiteGrpcClientFactory` | Interface | Factory for site-specific gRPC clients |
| `SiteGrpcClientFactory` | Class | Default implementation with caching |
| `SiteCodeGrpcInterceptor` | Interceptor | Propagates site code in gRPC metadata |
| `SiteCodeHolder` | Class | Ambient site code storage (async-safe) |
| `SiteGrpcDispatchHelper` | Helper | Routes gRPC calls to correct site handler |
| `GenerateSiteGrpcFacadeAttribute` | Attribute | Code generation for site facades |
| `SiteGrpcServiceAttribute` | Attribute | Marks gRPC service for site dispatch |
| `SiteGrpcExtensions` | Extensions | `AddSiteGrpc()`, `AddSiteGrpcClient<T>()` |

### Setup

```csharp
// Program.cs
services.AddSiteGrpc(o =>
{
    o.ClientFactory = sp => new SiteGrpcClientFactory(sp);
});

// Register per-site client factories
services.AddSiteGrpcClient<Catalog.CatalogService.CatalogServiceClient>();
```

### Propagating Site Code in gRPC

The `SiteCodeGrpcInterceptor` automatically adds site code to outgoing gRPC metadata:

```csharp
// Outgoing call (from service A to service B)
var channel = GrpcChannel.ForAddress("https://service-b.internal");
var client = new ServiceB.ServiceBClient(
    channel.Intercept(new SiteCodeGrpcInterceptor(siteCodeHolder)));

var response = await client.DoWorkAsync(new Request { ... });
```

Receiving side reads the site code from metadata:

```csharp
[SiteGrpcService(typeof(ServiceB.ServiceBBase))]
public class ServiceBImpl : ServiceB.ServiceBBase
{
    private readonly ISiteProfileResolver _siteResolver;

    public override async Task<Response> DoWork(Request request, ServerCallContext context)
    {
        // Site code extracted from metadata automatically
        var site = _siteResolver.Current;

        // Use site-specific DbContext, services, etc.
        return await base.DoWork(request, context);
    }
}
```

---

## Muonroi.Tenancy.SiteProfile.SourceGenerators

**NuGet:** `Muonroi.Tenancy.SiteProfile.SourceGenerators` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Roslyn code generators for automatic site profile registration, gRPC facades, and validation.

### Generated Code

Annotate your site profile class:

```csharp
[GenerateSiteProfile(SiteIds.BRAVO, typeof(BravoOrderContext))]
public class BravoSiteProfile : ISiteProfile
{
    public string SiteId => SiteIds.BRAVO;
    public void RegisterServices(IServiceCollection services, IConfiguration config) { }
}
```

Generators create:

1. **SiteProfileRegistrationGenerator**
   - `MGeneratedSiteProfilesExtensions.g.cs`
   - Contains `AddGeneratedSiteProfiles()` method for multi-site registration

2. **SiteGrpcFacadeGenerator**
   - `BravoServiceBFacade.g.cs`
   - Auto-wraps gRPC services with site dispatch

3. **SiteProfileScaffoldingGenerator**
   - `BravoOrderContext.g.cs` (if needed)
   - Partial DbContext with site-specific configuration

### Analyzers

The generators also provide Roslyn analyzers:

| Analyzer | Rule | Check |
|----------|------|-------|
| `SiteIdLiteralAnalyzer` | SITE001 | SiteId must be string literal, not variable |
| `AssemblyIsolationHintAnalyzer` | SITE002 | Site assemblies should not cross-reference |
| `ContractComplianceAnalyzer` | SITE003 | All sites must implement same contracts |
| `ColumnMapDriftAnalyzer` | SITE004 | Column mappings must be consistent |
| `InheritanceHintAnalyzer` | SITE005 | Inheritance patterns must match |
| `MissingSiteGrpcServiceAttributeAnalyzer` | SITE006 | gRPC service missing `[SiteGrpcService]` |
| `DuplicateProtoMessageAnalyzer` | SITE007 | Duplicate proto messages across sites |
| `SiteGrpcServiceRegistryAnalyzer` | SITE008 | gRPC service not registered |

---

## Muonroi.Quota.Abstractions

**NuGet:** `Muonroi.Quota.Abstractions` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Tenant quota tracking and enforcement. Limits resources per tenant (rules, executions, API calls, storage, etc.).

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `ITenantQuotaTracker` | Interface | Check quota availability and increment usage |
| `ITenantQuotaStore` | Interface | Persist quota limits and usage |
| `TenantQuota` | Model | Quota limits for a tenant |
| `TenantQuotaPresets` | Static | Free, Starter, Professional, Enterprise presets |
| `QuotaUsage` | Model | Current usage statistics |
| `QuotaType` | Enum | Rules, Executions, DecisionTables, Storage, Messages, Connectors, etc. |
| `InMemoryTenantQuotaStore` | Class | Volatile in-memory storage (testing) |
| `InMemoryTenantQuotaTracker` | Class | Volatile in-memory tracker |
| `TenantQuotaServiceCollectionExtensions` | Extensions | `AddTenantQuota()` registration |

### Quota Types

```csharp
public enum QuotaType
{
    RulesPerTenant,
    RuleExecutionsPerDay,
    ConcurrentExecutions,
    DecisionTablesPerTenant,
    JsonWorkflows,
    StorageMB,
    ApiRequestsPerMinute,
    RuleEvaluationsPerSecond,
    WorkflowExecutionsPerHour,
    RuleComplexity,
    WorkflowSizeKB,
    ExecutionTimeMs,
    MessagesPerDay,
    MessagesPerMinute,
    TotalConnectors,
    ConnectorExecutionsPerDay
}
```

### Quota Limits by Tier

```csharp
var freeQuota = TenantQuotaPresets.Free;
// MaxRulesPerTenant: 10
// MaxRuleExecutionsPerDay: 1000
// MaxApiRequestsPerMinute: 20

var enterpriseQuota = TenantQuotaPresets.Enterprise;
// MaxRulesPerTenant: int.MaxValue
// MaxRuleExecutionsPerDay: int.MaxValue
// MaxApiRequestsPerMinute: int.MaxValue
```

### DI Registration

```csharp
// Use in-memory tracker (dev/testing)
services.AddTenantQuota();

// Or register custom persistent store
services.AddScoped<ITenantQuotaStore, PostgresQuotaStore>();
services.AddScoped<ITenantQuotaTracker>(sp =>
    new TenantQuotaTracker(sp.GetRequiredService<ITenantQuotaStore>()));
```

### Usage Example

```csharp
public class RuleExecutor
{
    private readonly ITenantQuotaTracker _quota;

    public RuleExecutor(ITenantQuotaTracker quota)
    {
        _quota = quota;
    }

    public async Task<RuleResult> ExecuteAsync(string tenantId, IRule rule, CancellationToken ct)
    {
        // Check if tenant has execution quota remaining
        bool hasQuota = await _quota.CheckQuotaAsync(
            tenantId,
            QuotaType.RuleExecutionsPerDay,
            amount: 1,
            ct: ct);

        if (!hasQuota)
        {
            throw new QuotaExceededException(
                $"Tenant '{tenantId}' exceeded daily rule execution quota");
        }

        // Execute rule
        var result = await rule.ExecuteAsync(...);

        // Increment usage
        await _quota.IncrementUsageAsync(
            tenantId,
            QuotaType.RuleExecutionsPerDay,
            amount: 1,
            ct: ct);

        return result;
    }
}
```

### Quota Integration with Rule Engine

The rule engine automatically checks quota before execution (if quota tracker is registered):

```csharp
// In RuleOrchestrator.ExecuteAsync(...)
if (_quotaTracker is not null)
{
    bool hasQuota = await _quotaTracker.CheckQuotaAsync(
        tenantId,
        QuotaType.RuleExecutionsPerDay,
        ct: ct);

    if (!hasQuota)
        return OrchestratorResult.Failure("Quota exceeded");
}

// Execute rules...
await _quotaTracker?.IncrementUsageAsync(tenantId, QuotaType.RuleExecutionsPerDay, ct: ct)!;
```

---

## Complete Setup Example

### Program.cs (Multi-Site, Multi-Tenant)

```csharp
var builder = WebApplication.CreateBuilder(args);

// ===== Core Tenancy (HttpContext extraction + AsyncLocal storage) =====
builder.Services.AddTenancy(builder.Configuration);

// ===== Site Profile Infrastructure =====
builder.Services.AddMultiSiteProfiles(
    builder.Configuration,
    siteCodeAccessor: sp =>
    {
        var httpContext = sp.GetRequiredService<IHttpContextAccessor>()?.HttpContext;
        return httpContext?.Request.Headers["X-Site-Code"].FirstOrDefault() ?? "default";
    },
    assemblies: typeof(Program).Assembly);

// ===== Per-Site DbContext =====
builder.Services.AddSiteDbInfrastructure(o =>
{
    o.TenantId = sp => sp.GetRequiredService<ISystemExecutionContextAccessor>()
        .Get().TenantId;
    o.ConnectionString = sp =>
    {
        var factory = sp.GetRequiredService<ITenantConnectionStringFactory>();
        var tenantId = sp.GetRequiredService<ITenantContext>().TenantId;
        return factory.GetConnectionString(tenantId);
    };
    o.ConnectionStringTransform = cs => Cryptography.Decrypt(_secretKey, cs);
    o.ConfigureDbContext = (b, cs) => b.UseSqlServer(cs);
});

builder.Services.AddSiteDbContext<DefaultOrderContext>();
builder.Services.AddSiteDbContext<BravoOrderContext>();
builder.Services.AddSiteMigrationRunner();

// ===== Per-Site Dapper =====
builder.Services.AddSiteDapperInfrastructure(o =>
{
    o.WriteConnectionString = sp =>
    {
        var factory = sp.GetRequiredService<ITenantConnectionStringFactory>();
        var tenantId = sp.GetRequiredService<ITenantContext>().TenantId;
        return factory.GetConnectionString(tenantId);
    };
    o.ReadConnectionString = sp =>
    {
        // Optional: separate read replica
        return sp.GetRequiredService<IReadOnlyConnectionProvider>()
            .GetReadConnectionString();
    };
});

builder.Services.AddSiteResolvedService<IDapper>();
builder.Services.AddSiteResolvedService<IDapperRead>();
builder.Services.AddSiteSqlBuilder();

// ===== Quota Tracking =====
builder.Services.AddTenantQuota();

// ===== gRPC =====
builder.Services.AddSiteGrpc();

// ===== Site Profiles (source-generated or manual) =====
builder.Services.AddGeneratedSiteProfiles(builder.Configuration);

var app = builder.Build();

// ===== Middleware =====
app.UseMiddleware<TenantResolutionMiddleware>();
app.UseMiddleware<SiteProfileStateMiddleware>();

app.Run();
```

### Site Profile Implementation

```csharp
[GenerateSiteProfile(SiteIds.BRAVO, typeof(BravoOrderContext))]
public class BravoSiteProfile : ISiteProfile
{
    public string SiteId => SiteIds.BRAVO;

    public void RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        // DbContext (already registered globally, but can customize here)
        services.AddSiteDbContext<BravoOrderContext>();

        // Repositories
        services.AddKeyedScoped<IOrderRepository, BravoOrderRepository>(SiteId);

        // Services
        services.AddKeyedScoped<IOrderService, BravoOrderService>(SiteId);

        // Dapper
        services.AddKeyedScoped<IDapper, BravoDapperImpl>(SiteId);
        services.AddKeyedScoped<IDapperRead, BravoDapperReadImpl>(SiteId);

        // Column mappings
        services.AddKeyedSingleton<ISiteColumnMap, BravoColumnMap>(SiteId);

        // gRPC services
        services.AddKeyedScoped<Catalog.CatalogService.CatalogServiceClient,
            BravoCatalogServiceClient>(SiteId);

        // Custom behavior
        services.AddKeyedScoped<ISiteStepHook, BravoAuditBehavior>(SiteId);
    }
}
```

### Service Usage

```csharp
[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly IOrderService _orderService;
    private readonly ITenantContext _tenantContext;
    private readonly ISiteProfileResolver _siteResolver;
    private readonly ITenantQuotaTracker _quotaTracker;

    public OrdersController(
        IOrderService orderService,
        ITenantContext tenantContext,
        ISiteProfileResolver siteResolver,
        ITenantQuotaTracker quotaTracker)
    {
        _orderService = orderService;
        _tenantContext = tenantContext;
        _siteResolver = siteResolver;
        _quotaTracker = quotaTracker;
    }

    [HttpGet]
    public async Task<IActionResult> ListAsync()
    {
        // Tenant context resolved automatically from HTTP request
        var tenantId = _tenantContext.TenantId;

        // Site profile resolved automatically based on X-Site-Code header
        var site = _siteResolver.Current.SiteId;

        // Check quota
        bool hasQuota = await _quotaTracker.CheckQuotaAsync(
            tenantId,
            QuotaType.ApiRequestsPerMinute);

        if (!hasQuota)
            return StatusCode(429, "Rate limit exceeded");

        // Execute — site-specific service is injected
        var orders = await _orderService.ListAsync();

        await _quotaTracker.IncrementUsageAsync(
            tenantId,
            QuotaType.ApiRequestsPerMinute);

        return Ok(orders);
    }
}
```

---

## Patterns & Best Practices

### Fail-Closed Security

Always validate tenant context:

```csharp
// ✓ Good: Explicit validation
if (TenantContext.CurrentTenantId is null)
{
    throw new UnauthorizedException("Tenant context required");
}

// ✗ Bad: Silent default
var tenantId = TenantContext.CurrentTenantId ?? "default-tenant";
```

### Cross-Tenant Operations

When admin needs cross-tenant access (rare):

```csharp
using (TenantContext.AllowCrossTenantAccess = true)
{
    // Global query filters temporarily disabled
    var allTenants = await _dbContext.Tenants.ToListAsync();
}
```

### Schema Divergence in Dapper

Use `SiteSqlBuilder` to handle column name differences:

```csharp
var sqlBuilder = sp.GetRequiredService<SiteSqlBuilder>();

// Builds SQL with site-specific column mappings
string sql = sqlBuilder.BuildSelectQuery<Order>(
    "WHERE CreatedAt > @date AND Status = @status");

// Executes: SELECT ... WHERE CRT_DT > @date AND STS = @status (for Bravo site)
var orders = await readContext.QueryAsync<Order>(sql, new { date, status });
```

### Testing with Site Scope

```csharp
[Test]
public async Task OrderService_CreateAsync_SetsSiteCode()
{
    var bravo = new BravoSiteProfile();
    using (SiteProfileScope.SetCurrent(bravo))
    {
        var order = new Order { Name = "Test" };
        var created = await _orderService.CreateAsync(order);

        Assert.That(created.SiteCode, Is.EqualTo(SiteIds.BRAVO));
    }
}
```

### Background Jobs (Quota Reset)

```csharp
[BackgroundJob("DailyQuotaReset")]
public class DailyQuotaResetJob : IBackgroundJob
{
    private readonly ITenantQuotaTracker _quotaTracker;

    public async Task ExecuteAsync(IJobExecutionContext context)
    {
        // No HTTP context here — set via AsyncLocal
        TenantContext.CurrentTenantId = "SYSTEM";

        await _quotaTracker.ResetDailyQuotasAsync(context.CancellationToken);
    }
}
```

---

## Related Documentation

- [Multi-Tenant Guide](../../03-guides/multi-tenancy/multi-tenant-guide.md) — Tenant resolution and context patterns
- [Site Profile Overview](../../03-guides/site-profile/site-profile-overview.md) — Site profile concepts and setup
- [Adding a New Site](../../03-guides/site-profile/adding-a-new-site.md) — Step-by-step site creation
