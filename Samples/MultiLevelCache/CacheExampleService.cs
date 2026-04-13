using Muonroi.BuildingBlock.External.Caching.Distributed.MultiLevel;

public class CacheExampleService(IMultiLevelCacheService cache)
{
    private readonly IMultiLevelCacheService _cache = cache;

    public async Task<string> GetDataAsync()
    {
        return await _cache.GetOrSetAsync("sample-key", () => Task.FromResult("cached value")) ?? string.Empty;
    }
}
