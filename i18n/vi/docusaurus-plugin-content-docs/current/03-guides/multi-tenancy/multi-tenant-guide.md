# Huong dan Multi-Tenant

Thu vien ho tro tach du lieu theo tenant thong qua `TenantContext`. `TenantContextMiddleware` xac dinh `tenantId` cho moi request va luu vao `TenantContext.CurrentTenantId`.

Middleware kiem tra nhieu nguon theo thu tu:

1. Claim JWT `tenant_id` (ten claim mac dinh)
2. Header `x-tenant-id` (ten header mac dinh)
3. Subdomain cua host (vd: `tenant.example.com` => `tenant`)

## Cac chien luoc da-tenant pho bien

| Chien luoc | Mo ta |
|-----------|-------|
| Shared DB + TenantId | Moi tenant dung chung co so du lieu, cac bang co cot `TenantId`. `MDbContext` tu dong loc va tao chi muc cho cot nay. |
| DB-per-tenant | Moi tenant co chuoi ket noi rieng. `ITenantConnectionStringFactory` anh xa `tenantId` sang chuoi ket noi tuong ung. |
| Schema-per-tenant | Dung chung may chu nhung khac schema; co the anh xa `tenantId` sang chuoi ket noi kem schema tuong ung. |

## Cau hinh

```csharp
// Bind from configuration and register when Enabled = true
services.AddTenantContext(builder.Configuration);
app.UseMiddleware<TenantContextMiddleware>();
```

### Tu chinh bo giai ma tenant

`ITenantIdResolver` chi co 1 ham `Task<string?> ResolveTenantIdAsync(HttpContext context)`. Cai dat va dang ky resolver de lay `tenantId` tu nguon khac (gRPC, DB,...).

```csharp
public class HeaderTenantResolver : ITenantIdResolver
{
    public Task<string?> ResolveTenantIdAsync(HttpContext context)
    {
        if (context.Request.Headers.TryGetValue("X-Tenant-Id", out var header))
        {
            return Task.FromResult<string?>(header.ToString());
        }
        return Task.FromResult<string?>(null);
    }
}

// Dang ky
services.AddTenantIdResolver<HeaderTenantResolver>();
```

### Tenant mac dinh va fallback

Neu co the request thieu `tenantId`, cau hinh tenant mac dinh de fallback:

```json
"TenantConfigs": {
  "DefaultTenant": "tenant1"
}
```

Resolver co the doc gia tri nay lam fallback.

## Ket noi rieng cho tung tenant

Anh xa `tenantId` sang chuoi ket noi qua `ITenantConnectionStringFactory`:

```json
"TenantConnectionStrings": {
  "tenant1": "Server=.;Database=tenant1_db;Trusted_Connection=True",
  "tenant2": "Server=.;Database=tenant2_db;Trusted_Connection=True"
}
```

## Schema-per-tenant

Neu DB ho tro schema (vd PostgreSQL), cau hinh `SearchPath` tuong ung:

```json
"TenantConnectionStrings": {
  "tenant1": "Host=...;Database=main;SearchPath=tenant1",
  "tenant2": "Host=...;Database=main;SearchPath=tenant2"
}
```

Hoac thiet lap schema dong trong `OnModelCreating`.

## Logging da-tenant

Serilog "enrich" tu dong them `TenantId`, `UserId`, `CorrelationId` vao log; co the route log theo tenant.

## Vi du

- Quickstart: Multi-Tenant API with JWT & RBAC: [Quickstart Multi-Tenant API](/docs/getting-started/quickstart-multi-tenant-api)
- Ma nguon mau MultiTenant:
  - Program: [Samples/MultiTenant/Program.cs](https://github.com/muonroi/MuonroiBuildingBlock/blob/main/Samples/MultiTenant/Program.cs)
  - Service: [Samples/MultiTenant/TenantExampleService.cs](https://github.com/muonroi/MuonroiBuildingBlock/blob/main/Samples/MultiTenant/TenantExampleService.cs)
