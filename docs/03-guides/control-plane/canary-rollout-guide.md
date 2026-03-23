# Canary Rollout Guide

Canary rollout enables safe deployment of new workflow versions by routing traffic to a subset of tenants or a percentage of requests. This guide covers starting, monitoring, promoting, and rolling back canary deployments.

## Overview

A canary rollout:
1. Keeps the active version as the baseline for most traffic
2. Routes a controlled portion to a new candidate version
3. Allows comparison of metrics (error rate, latency) before full promotion
4. Can be promoted to production or rolled back at any time

### When to Use Canary vs. Shadow

- **Canary**: Route real traffic to new version, measure impact, decide to promote or rollback
- **Shadow**: Compare new version without affecting users (see [Shadow Deployment Guide](canary-shadow.md))

---

## Prerequisites

1. A ruleset with at least 2 approved versions
2. Access to control plane API with appropriate tenant credentials
3. Knowledge of workflow name and target version number

---

## Starting a Canary Rollout

### By Percentage (Random Routing)

Deploy to a percentage of all incoming requests:

```bash
curl -X POST https://cp.truyentm.xyz/api/v1/canary/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "workflowName": "loan-approval",
    "version": 3,
    "targetPercentage": 10
  }'
```

**Response:**
```json
{
  "rolloutId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "workflowName": "loan-approval",
  "version": 3,
  "status": "Active",
  "startedAt": "2026-03-20T10:30:00Z",
  "targetPercentage": 10,
  "canaryVersion": 3,
  "activeVersion": 2,
  "affectedTenantsCount": null
}
```

**Behavior:**
- Approximately 10% of requests route to version 3
- 90% continue using the active version (version 2)
- Routing is probabilistic (random assignment per request)
- All tenants participate equally

### By Tenant IDs (Deterministic Beta Testing)

Deploy to specific tenants for controlled beta testing:

```bash
curl -X POST https://cp.truyentm.xyz/api/v1/canary/start \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "workflowName": "loan-approval",
    "version": 3,
    "targetTenantIds": ["tenant-a", "tenant-beta-partner", "internal-qa"]
  }'
```

**Response:**
```json
{
  "rolloutId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "workflowName": "loan-approval",
  "version": 3,
  "status": "Active",
  "startedAt": "2026-03-20T10:35:00Z",
  "targetTenantIds": ["tenant-a", "tenant-beta-partner", "internal-qa"],
  "canaryVersion": 3,
  "activeVersion": 2,
  "affectedTenantsCount": 3
}
```

**Behavior:**
- Only requests from the 3 specified tenants use version 3
- All other tenants continue with the active version
- Tenant-level isolation is exact (no percentage variance)
- Useful for beta testing with trusted customers

### Combining Percentage and Tenant IDs

You can specify both to restrict canary to a subset within specific tenants:

```bash
curl -X POST https://cp.truyentm.xyz/api/v1/canary/start \
  -H "Content-Type: application/json" \
  -d '{
    "workflowName": "loan-approval",
    "version": 3,
    "targetPercentage": 50,
    "targetTenantIds": ["tenant-a", "tenant-beta-partner"]
  }'
```

In this case:
- Only tenant-a and tenant-beta-partner participate
- 50% of their requests → version 3
- 50% → active version

---

## Listing Active Canaries

View all active canary rollouts, optionally filtered by workflow:

```bash
curl https://cp.truyentm.xyz/api/v1/canary \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Filter by workflow:

```bash
curl "https://cp.truyentm.xyz/api/v1/canary?workflowName=loan-approval" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
[
  {
    "rolloutId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    "workflowName": "loan-approval",
    "version": 3,
    "status": "Active",
    "startedAt": "2026-03-20T10:30:00Z",
    "targetPercentage": 10,
    "canaryVersion": 3,
    "activeVersion": 2
  },
  {
    "rolloutId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "workflowName": "payment-processing",
    "version": 2,
    "status": "Active",
    "startedAt": "2026-03-20T11:00:00Z",
    "targetTenantIds": ["tenant-qa"],
    "canaryVersion": 2,
    "activeVersion": 1
  }
]
```

---

## Monitoring Canary Performance

During a canary rollout, use the audit trail and dashboard to monitor:

### Error Rate Comparison

Query the audit trail filtered by version:

```bash
curl "https://cp.truyentm.xyz/api/v1/audit/workflows/loan-approval?version=3&page=1&pageSize=50" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Look for:
- Number of failed executions (HTTP 400, 500 status)
- Error messages and stack traces
- Comparison with version 2 results in the same time window

### Latency Comparison

Check execution times in telemetry:

```bash
curl "https://cp.truyentm.xyz/api/v1/telemetry/loan-approval?metric=duration&version=3" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Metrics to track:
- p50, p95, p99 latency
- Memory usage per execution
- Rule evaluation time vs. action execution time

### Dashboard Monitoring

In the control plane dashboard:
1. Navigate to **Workflows** → **loan-approval**
2. Select **Canary** tab
3. View real-time metrics and comparison charts
4. Filter audit logs by version to see error patterns

---

## Promoting a Canary to Production

Once canary metrics are satisfactory, promote it to become the new active version:

```bash
curl -X POST https://cp.truyentm.xyz/api/v1/canary/f47ac10b-58cc-4372-a567-0e02b2c3d479/promote \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "actor": "devops@acme.com",
    "reason": "Error rate steady at 0.1%, latency improved 15%"
  }'
```

**Response:**
```json
{
  "workflowName": "loan-approval",
  "previousActiveVersion": 2,
  "newActiveVersion": 3,
  "rolloutId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "promotedAt": "2026-03-20T10:45:00Z",
  "actor": "devops@acme.com"
}
```

**Effect:**
- Version 3 becomes the new active version for all tenants
- All traffic routes to version 3 immediately
- Previous version 2 remains available for rollback (for 24h grace period)
- A `RuleSetChanged` event is published via SignalR to notify all clients

---

## Rolling Back a Canary

If issues are detected during canary, roll back immediately:

```bash
curl -X POST https://cp.truyentm.xyz/api/v1/canary/f47ac10b-58cc-4372-a567-0e02b2c3d479/rollback \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "reason": "Error rate increased 5x (0.1% → 0.5%), affecting 50 accounts"
  }'
```

**Response:**
```json
{
  "rolloutId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "workflowName": "loan-approval",
  "status": "RolledBack",
  "rolledBackAt": "2026-03-20T10:42:00Z",
  "reason": "Error rate increased 5x (0.1% → 0.5%), affecting 50 accounts",
  "activeVersionRemains": 2
}
```

**Effect:**
- Canary immediately stops routing traffic
- All traffic returns to the previous active version
- Canary version (3) is not deleted; can be re-tested later
- A rollback event is recorded in the audit trail with the reason

---

## Runtime Behavior

### Version Selection

When a request arrives at the RulesEngineService:

1. **Tenant resolution**: Extract tenant ID from header/path/subdomain
2. **Canary check**: Call `GetCanaryVersionForTenantAsync(workflowName, tenantId)`
   - If canary exists and tenant matches (by percentage or ID list) → return canary version
   - Otherwise → return null (use active version)
3. **Cache lookup**: Construct cache key `canary:{workflowName}:{tenantId}` or `workflow:{workflowName}:{activeVersion}`
4. **Execution**: Load the selected version, execute, record result

### Cache Interaction

Canary versions are cached separately:
- **Canary cache key**: `canary:{workflowName}:{tenantId}` (TTL per tenant)
- **Active cache key**: `workflow:{workflowName}:{activeVersion}` (shared across all tenants using active)
- Promoting a canary invalidates the canary cache and updates the active version key

### SignalR Notifications

When canary state changes, all subscribed clients receive:

```javascript
// On Start
{
  event: "CanaryStarted",
  workflowName: "loan-approval",
  rolloutId: "f47ac10b-...",
  version: 3,
  targetPercentage: 10,
  timestamp: "2026-03-20T10:30:00Z"
}

// On Promote
{
  event: "CanaryPromoted",
  workflowName: "loan-approval",
  newActiveVersion: 3,
  previousActiveVersion: 2,
  timestamp: "2026-03-20T10:45:00Z"
}

// On Rollback
{
  event: "CanaryRolledBack",
  workflowName: "loan-approval",
  rolloutId: "f47ac10b-...",
  reason: "Error rate increased 5x",
  timestamp: "2026-03-20T10:42:00Z"
}
```

Subscribe in your client code (see [SignalR Hot Reload Guide](signalr-hot-reload.md)):

```javascript
const hubConnection = new signalR.HubConnectionBuilder()
  .withUrl("https://cp.truyentm.xyz/hubs/ruleset-changes", {
    accessTokenFactory: () => getToken()
  })
  .withAutomaticReconnect()
  .build();

hubConnection.on("CanaryPromoted", (message) => {
  console.log(`Version ${message.newActiveVersion} is now live`);
  // Invalidate client cache or reload rules
});

hubConnection.start();
```

---

## Best Practices

1. **Start small**: Begin with 5-10% traffic for unfamiliar workflows
2. **Monitor actively**: Watch error rates and latency for at least 1-2 hours
3. **Document your decision**: Include reason in promote/rollback requests for audit
4. **Use tenant IDs for beta**: Deploy to trusted customers first before percentage rollout
5. **Set alerting**: Integrate with your monitoring system to detect anomalies
6. **Test approval flow**: Ensure version is approved before starting canary
7. **Gradual increase**: Consider multiple canary stages (5% → 25% → 100%)

---

## Troubleshooting

### Canary requests still going to old version

Check:
- Canary rollout status via `GET /api/v1/canary?workflowName=X`
- Tenant ID resolution (is `x-tenant-id` header correct?)
- Cache TTL: Canary cache may take up to 5 minutes to warm

### Error rate spike but hard to isolate cause

Use the audit trail with version filter:
```bash
curl "https://cp.truyentm.xyz/api/v1/audit/workflows/loan-approval?version=3" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Compare rule execution logs between version 2 and 3 for differences.

### Rollback not working immediately

Verify:
- Rollback API returned HTTP 200
- Previous active version exists and is not expired
- Check SignalR event arrived on connected clients

---

## Related Guides

- [Ruleset Approval Workflow](ruleset-approval-workflow.md) — How to approve versions before canary
- [Shadow Deployment Guide](canary-shadow.md) — Run parallel tests without affecting users
- [SignalR Hot Reload](signalr-hot-reload.md) — Real-time updates via WebSocket
- [Rule Rollout Guide](../rule-rollout-guide.md) — Broader deployment strategies
