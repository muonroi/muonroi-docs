# Backend Architecture Guide

This guide summarizes the backend building blocks commonly used in Muonroi-based ASP.NET applications: repositories, controllers, handlers, middleware, and zero-code CRUD endpoints.

## Cross-entity access inside repositories

`MRepository<T>` is the default repository base type. Use it for entity-focused behavior and keep the repository aligned with one aggregate or one bounded business concern.

When a workflow needs data from multiple tables, inject the current `MDbContext` or use `UnitOfWork` from the repository base class. That is acceptable for transaction-heavy workflows, but it should stay explicit and limited. Do not turn every repository into a generic query hub.

```csharp
List<MUser> users = await (
    from role in _dbContext.Set<MRole>().AsNoTracking()
    join userRole in _dbContext.Set<MUserRole>().AsNoTracking()
        on role.EntityId equals userRole.RoleId
    join user in _dbContext.Set<MUser>().AsNoTracking()
        on userRole.UserId equals user.EntityId
    where role.EntityId == roleId
        && !user.IsDeleted
        && !role.IsDeleted
        && !userRole.IsDeleted
    select user
).ToListAsync(cancellationToken);
```

If the result must be returned to the API layer, map it to a DTO in the handler or service boundary.

## Common extension methods

The platform includes helper extensions for common backend tasks. Typical examples are string normalization, Base64 conversion, locking helpers, and bulk insert operations.

```csharp
string normalized = "sample value".NormalizeString();
string encoded = "hello".ToBase64String();
await dbContext.BulkInsertAsync(entities);
```

Use extension methods only when they make the call site more readable. If the behavior is business-specific, prefer a named domain service instead.

## Base controller pattern

`MControllerBase` provides a thin API surface with shared infrastructure already injected.

```csharp
[ApiController]
[Route("api/v{version:apiVersion}/[controller]")]
[Authorize]
public abstract class MControllerBase(
    IMediator mediator,
    ILogger logger,
    IMapper mapper) : ControllerBase
```

The base class typically exposes `Mediator`, `Logger`, and `Mapper`. Controllers should stay orchestration-only: validate input shape, send the request to a handler, and return the response.

If your APIs return `MResponse<T>`, you can apply `MControllerBaseConvention` to centralize `ProducesResponseType` metadata.

## Handler pattern

Business workflows usually live in handlers derived from `BaseCommandHandler` or `MBaseHandler`. Keep handlers focused on one use case and one response contract.

```csharp
public abstract class BaseCommandHandler(
    IMapper mapper,
    MAuthenticateInfoContext tokenInfo,
    IAuthenticateRepository authenticateRepository,
    ILogger logger,
    IMediator mediator,
    MPaginationConfig paginationConfig)
```

Handlers can use helper methods such as `SendAsync` and `PublishAsync`, plus mapping and logging infrastructure. A typical flow is:

1. Validate the request.
2. Execute business logic.
3. Persist state changes.
4. Return `MResponse<T>` or publish follow-up events.

Split a handler once it starts carrying unrelated branches or multiple responsibilities.

## Authentication and authorization middleware

Legacy applications may still use `JwtMiddleware`, `MAuthenMiddleware`, and `MCookieAuthMiddleware`.

The usual request flow is:

1. `JwtMiddleware` reads the bearer token and builds `HttpContext.User`.
2. `MAuthenMiddleware` validates token state, refresh token state, or token validity keys.
3. Downstream handlers and controllers read the authenticated identity from the request context.

```csharp
app.UseMiddleware<JwtMiddleware>();
app.UseMiddleware<MAuthenMiddleware<MyDbContext, MyPermission>>();
```

For browser-based BFF-style flows, `MCookieAuthMiddleware` can copy the access token from a cookie into the standard `Authorization` header path.

```csharp
app.UseMiddleware<MCookieAuthMiddleware>();
```

In new code, prefer request-scoped abstractions such as `ISystemExecutionContextAccessor` over static ambient state.

## Error handling

`MExceptionMiddleware` standardizes exception logging and JSON error responses.

```csharp
app.UseMiddleware<MExceptionMiddleware>();
```

Place it near the start of the pipeline so unexpected exceptions are captured consistently.

If you want the framework defaults quickly, `UseDefaultMiddleware` wires the common middleware chain:

```csharp
app.UseDefaultMiddleware<MyDbContext, MyPermission>();
```

Add `JwtMiddleware` and tenant middleware explicitly if your application requires them.

## Zero-code CRUD controllers

The stack can generate basic CRUD APIs automatically for entities derived from `MEntity`.

```csharp
public class Product : MEntity
{
    public string Name { get; set; } = string.Empty;
    public decimal Price { get; set; }
}
```

At startup, `GenericControllerFeatureProvider` can expose endpoints such as:

- `GET /api/v1/Product`
- `GET /api/v1/Product/{id}`
- `POST /api/v1/Product`
- `PUT /api/v1/Product`
- `DELETE /api/v1/Product/{id}`

This is useful for admin-style modules and internal tooling. For public or business-critical APIs, explicit controllers are usually easier to evolve and review.
