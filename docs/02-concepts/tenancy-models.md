# Tenancy Models

The current ecosystem uses two layers of tenant propagation.

## Canonical context

New code should use `ISystemExecutionContextAccessor` and `ISystemExecutionContext`.

- `TenantId`
- `UserId`
- `Username`
- `CorrelationId`
- `Permissions`
- `SourceType`

## Legacy mirrors

Some runtime packages still mirror values into:

- `TenantContext.CurrentTenantId`
- `UserContext.CurrentUserGuid`
- `UserContext.CurrentUsername`

Use `ContextMirrorScope.Apply(...)` only at transport boundaries that still require the static mirrors.

## Transport boundaries already handled

- `JwtMiddleware`
- `GrpcServerInterceptor`
- `AmqpContextConsumeFilter`
- `TenantContextConsumeFilter`
- `JobContextActivatorFilter`
- `QuartzContextJobListener`

Do not duplicate context initialization where those boundaries already do it.
