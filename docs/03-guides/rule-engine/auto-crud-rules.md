# Auto CRUD Rules

`MGenericController<T, TDbContext>` can run business rules around CRUD operations.

## Typical hook points

- `BeforeCreate`
- `AfterCreate`
- `BeforeUpdate`
- `AfterUpdate`
- `BeforeDelete`
- `AfterDelete`

## Authoring pattern

Implement `IRule<CrudContext<TEntity>>` and register the rules through the CRUD rule registration helpers for the entity.

## Use cases

- validation before persistence
- stock or quota side effects after persistence
- audit and notification hooks
- deletion safeguards
