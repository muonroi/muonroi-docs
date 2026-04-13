using Microsoft.Extensions.Caching.Memory;

public class MemoryExampleService(IMemoryCache cache)
{
    private readonly IMemoryCache _cache = cache;
    private const string CacheKey = "memory-key";

    public string GetData()
    {
        if (!_cache.TryGetValue(CacheKey, out string? value))
        {
            value = "memory value";
            _cache.Set(CacheKey, value, TimeSpan.FromMinutes(5));
        }
        return value;
    }
}
