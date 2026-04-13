# Control Plane Operator Guide

The Muonroi control plane is the private operator-facing service for managing rule sets, approvals, canary rollout, audit, tenant assignment, decision tables, API catalog snapshots, and dashboard bootstrap data.

This guide is written for operators and platform engineers running the service, not for library consumers. It assumes you control deployment, database access, and environment configuration for the API and dashboard.

## Architecture overview

The control plane has two runtime surfaces:

- `Muonroi.ControlPlane.Api`, an ASP.NET 8 API
- `control-plane-dashboard`, a React dashboard

The API wires together:

- rule set persistence through PostgreSQL
- approval and activation workflows
- canary rollout services
- audit recording
- decision table storage and version history
- UI catalog scanning and snapshot capture
- SignalR notifications
- public runtime info at `/api/v1/info`

At startup the API currently does all of the following:

- loads `ControlPlaneAuth` options
- loads `ControlPlaneRuntimeInfo` options
- requires `ConnectionStrings:RuleControlPlaneDb`
- enables decision table storage through `AddDecisionTableWeb(o => o.PostgresConnectionString = connectionString)`
- enables rule engine persistence through `AddMRuleEngineWithPostgres(...)`
- optionally enables Redis hot reload when `ConnectionStrings:Redis` is populated

High-level topology:

```text
Dashboard -> ControlPlane.Api -> PostgreSQL
                          -> Redis (optional, hot reload fan-out)
                          -> SignalR hub -> dashboard clients
```

Cross-reference the product overview in [Control Plane Overview](../03-guides/control-plane/control-plane-overview.md).

## Deployment checklist

Before first boot, confirm:

- PostgreSQL is reachable and the `RuleControlPlaneDb` connection string is correct
- an audit private key PEM exists outside development if you enable signed audit
- `ControlPlaneRuntimeInfo` matches the commercial runtime state you want exposed to the dashboard
- JWT auth is configured if `DisableAuthorization` is `false`
- Redis is available if you expect multi-node hot reload

## Minimal runtime configuration

The API reads these application settings today.

### Connection strings

| Key | Required | Notes |
| --- | --- | --- |
| `ConnectionStrings:RuleControlPlaneDb` | Yes | PostgreSQL backing rulesets and decision tables |
| `ConnectionStrings:Redis` | No | Enables Redis-backed hot reload if non-empty |

### `ControlPlaneAuth`

| Key | Required | Notes |
| --- | --- | --- |
| `DisableAuthorization` | No | Defaults to `true`; set `false` for real operator auth |
| `SigningKey` | Yes when auth enabled | JWT signing key |
| `Issuer` | Recommended | JWT issuer |
| `Audience` | Recommended | JWT audience |

### `ControlPlaneRuntimeInfo`

| Key | Required | Notes |
| --- | --- | --- |
| `Version` | No | Empty means assembly version is used |
| `ActivationProof` | No | Returned by `/api/v1/info` for UI bootstrap |
| `Tier` | No | Defaults to `Free`; dashboard uses it for runtime license state |
| `IsValid` | No | Must reflect whether commercial runtime proof is valid |
| `LicenseId` | No | Metadata only, shown in runtime state |
| `AllowedFeatures` | No | Feature list injected into runtime license state |

### `RuleControlPlane`

| Key | Required | Notes |
| --- | --- | --- |
| `RequireApproval` | No | Maker-checker flow toggle |
| `NotifyOnStateChange` | No | Controls change notifications |
| `EnableCanary` | No | Turns on canary rollout endpoints and behavior |
| `AuditSignerKeyId` | Recommended | Key id written into signed audit output |
| `AuditPrivateKeyPemPath` | Required outside Development/Testing | API throws if missing in non-dev environments |

### Platform variables

These are not custom Muonroi keys, but you will normally set them:

- `ASPNETCORE_ENVIRONMENT`
- `ASPNETCORE_URLS`
- container-level secrets for the DB password and JWT signing key

## Example `appsettings.json`

This is the current shape used by the API:

```json
{
  "ConnectionStrings": {
    "RuleControlPlaneDb": "Host=localhost;Database=muonroi_rules;Username=admin;Password=admin",
    "Redis": ""
  },
  "ControlPlaneAuth": {
    "DisableAuthorization": true,
    "SigningKey": "dev-control-plane-signing-key-change-this",
    "Issuer": "muonroi-control-plane",
    "Audience": "muonroi-control-plane-clients"
  },
  "ControlPlaneRuntimeInfo": {
    "Version": "",
    "ActivationProof": "",
    "Tier": "Enterprise",
    "IsValid": true,
    "LicenseId": "control-plane-runtime",
    "AllowedFeatures": ["*"]
  },
  "RuleControlPlane": {
    "RequireApproval": true,
    "NotifyOnStateChange": true,
    "EnableCanary": true,
    "AuditSignerKeyId": "ruleset-control-plane",
    "AuditPrivateKeyPemPath": "./secrets/audit-private.pem"
  }
}
```

## Docker compose example

The repos currently ship application Dockerfiles, but in many teams the API image is published by CI. The most stable operator pattern is to define infrastructure explicitly and inject the already-built application image.

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: muonroi_rules
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: admin
    ports:
      - "5432:5432"
    volumes:
      - cp-postgres:/var/lib/postgresql/data

  redis:
    image: redis:7
    ports:
      - "6379:6379"

  control-plane-api:
    image: ghcr.io/muonroi/muonroi-control-plane:develop
    depends_on:
      - postgres
      - redis
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      ASPNETCORE_URLS: http://+:8080
      ConnectionStrings__RuleControlPlaneDb: Host=postgres;Database=muonroi_rules;Username=admin;Password=admin
      ConnectionStrings__Redis: redis:6379
      ControlPlaneAuth__DisableAuthorization: "false"
      ControlPlaneAuth__SigningKey: replace-me
      ControlPlaneAuth__Issuer: muonroi-control-plane
      ControlPlaneAuth__Audience: muonroi-control-plane-clients
      RuleControlPlane__RequireApproval: "true"
      RuleControlPlane__NotifyOnStateChange: "true"
      RuleControlPlane__EnableCanary: "true"
      RuleControlPlane__AuditSignerKeyId: ruleset-control-plane
      RuleControlPlane__AuditPrivateKeyPemPath: /run/secrets/audit-private.pem
    ports:
      - "8080:8080"
    secrets:
      - audit-private.pem

volumes:
  cp-postgres:

secrets:
  audit-private.pem:
    file: ./secrets/audit-private.pem
```

If you run the dashboard separately, point it at the API base URL and make sure `/api/v1/info` is reachable so the commercial UI components can bootstrap their license state.

## Authorization model

The API defines three effective policies:

- `cp.admin`
- `cp.approver`
- `cp.viewer`

Current behavior:

- `cp.admin` can do everything
- `cp.approver` can approve, activate, and run canary operations
- `cp.viewer` can read operator data

Permissions can come from:

- roles
- claims with the Muonroi permission claim type

If authorization is disabled, the API still resolves tenant and actor information from headers and defaults.

Useful request headers today:

- `x-tenant-id`
- `X-Actor`

## Tenant and actor resolution

Tenant resolution order in the current API is:

1. user claim `tenant_id`
2. request header `x-tenant-id`
3. ambient `TenantContext.CurrentTenantId`
4. fallback to `"default"`

Actor resolution order is:

1. explicit request `actor`
2. authenticated user name
3. `X-Actor` header
4. fallback to `"control-plane"`

Operationally:

- always send tenant id explicitly from the dashboard or gateway
- always stamp actor identity when using scripts or automation

## Admin flow: create tenant -> assign rules -> approve -> activate

The control plane is easiest to reason about if you separate content from rollout.

Typical flow:

1. create or identify a tenant
2. save a workflow as draft
3. assign the workflow to the tenant
4. submit the draft for approval
5. approve it
6. activate directly or start a canary

### Save a ruleset

```http
POST /api/v1/control-plane/rulesets/{workflow}
```

Important request fields:

- `ruleSet` as JSON
- `activateAfterSave`
- optional `actor`
- optional `detail`

### Assign it to a tenant

Use the tenant rule endpoints to map a workflow and version to a tenant. The API also supports tenant quota operations from the same area.

### Submit and approve

Once approval is required, save does not immediately make the version active. The version moves through the maker-checker flow.

### Activate

```http
POST /api/v1/control-plane/rulesets/{workflow}/{version}/activate
```

Only activate versions that already passed approval in a governed environment.

## Approval workflow

The current status model follows the standard operator flow:

- `Draft`
- `PendingApproval`
- `Approved`
- `Active`

Recommended operator split:

- maker authors and submits
- approver reviews and accepts or rejects
- activation is separate and auditable

Use these endpoints together:

- `POST /api/v1/control-plane/rulesets/{workflow}`
- `POST /api/v1/control-plane/approvals/{workflow}/{version}/submit`
- `POST /api/v1/control-plane/approvals/{workflow}/{version}/approve`
- `POST /api/v1/control-plane/approvals/{workflow}/{version}/reject`
- `GET /api/v1/control-plane/rulesets/pending-approvals`

Good operating discipline:

- require a non-empty `detail` when submitting, approving, or rejecting
- keep maker and approver identities separate
- do not use direct activation as a substitute for approval in production

Cross-reference [Ruleset Approval Workflow](../03-guides/control-plane/ruleset-approval-workflow.md).

## Canary rollout

Canary rollout lets you expose a new workflow version gradually.

Operator use cases:

- tenant allow-list rollout
- percentage-based validation
- rollback without rebuilding the original version

Typical step-by-step flow:

1. deploy and approve version `N`
2. start a canary for a small tenant segment or low percentage
3. monitor errors, audit, and operator feedback
4. promote or rollback

Useful endpoints:

- `POST /api/v1/control-plane/canary/{workflow}/{version}/start`
- `GET /api/v1/control-plane/canary/{workflow}`
- `POST /api/v1/control-plane/canary/{workflow}/promote`
- `POST /api/v1/control-plane/canary/{workflow}/rollback`

Practical advice:

- start with named tenants for high-value accounts
- use percentage rollout only after you trust telemetry and tenant assignment
- keep a rollback runbook ready before starting the canary

Cross-reference [Canary Rollout Guide](../03-guides/control-plane/canary-rollout-guide.md) and [Canary Shadow](./canary-shadow.md).

## Hot reload and propagation flow

The operator story is not complete until the change reaches runtime nodes.

Current hot-reload path:

1. operator saves or activates a rule set
2. API persists the change in PostgreSQL
3. if Redis is configured, the API publishes the change for cross-node invalidation
4. application nodes reload the relevant workflow
5. SignalR notifies dashboard clients

This split matters:

- PostgreSQL is the source of truth
- Redis is the fan-out mechanism
- SignalR is the dashboard feedback channel

If `ConnectionStrings:Redis` is empty:

- the API still works
- single-node or polling-based scenarios remain fine
- cross-node freshness is weaker

Cross-reference [SignalR Hot Reload](../03-guides/control-plane/signalr-hot-reload.md).

## Audit trail

The control plane records operator actions in the rules database and can sign audit entries using the configured RSA private key.

Important operational points:

- `RuleControlPlane:AuditPrivateKeyPemPath` is mandatory outside development and testing
- every save, approval, rejection, activation, canary action, or tenant assignment should carry actor context
- the audit stream is only trustworthy if actor identity is trustworthy

What to review during incident response:

- who submitted the version
- who approved it
- which tenant was affected
- when the version became active
- whether a rollback was performed

Pair the audit log with deployment logs and dashboard SignalR events when reconstructing an incident timeline.

## Decision table management

The control plane hosts decision table CRUD and version history alongside rulesets. That gives operators one place to manage both rule JSON and table-driven logic.

Notable endpoints:

- `POST /api/v1/decision-tables/feel-autocomplete`
- `GET /api/v1/decision-tables/{id}/versions`
- `GET /api/v1/decision-tables/{id}/versions/{v}`
- `GET /api/v1/decision-tables/{id}/versions/{v1}/diff/{v2}`

Operational guidance:

- treat decision table versions like code artifacts
- review diffs before promotion
- use the version endpoints instead of comparing ad hoc exports manually

If the UI exposes the decision table widget and the flow designer together, make sure both surfaces point at the same API base URL and tenant context.

## API catalog and flow view

The dashboard now also exposes:

- a Flow View inside the rule editor for graph-based authoring of rulesets
- an API Catalog page backed by `/api/v1/ui-catalog`
- snapshot capture for catalog history so operators can record endpoint-to-rule bindings over time

Useful catalog endpoints:

- `GET /api/v1/ui-catalog/apis`
- `GET /api/v1/ui-catalog/bindings`
- `GET /api/v1/ui-catalog/graph`
- `GET /api/v1/ui-catalog/snapshots`
- `POST /api/v1/ui-catalog/snapshots/capture`

Operational guidance:

- use the catalog page to confirm an endpoint is wired to the expected workflow after rule changes
- capture a snapshot before and after high-risk rollout windows if you need a lightweight binding history
- keep the Flow View and JSON View pointed at the same tenant and API base so edits stay consistent

## Useful read endpoints

The following endpoints are commonly used for health and diagnostics:

- `GET /api/v1/info`
- `GET /api/v1/control-plane/me`
- `GET /api/v1/control-plane/rulesets`
- `GET /api/v1/control-plane/rulesets/{workflow}/versions`
- `GET /api/v1/control-plane/rulesets/{workflow}/export`
- `GET /api/v1/ui-catalog/graph`
- `GET /api/v1/ui-catalog/snapshots`

## Troubleshooting

### Startup fails with missing `RuleControlPlaneDb`

Cause:

- `ConnectionStrings:RuleControlPlaneDb` is empty or not injected

Fix:

- provide the connection string
- confirm the environment variable path uses double underscores in containers

### Startup fails outside development with missing audit key

Cause:

- `RuleControlPlane:AuditPrivateKeyPemPath` is not set or the file is unreadable

Fix:

- mount the PEM as a secret
- confirm the path exists inside the container

### Dashboard loads but premium widgets stay gated

Cause:

- `/api/v1/info` returns no valid activation proof or `isValid=false`

Fix:

- update `ControlPlaneRuntimeInfo`
- verify the runtime proof used by the dashboard bootstrap

### Activation works on one node but not others

Cause:

- Redis is missing or misconfigured, or application nodes are not wired to hot reload

Fix:

- verify `ConnectionStrings:Redis`
- check Redis connectivity from all nodes
- confirm consumers are subscribed to the rule change channel

### Pending approvals list is empty unexpectedly

Cause:

- save happened with `activateAfterSave=true`
- approval is disabled
- wrong tenant was resolved

Fix:

- review `RequireApproval`
- inspect tenant headers and claims
- query the workflow version list directly

### Wrong tenant receives a rule

Cause:

- missing or incorrect `x-tenant-id`
- script used default tenant fallback

Fix:

- stamp tenant id on every operator request
- avoid relying on the `"default"` fallback in production automation

## Recommended next reading

- [Control Plane Overview](../03-guides/control-plane/control-plane-overview.md)
- [Ruleset Approval Workflow](../03-guides/control-plane/ruleset-approval-workflow.md)
- [Canary Rollout Guide](../03-guides/control-plane/canary-rollout-guide.md)
- [SignalR Hot Reload](../03-guides/control-plane/signalr-hot-reload.md)
- [Troubleshooting Guide](./troubleshooting-guide.md)
