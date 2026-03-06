# Quickstart

This quickstart provisions the current rule-engine stack: licensed runtime, Postgres-backed rulesets, optional Redis hot reload, and FEEL web endpoints.

## 1. Register the services

```csharp
using Muonroi.Rules;
using Muonroi.RuleEngine.Runtime.Rules;

builder.Services.AddSingleton(new LicenseState
{
    IsValid = true,
    Tier = LicenseTier.Licensed,
    Payload = new LicensePayload
    {
        LicenseId = "local-dev",
        AllowedFeatures = [FreeTierFeatures.Premium.RuleEngine]
    }
});

builder.Services.AddFeelWeb();
builder.Services.AddMRuleEngineWithPostgres(
    builder.Configuration.GetConnectionString("RuleControlPlaneDb")!,
    options => builder.Configuration.GetSection("RuleControlPlane").Bind(options));
```

Optional cross-node hot reload:

```csharp
builder.Services.AddMRuleEngineWithRedisHotReload(
    builder.Configuration.GetConnectionString("Redis")!);
```

## 2. Configure `appsettings.json`

```json
{
  "ConnectionStrings": {
    "RuleControlPlaneDb": "Host=localhost;Database=muonroi_rules;Username=admin;Password=admin",
    "Redis": "localhost:6379"
  },
  "RuleControlPlane": {
    "RequireApproval": true,
    "NotifyOnStateChange": true,
    "EnableCanary": true,
    "AuditSignerKeyId": "ruleset-control-plane"
  }
}
```

## 3. Map the endpoints

```csharp
app.MapControllers();
app.MapHub<RuleSetChangeHub>("/hubs/ruleset-changes");
```

After startup, the current rule-focused endpoints are:

- `POST /api/v1/feel/evaluate`
- `POST /api/v1/feel/autocomplete`
- `GET /api/v1/feel/examples`
- `/api/v1/decision-tables/*`
- `/api/v1/control-plane/*` in the control-plane service

## 4. Verify the stack

1. Call `GET /health`.
2. Call `GET /api/v1/decision-tables`.
3. Post a simple FEEL expression to `/api/v1/feel/evaluate`.
4. If Redis is enabled, connect a SignalR client to `/hubs/ruleset-changes`.

## 5. Next documents

- [Decision Table Quickstart](./quickstart-decision-table.md)
- [Rule Engine Guide](../03-guides/rule-engine/rule-engine-guide.md)
- [Appsettings Guide](../05-reference/appsettings-guide.md)
