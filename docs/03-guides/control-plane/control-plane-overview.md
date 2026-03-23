# Control Plane Overview

`muonroi-control-plane` is the private operator service for managed rule delivery, providing RESTful APIs, MCP tools, SignalR real-time updates, and a React dashboard for ruleset lifecycle management.

## Architecture

Control Plane consists of three layers:

1. **Backend API** — ASP.NET 8 Minimal API hosting 40+ endpoints across 12 route groups
2. **MCP Server** — 31 tools for external integrations and CI/CD pipelines
3. **React Dashboard** — 13 pages for operator workflows (ruleset editor, canary rollouts, audit trails, tenant management)

All changes broadcast via SignalR to connected clients for real-time synchronization.

## Base Routes

REST endpoints live under `/api/v1/control-plane` and `/api/v1/rule-catalog`.

Public bootstrap endpoint:
- `GET /api/v1/info` — Returns control-plane runtime metadata (version, activationProof for UI license bootstrap)

---

## 31 MCP Tools by Category

### Ruleset Management (7 tools)

| Tool | Purpose | Auth |
|------|---------|------|
| `muonroi_ruleset_list` | List all workflows with versions and statuses | Bearer JWT or API Key |
| `muonroi_ruleset_get_versions` | Get version history for a workflow | Bearer JWT or API Key |
| `muonroi_ruleset_save` | Save new ruleset version (validate + auto-increment) | Bearer JWT or API Key |
| `muonroi_ruleset_validate` | Validate ruleset JSON without saving | Bearer JWT or API Key |
| `muonroi_ruleset_dry_run` | Execute ruleset with test inputs, return traces | Bearer JWT or API Key |
| `muonroi_ruleset_export` | Export ruleset JSON (active or specific version) | Bearer JWT or API Key |
| `muonroi_ruleset_activate` | Activate a specific version globally | Bearer JWT or API Key |

### Approval Workflow (4 tools)

| Tool | Purpose | Role |
|------|---------|------|
| `muonroi_approval_submit` | Submit version for approval (draft → pending) | Admin |
| `muonroi_approval_approve` | Approve pending version (maker ≠ checker) | Approver |
| `muonroi_approval_reject` | Reject version with reason | Approver |
| `muonroi_ruleset_pending_approvals` | List all pending approvals across workflows | Approver/Admin |

### Canary Rollouts (4 tools)

| Tool | Purpose | Use Case |
|------|---------|----------|
| `muonroi_canary_start` | Start canary for selected tenants or % | Staged rollout |
| `muonroi_canary_list` | List active canaries (filter by workflow) | Monitor rollouts |
| `muonroi_canary_promote` | Promote canary to full rollout | Go live after validation |
| `muonroi_canary_rollback` | Rollback with reason and revert affected tenants | Emergency recovery |

### Decision Tables (6 tools)

| Tool | Purpose | Use Case |
|------|---------|----------|
| `muonroi_decision_table_list` | List all decision tables | Browse catalog |
| `muonroi_decision_table_get` | Get current decision table definition | View table |
| `muonroi_decision_table_get_version` | Get specific version (v1, v2, etc.) | Version history |
| `muonroi_decision_table_get_versions` | Paginated version list (50 per page default) | Compare versions |
| `muonroi_decision_table_diff_versions` | Compare two versions (v1 → v2) | Audit changes |
| `muonroi_decision_table_evaluate` | Test decision table with input facts | Dry-run logic |

### Tenant Management (5 tools)

| Tool | Purpose | Auth |
|------|---------|------|
| `muonroi_tenant_list` | List all managed tenants | Bearer JWT or API Key |
| `muonroi_tenant_get_rulesets` | Get workflow assignments for tenant | Bearer JWT or API Key |
| `muonroi_tenant_get_quota` | Get tenant quota overrides | Bearer JWT or API Key |
| `muonroi_tenant_set_quota` | Upsert tenant quota (max requests/day, workflows, rules) | Bearer JWT or API Key |
| `muonroi_tenant_assign_ruleset` | Assign workflow version to tenant | Bearer JWT or API Key |

### Tenant Isolation (1 tool)

| Tool | Purpose | Requires |
|------|---------|----------|
| `muonroi_tenant_request_isolation_mode` | Request data isolation mode (SharedDb → SeparateSchema → DbPerTenant) | Admin approval |

### Audit (3 tools)

| Tool | Purpose | Access |
|------|---------|--------|
| `muonroi_audit_get_all` | Get all audit entries (paginated) | Bearer JWT or API Key |
| `muonroi_audit_get_workflow` | Filter audit by workflow name | Bearer JWT or API Key |
| `muonroi_audit_get_tenant` | Filter audit by tenant ID | Bearer JWT or API Key |

### Connectors (4 tools)

| Tool | Purpose | Use Case |
|------|---------|----------|
| `muonroi_connector_catalog` | List available connector types (HTTP, gRPC, message-bus, etc.) | Browse options |
| `muonroi_connector_list` | List configured connectors | Manage integrations |
| `muonroi_connector_get` | Get connector config by ID | View details |
| `muonroi_connector_test` | Test connector connectivity | Validate setup |

### Proliferation Engine (5 tools)

| Tool | Purpose | Phase |
|------|---------|-------|
| `muonroi_proliferation_trigger` | Trigger scenario generation for workflow | Analysis |
| `muonroi_proliferation_scenarios` | List generated scenarios with focus areas | Review |
| `muonroi_proliferation_result` | Get detailed result for scenario execution | Results |
| `muonroi_proliferation_stats` | Get proliferation stats (coverage, regression) | Metrics |
| `muonroi_proliferation_lineage` | Get rule lineage and impact graph | Dependencies |

### FEEL Expression (1 tool)

| Tool | Purpose | Editor |
|------|---------|--------|
| `muonroi_feel_autocomplete` | FEEL autocomplete (suggest variables, functions at cursor) | IDE-style suggestions |

---

## 13 Dashboard Pages

| Page | Route | Purpose |
|------|-------|---------|
| Rules List | `/rules` | Browse workflows, search, filter by status (draft/pending/active) |
| Rule Editor | `/rules/{workflow}/{version}` | Edit ruleset JSON, syntax highlight, validate on save |
| Decision Tables | `/decision-tables` | List all decision tables with versions |
| Table Editor | `/decision-tables/{tableId}` | Edit hit policy, conditions, outputs; undo/redo (50 actions) |
| Canary Dashboard | `/canary` | Monitor active canaries, view timeline and tenant distribution |
| Canary Details | `/canary/{rolloutId}` | Drill into metrics, rollback or promote |
| Approval Queue | `/approvals` | List pending approvals, approve/reject with reason |
| Audit Trail | `/audit` | View all changes across workflows, filter by date/user/action |
| Audit (Workflow) | `/audit?workflow={name}` | Filter audit to specific workflow |
| Audit (Tenant) | `/audit?tenantId={id}` | Filter audit to specific tenant |
| Tenant Management | `/tenants` | List tenants, view quota, assign rulesets |
| Tenant Details | `/tenants/{tenantId}` | Set quota limits, request isolation mode, view audit |
| Rule Catalog | `/rule-catalog` | Browse available rule types, search by category |

---

## Key Features

### Make-Checker Approval Workflow

Enforce separation of duties:
1. Admin submits version for approval (draft → pending)
2. Approver (different person) approves or rejects
3. On approval, version becomes available for canary or full activation

See [Ruleset Approval Workflow](./ruleset-approval-workflow.md).

### Canary Rollouts

Stage deployments with confidence:
1. Start canary for 10% of tenants or specific tenant IDs
2. Monitor performance and error rates
3. Promote to full rollout or rollback with reason

See [Canary Rollout Guide](./canary-rollout-guide.md).

### Hot-Reload via SignalR

Real-time synchronization across all connected clients:
- `/hubs/ruleset-changes` — Workflow modifications, activations, canary events
- `/hubs/auth-rule-changes` — Authorization rule updates

See [SignalR Hot-Reload](./signalr-hot-reload.md).

### Tenant-Aware Versioning

Each tenant can run different versions simultaneously:
- Assign workflow version to tenant via `tenant_assign_ruleset`
- Canary targets specific tenants for gradual rollout
- Quota enforcement per tenant (max requests/day, concurrent rules, workflows)

### Audit Trail

Full immutable log of all changes:
- Who made the change (actor, IP, timestamp)
- What changed (workflow, version, field diffs)
- Why (commit message or reason for approval/rejection)
- Where (source: API, dashboard, MCP tool)

---

## API Examples

### List All Workflows

```bash
curl -X GET https://cp.truyentm.xyz/api/v1/control-plane/rulesets \
  -H "Authorization: Bearer $TOKEN"
```

Response:
```json
[
  {
    "workflowName": "claim-approval",
    "activeVersion": 5,
    "versions": [
      { "version": 5, "status": "active", "createdAt": "2026-03-20T10:00:00Z" },
      { "version": 4, "status": "approved", "createdAt": "2026-03-19T14:30:00Z" }
    ]
  }
]
```

### Save and Auto-Activate Ruleset

```bash
curl -X POST https://cp.truyentm.xyz/api/v1/control-plane/rulesets/claim-approval \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "rules": [
      {
        "id": "rule-1",
        "condition": "input.amount > 1000",
        "output": { "requiresReview": true }
      }
    ],
    "activateAfterSave": true,
    "detail": "Add high-value claim threshold"
  }'
```

### Dry-Run with Test Input

```bash
curl -X POST https://cp.truyentm.xyz/api/v1/control-plane/rulesets/claim-approval/dry-run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": {
      "amount": 5000,
      "claimType": "medical"
    }
  }'
```

Response includes execution trace, condition evaluations, and output values.

### Start Canary Rollout

```bash
curl -X POST https://cp.truyentm.xyz/api/v1/control-plane/rulesets/claim-approval/canary \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "version": 5,
    "targetPercentage": 10,
    "actor": "alice@acme.com"
  }'
```

### Submit for Approval

```bash
curl -X POST https://cp.truyentm.xyz/api/v1/control-plane/rulesets/claim-approval/5/submit \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "actor": "admin@acme.com" }'
```

### Get Tenant Quota

```bash
curl -X GET https://cp.truyentm.xyz/api/v1/control-plane/tenants/tenant-123/quota \
  -H "Authorization: Bearer $TOKEN"
```

Response:
```json
{
  "tenantId": "tenant-123",
  "maxRequestsPerDay": 100000,
  "maxWorkflows": 50,
  "maxConcurrentRules": 1000
}
```

### Assign Workflow Version to Tenant

```bash
curl -X POST https://cp.truyentm.xyz/api/v1/control-plane/tenants/tenant-456/rulesets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "workflowName": "claim-approval",
    "version": 4
  }'
```

---

## MCP Tool Integration

Use MCP tools for CI/CD pipelines, external orchestration, or integrations:

```bash
# List all workflows
curl -X POST https://cp.truyentm.xyz/sse/tools/muonroi_ruleset_list \
  -H "Content-Type: application/json" \
  -d '{"$schema": "mcp://muonroi/ruleset_list"}'

# Dry-run a ruleset
curl -X POST https://cp.truyentm.xyz/sse/tools/muonroi_ruleset_dry_run \
  -H "Content-Type: application/json" \
  -d '{
    "workflowName": "claim-approval",
    "inputs": { "amount": 5000, "claimType": "medical" }
  }'

# Approve a pending version
curl -X POST https://cp.truyentm.xyz/sse/tools/muonroi_approval_approve \
  -H "Content-Type: application/json" \
  -d '{
    "workflowName": "claim-approval",
    "version": 5,
    "actor": "approver@acme.com"
  }'

# Get audit trail for workflow
curl -X POST https://cp.truyentm.xyz/sse/tools/muonroi_audit_get_workflow \
  -H "Content-Type: application/json" \
  -d '{
    "workflowName": "claim-approval",
    "pageSize": 20
  }'
```

---

## Related Guides

- [Ruleset Approval Workflow](./ruleset-approval-workflow.md) — Make-checker pattern and approval states
- [Canary Rollout Guide](./canary-rollout-guide.md) — Safe staged deployment
- [SignalR Hot-Reload](./signalr-hot-reload.md) — Real-time client synchronization
- [Decision Table Editor](../../../02-concepts/decision-tables.md) — FEEL expressions and hit policies
- [Rule Catalog & Contracts](../rule-catalog.md) — Available rules and input/output schemas

---

## Deployment

Control Plane is deployed at `https://cp.truyentm.xyz`:
- Backend API: Port 8080 (internal)
- PostgreSQL: `muonroi_rules` database
- Redis: Hot-reload cache (optional)
- SignalR: WebSocket at `/hubs/*`

See [CLAUDE.md](/docs/references/claude-md.md#live-deployment) for VPS details.
