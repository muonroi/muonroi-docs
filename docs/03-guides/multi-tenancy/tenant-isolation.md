---
title: Tenant Isolation
sidebar_position: 2
---

## Overview

Tenant isolation ensures that data and operations from one tenant cannot access, modify, or influence another tenant's resources. Muonroi provides **three isolation strategies** — from lightweight shared-schema filtering to complete database separation — allowing you to choose the right balance between operational simplicity and security/compliance requirements.

All isolation strategies are built on the same **AsyncLocal context propagation** foundation, so switching between them requires only configuration changes, not code rewrites.

## Data Isolation Strategies

The following table summarizes the three supported strategies:

| Strategy | Database Layout | Isolation Level | Operational Cost | Use Case |
|----------|-----------------|-----------------|-----------------|----------|
| **SharedSchema** (default) | Single DB, single schema | Row-level (EF query filters) | Minimal | SaaS, low-compliance tenants |
| **SeparateSchema** | Single DB, tenant-per-schema | Schema-level (SearchPath) | Low | Moderate compliance (GDPR) |
| **SeparateDatabase** | Database per tenant | Database-level (separate instance) | High | High-compliance (HIPAA, finance) |

### 1. SharedSchema (Default)

All tenants share the same database and schema. Isolation is enforced by **Entity Framework Core query filters** applied automatically to `ITenantScoped` entities.

**How it works:**
- Every entity implementing `ITenantScoped` gets an automatic filter: `e.TenantId == TenantContext.CurrentTenantId || TenantContext.CurrentTenantId == null`
- When a request arrives, `TenantResolutionMiddleware` sets `TenantContext.CurrentTenantId` for the async flow
- All queries automatically filter results by tenant ID
- System operations (admin, background jobs) set `CurrentTenantId = null` to access all tenants

**Code Example:**

```csharp
public class Order : MEntity, ITenantScoped
{
    public string TenantId { get; set; }
    public string OrderNumber { get; set; }
    public decimal Amount { get; set; }
}

// In your DbContext OnModelCreating:
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);

    // MDbContext automatically applies tenant filter for ITenantScoped entities
    // Equivalent filter generated:
    // modelBuilder.Entity<Order>()
    //     .HasQueryFilter(e => e.TenantId == TenantContext.CurrentTenantId
    //                        || TenantContext.CurrentTenantId == null);
}

// Usage in a controller:
public class OrdersController(IRepository<Order> repo)
{
    [HttpGet]
    public async Task<List<Order>> GetOrders()
    {
        // Query automatically filtered by current tenant
        return await repo.GetQueryable().ToListAsync();
    }
}
```

**Advantages:**
- Minimal infrastructure (one database)
- Simple operational model
- Easy to develop and test

**Disadvantages:**
- Requires trust in EF filtering logic
- Schema changes affect all tenants simultaneously
- Requires careful NULL handling in filters

---

### 2. SeparateSchema (PostgreSQL)

Each tenant gets its own PostgreSQL schema within the same database. Isolation is enforced at the schema level using PostgreSQL `search_path`.

**How it works:**
- Each tenant has schema: `schema_tenant_abc`, `schema_tenant_xyz`, etc.
- Connection string unchanged; `TenantSchemaSelector` dynamically sets `SET search_path` at connection time
- Queries reference unqualified table names (e.g., `SELECT * FROM orders`) and PostgreSQL routes to the correct schema
- System operations can use unqualified schemas or explicitly reference `public.*`

**Configuration:**

```json
{
  "MultiTenantOptions": {
    "Enabled": true,
    "IsolationMode": "SeparateSchema"
  },
  "TenantConnectionStrings": {
    "PostgreSqlConnectionString": "Host=localhost;Database=muonroi_shared;User=muonroi;Password=secret;",
    "SchemaMappings": {
      "tenant_abc": "schema_abc",
      "tenant_xyz": "schema_xyz"
    }
  }
}
```

**Schema Creation Script:**

```sql
-- Run as superuser or schema-creation role
CREATE SCHEMA schema_abc AUTHORIZATION muonroi;
CREATE SCHEMA schema_xyz AUTHORIZATION muonroi;

-- Copy base tables and indexes
CREATE TABLE schema_abc.orders AS TABLE public.orders WITH NO DATA;
CREATE TABLE schema_xyz.orders AS TABLE public.orders WITH NO DATA;
```

**Code Integration:**

```csharp
// In Program.cs
services.AddDbContextConfigure<MyDbContext, PermissionEnum>(
    configuration, isSecretDefault: false
);

// MDbContextConfiguration detects IsolationMode and applies TenantSchemaSelector
// TenantSchemaSelector.ApplyToConnectionString() sets search_path at runtime
```

**Advantages:**
- True schema isolation (DDL, indexes, statistics per tenant)
- Simpler data migration (schema-level scripts)
- Compliance-friendly (schema audit trail, per-schema backups)
- One database connection pool

**Disadvantages:**
- PostgreSQL-specific (not portable to SQL Server, MySQL)
- Requires schema management tooling
- Slightly higher memory overhead (multiple schema caches)

---

### 3. SeparateDatabase (Full Isolation)

Each tenant has its own dedicated database instance. Maximum isolation and compliance, but highest operational cost.

**How it works:**
- Tenant → connection string mapping stored in a shared `TenantRegistry` database
- On request, `TenantResolutionMiddleware` resolves tenant ID, looks up connection string, and configures DbContext dynamically
- Each tenant's DbContext instance connects to their own database
- No row-level filtering needed; security is database-level

**Configuration:**

```json
{
  "MultiTenantOptions": {
    "Enabled": true,
    "IsolationMode": "SeparateDatabase"
  },
  "TenantRegistry": {
    "ConnectionString": "Host=registry.example.com;Database=tenant_registry;User=admin;",
    "RefreshIntervalMinutes": 60
  }
}
```

**Tenant Registry Schema:**

```sql
CREATE TABLE public.tenant_connections (
    TenantId VARCHAR(255) PRIMARY KEY,
    DatabaseName VARCHAR(255) NOT NULL,
    ConnectionString VARCHAR(1024) NOT NULL,
    CreatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    IsActive BOOLEAN NOT NULL DEFAULT TRUE
);

-- Example:
INSERT INTO public.tenant_connections VALUES
    ('tenant_abc', 'muonroi_abc', 'Host=db.example.com;Database=muonroi_abc;...', NOW(), TRUE),
    ('tenant_xyz', 'muonroi_xyz', 'Host=db.example.com;Database=muonroi_xyz;...', NOW(), TRUE);
```

**Code Integration:**

```csharp
// In Program.cs
services.AddSingleton<ITenantConnectionResolver, TenantConnectionResolver>();

// Inject into DbContext configuration
public class DbContextFactory(ITenantConnectionResolver resolver)
{
    public async Task<MyDbContext> CreateAsync(string tenantId)
    {
        string connectionString = await resolver.GetConnectionStringAsync(tenantId);
        var optionsBuilder = new DbContextOptionsBuilder<MyDbContext>();
        optionsBuilder.UseNpgsql(connectionString);
        return new MyDbContext(optionsBuilder.Options, ...);
    }
}
```

**Advantages:**
- Absolute data isolation (regulatory requirement)
- Independent scaling per tenant
- Zero cross-tenant query risk
- Audit trail naturally isolated

**Disadvantages:**
- N+1 database instances to manage
- High infrastructure cost
- Complex backup/restore procedures
- Connection pool complexity

---

## Context Propagation

### TenantContext & AsyncLocal

Tenant ID flows through the request/execution pipeline via **AsyncLocal**, a CLR feature that maintains context per async task tree:

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

**Key behaviors:**
- No parameter passing needed; `TenantContext.CurrentTenantId` accessible everywhere
- Each async task gets its own value (safe in concurrent requests)
- Child tasks inherit parent's value automatically
- Must be cleared on task completion (middleware handles this)

### TenantResolutionMiddleware

Runs early in the request pipeline to resolve and validate tenant ID:

```csharp
public class TenantContextMiddleware : IMiddleware
{
    public async Task Invoke(HttpContext context)
    {
        // Resolution order:
        // 1. Header: x-tenant-id
        // 2. Route parameter: {tenantId}
        // 3. Subdomain: tenant.example.com

        string? tenantId = await resolver.ResolveTenantIdAsync(context);
        string? claimTenantId = context.User.FindFirst(ClaimConstants.TenantId)?.Value;

        // Validation: header + JWT claim must match (401 if not)
        if (!TenantSecurityValidator.TryValidate(tenantId, claimTenantId, ...))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        // Set context for this request
        try
        {
            TenantContext.CurrentTenantId = tenantId;
            await next(context);
        }
        finally
        {
            TenantContext.CurrentTenantId = null; // Clear after response
        }
    }
}
```

**Registration:**

```csharp
// In Program.cs
app.UseMiddleware<TenantContextMiddleware>();
```

### ContextMirrorScope (Temporary Tenant Switch)

For admin operations or background jobs that need to work on behalf of a different tenant:

```csharp
public sealed class ContextMirrorScope : IDisposable
{
    private readonly string? _previousTenantId = TenantContext.CurrentTenantId;

    public static ContextMirrorScope Apply(ISystemExecutionContext context)
    {
        return new ContextMirrorScope(context);
    }

    private ContextMirrorScope(ISystemExecutionContext context)
    {
        // Push new context
        TenantContext.CurrentTenantId = context.TenantId;
        UserContext.CurrentUserGuid = context.UserId;
        UserContext.CurrentUsername = context.Username;
    }

    public void Dispose()
    {
        // Pop old context
        TenantContext.CurrentTenantId = _previousTenantId;
        UserContext.CurrentUserGuid = _previousUserId;
        UserContext.CurrentUsername = _previousUsername;
    }
}

// Usage:
public class AdminService(IRepository<Order> repo)
{
    public async Task DeleteAllOrdersForTenantAsync(string tenantId)
    {
        using (ContextMirrorScope.Apply(new SystemExecutionContext
        {
            TenantId = tenantId,
            UserId = Guid.NewGuid(),
            Username = "system"
        }))
        {
            // This executes with TenantContext.CurrentTenantId = tenantId
            await repo.DeleteAsync(x => true);
        }
        // Context restored to original after Dispose()
    }
}
```

---

## EF Query Filters (SharedSchema)

### Automatic Filter Application

`MDbContext.OnModelCreating` scans all entities and applies tenant filters to `ITenantScoped` types:

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);

    foreach (var entityType in modelBuilder.Model.GetEntityTypes())
    {
        if (typeof(ITenantScoped).IsAssignableFrom(entityType.ClrType))
        {
            var tenantProp = entityType.ClrType.GetProperty(nameof(ITenantScoped.TenantId));
            if (tenantProp?.PropertyType == typeof(string))
            {
                // Build: e => e.TenantId == TenantContext.CurrentTenantId
                //           || TenantContext.CurrentTenantId == null
                var tenantFilter = BuildTenantFilter(entityType.ClrType, tenantProp);
                modelBuilder.Entity(entityType.ClrType).HasQueryFilter(tenantFilter);

                // Add index for query performance
                modelBuilder.Entity(entityType.ClrType).HasIndex(nameof(ITenantScoped.TenantId));
            }
        }
    }
}

private static LambdaExpression BuildTenantFilter(Type entityType, PropertyInfo tenantProp)
{
    var parameter = Expression.Parameter(entityType, "e");
    var propertyAccess = Expression.Property(parameter, tenantProp);
    var currentTenant = Expression.Property(null, typeof(TenantContext),
        nameof(TenantContext.CurrentTenantId));

    // e.TenantId == CurrentTenantId || CurrentTenantId == null
    var isCurrentNull = Expression.Equal(currentTenant, Expression.Constant(null));
    var isMatch = Expression.Equal(propertyAccess, currentTenant);
    var body = Expression.OrElse(isMatch, isCurrentNull);

    return Expression.Lambda(body, parameter);
}
```

### The NULL Check

The filter includes `|| TenantContext.CurrentTenantId == null` to allow system operations (background jobs, migrations, admin queries) to access all tenants without modification:

```csharp
// In a background job:
TenantContext.CurrentTenantId = null; // Switch to "all tenants" mode
var allOrders = await dbContext.Orders.ToListAsync();
// Returns all orders from all tenants
```

### Best Practices

1. **Always implement ITenantScoped** for multi-tenant entities
2. **Index TenantId** automatically done by MDbContext
3. **Include TenantId in composite keys** for uniqueness guarantees
4. **Test with explicit tenants** verify filter works correctly
5. **Do not bypass filters** avoid `.IgnoreQueryFilters()` in production

---

## Realtime Isolation (SignalR)

`RuleSetChangeHub` manages multi-tenant SignalR connections with group-based isolation:

```csharp
public class RuleSetChangeHub : Hub
{
    public async Task Subscribe(string rulesetId)
    {
        string tenantId = TenantContext.CurrentTenantId ?? "default";

        // Only allow subscribe to own tenant's group
        string groupName = $"tenant:{tenantId}:ruleset:{rulesetId}";
        await Groups.AddToGroupAsync(Context.ConnectionId, groupName);
    }

    public async Task PublishChange(RuleSetChangeEvent evt)
    {
        string tenantId = TenantContext.CurrentTenantId;
        string groupName = $"tenant:{tenantId}:ruleset:{evt.RuleSetId}";

        // Only tenants in this group receive the notification
        await Clients.Group(groupName).SendAsync("OnRuleSetChanged", evt);
    }
}
```

**Isolation guarantees:**
- Clients can only subscribe to groups for their own tenant
- Broadcasts are scoped to tenant-specific groups
- Admin/approver roles (checked separately) can subscribe to cross-tenant groups

---

## Migration Paths

### SharedSchema → SeparateSchema

1. **Create new schemas** for each tenant:
   ```sql
   CREATE SCHEMA schema_abc AUTHORIZATION muonroi;
   ```

2. **Copy schema structure** (tables, indexes, constraints):
   ```sql
   CREATE TABLE schema_abc.orders AS TABLE public.orders WITH NO DATA;
   -- Repeat for all tables
   ```

3. **Migrate data** by tenant:
   ```sql
   INSERT INTO schema_abc.orders
   SELECT * FROM public.orders WHERE tenant_id = 'tenant_abc';
   ```

4. **Update configuration** to use `IsolationMode: SeparateSchema`

5. **Remove TenantId filters** from queries (optional; filters still work)

### SeparateSchema → SeparateDatabase

Similar process but with full database provisioning:

1. **Provision new databases** for each tenant
2. **Restore schema** from template database
3. **Migrate data** using remote queries or ETL
4. **Update TenantRegistry** connection strings
5. **Test** cross-tenant isolation

---

## Troubleshooting

**Problem:** Query returns data from other tenants

**Solution:** Check `TenantContext.CurrentTenantId` is set before DbContext access:
```csharp
var tenantId = TenantContext.CurrentTenantId;
if (string.IsNullOrEmpty(tenantId))
    throw new InvalidOperationException("Tenant context not initialized");
```

**Problem:** Background job can't access all tenants

**Solution:** Set `TenantContext.CurrentTenantId = null`:
```csharp
public class BackgroundJobService
{
    public async Task ProcessAllTenantsAsync()
    {
        try
        {
            TenantContext.CurrentTenantId = null; // Access all
            await dbContext.Orders.UpdateAsync(...);
        }
        finally
        {
            TenantContext.CurrentTenantId = null; // Clean up
        }
    }
}
```

**Problem:** Filter doesn't work in LINQ-to-Objects

**Solution:** Filters only apply to database queries; in-memory `.AsEnumerable()` queries bypass them:
```csharp
// FILTERED (query executed in DB)
var orders = await dbContext.Orders.ToListAsync();

// NOT FILTERED (loaded in memory)
var orders = dbContext.Orders.AsEnumerable().Where(...).ToList();

// Always materialize with ToListAsync() before filtering
```

---

## See Also

- [Multi-Tenant Architecture Guide](../multi-tenant-guide.md)
- [EF Query Filters Reference](../ef-query-filters.md)
- [Quota & Rate Limiting API](../quota-api-reference.md)
- [License & Governance](../auth-governance.md)
