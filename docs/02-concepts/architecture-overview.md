# Architecture Overview

This document provides a high-level view of the primary components in the library and key processing flows for authentication, authorization, and multi-tenant isolation.

## 1. Authentication and authorization flow

```text
Request
  │
  ├─> JwtMiddleware
  │
  ├─> MAuthenMiddleware
  │
  └─> Controller ──[PermissionFilter]──> Action
```

1. **JwtMiddleware** decodes the JWT to obtain user information.
2. **MAuthenMiddleware** checks `TokenValidityKey` in Redis and initializes `MAuthenticateInfoContext`.
3. **PermissionFilter** verifies access rights before executing the action.

## 2. Multi-tenant flow

```text
Request
  │
  └─> TenantContextMiddleware ──> TenantContext.CurrentTenantId
                                   │
                                   └─> MDbContext (filtered by TenantId)
```

The middleware reads `tenantId` from the header or subdomain and attaches it to `TenantContext`. Queries from `MDbContext` automatically include the `TenantId` condition when present.

## 3. Core database tables

- **MUsers**: user account information.
- **MRoles**: list of roles.
- **MPermissions**: permission definitions mapped to enum values.
- **MRolePermissions**: association between roles and permissions.
- **MUserRoles**: association between users and roles.
- **MRefreshTokens**: stores user refresh tokens.
- **MUserTokens**: external login tokens (OAuth, etc.).
- **MUserLoginAttempts**: tracks failed login attempts.
- **MLanguages**: supported locale codes for localization.
- **MPermissionGroups**: groups permissions by module.
- **MPermissionAuditLogs**: audit trail of permission changes.

See [Database Structure](../05-reference/database-structure.md) for table relationships.

## 4. Layered design

```text
Presentation (API Controllers)
              │
Application Layer (Services, Handlers)
              │
Domain Layer (Entities, Aggregates)
              │
Infrastructure (EF Core, Redis, Kafka, ...)
```

- **Presentation**: controllers, middlewares, and filters.
- **Application**: business logic, command and query handling.
- **Domain**: entities, value objects, and domain rules.
- **Infrastructure**: implementations such as EF Core, Redis, Kafka/RabbitMQ.

## 5. Supporting components

- **Caching**: Redis is used for storing transient data.
- **Background Jobs**: Hangfire or Quartz execute tasks outside the request pipeline.
- **Message Bus**: Kafka or RabbitMQ via MassTransit enables asynchronous communication.

## 6. Further reading

- [Permission Guide](../03-guides/identity-access/permission-guide.md)
- [Multi-Tenant Guide](../03-guides/multi-tenancy/multi-tenant-guide.md)
- [Token Guide](../03-guides/identity-access/token-guide.md)
- [Cache Guide](../03-guides/integration/cache-guide.md)
- [Background Jobs Guide](../04-operations/background-jobs-guide.md)
- [Saga Pattern with Kafka](../03-guides/integration/saga-kafka.md)
