# Multi-Tenant Quota Guide

This guide explains quota setup for rule engine and messaging workloads.

## 1. What is enforced

Supported quota keys (from `QuotaType`):

- `RuleExecutionsPerDay`
- `ConcurrentExecutions`
- `ApiRequestsPerMinute`
- `RuleEvaluationsPerSecond`
- `WorkflowExecutionsPerHour`
- `StorageUsageMB`
- `TotalRules`
- `TotalDecisionTables`
- `TotalWorkflows`
- `MessagesPerMinute` — enforced by `TenantQuotaMessagingFilter` on every publish/send
- `MessagesPerDay` — enforced by `TenantQuotaMessagingFilter` on every publish/send

## 2. Registration

`InfrastructureExtensions` already wires quota services:

- `AddTenantQuotaManagement()`
- `UseQuotaEnforcement()`

## 3. Runtime behavior

- Middleware checks `ApiRequestsPerMinute`.
- `RuleOrchestrator<TContext>` checks and updates:
  - `ConcurrentExecutions`
  - `RuleEvaluationsPerSecond`
  - `RuleExecutionsPerDay`
- `TenantQuotaMessagingFilter` checks and updates:
  - `MessagesPerMinute` (rolling 1-minute window)
  - `MessagesPerDay` (rolling 24-hour window)
- On violation, `QuotaExceededException` is thrown or API returns `429`.

> **Messaging quota note**: `QuotaExceededException` thrown by the messaging filter is **not** a transient infrastructure error. MassTransit will not retry it — the message is dropped. This is intentional to prevent quota circumvention through retry loops.

## 4. Tiers

Preset tiers in `TenantQuotaPresets`:

- `Free`
- `Starter`
- `Professional`
- `Enterprise`

## 5. Storage and tracker

- `ITenantQuotaStore` stores limits and usage.
- `TenantQuotaTracker` uses distributed cache for time-window counters.

## 6. Messaging quota integration

Enable per-tenant message rate limiting by combining the quota system with the messaging stack:

```json
"MessageBusConfigs": {
  "EnableQuotaEnforcement": true
}
```

```csharp
// Registration
builder.Services.AddTenantQuotaManagement();
builder.Services.AddMessageBus(builder.Configuration, ...);
```

Define limits per tenant:

```csharp
await quotaStore.SetAsync(new TenantQuota
{
    TenantId = "tenant-a",
    QuotaType = QuotaType.MessagesPerMinute,
    Limit = 1000
});
await quotaStore.SetAsync(new TenantQuota
{
    TenantId = "tenant-a",
    QuotaType = QuotaType.MessagesPerDay,
    Limit = 50000
});
```

See [Messaging Guide](../integration/messaging-guide.md) for the full messaging pipeline.

## 7. Testing

See `tests/Muonroi.BuildingBlock.Test/Tenancy/TenantQuotaTests.cs` for baseline coverage.

For messaging-specific quota tests see `tests/Muonroi.Messaging.MassTransit.Tests/TenantQuotaMessagingFilterTests.cs`.
