---
title: EF Filters & Multi-Tenant Data Isolation
sidebar_label: EF Filters
sidebar_position: 4
---

# EF Filters & Multi-Tenant Data Isolation

`MDbContext` applies multi-tenant and creator-aware query filters automatically to isolate tenant data at the database layer. This document explains the three data isolation strategies and how EF filters fit into each.

## Three Data Isolation Strategies

Muonroi supports three database isolation patterns, each with different EF filter requirements:

### 1. SharedSchema (Single Database, Single Schema)

All tenants share the same database and schema. **EF query filters are the PRIMARY isolation mechanism**.

**How it works:**
- All tables have a `TenantId` column
- EF filters automatically restrict queries to the current tenant
- Every query includes `WHERE TenantId = {currentTenantId}`

**EF Filter Expression:**
```csharp
e => e.TenantId == TenantContext.CurrentTenantId || TenantContext.CurrentTenantId == null
```

**When to use:**
- Multi-tenant SaaS applications with many tenants
- Development/staging environments
- Lower infrastructure costs

**Security notes:**
- Filters are applied at EF level (in-process); network traffic is NOT restricted
- Always use raw SQL through `MRepository` or parameterized queries to avoid filter bypass
- Set `TenantContext.CurrentTenantId` at middleware layer before any data access

### 2. SeparateSchema (Single Database, Multiple Schemas)

Each tenant has its own schema within the same PostgreSQL database. EF filters are **optional but recommended** for defense-in-depth.

**How it works:**
- PostgreSQL `SET search_path TO schema_name` routes queries to the tenant schema
- EF filters provide a second layer of protection
- Connection string or middleware sets the schema before DbContext use

**EF Filter Expression (optional):**
```csharp
e => e.TenantId == TenantContext.CurrentTenantId || TenantContext.CurrentTenantId == null
```

**Example middleware setup:**
```csharp
app.UseMiddleware<TenantResolutionMiddleware>();

public class TenantResolutionMiddleware(RequestDelegate next, IDbContextFactory<MyDbContext> contextFactory)
{
    public async Task InvokeAsync(HttpContext context)
    {
        var tenantId = context.Request.Headers["x-tenant-id"].ToString();
        TenantContext.CurrentTenantId = tenantId;
        
        // Set PostgreSQL search_path (if using SeparateSchema)
        using var db = await contextFactory.CreateDbContextAsync();
        await db.Database.ExecuteSqlAsync($"SET search_path TO tenant_{tenantId}");
        
        await next(context);
    }
}
```

**When to use:**
- Large multi-tenant deployments
- Regulatory requirements for schema-level separation
- Need for tenant-specific backups/migrations

**Security notes:**
- Network traffic is NOT schema-isolated
- Combine with EF filters for defense-in-depth

### 3. SeparateDatabase (Multiple Databases)

Each tenant has a dedicated database and connection string. EF filters are **optional** (connection routing provides isolation).

**How it works:**
- Database routing service selects the tenant's connection string
- EF filters provide an additional safety layer
- Each database contains only one tenant's schema

**Example routing:**
```csharp
public class TenantConnectionProvider(IConfiguration config)
{
    public string GetConnectionString(string tenantId)
    {
        var tenantConnStr = config[$"ConnectionStrings:Tenant{tenantId}"]
            ?? throw new InvalidOperationException($"No connection string for tenant {tenantId}");
        return tenantConnStr;
    }
}

public class TenantDbContextFactory : IDbContextFactory<MyDbContext>
{
    public DbContext CreateDbContext()
    {
        var tenantId = TenantContext.CurrentTenantId 
            ?? throw new InvalidOperationException("TenantContext not set");
        var connStr = _connProvider.GetConnectionString(tenantId);
        var optionsBuilder = new DbContextOptionsBuilder<MyDbContext>()
            .UseNpgsql(connStr);
        return new MyDbContext(optionsBuilder.Options);
    }
}
```

**When to use:**
- Very large tenants (data volume > 100 GB)
- Strict data residency/sovereignty requirements
- Per-tenant performance tuning needed

**Security notes:**
- Connection string routing provides strong isolation
- EF filters still recommended for defense-in-depth
- Secrets management is critical (secure vault for connection strings)

---

## EF Query Filter Details

### Filter Expression

For entities implementing `ITenantScoped`, `MDbContext` builds a filter equivalent to:

```csharp
e => e.TenantId == TenantContext.CurrentTenantId || TenantContext.CurrentTenantId == null
```

**Breakdown:**
- `e.TenantId == TenantContext.CurrentTenantId` — restricts to current tenant
- `TenantContext.CurrentTenantId == null` — allows admin/system operations when tenant context not set

### Filter Registration in MDbContext

Filters are registered in `OnModelCreating`:

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);
    
    // Apply tenant filter to all ITenantScoped entities
    foreach (var entityType in modelBuilder.Model.GetEntityTypes())
    {
        if (typeof(ITenantScoped).IsAssignableFrom(entityType.ClrType))
        {
            var parameter = Expression.Parameter(entityType.ClrType, "e");
            var currentTenant = Expression.Property(
                Expression.Property(null, typeof(TenantContext), nameof(TenantContext.CurrentTenantId)),
                "TenantId"
            );
            var tenantIdProperty = Expression.Property(parameter, "TenantId");
            var tenantFilter = Expression.Lambda(
                Expression.OrElse(
                    Expression.Equal(tenantIdProperty, currentTenant),
                    Expression.Equal(currentTenant, Expression.Constant(null))
                ),
                parameter
            );
            
            modelBuilder.Entity(entityType.ClrType).HasQueryFilter(tenantFilter);
        }
    }
}
```

### Creator Filter (for MEntity)

`MEntity` types with `CreatorUserId` receive an additional filter:

```csharp
e => e.TenantId == TenantContext.CurrentTenantId || TenantContext.CurrentTenantId == null
```

This ensures users can only see entities created within their current tenant context.

---

## MRepository Example

Repositories that inherit `MRepository<T>` automatically inherit tenant filtering:

```csharp
public class OrderRepository : MRepository<Order, MyDbContext>
{
    public OrderRepository(MyDbContext context) : base(context) { }
    
    // Tenant filtering is automatic via MDbContext
    public async Task<List<Order>> GetOrdersAsync(int page = 1, int pageSize = 10)
    {
        // This query automatically includes: WHERE TenantId = {CurrentTenantId}
        return await GetPagedAsync(
            query => query.OrderByDescending(o => o.CreatedAt),
            page,
            pageSize
        );
    }
}
```

**Usage in a service:**

```csharp
public class OrderService(OrderRepository repo)
{
    public async Task<List<Order>> ListOrdersAsync(int page = 1)
    {
        // TenantContext.CurrentTenantId is set by middleware
        return await repo.GetOrdersAsync(page);
    }
}
```

---

## Performance Considerations

### Indexes on TenantId

To maintain query performance, always create indexes on `TenantId` for large tables:

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);
    
    modelBuilder.Entity<Order>()
        .HasIndex(o => o.TenantId)
        .HasDatabaseName("idx_order_tenantid");
    
    // Composite index for common query patterns
    modelBuilder.Entity<Order>()
        .HasIndex(o => new { o.TenantId, o.CreatedAt })
        .HasDatabaseName("idx_order_tenantid_createdat");
}
```

### Query Filter Overhead

- EF query filters add minimal overhead (~2-5% for typical queries)
- Filters are composed into the generated SQL, not applied in-memory
- Use `.AsNoTracking()` for read-only queries to reduce memory pressure

---

## Common Pitfalls

### 1. Forgetting to Set TenantContext

If `TenantContext.CurrentTenantId` is not set before data access, the filter applies `null`, which returns all records:

```csharp
// WRONG: No tenant context set
var allOrders = await context.Orders.ToListAsync(); // Returns orders from ALL tenants

// CORRECT: Set tenant context in middleware
TenantContext.CurrentTenantId = extractedTenantId;
var tenantOrders = await context.Orders.ToListAsync(); // Returns only current tenant's orders
```

**Solution:** Use `TenantResolutionMiddleware` (applied early in the pipeline) to ensure TenantContext is always set before business logic runs.

### 2. Raw SQL Bypassing Filters

Raw SQL queries do NOT apply EF filters:

```csharp
// DANGEROUS: Raw SQL bypasses filters
var orders = await context.Orders
    .FromSqlRaw("SELECT * FROM Orders")
    .ToListAsync(); // Returns ALL orders, not filtered

// CORRECT: Include TenantId condition in raw SQL
var tenantId = TenantContext.CurrentTenantId;
var orders = await context.Orders
    .FromSqlInterpolated($"SELECT * FROM Orders WHERE TenantId = {tenantId}")
    .ToListAsync();
```

**Solution:** Always use parameterized queries through `MRepository` methods or manually add `TenantId` conditions to raw SQL.

### 3. Querying Before Setting Tenant Context

Race conditions can occur if queries execute before middleware sets TenantContext:

```csharp
// WRONG: Query before middleware runs
var orders = context.Orders.ToListAsync(); // TenantContext still null
await next(context); // Middleware sets TenantContext (too late)

// CORRECT: Set TenantContext in middleware BEFORE calling next()
TenantContext.CurrentTenantId = tenantId;
await next(context); // Now TenantContext is set for downstream
```

---

## Operational Consequences

- **Repository reads** should flow through `MRepository<T>` so license checks and soft-delete behavior stay consistent
- The static tenant mirror still affects EF filters, so transport code must set tenant context **before DbContext access**
- **New features** should use execution-context abstractions first, then mirror only when the older EF path requires it
- **Admin/system operations** that need to access all tenants should explicitly set `TenantContext.CurrentTenantId = null` in a `ContextMirrorScope`

---

## Cross-References

- [Multi-Tenant Guide](../03-guides/multi-tenancy/multi-tenant-guide.md) — tenant resolution and context propagation
- [Tenant Isolation](../03-guides/multi-tenancy/tenant-isolation.md) — architectural overview
- [Data Layer](../03-guides/integration/data-layer.md) — MRepository and MDbContext details
