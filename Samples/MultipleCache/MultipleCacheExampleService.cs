using Microsoft.Extensions.Caching.Memory;
using Muonroi.BuildingBlock.External.Caching.Distributed.MultiLevel;

public class MultipleCacheExampleService(IMemoryCache memory, IMultiLevelCacheService distributed)
{
    private readonly IMemoryCache _memory = memory;
    private readonly IMultiLevelCacheService _distributed = distributed;
    private const string MemoryKey = "multiple-memory";
    private const string DistributedKey = "multiple-distributed";

    public string GetMemoryData()
    {
        if (!_memory.TryGetValue(MemoryKey, out string? value))
        {
            value = "local value";
            _memory.Set(MemoryKey, value, TimeSpan.FromMinutes(5));
        }
        return value;
    }

    public async Task<string> GetDistributedDataAsync()
    {
        return await _distributed.GetOrSetAsync(DistributedKey, () => Task.FromResult("distributed value")) ?? string.Empty;
    }
}
