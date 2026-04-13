# Quota API Reference

Controller: `TenantQuotaController`

Route prefix: `/api/v1/tenants/{tenantId}/quotas`

## Authentication

- Requires authenticated user (`[Authorize]`).
- `PUT limits` requires `Admin` role.
- Access is tenant-scoped via `TenantContext.CurrentTenantId`.

## Endpoints

1. `GET /usage`
- Returns current usage counters (`QuotaUsage`).

2. `GET /limits`
- Returns tenant quota limits (`TenantQuota`).

3. `PUT /limits`
- Admin endpoint to update explicit limits.
- Request body: `TenantQuota`.

4. `POST /upgrade`
- Upgrade tier using preset profile.
- Request body:

```json
{
  "tier": "Enterprise"
}
```

## Responses

- `200 OK`: successful read/update/upgrade
- `403 Forbidden`: tenant mismatch or role mismatch

## Notes

- Tier upgrade applies preset values from `TenantQuotaPresets`.
- Manual `PUT limits` can override preset values for custom tenants.
