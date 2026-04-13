using System.Threading;
using System.Threading.Tasks;

namespace ImportExportRules;

public interface IIdentityGrpcClient
{
    Task<UserInfo> GetUserInfoAsync(string userId, CancellationToken ct = default);
}

public interface IContractRestClient
{
    Task<bool> HasValidContractAsync(string tenantId, CancellationToken ct = default);
}

public interface IPermissionGrpcClient
{
    Task<bool> HasPermissionAsync(string userId, string goodsType, CancellationToken ct = default);
}

public sealed record UserInfo(string TenantId, string Role);

// Simple in-memory implementations used for the sample.
public sealed class FakeIdentityGrpcClient : IIdentityGrpcClient
{
    public Task<UserInfo> GetUserInfoAsync(string userId, CancellationToken ct = default)
        => Task.FromResult(new UserInfo("tenant-1", "admin"));
}

public sealed class FakeContractRestClient : IContractRestClient
{
    public Task<bool> HasValidContractAsync(string tenantId, CancellationToken ct = default)
        => Task.FromResult(true);
}

public sealed class FakePermissionGrpcClient : IPermissionGrpcClient
{
    public Task<bool> HasPermissionAsync(string userId, string goodsType, CancellationToken ct = default)
        => Task.FromResult(true);
}
