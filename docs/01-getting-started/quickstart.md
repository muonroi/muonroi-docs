---
title: Quickstart
sidebar_label: Quickstart
sidebar_position: 2
---

# Quickstart

This guide provisions a complete Muonroi rule-engine stack: license protection, rule engine runtime with Postgres storage, optional Redis hot reload, and REST endpoints for FEEL evaluation and rule management.

:::tip
**First time?** Read [Architecture Overview](../02-concepts/architecture-overview.md) for a 5-minute system overview before starting.
:::

## Step 1: Create the license file

Muonroi requires a valid license key at startup. Create a `licenses` directory in your project root and add the license key file:

**File: `licenses/license.key`**
```json
{
  "LicenseKey": "MRR-xxxxxxxxxxxxxxxxxxxxx"
}
```

:::info
License keys start with `MRR-` and are base64url-encoded. See [License Governance](../03-guides/license-governance/license-setup.md) for obtaining a key.

For **local development only**, you can use `LicenseMode: Offline` in appsettings.json to skip activation. Production must use online activation.
:::

## Step 2: Configure appsettings.json

Add database connections and license configuration to your app settings:

**File: `appsettings.json`**
```json
{
  "ConnectionStrings": {
    "RuleControlPlaneDb": "Host=localhost;Database=muonroi_rules;Username=muonroi;Password=changeme",
    "Redis": "localhost:6379"
  },
  "LicenseConfigs": {
    "Mode": "Online",
    "LicenseFilePath": "licenses/license.key",
    "ActivationProofPath": "licenses/activation_proof.json",
    "FallbackToOnlineActivation": true,
    "Online": {
      "Endpoint": "https://license.truyentm.xyz",
      "EnableHeartbeat": true,
      "HeartbeatIntervalMinutes": 240,
      "RevocationGraceHours": 24,
      "TimeoutSeconds": 10
    }
  },
  "RuleControlPlane": {
    "RequireApproval": true,
    "NotifyOnStateChange": true,
    "EnableCanary": true,
    "AuditSignerKeyId": "ruleset-control-plane"
  }
}
```

## Step 3: Register services in Program.cs

Add the license protection, rule engine, and optional enterprise governance services:

```csharp
using Muonroi.Rules;
using Muonroi.RuleEngine.Runtime.Rules;
using Muonroi.Governance.Enterprise;

var builder = WebApplicationBuilder.CreateBuilder(args);

// Add license protection (all apps, required)
builder.Services.AddLicenseProtection(builder.Configuration);

// Add enterprise governance (anti-tamper, HMAC chain, fail-closed on missing license)
builder.Services.AddMEnterpriseGovernance(builder.Configuration);

// Add rule engine with Postgres backend
builder.Services.AddMRuleEngineWithPostgres(
    builder.Configuration.GetConnectionString("RuleControlPlaneDb")!,
    options => builder.Configuration.GetSection("RuleControlPlane").Bind(options));

// Optional: Enable Redis-backed hot reload for rule changes (cross-server sync)
builder.Services.AddMRuleEngineWithRedisHotReload(
    builder.Configuration.GetConnectionString("Redis")!);

// Add FEEL expression evaluation endpoints
builder.Services.AddFeelWeb();

// Add standard controllers
builder.Services.AddControllers();

var app = builder.Build();

// Map API endpoints
app.MapControllers();

// Map SignalR hub for real-time ruleset change notifications
app.MapHub<RuleSetChangeHub>("/hubs/ruleset-changes");

app.Run();
```

## Step 4: Initialize the database

Ensure PostgreSQL is running with the correct database and schema. The rule engine automatically creates tables on first run. You can verify with:

```bash
psql -h localhost -U muonroi -d muonroi_rules -c "\dt"
```

Expected tables:
- `rule_sets` — ruleset definitions and versions
- `rule_set_audits` — change history
- `rule_engine_executions` — execution logs (if audit enabled)

## Step 5: Verify endpoints

After startup, verify that the rule engine is operational by checking these core endpoints:

### Health Check
```bash
curl http://localhost:5000/health
```

### Rule Engine Endpoints
```bash
# List all rulesets
curl http://localhost:5000/api/v1/rule-sets

# List decision tables
curl http://localhost:5000/api/v1/decision-tables

# Evaluate a FEEL expression
curl -X POST http://localhost:5000/api/v1/feel/evaluate \
  -H "Content-Type: application/json" \
  -d '{"expression":"1 + 1"}'

# Get FEEL expression autocomplete
curl -X POST http://localhost:5000/api/v1/feel/autocomplete \
  -H "Content-Type: application/json" \
  -d '{"expression":"age ","cursor":4}'
```

### Control Plane Endpoints (if enabled)
```bash
# Get ruleset versions
curl http://localhost:5000/api/v1/control-plane/rule-sets/{rulesetId}/versions

# Activate a ruleset version
curl -X POST http://localhost:5000/api/v1/control-plane/rule-sets/{rulesetId}/activate \
  -H "Content-Type: application/json" \
  -d '{"version":2}'
```

### SignalR Connection (optional)
Connect a client to real-time ruleset change events:
```javascript
const connection = new signalR.HubConnectionBuilder()
    .withUrl("http://localhost:5000/hubs/ruleset-changes")
    .withAutomaticReconnect()
    .build();

connection.on("RuleSetChanged", (ruleset) => {
    console.log("Ruleset updated:", ruleset);
});

connection.start();
```

## Step 6: Configure multi-tenant support (optional)

If your app requires multi-tenancy, add tenant context resolution:

```csharp
// In Program.cs, before MapControllers
app.UseMiddleware<TenantResolutionMiddleware>();
```

Tenants are resolved from (in order):
1. HTTP header: `X-Tenant-Id`
2. Route parameter: `{tenantId}`
3. Subdomain: `{tenantId}.yourdomain.com`

See [Multi-Tenancy Guide](../03-guides/multi-tenancy/multi-tenant-setup.md) for detailed configuration.

## Available Endpoints Summary

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Service health check |
| `/api/v1/rule-sets` | GET | List all rulesets |
| `/api/v1/rule-sets/{id}` | GET | Get ruleset details |
| `/api/v1/rule-sets/{id}/versions` | GET | List ruleset versions |
| `/api/v1/feel/evaluate` | POST | Evaluate FEEL expression |
| `/api/v1/feel/autocomplete` | POST | FEEL expression autocomplete |
| `/api/v1/decision-tables` | GET | List decision tables |
| `/api/v1/decision-tables/{id}` | GET | Get decision table |
| `/api/v1/decision-tables/{id}/evaluate` | POST | Evaluate decision table |
| `/api/v1/control-plane/rule-sets/{id}/activate` | POST | Activate ruleset version |
| `/api/v1/control-plane/rule-sets/{id}/approve` | POST | Approve pending ruleset |
| `/hubs/ruleset-changes` | WebSocket | Real-time ruleset change notifications |

## Next Steps

- **[First Rule](./first-rule.md)** — Create your first rule in 5 minutes
- **[Decision Table Quickstart](./quickstart-decision-table.md)** — Build a decision table
- **[Rule Engine Guide](../03-guides/rule-engine/rule-engine-guide.md)** — Deep dive into rule execution
- **[License Governance](../03-guides/license-governance/license-setup.md)** — Production license setup
- **[Multi-Tenancy Guide](../03-guides/multi-tenancy/multi-tenant-setup.md)** — Configure tenant isolation
- **[Sample Projects](../06-resources/samples/)** — LoanApproval, MultiTenantSaaS, and more

## Troubleshooting

### License activation fails
- Verify `licenses/license.key` exists and contains valid `MRR-` key
- Check network connectivity to `https://license.truyentm.xyz`
- Review activation logs in `licenses/activation_proof.json` for error details
- See [License Troubleshooting](../04-operations/troubleshooting.md#license)

### Database connection errors
- Verify PostgreSQL is running: `psql -h localhost -U muonroi -d muonroi_rules`
- Check connection string in `appsettings.json`
- Ensure `muonroi_rules` database exists (create with `CREATE DATABASE muonroi_rules;`)

### Redis hot reload not working
- Verify Redis is running: `redis-cli ping` → should return `PONG`
- Check connection string matches Redis configuration
- See [Operations Guide](../04-operations/deployment.md#redis)
