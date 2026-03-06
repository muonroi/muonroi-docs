# Tenant Isolation

Tenant isolation currently combines:

- execution-context propagation
- static tenant mirror compatibility
- `MDbContext` query filters
- tenant-aware SignalR and background-job adapters

## Data layer

`MDbContext` adds tenant filters for `ITenantScoped` entities and indexes `TenantId` where relevant.

## Realtime layer

`RuleSetChangeHub` groups clients by `tenant:{tenantId}` and blocks cross-tenant subscription unless the caller is an admin or approver.

## Operational guidance

- Resolve tenant context before any DbContext access.
- Do not write directly to static tenant fields in new business logic.
- Keep tenant IDs normalized and consistent across HTTP, gRPC, message bus, and job boundaries.
