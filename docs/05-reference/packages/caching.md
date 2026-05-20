---
title: Caching Packages
sidebar_label: Caching
sidebar_position: 4
---

# Caching Packages

Muonroi provides a multi-level caching strategy that integrates seamlessly with the ecosystem's tenancy, licensing, and telemetry systems. The architecture supports memory-only caching, Redis-based distributed caching, and hybrid multi-level caching with cache stampede protection and OpenTelemetry instrumentation.

---

## Muonroi.Caching.Abstractions

**NuGet:** `Muonroi.Caching.Abstractions` | **Tier:** OSS | **Distribution:** NuGet.org

This package defines the core abstractions for distributed caching and is consumed by all other caching implementations.

### Purpose

Provides the unified `IMCacheService` interface and supporting types that abstract cache operations across memory, Redis, and hybrid configurations. Includes key building and tenant-scoped cache entry options.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IMCacheService` | Interface | Unified cache service: `GetAsync<T>`, `SetAsync<T>`, `RemoveAsync`, `RefreshAsync`, `GetOrSetAsync<T>` |
| `CacheEntryOptions` | Record | Cache entry configuration: `AbsoluteExpirationRelativeToNow`, `SlidingExpiration`, `KeyNamespace`, `TenantScoped` |
| `DistributedCacheKeyBuilder` | Static | Builds composite keys: `Build(key, namespace?, tenantId?)`, `NormalizeTenantId(tenantId?)` |
| `DistributedCacheRuntimeTelemetry` | Static | OpenTelemetry integration: activity source and meter for cache operations |
| `DistributedCacheTelemetryDescriptor` | Class | Implements `ITelemetryDescriptor` for automatic telemetry discovery |

### IMCacheService Interface

```csharp
public interface IMCacheService
{
    /// Gets a cached value from the distributed cache.
    Task<T?> GetAsync<T>(string key, CancellationToken token = default);

    /// Sets a cached value in the distributed cache.
    Task SetAsync<T>(
        string key,
        T value,
        CacheEntryOptions? options = null,
        CancellationToken token = default);

    /// Removes a cached value from the distributed cache.
    Task RemoveAsync(string key, CancellationToken token = default);

    /// Refreshes a cached value in the distributed cache.
    Task RefreshAsync(string key, CancellationToken token = default);

    /// Gets a cached value or computes and stores it.
    Task<T?> GetOrSetAsync<T>(
        string key,
        Func<Task<T?>> factory,
        CacheEntryOptions? options = null,
        CancellationToken token = default) where T : class;
}
```

### CacheEntryOptions

```csharp
public sealed record CacheEntryOptions
{
    /// Gets or sets an absolute expiration relative to now.
    /// Default: 1440 minutes (24 hours).
    public TimeSpan? AbsoluteExpirationRelativeToNow { get; init; } = TimeSpan.FromMinutes(1440);

    /// Gets or sets how long a cache entry can be inactive before removal.
    /// This will not extend beyond the absolute expiration (if set).
    public TimeSpan? SlidingExpiration { get; init; }

    /// Gets or sets a namespace to prefix the cache key.
    /// Default: null.
    public string? KeyNamespace { get; init; }

    /// Gets or sets whether to use tenant-specific scoping.
    /// Default: true (ecosystem default).
    public bool TenantScoped { get; init; } = true;
}
```

### Key Building

The `DistributedCacheKeyBuilder` composes cache keys with optional namespace and tenant prefixes:

```
Build(key: "user:123", namespace: null, tenantId: null)
  → "user:123"

Build(key: "user:123", namespace: "app1", tenantId: null)
  → "app1:user:123"

Build(key: "user:123", namespace: null, tenantId: "tenant-a")
  → "tenant-a:user:123"

Build(key: "user:123", namespace: "app1", tenantId: "tenant-a")
  → "app1:tenant-a:user:123"
```

### Telemetry

The package emits OpenTelemetry metrics and traces for all cache operations:

**Activity Source:** `Muonroi.BuildingBlock.DistributedCache`  
**Meter:** `Muonroi.BuildingBlock.DistributedCache`

**Metrics:**
- `distributed_cache_operations_total` (Counter): Total operations tagged by operation, layer, status, hit, and tenant ID
- `distributed_cache_errors_total` (Counter): Total errors
- `distributed_cache_operation_duration_ms` (Histogram): Operation latency

**Activity Tags:**
- `cache.operation`: "get", "set", "remove", "refresh", "get_or_set"
- `cache.layer`: "memory", "distributed", "factory", "none"
- `cache.hit`: Boolean
- `tenant.id`: Tenant identifier (normalized)

---

## Muonroi.Caching.Memory

**NuGet:** `Muonroi.Caching.Memory` | **Tier:** OSS | **Distribution:** NuGet.org

Provides multi-level caching with in-process memory and optional distributed cache backing. Includes cache stampede protection and TTL jitter to prevent thundering herd scenarios.

### Purpose

Implements a dual-layer cache: fast in-memory for hot data and a configurable distributed layer (in-memory, Redis, or others) for shared state. Automatically synchronizes L1 (memory) with L2 (distributed) on reads and writes.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IMultiLevelCacheService` | Interface | Multi-level cache contract: `GetAsync<T>`, `SetAsync<T>`, `GetOrSetAsync<T>`, `RemoveAsync` |
| `MultiLevelCacheService` | Class | Implementation with stampede protection, TTL jitter, and OpenTelemetry |
| `CacheConfigs` | Class | Configuration: cache type, namespace, stampede protection, expiration, jitter |
| `MultiLevelCacheType` | Enum | Layer selection: `Memory`, `Redis`, `MultiLevel` |

### IMultiLevelCacheService Interface

```csharp
public interface IMultiLevelCacheService
{
    /// Gets a cached value or computes and stores it.
    Task<T?> GetOrSetAsync<T>(
        string key,
        Func<Task<T?>> factory,
        int? absoluteExpirationInMinutes = 1440,
        CancellationToken token = default);

    /// Stores a value in the cache.
    Task SetAsync<T>(
        string key,
        T value,
        int? absoluteExpirationInMinutes = 1440,
        CancellationToken token = default);

    /// Gets a cached value.
    Task<T?> GetAsync<T>(string key, CancellationToken token = default);

    /// Removes a cached value.
    Task RemoveAsync(string key, CancellationToken token = default);
}
```

### CacheConfigs

```csharp
public class CacheConfigs
{
    /// Default configuration section name.
    public const string DefaultSectionName = "CacheConfigs";

    /// Configuration section name to bind from.
    public string SectionName { get; set; } = DefaultSectionName;

    /// Cache layer selection: Memory, Redis, or MultiLevel.
    public MultiLevelCacheType CacheType { get; set; } = MultiLevelCacheType.Memory;

    /// Optional key namespace prefix.
    public string KeyNamespace { get; set; } = string.Empty;

    /// Enables cache stampede protection via distributed locks.
    public bool EnableStampedeProtection { get; set; } = true;

    /// Default absolute expiration in minutes.
    public int DefaultAbsoluteExpirationInMinutes { get; set; } = 1440;

    /// TTL jitter percentage for expiration randomization (0-50).
    public int TtlJitterPercent { get; set; }
}
```

### DI Registration

Register multi-level caching in your service collection:

```csharp
// Startup.cs or Program.cs
services.AddMultiLevelCaching(configuration);
```

The extension automatically:
1. Registers `IMemoryCache` (in-process)
2. Registers `IDistributedCache` (in-memory backing by default)
3. Registers `IMultiLevelCacheService` as singleton

**Note:** The default distributed cache is in-memory. For production with Redis, use `AddRedis()` instead.

### Usage Example

#### Basic Get-or-Set

```csharp
public class UserService
{
    private readonly IMultiLevelCacheService _cache;

    public UserService(IMultiLevelCacheService cache)
    {
        _cache = cache;
    }

    public async Task<User?> GetUserAsync(string userId, CancellationToken ct = default)
    {
        return await _cache.GetOrSetAsync(
            key: $"user:{userId}",
            factory: async () => await _database.GetUserAsync(userId, ct),
            absoluteExpirationInMinutes: 240, // 4 hours
            token: ct);
    }
}
```

#### Explicit Set

```csharp
await _cache.SetAsync(
    key: $"user:{userId}",
    value: user,
    absoluteExpirationInMinutes: 240);
```

#### Invalidation

```csharp
await _cache.RemoveAsync($"user:{userId}");
```

### Cache Stampede Protection

When multiple requests miss the cache simultaneously, a stampede occurs: all threads invoke the factory concurrently. Multi-level caching prevents this with distributed locks:

```csharp
// First request acquires lock, invokes factory
// Other concurrent requests wait for lock, then read from L1/L2
var value = await _cache.GetOrSetAsync(key, factory);
```

**Configuration:**
```json
{
  "CacheConfigs": {
    "EnableStampedeProtection": true
  }
}
```

### TTL Jitter

To avoid thundering herd on expiration (many keys expiring simultaneously), apply random jitter to TTL:

```json
{
  "CacheConfigs": {
    "TtlJitterPercent": 10
  }
}
```

With 10% jitter on a 1440-minute TTL:
- Jitter range: ±144 minutes
- Actual TTL: 1296–1584 minutes (random offset)

### Telemetry

Multi-level caching emits the same OpenTelemetry metrics as distributed caching. The `layer` tag indicates cache hit location:
- `"memory"`: Hit in L1 (in-process)
- `"distributed"`: Hit in L2 (backing store)
- `"factory"`: Computed by factory function
- `"none"`: Miss

---

## Muonroi.Caching.Redis

**NuGet:** `Muonroi.Caching.Redis` | **Tier:** Enterprise | **Distribution:** NuGet.org

Provides Redis-backed distributed caching with full ecosystem integration: tenancy, licensing, logging, and telemetry.

### Purpose

Implements `IMCacheService` using Redis as the backing store. Scales horizontally across multiple instances, supports multi-tenant isolation, and integrates license enforcement (distributed cache is Premium-tier feature).

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `RedisCacheService` | Class | `IMCacheService` implementation using StackExchange.Redis |
| `RedisExtensions` | Static | DI registration: `AddRedis()`, extension methods for `IDistributedCache` |
| `IRedisRoutingTableStore` | Interface | Track 8 message routing backed by Redis pub/sub and hashes |
| `RedisRoutingTableOptions` | Class | Routing table configuration: local cache TTL, key prefix, channel name |

### RedisCacheService

```csharp
public sealed class RedisCacheService : IMCacheService
{
    public RedisCacheService(
        IDistributedCache distributedCache,
        IMJsonSerializeService jsonSerializeService,
        ITenantContext tenantContext,
        ILicenseGuard licenseGuard,
        IMLog<RedisCacheService> logger);

    public async Task<T?> GetAsync<T>(string key, CancellationToken token = default);
    public async Task SetAsync<T>(string key, T value, CacheEntryOptions? options = null, CancellationToken token = default);
    public async Task RemoveAsync(string key, CancellationToken token = default);
    public async Task RefreshAsync(string key, CancellationToken token = default);
    public async Task<T?> GetOrSetAsync<T>(string key, Func<Task<T?>> factory, CacheEntryOptions? options = null, CancellationToken token = default) where T : class;
}
```

Key features:
- **Tenant scoping:** Automatically prepends tenant ID to cache keys (configurable via `CacheEntryOptions.TenantScoped`)
- **License enforcement:** Throws if distributed cache feature not licensed
- **OpenTelemetry:** Emits traces and metrics for all operations
- **Error handling:** Logs and propagates exceptions

### DI Registration

```csharp
// Startup.cs or Program.cs
var redisConfigs = new RedisConfigs
{
    Enable = true,
    Host = "localhost",
    Port = "6379",
    // Password = "redis-password", // Optional
    KeyPrefix = "myapp"
};

services.AddRedis(configuration, redisConfigs);
```

**From configuration:**
```json
{
  "Redis": {
    "Host": "localhost",
    "Port": "6379",
    "Password": "",
    "KeyPrefix": "myapp"
  }
}
```

The extension:
1. Validates Host and Port are provided
2. Registers StackExchange.Redis `IConnectionMultiplexer`
3. Registers `IDistributedCache` backed by Redis
4. Registers `RedisCacheService` as `IMCacheService` singleton
5. Enforces Premium license tier

### Usage Example

```csharp
public class ProductService
{
    private readonly IMCacheService _cache;

    public ProductService(IMCacheService cache)
    {
        _cache = cache;
    }

    public async Task<Product?> GetProductAsync(string productId, CancellationToken ct = default)
    {
        return await _cache.GetOrSetAsync(
            key: $"product:{productId}",
            factory: async () => await _database.GetProductAsync(productId, ct),
            options: new CacheEntryOptions
            {
                AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(2),
                KeyNamespace = "products",
                TenantScoped = true // Include tenant in key
            },
            token: ct);
    }

    public async Task InvalidateProductAsync(string productId, CancellationToken ct = default)
    {
        await _cache.RemoveAsync($"product:{productId}", ct);
    }
}
```

### IDistributedCache Extension Methods

The package provides convenience extension methods on `IDistributedCache` for backward compatibility:

```csharp
// Get a cached string value
string? value = await distributedCache.GetCacheAsync("key", cancellationToken: ct);

// Get and deserialize
User? user = await distributedCache.GetCacheAsync<User>("user:123", cancellationToken: ct);

// Set a typed value
await distributedCache.SetCacheAsync("user:123", user, absoluteExpirationInMinutes: 240, cancellationToken: ct);

// Remove a cached value
await distributedCache.RemoveAsync("user:123", cancellationToken: ct);

// Refresh TTL
await distributedCache.RefreshAsync("user:123", cancellationToken: ct);

// Get or compute
var product = await distributedCache.GetOrSetAsync(
    key: "product:456",
    cacheData: async () => await _db.GetProductAsync("456", ct),
    absoluteExpirationInMinutes: 120,
    cancellationToken: ct);
```

All extension methods:
- Enforce license checks
- Support both `LicenseState` and `ILicenseGuard` for flexibility
- Emit telemetry tags
- Handle tenant-scoped key building automatically

### Redis Routing Table

For Track 8 message routing, register the Redis routing table:

```csharp
services.AddRedisRoutingTable(options =>
{
    options.LocalCacheTtl = TimeSpan.FromSeconds(30);
    options.KeyPrefix = "routing";
    options.ChannelName = "routing-changed";
});
```

**RedisRoutingTableOptions:**

```csharp
public sealed class RedisRoutingTableOptions
{
    /// Gets or sets the local in-process cache time-to-live.
    /// Default: 60 seconds.
    public TimeSpan LocalCacheTtl { get; set; } = TimeSpan.FromSeconds(60);

    /// Gets or sets the key prefix used for Redis hashes.
    /// Default: "mrt".
    public string KeyPrefix { get; set; } = "mrt";

    /// Gets or sets the pub/sub channel prefix used for invalidation.
    /// Default: "routing-table-changed".
    public string ChannelName { get; set; } = "routing-table-changed";
}
```

This enables distributed routing table updates across instances using Redis pub/sub.

### License Enforcement

Distributed cache operations require the Premium license tier. Free-tier instances fall back to in-memory caching:

```csharp
// Free tier: uses in-memory cache only
// Premium tier: uses Redis

if (!licenseGuard.HasFeature(FreeTierFeatures.Premium.DistributedCache))
{
    // Automatically uses in-memory fallback
    // or throws if external distributed cache required
}
```

### Configuration

Redis connection options:

| Setting | Default | Notes |
|---------|---------|-------|
| `Redis:Host` | Required | Redis server hostname or IP |
| `Redis:Port` | Required | Redis server port (typically 6379) |
| `Redis:Password` | Empty | Optional authentication password |
| `Redis:KeyPrefix` | Required | Prefix for all cache keys in this instance |
| `Redis:AllowAdmin` | false | Allow admin commands (FLUSHDB, CONFIG, etc.) |
| `Redis:AbortOnConnectFail` | true | Abort startup if connection fails |

### Telemetry

Redis cache emits OpenTelemetry metrics with the same tags as memory-based caching. The `layer` tag is always `"distributed"`.

---

## Architecture & Design Patterns

### Cache Key Composition

All caching packages use `DistributedCacheKeyBuilder.Build()` to compose final cache keys:

```
[KeyNamespace:]?[TenantId:]?BaseKey
```

Example:
- Key: `"user:123"`, Namespace: `"myapp"`, Tenant: `"acme"`
  → Final: `"myapp:acme:user:123"`

This ensures:
1. **Isolation:** Different namespaces don't collide
2. **Multi-tenancy:** Tenant data is naturally partitioned
3. **Debugging:** Clear key structure in Redis/Memcached UIs

### Multi-Level Caching Strategy

```
┌─────────────────────────────────┐
│   Request for "user:123"         │
└────────────┬────────────────────┘
             │
             ▼
     ┌──────────────┐
     │ L1: Memory   │ ◄─── Check first (nanoseconds)
     └──────┬───────┘
            │ MISS
            ▼
     ┌──────────────┐
     │ L2: Redis    │ ◄─── Check second (microseconds)
     └──────┬───────┘
            │ MISS
            ▼
     ┌──────────────┐
     │ Factory()    │ ◄─── Compute (blocking)
     └──────┬───────┘
            │ Result
            ▼
     ┌──────────────┐
     │ Write L2     │ ◄─── Populate Redis
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Write L1     │ ◄─── Populate memory
     └──────┬───────┘
            │
            ▼
     ┌──────────────┐
     │ Return data  │
     └──────────────┘
```

**Stampede Protection:** When multiple requests hit simultaneously at L1 + L2 miss, a distributed lock ensures only one invokes the factory. Others await the lock and read the result.

### Tenant-Scoped Caching

By default, `CacheEntryOptions.TenantScoped = true`, which:
- Reads current tenant from `ITenantContext.CurrentTenantId` or `ISystemExecutionContextAccessor`
- Prepends tenant ID to the cache key
- Isolates cached data per tenant without additional logic

**Disable tenant scoping** for shared data:
```csharp
var options = new CacheEntryOptions { TenantScoped = false };
await _cache.SetAsync("shared-config", data, options);
```

### License Control

Distributed cache (Redis, Memcached, etc.) is a **Premium feature**. Free tier gets in-memory fallback:

```csharp
// Internally checks license before Redis ops
licenseGuard.EnsureFeature(FreeTierFeatures.Premium.DistributedCache);
```

If license is missing:
- In-memory cache: Works as expected
- Distributed cache: Throws `MInternalException`

---

## Configuration Examples

### Memory-Only Setup

```json
{
  "CacheConfigs": {
    "CacheType": "Memory",
    "KeyNamespace": "myapp",
    "EnableStampedeProtection": true,
    "DefaultAbsoluteExpirationInMinutes": 1440,
    "TtlJitterPercent": 5
  }
}
```

```csharp
services.AddMultiLevelCaching(configuration);
var cache = serviceProvider.GetRequiredService<IMultiLevelCacheService>();
```

### Redis Distributed Cache

```json
{
  "Redis": {
    "Host": "redis.example.com",
    "Port": "6379",
    "Password": "secret",
    "KeyPrefix": "prod-cache"
  }
}
```

```csharp
var redisConfigs = configuration.GetSection("Redis").Get<RedisConfigs>()!;
services.AddRedis(configuration, redisConfigs);
var cache = serviceProvider.GetRequiredService<IMCacheService>();
```

### Multi-Level (Memory + Redis)

```json
{
  "CacheConfigs": {
    "CacheType": "MultiLevel",
    "KeyNamespace": "myapp",
    "EnableStampedeProtection": true,
    "DefaultAbsoluteExpirationInMinutes": 1440,
    "TtlJitterPercent": 10
  },
  "Redis": {
    "Host": "redis.example.com",
    "Port": "6379",
    "Password": "secret",
    "KeyPrefix": "prod-l2"
  }
}
```

```csharp
// Register both memory and Redis
services.AddMultiLevelCaching(configuration);

var redisConfigs = configuration.GetSection("Redis").Get<RedisConfigs>()!;
services.AddRedis(configuration, redisConfigs);

// Use multi-level service
var cache = serviceProvider.GetRequiredService<IMultiLevelCacheService>();
```

---

## Common Patterns

### Pattern: Cache Invalidation on Update

```csharp
public async Task UpdateProductAsync(Product product, CancellationToken ct)
{
    // Save to database
    await _database.UpdateAsync(product, ct);

    // Invalidate cache
    await _cache.RemoveAsync($"product:{product.Id}", ct);

    // Or: Pre-warm with updated value
    await _cache.SetAsync($"product:{product.Id}", product, ct);
}
```

### Pattern: Tenant-Aware Queries

```csharp
public async Task<IEnumerable<Order>> GetUserOrdersAsync(string userId, CancellationToken ct)
{
    // Automatically includes tenant in key
    return await _cache.GetOrSetAsync(
        key: $"user-orders:{userId}",
        factory: async () => await _database.GetUserOrdersAsync(userId, ct),
        options: new CacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = TimeSpan.FromHours(1),
            TenantScoped = true // Default
        },
        token: ct);
}
```

### Pattern: Graceful Degradation

```csharp
public async Task<Config> GetConfigAsync(CancellationToken ct)
{
    try
    {
        return await _cache.GetOrSetAsync(
            key: "app-config",
            factory: async () => await _configService.LoadAsync(ct),
            token: ct);
    }
    catch (Exception ex)
    {
        _logger.LogWarning(ex, "Cache error; falling back to direct load");
        return await _configService.LoadAsync(ct);
    }
}
```

---

## Troubleshooting

### Cache Not Being Used

**Symptom:** Frequent database hits, no improvement in latency.

**Check:**
1. Verify `IMultiLevelCacheService` or `IMCacheService` is registered
2. Ensure `GetOrSetAsync` is used (not just `GetAsync`)
3. Check license tier (Premium required for Redis)
4. Verify tenant context is set for scoped caches

### Redis Connection Failure

**Symptom:** `MConfigurationException: Invalid Redis: Host and Port are required`

**Fix:**
```json
{
  "Redis": {
    "Host": "localhost",
    "Port": "6379"
  }
}
```

Or set environment variables:
```bash
REDIS_HOST=localhost
REDIS_PORT=6379
```

### Cache Stampede (Many Simultaneous Requests)

**Symptom:** All requests invoke the factory simultaneously on miss.

**Fix:** Enable stampede protection:
```json
{
  "CacheConfigs": {
    "EnableStampedeProtection": true
  }
}
```

### License Error on Distributed Cache

**Symptom:** `[LICENSE] Feature 'distributed-cache' is not available`

**Cause:** Attempting to use Redis/distributed cache with Free license.

**Fix:**
- Upgrade to Premium license, or
- Fall back to memory-only cache, or
- Use `LicenseState.CreateFree()` for development

---

## See Also

- [Tenancy Guide](../../03-guides/multi-tenancy/multi-tenant-guide.md) — Multi-tenant caching patterns
- [OpenTelemetry Integration](../../04-operations/observability-guide.md) — Cache metrics and tracing
- [License Management](../../03-guides/license-governance/license-activation.md) — Feature tier enforcement
