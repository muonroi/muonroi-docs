using Muonroi.BuildingBlock.External.Tenant;

public class TenantExampleService(ITenantContext tenantContext)
{
    private readonly ITenantContext _tenantContext = tenantContext;

    public string? GetTenant() => _tenantContext.TenantId;
}
