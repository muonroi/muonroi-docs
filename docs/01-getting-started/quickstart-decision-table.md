# Decision Table Quickstart

This quickstart focuses on decision tables instead of handwritten rules.

## 1. Register the web package

```csharp
using Muonroi.RuleEngine.DecisionTable.Web;
using Muonroi.Rules;

builder.Services.AddFeelWeb();
builder.Services.AddDecisionTableWeb(o =>
{
    o.PostgresConnectionString = builder.Configuration.GetConnectionString("RuleDb");
});
```

## 2. Create a table

Send `POST /api/v1/decision-tables` with a `DecisionTableModel` payload that contains:

- `name`
- `hitPolicy`
- `inputColumns`
- `outputColumns`
- `rows`

## 3. Validate and save

1. `POST /api/v1/decision-tables/{id}/validate`
2. `PUT /api/v1/decision-tables/{id}`
3. `GET /api/v1/decision-tables/{id}/versions`

## 4. Export when needed

- `GET /api/v1/decision-tables/{id}/export/json`
- `GET /api/v1/decision-tables/{id}/export/dmn`
- `GET /api/v1/decision-tables/{id}/export/excel`

## 5. Add FEEL assistance

The UI widgets call `/api/v1/feel/autocomplete` while authors edit cells, so expose `AddFeelWeb()` in the same host.
