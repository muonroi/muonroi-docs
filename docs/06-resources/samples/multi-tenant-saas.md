# Multi Tenant SaaS Sample

Suggested sample shape:

- tenant-aware API host
- `ISystemExecutionContextAccessor` for request context
- tenant quota management
- runtime rulesets plus tenant assignment from the control plane
- optional decision-table editor in the frontend
