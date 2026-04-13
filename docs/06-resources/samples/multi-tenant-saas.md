# Multi Tenant SaaS Sample

Source path:

- `muonroi-building-block/samples/MultiTenantSaaS`

## What this demonstrates

- Tenant-specific rule registration with `[TenantRuleGroup("pricing", "<tenant>")]`.
- 3 tenant outcomes from the same endpoint: `tenant-starter`, `tenant-pro`, `tenant-enterprise`.
- Optional enterprise control-plane integration:
  - `AddMRuleEngineWithPostgres(...)`
  - `AddMRuleEngineWithRedisHotReload(...)`

## Quick run

```powershell
cd <workspace-root>\muonroi-building-block\samples\MultiTenantSaaS\src\MultiTenant.Api
dotnet restore
dotnet run
```

## Test requests

```powershell
curl -X POST http://localhost:5000/api/pricing/tenant-starter -H "Content-Type: application/json" -d '{"basePrice":20,"seatCount":30,"annualCommitment":false}'
curl -X POST http://localhost:5000/api/pricing/tenant-pro -H "Content-Type: application/json" -d '{"basePrice":20,"seatCount":30,"annualCommitment":false}'
curl -X POST http://localhost:5000/api/pricing/tenant-enterprise -H "Content-Type: application/json" -d '{"basePrice":20,"seatCount":30,"annualCommitment":false}'
```
