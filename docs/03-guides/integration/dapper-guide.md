# Dapper Guide

Muonroi can be used with Dapper for read-heavy paths, hand-tuned SQL, or reporting workloads where EF Core is not the best fit.

## Register Dapper services

```csharp
services.AddDapper();
services.AddSingleton<IConnectionStringProvider, MConnectionStringProvider>();
MSqlMapperTypeExtensions.RegisterDapperHandlers();
```

`MConnectionStringProvider` resolves connection strings from configuration or a secret-backed provider. `RegisterDapperHandlers` adds custom type handlers used by the stack.

If you want Redis-backed caching for Dapper queries, add it explicitly:

```csharp
services.AddDapperCaching(configuration, redisConfigs);
```

## Run paged queries

Use `MDapperCommand` plus the Dapper helper extensions for paging and materialization.

```csharp
public class UserQueries(IDapper dapper)
{
    public Task<PageResult<UserDto>> GetUsersAsync(int page, int size)
    {
        MDapperCommand command = new()
        {
            CommandText = "SELECT * FROM Users ORDER BY Id"
        };

        string countSql = "SELECT COUNT(1) FROM Users";
        return dapper.QueryPageAsync<UserDto>(command, countSql, page, size);
    }
}
```

`QueryPageAsync` returns the result items plus total-record metadata.

## When to use Dapper

Use Dapper when:

- SQL shape matters and you want exact control.
- The query is read-only and performance-sensitive.
- The result does not need change tracking.

Prefer EF Core when:

- You need rich domain modeling.
- You rely on migrations and change tracking.
- The query is simple enough that LINQ remains clearer than handwritten SQL.
