---
title: Tenancy Models
sidebar_label: Tenancy Models
sidebar_position: 3
---

# Tenancy Models

Muonroi provides a flexible multi-tenant architecture based on **AsyncLocal context propagation** and pluggable data isolation strategies. This document covers tenant resolution, context propagation, isolation modes, and quota management.

## Overview

Every request in a multi-tenant Muonroi application flows through a tenant resolution phase that establishes the current tenant context, which is then propagated throughout the execution pipeline via `AsyncLocal<T>` storage. This allows all downstream code to access the tenant ID without explicit parameter passing.

---

## Tenant Resolution Order

When an HTTP request arrives, `TenantResolutionMiddleware` determines the tenant ID using the following priority order:

```
1. x-tenant-id header (highest priority)
   ↓ (if not found)
2. URL path parameter (/{tenantId}/...)
   ↓ (if not found)
3. Subdomain extraction (tenant-a.example.com)
   ↓ (if not found)
4. JWT claim validation (iss, sub, org_id, or custom claim)
   ↓
5. Validate extracted tenantId against JWT tenant claim
   └─ If mismatch: return 401 Unauthorized
```

### Resolution Flow Diagram

```
HTTP Request arrives
    ↓
TenantResolutionMiddleware.Invoke
    ├─ Check x-tenant-id header?
    │   ├─ YES → use it
    │   └─ NO → check URL path
    │       ├─ YES → extract from /{id}/...
    │       └─ NO → check subdomain
    │           ├─ YES → extract from tenant.example.com
    │           └─ NO → extract from JWT (iss, sub, org_id)
    ↓
Extract tenantId (string)
    ↓
Validate against JWT tenant claim
    ├─ Match? → continue
    └─ No match? → return 401 Unauthorized
    ↓
Set TenantContext.CurrentTenantId (AsyncLocal)
    ↓
All downstream: TenantContext.CurrentTenantId (no params)
```

### Example: Header-Based Resolution

```csharp
// Client request
GET /api/orders HTTP/1.1
x-tenant-id: acme-corp

// Middleware extracts:
var tenantId = "acme-corp";
TenantContext.CurrentTenantId = tenantId;  // AsyncLocal

// In controller:
public class OrdersController(IRepository<Order> repo)
{
    public async Task<List<Order>> GetOrders()
    {
        // Queries automatically filtered by acme-corp
        return await repo.GetQueryable().ToListAsync();
    }
}
```

### Example: Path-Based Resolution with JWT Validation

```csharp
// Client request
GET /api/tenants/customer-xyz/orders HTTP/1.1
Authorization: Bearer eyJ...

// Middleware extracts:
var pathTenantId = "customer-xyz";      // from URL
var jwtTenantId = claims["org_id"];     // from JWT
if (pathTenantId != jwtTenantId)
    return 401;  // Tenant mismatch — deny access

TenantContext.CurrentTenantId = pathTenantId;
```

---

## Context Propagation

### Canonical Context (Recommended)

New code should use the **execution context** approach:

```csharp
public interface ISystemExecutionContext
{
    string TenantId { get; }
    string UserId { get; }
    string Username { get; }
    string CorrelationId { get; }
    IReadOnlySet<string> Permissions { get; }
    string SourceType { get; }  // "api", "grpc", "mq", etc.
}

// Injected via ISystemExecutionContextAccessor
public class MyService(ISystemExecutionContextAccessor contextAccessor)
{
    public void DoWork()
    {
        var ctx = contextAccessor.CurrentContext;
        var tenantId = ctx.TenantId;      // No static state
        var userId = ctx.UserId;
        var permissions = ctx.Permissions;
    }
}
```

### Legacy Mirrors (Still Supported)

Older runtime packages mirror execution context into static properties for backward compatibility:

```csharp
// Static properties (AsyncLocal-backed)
TenantContext.CurrentTenantId      // Mirrored from ISystemExecutionContext
UserContext.CurrentUserGuid        // Mirrored from ISystemExecutionContext
UserContext.CurrentUsername        // Mirrored from ISystemExecutionContext
```

:::warning
Static context is subject to `AsyncLocal` scope. Do not assume persistence across thread transitions outside a request.
:::

### ContextMirrorScope — Temporary Switches

For transport boundaries that still use legacy mirrors, `ContextMirrorScope` allows temporary tenant/user switches:

```csharp
// Temporarily switch to admin context
using (var scope = ContextMirrorScope.Apply(
    tenantId: null,                 // null = see all tenants
    userId: adminUserId,
    username: "system"))
{
    // All downstream code sees the temporary context
    var allTenantData = await repo.GetQueryable().ToListAsync();
}
// Exiting the using block restores the original context
```

### Transport Boundaries Already Configured

Do **not** duplicate context initialization where these already handle it:

- `JwtMiddleware` — Extracts JWT claims, creates execution context
- `GrpcServerInterceptor` — Extracts gRPC metadata (tenant, user)
- `AmqpContextConsumeFilter` — Reads message headers for tenant/user
- `TenantContextConsumeFilter` — Applies tenant-scoped message filtering
- `JobContextActivatorFilter` — Initializes background job context
- `QuartzContextJobListener` — Wires tenant context to Quartz jobs

---

## Data Isolation Strategies

Muonroi supports three pluggable isolation strategies. All use the same context propagation foundation, so switching between them requires only configuration changes.

### Comparison Table

| Strategy | Database Layout | Isolation Level | Query Filter | Operational Cost | Compliance Fit |
|----------|-----------------|-----------------|--------------|-----------------|---|
| **SharedSchema** (default) | Single DB, single schema | Row-level (EF) | `WHERE TenantId = @id` | Minimal | SaaS, standard tenants |
| **SeparateSchema** | Single DB, tenant-per-schema | Schema-level | PostgreSQL `SET search_path` | Low | GDPR, moderate isolation |
| **SeparateDatabase** | Database per tenant | Database-level | Connection string per tenant | High | HIPAA, PCI-DSS, strict isolation |

### 1. SharedSchema (Default)

All tenants share a single database and schema. Isolation is enforced by **Entity Framework Core query filters** applied to `ITenantScoped` entities.

**How it works:**
- Every `ITenantScoped` entity automatically receives this filter:
  ```csharp
  e => e.TenantId == TenantContext.CurrentTenantId
       || TenantContext.CurrentTenantId == null  // Admin bypass
  ```
- `TenantResolutionMiddleware` sets `TenantContext.CurrentTenantId` for the request
- All queries transparently filter results by tenant
- Background jobs and admin operations set `CurrentTenantId = null` to access all tenants

**Configuration:**

```json
{
  "MultiTenantOptions": {
    "Enabled": true,
    "IsolationMode": "SharedSchema"
  }
}
```

**Advantages:**
- Single database = minimal infrastructure
- Simple deployment and backup
- Easiest to develop and test
- Real-time analytics across tenants possible

**Disadvantages:**
- Depends on correct EF filter application (no hard database constraint)
- Schema changes apply to all tenants instantly
- Requires vigilant NULL-handling in filters
- Not suitable for high-compliance requirements

**When to use:**
- SaaS with trusted tenants
- Early-stage products with cost constraints
- Internal/private deployments

---

### 2. SeparateSchema (PostgreSQL)

Each tenant gets its own PostgreSQL **schema** within the same database. Isolation is enforced at the database schema level.

**How it works:**
- Tenant schemas: `schema_acme`, `schema_globex`, `schema_initech`
- Connection string remains unchanged
- `TenantSchemaSelector` intercepts connections and executes `SET search_path = schema_<tenantId>`
- Queries reference unqualified table names (`SELECT * FROM orders`)
- PostgreSQL automatically routes queries to the correct schema
- System/admin code can use a different search_path to access shared data

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
      "acme-corp": "schema_acme",
      "globex-inc": "schema_globex",
      "initech-ltd": "schema_initech"
    }
  }
}
```

**Schema initialization (Flyway/EF migrations):**

```sql
-- Create schema per tenant
CREATE SCHEMA IF NOT EXISTS schema_acme;
CREATE SCHEMA IF NOT EXISTS schema_globex;

-- Apply migrations to each schema
SET search_path = schema_acme;
CREATE TABLE orders (...);
CREATE TABLE customers (...);

SET search_path = schema_globex;
CREATE TABLE orders (...);
CREATE TABLE customers (...);
```

**Advantages:**
- Database-enforced isolation (schema boundary is a hard constraint)
- No EF filter risk
- Supports independent schema versions per tenant (for gradual migration)
- GDPR-friendly (easier to delete/export tenant data)
- Better performance than SharedSchema (smaller table scans per query)

**Disadvantages:**
- Single database still shared (resource contention possible)
- Schema creation overhead (must pre-create or auto-provision on signup)
- Backup/restore more complex than SeparateDatabase
- Cross-tenant analytics queries require explicit schema joins

**When to use:**
- GDPR-regulated SaaS
- Medium-compliance deployments
- Cost-conscious high-isolation needs

---

### 3. SeparateDatabase (Full Isolation)

Each tenant gets its own complete PostgreSQL or MySQL database instance. Isolation is at the database level.

**How it works:**
- Tenant databases: `muonroi_acme`, `muonroi_globex`, `muonroi_initech`
- Connection string selected at runtime based on `TenantContext.CurrentTenantId`
- `TenantDatabaseSelector` intercepts EF calls and applies the correct DbContext connection
- Each tenant database is independently encrypted, backed up, and recoverable
- No schema changes affect other tenants

**Configuration:**

```json
{
  "MultiTenantOptions": {
    "Enabled": true,
    "IsolationMode": "SeparateDatabase"
  },
  "TenantDatabases": {
    "acme-corp": "Host=localhost;Database=muonroi_acme;User=muonroi;Password=secret;",
    "globex-inc": "Host=localhost;Database=muonroi_globex;User=muonroi;Password=secret;",
    "initech-ltd": "Host=localhost;Database=muonroi_initech;User=muonroi;Password=secret;"
  }
}
```

**Provisioning new tenants:**

```csharp
public class TenantProvisioningService
{
    public async Task ProvisionNewTenantAsync(string tenantId, string connectionString)
    {
        // Create database
        await _adminDb.Database.ExecuteSqlAsync(
            $"CREATE DATABASE muonroi_{tenantId}");

        // Apply migrations to the new database
        using var scope = ContextMirrorScope.Apply(tenantId: tenantId);
        var dbContext = _dbContextFactory.CreateDbContext();
        await dbContext.Database.MigrateAsync();
    }
}
```

**Advantages:**
- Absolute isolation (separate database instance = no shared resource contention)
- Perfect for high-compliance (HIPAA, PCI-DSS, FINRA)
- Easy to restore a single tenant without affecting others
- Flexible: tenants can run different versions if needed
- Data residency compliance (can place databases in different regions/servers)

**Disadvantages:**
- Highest operational overhead (N databases to manage)
- Backup and restore complexity
- Tenant provisioning/deprovisioning adds latency
- Cross-tenant analytics requires federation queries
- Licensing: per-database fees if using cloud RDS

**When to use:**
- High-compliance regulated industries (finance, healthcare)
- Strict data residency requirements (GDPR, data sovereignty)
- Sensitive data requiring absolute isolation
- Very large enterprise customers with custom SLAs

---

## Quota System

Muonroi enforces **13 quota limits** organized into **4 tier presets**: Free, Starter, Professional, and Enterprise.

### Quota Types

```csharp
public enum QuotaType
{
    RuleExecutionsPerDay,        // How many rule executions per 24h
    ConcurrentExecutions,         // Max simultaneous rule runs
    ApiRequestsPerMinute,         // HTTP requests per rolling minute
    RuleEvaluationsPerSecond,     // FEEL/XPath evaluations per second
    WorkflowExecutionsPerHour,    // Workflow instances per hour
    StorageUsageMB,               // Total stored data (rules, workflows, tables)
    TotalRules,                   // Max rule definitions
    TotalDecisionTables,          // Max decision tables
    TotalWorkflows,               // Max workflows
    MessagesPerMinute,            // MassTransit publishes per minute (messaging)
    MessagesPerDay,               // MassTransit publishes per day (messaging)
    CustomExpressionsAllowed,     // Boolean: can use custom FEEL/XPath
    MultiTenancyAllowed           // Boolean: multi-tenant feature enabled
}
```

### Tier Presets

| Limit | Free | Starter | Professional | Enterprise |
|-------|------|---------|--------------|------------|
| **RuleExecutionsPerDay** | 1,000 | 100,000 | 10,000,000 | Unlimited |
| **ConcurrentExecutions** | 1 | 10 | 100 | Unlimited |
| **ApiRequestsPerMinute** | 10 | 100 | 1,000 | Unlimited |
| **RuleEvaluationsPerSecond** | 10 | 100 | 10,000 | Unlimited |
| **WorkflowExecutionsPerHour** | 100 | 1,000 | 100,000 | Unlimited |
| **StorageUsageMB** | 100 | 1,000 | 50,000 | Unlimited |
| **TotalRules** | 10 | 100 | 1,000 | Unlimited |
| **TotalDecisionTables** | 1 | 5 | 50 | Unlimited |
| **TotalWorkflows** | 3 | 10 | 50 | Unlimited |
| **MessagesPerMinute** | 10 | 100 | 10,000 | Unlimited |
| **MessagesPerDay** | 10,000 | 1,000,000 | 100,000,000 | Unlimited |
| **CustomExpressions** | ❌ | ❌ | ✅ | ✅ |
| **MultiTenancy** | ❌ | ❌ | ❌ | ✅ |

### Quota Enforcement Points

| Trigger | Enforced By | Action on Exceed |
|---------|-------------|------------------|
| **RuleExecutionsPerDay** | `RuleOrchestrator` | Throw `QuotaExceededException` |
| **ConcurrentExecutions** | `RuleOrchestrator` | Throw `QuotaExceededException` |
| **ApiRequestsPerMinute** | `QuotaEnforcementMiddleware` | Return HTTP 429 (Too Many Requests) |
| **RuleEvaluationsPerSecond** | `RuleOrchestrator` (per-rule) | Skip rule, log warning |
| **WorkflowExecutionsPerHour** | `MRuleFlowExecuteController` | Return HTTP 429 |
| **StorageUsageMB** | `RulesetPersistenceService` | Throw `QuotaExceededException` |
| **TotalRules** | `RulesetValidationService` | Reject create/publish |
| **MessagesPerMinute** | `TenantQuotaMessagingFilter` | Drop message (not retried) |

### Quota Caching

Quota data is cached per-tenant with a **daily TTL**:

```
Cache Key: quota:{tenantId}:{quotaType}:{periodKey}
TTL: 24 hours (recalculated at UTC midnight)

Example:
  quota:acme-corp:RuleExecutionsPerDay:2026-03-20 → 45000 (current)
  quota:acme-corp:ConcurrentExecutions:* → 8 (current)
```

### Programmatic Access

```csharp
public class MyRuleService(ITenantQuotaService quotaService)
{
    public async Task ExecuteAsync(string tenantId, FactBag fact)
    {
        // Check if tenant can run another rule
        var quota = await quotaService.GetQuotaAsync(tenantId);
        if (quota.RuleExecutionsPerDay >= 1_000_000)
            throw new QuotaExceededException("Daily rule execution limit reached");

        // Increment counter
        await quotaService.IncrementAsync(tenantId, QuotaType.RuleExecutionsPerDay);

        // Execute rule
        var result = await _orchestrator.ExecuteAsync(fact);
    }
}
```

### Changing Tier for a Tenant

```csharp
public class TenantUpgradeService(ITenantQuotaService quotaService)
{
    public async Task UpgradeTenantAsync(string tenantId, TenantTier newTier)
    {
        var presets = TenantQuotaPresets.GetTierLimits(newTier);
        await quotaService.ApplyTierAsync(tenantId, presets);

        // Clear old quota cache
        await _cache.RemoveAsync($"quota:{tenantId}:*");
    }
}
```

---

## Choosing Your Isolation Strategy

### Decision Flow

```
Do you have multi-tenant compliance requirements?
│
├─ No → Use SharedSchema (simplest, cheapest)
│
└─ Yes → Is data residency or per-region deployment required?
    │
    ├─ No → Is schema versioning per tenant needed?
    │   ├─ No → Use SeparateSchema (PostgreSQL)
    │   └─ Yes → Use SeparateDatabase
    │
    └─ Yes → Use SeparateDatabase (full control)
```

### Summary Table

| Scenario | Recommended | Reason |
|----------|-------------|--------|
| Internal SaaS, low compliance | **SharedSchema** | Minimal cost, simple to operate |
| GDPR-regulated SaaS | **SeparateSchema** | Schema-level isolation, data portability |
| Healthcare (HIPAA) or Finance | **SeparateDatabase** | Absolute isolation, audit trail per DB |
| Multi-region SaaS | **SeparateDatabase** | Can place DBs in different regions |
| Rapid prototyping | **SharedSchema** | Migrate to SeparateSchema later if needed |
| Large enterprise tenant | **SeparateDatabase** | Custom SLA, version flexibility |

---

## Backward Compatibility

### From Canonical (ISystemExecutionContext) to Mirrors

If your code uses the new `ISystemExecutionContextAccessor`, the context is automatically mirrored to static properties **only** at transport boundaries configured with `ContextMirrorScope`. Older code continues to work without changes.

### Migrating Existing Code

```csharp
// OLD: Using static TenantContext
var tenantId = TenantContext.CurrentTenantId;

// NEW: Using execution context
public MyService(ISystemExecutionContextAccessor contextAccessor)
{
    var tenantId = contextAccessor.CurrentContext.TenantId;
}
```

Both approaches coexist during migration.

---

## References

For more information, see:

- **[Multi-Tenant Guide](../03-guides/multi-tenancy/multi-tenant-guide.md)** — Detailed setup and configuration
- **[Tenant Isolation](../03-guides/multi-tenancy/tenant-isolation.md)** — Deep dive into isolation strategies
- **[Multi-Tenant Quota Guide](../03-guides/multi-tenancy/multi-tenant-quota-guide.md)** — Quota configuration and enforcement
- **[EF Filters](./ef-filters.md)** — How Entity Framework filters work
- **[Architecture Overview](./architecture-overview.md)** — Full system context
