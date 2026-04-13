using Muonroi.BuildingBlock.External.Caching.Distributed.MultiLevel;

public class RedisExampleService(IMultiLevelCacheService cache)
{
    private readonly IMultiLevelCacheService _cache = cache;

    public async Task<string> GetDataAsync()
    {
        return await _cache.GetOrSetAsync("redis-key", () => Task.FromResult("redis value")) ?? string.Empty;
    }
}
