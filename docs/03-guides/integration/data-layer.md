# Data Layer Guide

Muonroi provides `MDbContext`, `MRepository<T>`, and `MQuery<T>` as the standard EF Core building blocks.

## `DbSet` and queryable access

`DbSet<T>` is the raw EF Core entry point. Higher-level application code should usually query through `MRepository<T>` or `MQuery<T>`.

Those abstractions typically expose a filtered queryable that excludes soft-deleted rows such as `IsDeleted = false`. You can continue composing LINQ on top of that default query.

## `SaveChangesAsync` and `SaveEntitiesAsync`

`MDbContext` extends save behavior to update timestamps and other framework metadata before persisting.

`SaveEntitiesAsync` is the broader unit-of-work path used when you need both persistence and domain-event dispatching:

1. Update framework-managed metadata.
2. Save entity changes.
3. Dispatch domain events.
4. Commit the surrounding transaction when applicable.

Use `SaveChangesAsync` for straightforward persistence. Use `SaveEntitiesAsync` when a workflow must publish domain events as part of the same business operation.

## Domain events

`MEntity` stores pending domain events. After persistence, `MDbContext` dispatches those events through MediatR.

Typical event shapes include:

- `MEntityCreatedEvent`
- `MEntityChangedEvent`
- `MEntityDeletedEvent`
- Batch variants such as `MEntitiesCreatedEvent`

Batch operations may attach the batch event to one tracked entity so the unit of work can dispatch a single logical event for the full operation.

## Unit of work

`MDbContext` implements `IMUnitOfWork` and exposes transaction helpers such as:

- `BeginTransactionAsync`
- `CommitTransactionAsync`
- `RollbackTransaction`

`MRepository<T>` surfaces the current unit of work through `UnitOfWork`, which lets multiple repositories participate in the same transaction boundary.

## Register the data layer

Use the provided registration helper from `Program.cs`:

```csharp
services.AddDbContextConfigure<MyDbContext, MyPermission>(configuration);
```

That setup can resolve different storage providers based on configuration. Keep production connection strings in secret storage rather than inline appsettings.

## Paging with `MQuery`

`MQuery<T>` commonly exposes `GetPagedAsync` so a query can return items plus paging metadata in one call.

```csharp
IQueryable<MUser> query = _context.Set<MUser>().Where(x => !x.IsDeleted);

MPagedResult<UserDto> result = await GetPagedAsync(
    query,
    pageIndex: 1,
    pageSize: 10,
    selector: x => new UserDto
    {
        Id = x.EntityId,
        Name = x.Username
    });
```

The result usually contains row count, current page, page size, and projected items.
