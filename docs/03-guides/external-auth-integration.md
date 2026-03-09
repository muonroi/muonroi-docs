# External Auth Integration

Muonroi does not require `Muonroi.Auth` when you already have an external identity provider.

## 1) Implement `IAuthContextFactory`

`IAuthContextFactory` creates `IAuthenticateInfoContext` for current request context.

```csharp
using Muonroi.Core.Abstractions.Interfaces;

public sealed class KeycloakAuthContextFactory(IHttpContextAccessor accessor) : IAuthContextFactory
{
    public IAuthenticateInfoContext Create()
    {
        HttpContext? http = accessor.HttpContext;
        bool isAuthenticated = http?.User.Identity?.IsAuthenticated ?? false;

        return new MAuthenticateInfoContext(isAuthenticated)
        {
            CurrentUserGuid = http?.User.FindFirst("sub")?.Value ?? string.Empty,
            CurrentUsername = http?.User.FindFirst("preferred_username")?.Value ?? string.Empty,
            TenantId = http?.User.FindFirst("tenant_id")?.Value,
            AccessToken = http?.Request.Headers.Authorization.ToString(),
            CorrelationId = http?.TraceIdentifier ?? Guid.NewGuid().ToString("N")
        };
    }
}

services.AddScoped<IAuthContextFactory, KeycloakAuthContextFactory>();
```

Auth0 variant uses the same pattern, typically mapping:

- `sub` -> `CurrentUserGuid`
- `nickname` / `name` -> `CurrentUsername`
- custom claim (for example `https://your-domain/tenant_id`) -> `TenantId`

## 2) Implement `ITenantIdResolver` (multi-tenant)

```csharp
using Muonroi.Tenancy.Core.Legacy;

public sealed class JwtTenantIdResolver : ITenantIdResolver
{
    public Task<string?> ResolveTenantIdAsync(HttpContext context)
    {
        string? tenantId =
            context.User.FindFirst("tenant_id")?.Value ??
            context.Request.Headers["X-Tenant-Id"].FirstOrDefault();

        return Task.FromResult(tenantId);
    }
}

services.AddTenantIdResolver<JwtTenantIdResolver>();
```

## Registration order

When using tenancy:

```csharp
services.AddLicenseProtection(configuration);
services.AddTenantContext(configuration);
```

`AddTenantContext` throws a guided error if `ITenantLicenseFeatureGate` is not registered first.
