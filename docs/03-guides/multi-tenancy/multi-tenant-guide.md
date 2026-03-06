# Multi Tenant Guide

Use `ISystemExecutionContextAccessor` as the canonical tenant and user context for new code.

## Required pattern

```csharp
private readonly ISystemExecutionContextAccessor _contextAccessor;

ISystemExecutionContext context = _contextAccessor.Get();
string? tenantId = context.TenantId;
Guid? userId = Guid.TryParse(context.UserId, out Guid parsed) ? parsed : null;
```

## Transport boundaries

Context is already initialized by these components:

- `JwtMiddleware`
- `GrpcServerInterceptor`
- `AmqpContextConsumeFilter`
- `TenantContextConsumeFilter`
- `JobContextActivatorFilter`
- `QuartzContextJobListener`

## Legacy mirror support

When a downstream package still relies on `TenantContext` or `UserContext`, use:

```csharp
using var scope = new SystemExecutionContextScope(_contextAccessor, new SystemExecutionContext(...));
using var mirror = ContextMirrorScope.Apply(scopeContext, logScopeFactory);
```

## Current quota endpoints

- `GET /api/v1/tenants/{tenantId}/quotas`
- `PUT /api/v1/tenants/{tenantId}/quotas`
- control-plane tenant quota endpoints under `/api/v1/control-plane`
