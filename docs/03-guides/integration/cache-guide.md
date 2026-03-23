---
title: Caching Guide
sidebar_label: Caching
sidebar_position: 5
---

# Caching Guide

Muonroi provides a flexible multi-level caching system that combines in-memory (L1) and distributed cache (L2) layers to optimize performance in single-node and multi-instance deployments.

## Overview

The caching system is designed to:

- Reduce database round trips through intelligent cache layering
- Support horizontal scaling with distributed cache (Redis)
- Fall back gracefully to in-memory caching under Free tier
- Provide stampede protection to prevent cache-miss storms
- Automatically integrate with tenant context and license guards

---

## Architecture

The multi-level cache follows a three-tier design:

```
┌──────────────────────────────────────────────────────────┐
│  Application Code (GetOrSetAsync / GetAsync / SetAsync)  │
└──────────────────────┬───────────────────────────────────┘
                       │
           ┌───────────┴────────────┐
           ▼                        ▼
      ┌─────────┐        ┌──────────────────┐
      │ L1      │        │ L2               │
      │ Memory  │        │ Distributed      │
      │ (Fast)  │        │ (Redis/InMemory) │
      └────┬────┘        └─────────┬────────┘
           │                       │
           │                       ▼
           │                  ┌──────────┐
           │                  │ L3       │
           └──────────────────┤ Database │
                              └──────────┘
```

**Read flow:**
1. Check memory cache (L1) — O(1), no I/O
2. Check distributed cache (L2) — ~5-50ms, shared across instances
3. Query database (L3) — populate L1 and L2 on miss

**Write flow:**
1. Invalidate L1 (remove from memory)
2. Invalidate L2 (remove from Redis)
3. Write to L3 (database)

---

## Registration

Register multi-level caching in your `Program.cs`:

```csharp
var builder = WebApplication.CreateBuilder(args);

// Enable multi-level caching (memory + distributed)
builder.Services.AddMultiLevelCaching(builder.Configuration);

var app = builder.Build();
app.Run();
```

This automatically registers both `IMemoryCache` (dotnet built-in) and `IDistributedCache` (with external provider support).

---

## Configuration

Define cache settings in `appsettings.json` under the `CacheConfigs` section:

```json
{
  "CacheConfigs": {
    "CacheType": "Memory",
    "KeyNamespace": "myapp",
    "EnableStampedeProtection": true,
    "DefaultAbsoluteExpirationInMinutes": 300,
    "TtlJitterPercent": 10
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `CacheType` | enum | `Memory` | `Memory` = in-memory only, `Distributed` = Redis + memory |
| `KeyNamespace` | string | empty | Prefix for all cache keys (e.g., `"myapp:permission:"`) |
| `EnableStampedeProtection` | bool | `true` | Mutex-lock cache-miss requests to prevent thundering herd |
| `DefaultAbsoluteExpirationInMinutes` | int | `1440` (24h) | TTL in minutes for entries without explicit expiration |
| `TtlJitterPercent` | int | `0` | Randomize TTL by ±this% to spread cache expiration (0–50) |

---

## Core Interface

Inject `IMultiLevelCacheService` into your repositories or services:

```csharp
public class UserRepository
{
    private readonly IMultiLevelCacheService _cache;
    private readonly IRepository<User> _userRepository;

    public UserRepository(IMultiLevelCacheService cache, IRepository<User> userRepository)
    {
        _cache = cache;
        _userRepository = userRepository;
    }

    // Read-through caching
    public async Task<User?> GetByIdAsync(string userId)
    {
        string cacheKey = $"user:{userId}";
        return await _cache.GetOrSetAsync(
            key: cacheKey,
            factory: async () => await _userRepository.FindAsync(userId),
            absoluteExpirationInMinutes: 30  // 30-minute TTL
        );
    }

    // Write-through caching
    public async Task UpdateAsync(User user)
    {
        await _userRepository.UpdateAsync(user);
        string cacheKey = $"user:{user.Id}";
        await _cache.RemoveAsync(cacheKey);  // Invalidate cache
    }
}
```

### IMultiLevelCacheService Methods

| Method | Purpose | Example |
|--------|---------|---------|
| `GetOrSetAsync<T>(key, factory, ttl)` | Read L1→L2→L3 with factory on miss | Lazy load user profile |
| `GetAsync<T>(key)` | Read L1→L2, return null on miss | Check if permission cached |
| `SetAsync<T>(key, value, ttl)` | Write to L1+L2 | Warm cache after bulk import |
| `RemoveAsync(key)` | Invalidate L1+L2 | Purge stale user data |

---

## TTL Patterns

Choose TTL based on data volatility:

### Static Data (hours)

Data that rarely changes — ideal for caching:

```csharp
// Feature flags: cached for 24 hours
await _cache.GetOrSetAsync(
    key: "feature:advanced_auth",
    factory: () => _featureService.GetAsync("advanced_auth"),
    absoluteExpirationInMinutes: 1440  // 24h
);
```

### User Data (minutes)

Data that changes during a session — medium TTL:

```csharp
// User permissions: cached for 10 minutes
await _cache.GetOrSetAsync(
    key: $"user:{userId}:permissions",
    factory: () => _authService.GetPermissionsAsync(userId),
    absoluteExpirationInMinutes: 10
);
```

### Real-Time Data (seconds or skip cache)

Data that must always be fresh:

```csharp
// Current rate limit: skip cache entirely
var currentLimit = await _rateLimitService.GetAsync(userId);  // No caching
```

---

## Stampede Protection

When a cache key expires and many concurrent requests hit the factory, all threads will block on a shared lock. Only the first thread computes the value; others wait and return it from memory.

This prevents:
- Database overload during cache-miss storms
- Redundant factory invocations
- Performance degradation under high concurrency

**Enabled by default** (`EnableStampedeProtection: true`). Disable only if you have strong reasons (not recommended).

---

## Cache Keys and Tenant Isolation

Cache keys are automatically scoped to the current tenant:

```csharp
// In tenant context "acme-corp"
var key = DistributedCacheKeyBuilder.Build(
    key: "user:123",
    keyNamespace: "permissions",
    tenantId: "acme-corp"  // or null for auto-resolve from TenantContext
);
// Result: "permissions:acme-corp:user:123"
```

The key builder:
- Normalizes tenant IDs (trims whitespace, converts empty to null)
- Supports optional namespace prefix
- Automatically uses `TenantContext.CurrentTenantId` if tenant not specified

This ensures **one tenant cannot access another tenant's cached data**.

---

## Invalidation Strategies

### 1. Event-Driven (Recommended for distributed systems)

Use SignalR or message bus to broadcast cache invalidation across all instances:

```csharp
// When a rule is published, signal all instances
public async Task PublishRuleSetAsync(RuleSet ruleSet)
{
    await _ruleRepository.SaveAsync(ruleSet);
    await _hubContext.Clients.All.SendAsync("RuleSetPublished", ruleSet.Id);
}

// Connected clients listen and invalidate
hubConnection.On("RuleSetPublished", (string ruleSetId) =>
{
    _cache.RemoveAsync($"ruleset:{ruleSetId}");
});
```

### 2. Key-Based Invalidation

Directly invalidate specific keys:

```csharp
await _cache.RemoveAsync($"user:{userId}:permissions");
await _cache.RemoveAsync($"user:{userId}:settings");
```

### 3. Pattern-Based Invalidation (Redis-specific)

Use Redis key patterns to invalidate groups:

```csharp
// Would require Redis SCAN + DEL — implement as helper if needed
// E.g., "permissions:*:user:123" to clear all user permissions across namespaces
```

---

## Rule Engine Cache Integration

The Rule Engine uses a 3-level cache hierarchy:

```
RuntimeCache (per-tenant, TTL-based)
    ↓
WorkflowCache (static, max 2048 entries)
    ↓
ReflectionRuleCache (per-TContext, metadata introspection)
```

When a rule set is published:
1. Cache invalidation fires
2. `RuleSetChangeEvent` published to all subscribers
3. SignalR broadcasts to connected dashboards
4. Clients refresh their local rule versions

**No additional configuration** — the engine uses `IMultiLevelCacheService` internally.

---

## License-Gated Features

Distributed caching (Redis) requires a **Licensed or Enterprise** tier license.

- **Free tier**: Memory-only fallback (no Redis)
- **Licensed/Enterprise**: Full multi-level caching with Redis

The system gracefully degrades: if Redis is unavailable and `EnableStampedeProtection` is on, in-memory caching continues with stampede protection.

```csharp
// Will throw InvalidOperationException if distributed cache is used without license
EnsureDistributedCacheLicensed();
```

---

## Operational Guidance

### Monitoring & Telemetry

Cache operations emit OpenTelemetry activities with tags:

- `cache.operation`: get_or_set, get, set, remove
- `cache.key_hash`: SHA256(key).substring(0, 8)
- `tenant.id`: current tenant
- `cache_layer`: which layer served the request (memory, distributed, factory, none)
- `cache_hit`: boolean
- `elapsed`: request duration

### Key Namespace Strategies

Use hierarchical namespaces to organize cache entries:

```
ruleset:{tenantId}:{name}           // Rule set by name
workflow:{tenantId}:{id}            // Workflow by ID
permission:{tenantId}:{userId}      // User permissions
feature:{tenantId}:{featureName}    // Feature flags
```

### Redis Connection Monitoring

If using external Redis:

```json
{
  "RedisConfigs": {
    "ConnectionString": "redis.example.com:6379",
    "InstanceName": "muonroi:",
    "TimeoutMs": 5000,
    "AbortOnConnectFail": false
  }
}
```

Monitor:
- Connection availability
- Eviction rate (cache.evicted items)
- Memory usage on Redis server
- Latency (avg should be &lt;5ms)

### Best Practices

1. **Define clear TTLs per category** — don't use a one-size-fits-all expiration
2. **Use cache stampede protection** — enabled by default for a reason
3. **Invalidate aggressively on writes** — stale data is worse than extra DB hits
4. **Monitor cache hit rates** — aim for >70% on stable workloads
5. **Use key namespaces** — prevents collisions and aids debugging
6. **Test cache behavior** — verify invalidation in multi-instance scenarios
7. **Avoid large objects** — cache serialization/deserialization overhead grows with size
8. **Implement fallback handlers** — cache errors should not crash the app

---

## Related Documentation

- **[Multi-Tenancy Guide](../multi-tenancy/multi-tenancy-guide.md)** — How TenantContext integrates with caching
- **[Rule Engine Guide](../rule-engine/rule-engine-guide.md)** — 3-level rule cache architecture
- **[SignalR & Hot-Reload](signalr-hot-reload.md)** — Broadcasting cache invalidation
- **[License & Governance](../license-governance/license-governance-guide.md)** — Cache feature gating
