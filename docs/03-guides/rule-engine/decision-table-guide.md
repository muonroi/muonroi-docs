# Decision Table Guide

`DecisionTableModel` is a DMN-style structure with:

- `Id`
- `Name`
- `Description`
- `HitPolicy`
- `InputColumns`
- `OutputColumns`
- `Rows`
- `Version`
- `TenantId`
- `CreatedAt`
- `ModifiedAt`

## Supported hit policies

- `First`
- `Unique`
- `Collect`
- `Priority`
- `OutputOrder`
- `CollectSum`
- `CollectMin`
- `CollectMax`
- `CollectCount`

## Persistence

`DecisionTableEngineOptions` currently supports:

- `PostgresConnectionString`
- `SqlServerConnectionString`
- `Schema`
- `AutoMigrateDatabase`

The control-plane service wires Postgres explicitly:

```csharp
builder.Services.AddDecisionTableWeb(o => o.PostgresConnectionString = connectionString);
```

## Current capabilities

- create, update, delete, and list tables
- bulk upsert and bulk delete
- Excel, JSON, and DMN import
- JSON, DMN/XML, and CSV export
- server-side execute endpoint (`POST /api/v1/decision-tables/{id}/execute`)
- row reordering
- version history
- version diff (`GET /api/v1/decision-tables/{id}/versions/{v1}/diff/{v2}`)
- audit trail
- FEEL autocomplete + FEEL expression validation (`POST /api/v1/decision-tables/{id}/feel/validate-expression`)

## UI wiring

The decision-table UI contributor configures:

- `mu-decision-table`
- `apiBase=/api/v1/decision-tables`
- `validateEndpoint=/api/v1/decision-tables/{id}/validate`
- `historyEndpoint=/api/v1/decision-tables/{id}/versions`
- `diffEndpoint=/api/v1/decision-tables/{id}/versions/{v1}/diff/{v2}`
- `auditEndpoint=/api/v1/decision-tables/{id}/audit`
- `feelEndpoint=/api/v1/feel/autocomplete`
- `enableVersionDiff=true`
