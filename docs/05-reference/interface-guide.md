# Interface Guide

## Time

`IMDateTimeService`

- `Now()`
- `UtcNow()`
- `Today()`
- `UtcToday()`
- `NowTs()`
- `UtcNowTs()`

## JSON

`IMJsonSerializeService`

- `Serialize<T>(T obj)`
- `Deserialize<T>(string text)`

## Logging

`IMLog<T>`

- `BeginProperty(...)`
- `Info(...)`
- `Warn(...)`
- `Error(...)`
- `Debug(...)`

`IMLogContext`

- `PushProperty(...)`
- `PushProperties(...)`

## Execution context

`ISystemExecutionContext`

- `TenantId`
- `UserId`
- `Username`
- `CorrelationId`
- `AccessToken`
- `ApiKey`
- `IsAuthenticated`
- `Permissions`
- `SourceType`

`ISystemExecutionContextAccessor`

- `Get()`
- `Set(...)`
- `Clear()`

## Data layer base types

- `MDbContext`
- `MRepository<T>`
- `ILicenseGuard`
