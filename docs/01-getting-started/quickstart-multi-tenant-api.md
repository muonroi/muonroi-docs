# Quickstart: Multi-Tenant API with JWT & RBAC

This guide walks through creating a minimal WebAPI using **Muonroi.BuildingBlock** with multi-tenant support, JWT authentication, and role-based access control. A ready-to-use [Postman collection](/collections/multi-tenant-jwt-rbac.postman_collection.json) is included for quick testing.

## 1. Scaffold the Project

```bash
dotnet new install muonroibase.template
dotnet new muonroibase -n MultiTenantSample
```

## 2. Configure `Program.cs`

Enable multi-tenant services, JWT validation, and permission filtering:

```csharp
builder.Services.AddMultiTenancy(configuration);
builder.Services.AddValidateBearerToken<AppDbContext, MTokenInfo, Permission>(configuration);
builder.Services.AddPermissionFilter<Permission>();
```

Define permissions via an enum `Permission` and decorate controllers with `[MPermission(Permission.Admin)]` as needed.

## 3. Configure `appsettings.json`

Add tenant configuration and JWT settings:

```json
{
  "Jwt": {
    "Issuer": "https://your-auth-server",
    "Audience": "muonroi-api",
    "Key": "YourSuperSecretKey"
  },
  "TenantConfigs": {
    "DefaultTenant": "tenant1",
    "ConnectionStrings": {
      "tenant1": "Server=...;Database=tenant1;...",
      "tenant2": "Server=...;Database=tenant2;..."
    }
  }
}
```

## 4. Run and Test

Start the API and import the [Postman collection](/collections/multi-tenant-jwt-rbac.postman_collection.json). The collection demonstrates:

* Logging in to obtain a JWT
* Calling a tenant-scoped endpoint with RBAC enforcement

```bash
dotnet run --project MultiTenantSample
```

## 5. Next Steps

Refer to the [Multi-Tenant Guide](/docs/guides/multi-tenancy/multi-tenant-guide) and [Permission Guide](/docs/guides/identity-access/permission-guide) for advanced scenarios.

Also see:

- [Getting Started](./getting-started.md): minimal API setup and configuration.
- [Permission Tree Guide](/docs/guides/identity-access/permission-tree-guide): synchronize permission tree and metadata to client applications.
