# Caching Guide

Muonroi supports memory caching, Redis caching, and multi-level caching through a single configuration model.

## Enable multi-level caching

Use the built-in registration helper to wire memory cache plus Redis-backed distributed cache.

```csharp
services.AddMultiLevelCaching(configuration);
```

The typical configuration sources are `CacheConfigs` and `RedisConfigs`.

## Common patterns

- `MemoryCache`: fastest option for single-node or short-lived local caching.
- `RedisCache`: shared distributed cache for multi-node deployments.
- `MultiLevelCache`: memory cache in front of Redis to reduce round trips.
- Mixed repository caching: use in-process caching for hot reads and distributed cache for cross-node consistency.

## Repository usage

Repository and service code can use cache helpers such as `MCacheExtension` to read-through or write-through cached values.

Use caching for:

- Stable lookup tables
- Permission catalogs
- Tenant metadata
- Rate-limited external API results

Avoid caching:

- Security-sensitive state without explicit invalidation strategy
- Data that changes every request
- Large result sets with weak cache keys

## Operational guidance

- Define clear TTLs per cache category.
- Prefix keys with domain context such as tenant and feature area.
- Invalidate cache entries when writes change the underlying contract.
- Treat Redis as an infrastructure dependency and monitor availability, latency, and eviction pressure.
