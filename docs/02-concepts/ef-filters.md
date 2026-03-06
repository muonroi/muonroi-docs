# EF Filters

`MDbContext` applies multi-tenant and creator-aware query filters automatically.

## Tenant filter

For entities implementing `ITenantScoped`, `MDbContext` builds a filter equivalent to:

```csharp
e => TenantContext.CurrentTenantId == null || e.TenantId == TenantContext.CurrentTenantId
```

## Creator filter

For `MEntity` types with `CreatorUserId`, `MDbContext` also scopes by the current user mirror when present.

## Operational consequences

- Repository reads should flow through `MRepository<T>` so license checks and soft-delete behavior stay consistent.
- The static tenant mirror still affects EF filters, so transport code must set tenant context before DbContext access.
- New features should use execution-context abstractions first, then mirror only when the older EF path requires it.
