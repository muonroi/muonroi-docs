---
title: Advanced Patterns
sidebar_label: Advanced Patterns
sidebar_position: 14
---

# Advanced Patterns

This guide covers advanced execution topologies, flow graph routing, compensation patterns, and mediator notifications that enable complex rule orchestration scenarios. Advanced patterns matter when you need deterministic ordering, cross-node hot reload, transactional semantics, or audit-driven side effects.

## Overview

The rule engine supports three execution topologies:

1. **Code-first rules** — compile-time safety, typed `TContext`, version-stable
2. **Runtime rulesets** — operator-managed changes, hot-reloadable, operator governance
3. **Decision tables** — business-friendly tabular authoring, FEEL-based cell evaluation

Choose based on safety requirements, change cadence, and business domain.

---

## Flow Graph Execution

### What is a Flow Graph?

A flow graph is a directed acyclic graph (DAG) of rule nodes (conditions, actions, decision tables, sub-flows) connected by edges that define execution order and routing logic. Rule Studio exports flow graphs as JSON; the runtime deserializes and executes them using **Kahn's topological sort** algorithm.

### RuleGraphParser: Topological Ordering

`RuleGraphParser` converts a serialized flow graph JSON into an ordered list of `RuleGraphEntry` objects:

```csharp
public sealed class RuleGraphParser(IMJsonSerializeService json)
{
    public IReadOnlyList<RuleGraphEntry> Parse(string graphJson)
    {
        // 1. Extract all executable nodes (type: condition, action, decision-table, sub-flow, liquid, connector)
        // 2. Build incoming edge map for each node
        // 3. Apply Kahn's topological sort
        // 4. Classify edge types: always, on-false, on-error
        // 5. Return ordered RuleGraphEntry[] with routing metadata
    }
}
```

**Executable node types:**
- `condition` — FEEL/JavaScript expression, writes output fields to FactBag
- `action` — side-effect node, always executes
- `decision-table` — tabular decision logic, hit policies (First/Unique/Collect/Priority)
- `sub-flow` — nested flow graph execution
- `liquid` — template-based text generation (outputs string)
- `connector` — external HTTP request or webhook

**Excluded nodes:** Trigger, End, Start — flow control only.

### GraphRuleDispatchAdapter: Edge Routing

The `GraphRuleDispatchAdapter<TContext>` wraps each parsed node and applies flow-graph routing semantics on top of the inner rule:

```csharp
internal sealed class GraphRuleDispatchAdapter<TContext> : IRule<TContext>
{
    public async Task<RuleResult> EvaluateAsync(TContext ctx, FactBag facts, CancellationToken ct)
    {
        // 1. Check if this node should execute (incoming edge conditions met)
        if (!MShouldExecute(facts))
        {
            MWriteExecutionState(facts, executed: false, passed: false);
            return RuleResult.Pass("SKIPPED: edge condition not met");
        }

        // 2. Evaluate the inner rule
        RuleResult result = await _inner.EvaluateAsync(ctx, facts, ct);

        // 3. Route based on edge type:
        //    - on-true edges: only proceed if result.IsSuccess
        //    - on-false edges: proceed on failure (failure becomes success for routing)
        //    - on-error edges: proceed only on exception
        //    - always edges: always proceed regardless of result

        MWriteExecutionState(facts, executed: true, passed: result.IsSuccess, ...);

        // If failure is handled by an edge, convert failure -> success for routing
        if (!result.IsSuccess && (HasAlwaysEdge || HasOnFalseEdge))
        {
            MAppendRoutedFailure(facts, NodeId, result);  // Preserve original error
            return RuleResult.Passed();  // But route continues
        }

        return result;
    }
}
```

### FactBag Graph Keys

During flow graph execution, each node writes its state to the FactBag under the key pattern `__graph.node.{nodeId}.*`:

```json
{
  "__graph.node.validate_order": {
    "executed": true,
    "passed": true,
    "errored": false,
    "message": null
  },
  "__graph.node.check_inventory": {
    "executed": true,
    "passed": false,
    "errored": false,
    "message": "Insufficient stock: requested 100, available 45"
  }
}
```

This allows downstream nodes (or post-execution handlers) to inspect which nodes executed and what their outcomes were.

---

## Node Types in Flow Graph

| Type | Adapter | Execution | Output |
|------|---------|-----------|--------|
| **Condition** | `FeelRuleAdapter` / `JavaScriptRuleAdapter` | Evaluates FEEL or JS expression | Boolean or output fields to FactBag |
| **Action** | `FactBagRuleContext` wrapper | Direct execution, side effects only | Outputs to FactBag or external systems |
| **Decision Table** | `DecisionTableEngine` | FEEL-based table evaluation | Hit policy (First/Unique/Collect/Priority) |
| **Sub-flow** | Flow graph wrapped in `IRule<TContext>` | Recursively executes nested DAG | Outputs from all nodes in sub-flow |
| **Connector** | `HttpConnectorAdapter` | HTTP POST/GET to external service | JSON response parsed into FactBag |
| **Liquid** | `LiquidTemplateAdapter` | Template rendering (Liquid syntax) | Generated string stored in FactBag |

**Key insight:** All node types implement `IRule<TContext>`, so they integrate seamlessly into the orchestrator's two-phase execution pipeline (EvaluateAsync → ExecuteAsync).

---

## Execution Modes Deep Dive

The `ExecutionMode` enum controls how the orchestrator handles failures and recovery:

### AllOrNothing (Default)

```csharp
public enum ExecutionMode
{
    AllOrNothing = 0,  // Stop on first failure, no compensation
}
```

**Behavior:**
- Executes rules in topological order
- Stops on the first rule failure
- No compensation attempted
- Caller receives RuleResult with aggregated errors

**Use cases:**
- Financial transactions (consistency critical)
- Validation pipelines (fail-fast)
- Legacy systems (backward compatible)

**Example:**
```csharp
// Order processing: if any step fails, entire order fails
var result = await orchestrator.ExecuteAsync(context, rules, ExecutionMode.AllOrNothing);
if (!result.IsSuccess)
{
    // Order remains in NEW state; no cleanup performed
    return BadRequest(result.Errors);
}
```

### BestEffort

```csharp
BestEffort = 1,  // Continue after failures, aggregate errors
```

**Behavior:**
- Executes all rules regardless of individual failures
- Collects errors from failed rules
- Returns partial success with aggregated errors
- No compensation attempted

**Use cases:**
- Batch operations (independent items)
- Notifications (one failure doesn't prevent others)
- Validation chains (collect all validation errors)

**Example:**
```csharp
var result = await orchestrator.ExecuteAsync(context, rules, ExecutionMode.BestEffort);
// result.Errors might contain ["Email validation failed", "Phone validation failed"]
// But rules after email-failure still executed
foreach (var error in result.Errors)
{
    logger.LogWarning(error);
}
```

### CompensateOnFailure

```csharp
CompensateOnFailure = 2,  // Stop on failure, compensate executed rules in reverse
```

**Behavior:**
- Executes rules in topological order
- On the first failure, stops and compensates all previously executed rules
- Rules that implement `ICompensatableRule<TContext>` have their `CompensateAsync()` called in reverse order
- Final result indicates failure and compensation completion

**Use cases:**
- Distributed transactions (saga pattern)
- Inventory reservations (reserve → deduct → compensate)
- Multi-step side effects (each step must be reversible)

**Example:**
```csharp
var result = await orchestrator.ExecuteAsync(context, rules, ExecutionMode.CompensateOnFailure);
if (!result.IsSuccess)
{
    // Previously executed rules are now rolled back
    // Reserve inventory was released
    // Funds were refunded
    // Compensation logs are in result.Errors
}
```

---

## Compensation Pattern

### ICompensatableRule Interface

Rules that perform state-altering operations should implement `ICompensatableRule<TContext>` to define how to undo their effects:

```csharp
public interface ICompensatableRule<in TContext> : IRule<TContext>
{
    /// <summary>
    /// Undo or mitigate side effects produced by this rule.
    /// MUST NOT throw; handle errors internally or log.
    /// MUST be idempotent (safe to call multiple times).
    /// </summary>
    Task CompensateAsync(TContext context, FactBag facts, CancellationToken cancellationToken = default);
}
```

### Example: Reserve Inventory Rule

```csharp
public class ReserveInventoryRule : ICompensatableRule<OrderContext>
{
    private readonly IInventoryService _inventory;

    public string Code => "reserve-inventory";
    public string Name => "Reserve Inventory";

    public async Task<RuleResult> EvaluateAsync(OrderContext ctx, FactBag bag, CancellationToken ct)
    {
        // Phase 1: Check inventory availability without side effects
        var available = await _inventory.GetAvailableAsync(ctx.Sku, ct);
        if (available < ctx.Quantity)
        {
            return RuleResult.Failed($"Insufficient stock: {ctx.Sku}, available={available}");
        }

        return RuleResult.Passed();
    }

    public async Task ExecuteAsync(OrderContext context, CancellationToken cancellationToken = default)
    {
        // Phase 2: Perform the actual reservation (side effect)
        var reservationId = await _inventory.ReserveAsync(
            context.Sku,
            context.Quantity,
            context.OrderId,
            cancellationToken);

        // Store in FactBag for downstream rules and compensation
        FactBag.Set("inventory.reserved", true);
        FactBag.Set("inventory.reservation_id", reservationId);
    }

    public async Task CompensateAsync(OrderContext context, FactBag facts, CancellationToken cancellationToken = default)
    {
        // Phase 3: Release the reservation if upstream rule fails
        // This executes in REVERSE order (LIFO)

        if (!facts.TryGet<string>("inventory.reservation_id", out var reservationId))
        {
            return;  // Never reserved, nothing to compensate
        }

        try
        {
            await _inventory.ReleaseAsync(reservationId, cancellationToken);
            facts.Set("inventory.released", true);
        }
        catch (Exception ex)
        {
            // Log the error but do not throw
            // Compensation must be best-effort
            facts.Set("inventory.compensation_error", ex.Message);
        }
    }
}
```

### Compensation Order (LIFO)

When `CompensateOnFailure` mode encounters a failure, compensation runs in **reverse** of the execution order (Last In, First Out):

```
Execution order:   [Reserve] → [Charge] → [CreateOrder] ← FAILS
Compensation order: [CreateOrder] → [Charge] → [Reserve]
                        (skip)      compensate  compensate
```

This ensures dependencies are unwound correctly: you release stock before refunding funds.

---

## Flow Graph Definition

### Programmatic Definition

Define a flow graph in code using `RuleFlowGraphBuilder`:

```csharp
var graph = new RuleFlowGraphBuilder()
    // Start node
    .AddTrigger("start", "trigger")

    // Condition node
    .AddCondition("validate-order", "Check if order is valid")
        .SetExpression("order.total > 0 and order.items.length > 0")
        .SetOutputFields(new[] { "order.is_valid" })

    // Action node
    .AddAction("log-order", "Log order details")
        .SetExpression("log('Order: ' + order.id)")

    // Decision table node
    .AddDecisionTable("determine-shipping", "Determine shipping cost")
        .SetTableId("shipping_cost_table_v1")

    // Sub-flow node
    .AddSubFlow("process-payment", "Nested payment flow")
        .SetFlowCode("payment_flow_v2")

    // End node
    .AddEnd("end")

    // Edge: validate-order → [on-true] log-order
    .AddEdge("validate-order", "log-order", edgeType: "on-true")

    // Edge: validate-order → [on-false] end (fail fast)
    .AddEdge("validate-order", "end", edgeType: "on-false")

    // Edge: log-order → [always] determine-shipping
    .AddEdge("log-order", "determine-shipping", edgeType: "always")

    // Edge: determine-shipping → [always] process-payment
    .AddEdge("determine-shipping", "process-payment", edgeType: "always")

    // Edge: process-payment → [on-true] end
    .AddEdge("process-payment", "end", edgeType: "on-true")

    .Build();
```

### Rule Studio (UI)

Alternatively, design the flow graph visually in Rule Studio:

1. Drag condition/action/decision-table nodes onto the canvas
2. Connect with edges, selecting routing type (on-true, on-false, on-error, always)
3. Publish → Rule Studio exports JSON
4. Runtime parses via `RuleGraphParser`

---

## Approval and Rollback

### Maker-Checker Flow

When `RuleControlPlaneOptions.RequireApproval` is enabled, ruleset versions follow a state machine:

```
Draft → PendingApproval → Approved → Active
                    ↓
                 Rejected

Active → Superseded (when new version activated)
Active → RolledBack (explicit rollback)
```

Use the Control Plane API to transition states:

```csharp
// POST /api/v1/rulesets/{name}/versions/{version}/approve
// Transitions PendingApproval → Approved

// POST /api/v1/rulesets/{name}/versions/{version}/activate
// Transitions Approved → Active, previous Active → Superseded
```

---

## Canary Rollout

Enable `RuleControlPlaneOptions.EnableCanary` to roll out new ruleset versions to a subset of tenants while preserving an active fallback:

```csharp
services.AddMRuleControlPlane(options =>
{
    options.EnableCanary = true;
    options.CanaryPercentage = 10;  // Start with 10% of tenants
});
```

The orchestrator calls `GetCanaryVersionForTenantAsync(tenantId)` before cache lookup, enabling:

- Gradual rollout
- A/B testing
- Instant rollback if errors detected

---

## Cross-Node Hot Reload

Pair `AddMRuleEngineWithPostgres()` with `AddMRuleEngineWithRedisHotReload()` to broadcast ruleset changes across nodes:

```csharp
services
    .AddMRuleEngineWithPostgres("Data Source=...")
    .AddMRuleEngineWithRedisHotReload("localhost:6379");
```

On `SetActiveVersionAsync()`:
1. Postgres updates ruleset metadata
2. Redis publishes `RuleSetChangeEvent`
3. All subscribed nodes invalidate local caches
4. Next execution reads fresh version

---

## Rule-Triggered Mediator Notifications

### Using [MEmitOnPass(...)]

Use the `[MEmitOnPass(...)]` attribute on `IRule<TContext>` implementations to automatically emit mediator notifications when a rule evaluates successfully:

```csharp
[MEmitOnPass(typeof(OrderApprovedNotification))]
public class ApproveOrderRule : IRule<OrderContext>
{
    public string Code => "approve-order";

    public async Task<RuleResult> EvaluateAsync(OrderContext ctx, FactBag bag, CancellationToken ct)
    {
        // Condition: order total > 0
        if (ctx.Order.Total <= 0)
            return RuleResult.Failed("Order total must be positive");

        return RuleResult.Passed();
    }

    public async Task ExecuteAsync(OrderContext context, CancellationToken cancellationToken = default)
    {
        // Update order status
        context.Order.Status = OrderStatus.Approved;
    }
}
```

The orchestrator automatically invokes `IMediator.Publish(new OrderApprovedNotification(...))` after ExecuteAsync completes, without explicit boilerplate in the rule.

### Custom Notification Factory

When notification payload depends on runtime context, implement `IRuleNotificationFactory<TContext>`:

```csharp
public class OrderNotificationFactory : IRuleNotificationFactory<OrderContext>
{
    public object? CreateNotification(OrderContext context, FactBag facts, Type notificationType)
    {
        if (notificationType == typeof(OrderApprovedNotification))
        {
            return new OrderApprovedNotification(
                OrderId: context.Order.Id,
                ApprovedAt: DateTime.UtcNow,
                TotalAmount: context.Order.Total,
                ApprovalDetails: facts.Get<string>("approval.details"));
        }

        return null;  // Unknown notification type
    }
}

services.AddScoped<IRuleNotificationFactory<OrderContext>, OrderNotificationFactory>();
```

---

## Decision Table Authoring Loop

### Widget Editor (UI)

Use the Rule Studio decision table editor for business authoring:

1. Create decision table
2. Define input columns (condition axes)
3. Define output columns
4. Author hit policy (First, Unique, Collect, Priority)
5. Publish → version created

### Export to Portable Formats

Export to JSON or DMN (Decision Model and Notation) for downstream systems:

```csharp
// GET /api/v1/decision-tables/{tableId}/export?format=json
// GET /api/v1/decision-tables/{tableId}/export?format=dmn
```

This enables:
- Integration with external rule engines
- Audit trail of business rules
- Documentation and compliance

---

## Summary

Advanced patterns unlock sophisticated rule orchestration:

- **Flow graphs** enable complex ordering and conditional routing
- **Execution modes** provide transactional (AllOrNothing), best-effort, or compensating semantics
- **ICompensatableRule** implements saga patterns for distributed side effects
- **Mediator notifications** decouple rule logic from side effects
- **Hot reload** keeps rulesets fresh across distributed nodes
- **Canary rollout** reduces risk of new ruleset versions

Choose patterns based on your domain's safety, change velocity, and distributed execution requirements. See [rule-engine-guide](./rule-engine-guide.md), [decision-table-guide](./decision-table-guide.md), and [rule-engine-hooks-guide](./rule-engine-hooks-guide.md) for foundational concepts.
