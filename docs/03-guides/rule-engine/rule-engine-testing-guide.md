---
title: Testing Guide
sidebar_label: Testing Guide
sidebar_position: 12
---

# Rule Engine Testing Guide

Testing rules requires a layered approach: unit tests validate rule logic in isolation, integration tests verify orchestrator execution and data flow, and API tests confirm runtime behavior with approval workflows and persistence.

## Overview

The Muonroi rule engine provides three distinct testing patterns:

1. **Unit tests** — validate individual rules with `MRuleOrchestratorSpy`
2. **Integration tests** — verify orchestrator execution, dependencies, and FactBag state
3. **API tests** — confirm ruleset lifecycle (save → approve → activate) and SignalR notifications

All test infrastructure is in the `Muonroi.RuleEngine.Testing` NuGet package.

---

## Unit Testing with MRuleOrchestratorSpy

`MRuleOrchestratorSpy<TContext>` is a test wrapper that captures rule execution records and fact changes without requiring a database.

### Basic Usage

```csharp
using Muonroi.RuleEngine.Testing;
using Xunit;

[Fact]
public async Task MyRule_ShouldSetFactValue()
{
    // Arrange
    var rules = new List<IRule<string>> { new MyRule() };
    var spy = new MRuleOrchestratorSpy<string>(rules);

    // Act
    FactBag facts = await spy.ExecuteAsync("input-context");

    // Assert
    Assert.NotEmpty(spy.ExecutionRecords);
    Assert.Equal("RULE001", spy.ExecutionRecords[0].RuleCode);
    Assert.True(spy.ExecutionRecords[0].IsSuccess);
    Assert.Equal("expected-value", facts["my-fact"]);
}

public class MyRule : IRule<string>
{
    public string Code => "RULE001";
    public int Order => 1;

    public async Task<RuleResult> EvaluateAsync(
        string context,
        FactBag facts,
        CancellationToken ct = default)
    {
        // Condition check (returns failure if not met)
        if (context == null)
            return await Task.FromResult(RuleResult.Failure("context required"));

        return await Task.FromResult(RuleResult.Passed());
    }

    public Task ExecuteAsync(string context, CancellationToken cancellationToken = default)
    {
        // Side effects — update FactBag (phase 2)
        // Note: FactBag is passed implicitly via orchestrator
        return Task.CompletedTask;
    }
}
```

### Spy Features

`MRuleOrchestratorSpy<TContext>` provides:

- **`ExecutionRecords`** — `IReadOnlyList<MRuleExecutionRecord>` containing rule code, success flag, duration, and fact changes
- **`AfterSnapshot`** — complete FactBag state after execution
- **`BeforeSnapshot`** — FactBag state before execution (for before/after comparison)

### Asserting FactBag Changes

```csharp
[Fact]
public async Task MyRule_ShouldModifyFactBag()
{
    var rules = new List<IRule<string>> { new MyRule() };
    var spy = new MRuleOrchestratorSpy<string>(rules);

    await spy.ExecuteAsync("ctx");

    // Assert keys exist and have expected values
    Assert.True(spy.AfterSnapshot.ContainsKey("output-key"));
    Assert.Equal("calculated-value", spy.AfterSnapshot["output-key"]);

    // Assert specific fact changes
    var record = spy.ExecutionRecords[0];
    Assert.True(record.Changes.ContainsKey("output-key"));
    var (oldValue, newValue) = record.Changes["output-key"];
    Assert.Null(oldValue);
    Assert.Equal("calculated-value", newValue);
}
```

---

## Integration Testing with RuleOrchestrator

Test orchestrator behavior: dependency resolution, execution order, failure handling, and multi-tenant context propagation.

### Dependency Resolution

```csharp
[Fact]
public async Task ExecuteAsync_ResolvesDependenciesInOrder()
{
    var executed = new List<string>();

    var ruleB = new TestRule(
        code: "B",
        action: facts =>
        {
            facts["result"] = 42;
            executed.Add("B");
            return Task.FromResult(RuleResult.Success());
        });

    var ruleA = new TestRule(
        code: "A",
        dependencies: [typeof(TestRule)],  // B must execute first
        action: facts =>
        {
            if (!facts.TryGet("result", out int value) || value != 42)
                return Task.FromResult(RuleResult.Failure("B did not run"));
            executed.Add("A");
            return Task.FromResult(RuleResult.Success());
        });

    var orchestrator = new RuleOrchestrator<object>(
        new IRule<object>[] { ruleA, ruleB },
        hooks: [],
        logger: new NullLogger<RuleOrchestrator<object>>());

    await orchestrator.ExecuteAsync(new object());

    // B executes first due to dependency, then A
    Assert.Equal(new[] { "B", "A" }, executed);
}
```

### Execution Order (Order Property Fallback)

When no dependencies exist, rules execute in order of their `Order` property (ascending):

```csharp
[Fact]
public async Task ExecuteAsync_UsesOrderAsFallback()
{
    var executed = new List<string>();

    var second = new TestRule(code: "SECOND", order: 20);
    var first = new TestRule(code: "FIRST", order: 10);

    var orchestrator = CreateOrchestrator(second, first);
    await orchestrator.ExecuteAsync(new object());

    Assert.Equal(new[] { "FIRST", "SECOND" }, executed);
}
```

### Cycle Detection

The orchestrator detects circular dependencies and throws `InvalidOperationException`:

```csharp
[Fact]
public void ExecuteAsync_DetectsCycle()
{
    var ruleA = new TestRule("A", dependencies: [typeof(TestRule<RuleB>)]);
    var ruleB = new TestRule("B", dependencies: [typeof(TestRule<RuleA>)]);

    // Throws during construction (Kahn's algorithm validation)
    Assert.Throws<InvalidOperationException>(() =>
        new RuleOrchestrator<object>(new IRule<object>[] { ruleA, ruleB }, [], null));
}
```

### Failure Handling (AllOrNothing Mode)

By default, the orchestrator stops on first failure and propagates the error:

```csharp
[Fact]
public async Task ExecuteAsync_ShortCircuitsOnFailure()
{
    var executed = new List<string>();

    var failingRule = new TestRule(
        code: "FAIL",
        action: _ =>
        {
            executed.Add("FAIL");
            return Task.FromResult(RuleResult.Failure("boom"));
        });

    var laterRule = new TestRule(
        code: "LATER",
        action: _ =>
        {
            executed.Add("LATER");  // Never executes
            return Task.FromResult(RuleResult.Success());
        });

    var orchestrator = CreateOrchestrator(failingRule, laterRule);

    // Throws InvalidOperationException
    await Assert.ThrowsAsync<InvalidOperationException>(
        () => orchestrator.ExecuteAsync(new object()));

    Assert.Equal(new[] { "FAIL" }, executed);
}
```

---

## Multi-Tenant Testing

Test tenant-scoped rules with keyed service resolution and `TenantRuleGroup` attribute.

### Tenant-Scoped Rule Registration

```csharp
[TenantRuleGroup("workflow-name", "tenant-id")]
public sealed class TenantScopedRule : IRule<string>
{
    public string Code => "TENANT_RULE";
    public int Order => 0;

    public Task<RuleResult> EvaluateAsync(
        string context,
        FactBag facts,
        CancellationToken ct)
    {
        facts["tenant"] = "tenant-id";
        return Task.FromResult(RuleResult.Passed());
    }

    public Task ExecuteAsync(string context, CancellationToken ct = default)
        => Task.CompletedTask;
}

[Fact]
public async Task ResolveKeyedOrchestrator_ForTenant()
{
    var services = new ServiceCollection();
    services.AddLogging();
    services.AddRuleEngine();

    // Register rule scoped to workflow + tenant
    services.AddScoped<TenantScopedRule>();
    services.AddKeyedScoped<IRule<string>, TenantScopedRule>("workflow:tenant-id");

    // Register keyed orchestrator that pulls keyed rules
    services.AddKeyedScoped("workflow:tenant-id", (sp, _) =>
        new RuleOrchestrator<string>(
            sp.GetRequiredKeyedService<IEnumerable<IRule<string>>>("workflow:tenant-id"),
            sp.GetKeyedService<IEnumerable<IHookHandler<string>>>("workflow:tenant-id") ?? [],
            sp.GetService<IMLog<RuleOrchestrator<string>>>()));

    var provider = services.BuildServiceProvider();
    var orchestrator = provider.GetRequiredKeyedService<RuleOrchestrator<string>>("workflow:tenant-id");

    var facts = await orchestrator.ExecuteAsync("ctx");

    Assert.Equal("tenant-id", facts["tenant"]);
}
```

---

## API Testing: Ruleset Lifecycle

Test the complete workflow: save version → submit for approval → approve → activate → verify persistence.

### Save and Activate a Ruleset

```csharp
using Muonroi.ControlPlane.Sdk;
using Xunit;

[Fact]
public async Task RulesetLifecycle_SaveAndActivate()
{
    var client = new ControlPlaneApiClient("https://cp.example.com");
    var workflowName = "test-workflow-" + Guid.NewGuid();

    // Step 1: Build ruleset JSON
    var ruleset = new
    {
        rules = new[] {
            new {
                code = "RULE001",
                name = "Test Rule",
                condition = "input.value > 100",
                actions = new[] {
                    new { type = "set-fact", key = "status", value = "approved" }
                }
            }
        },
        settings = new { executionMode = "AllOrNothing" }
    };

    // Step 2: Save new version (draft)
    var saveResponse = await client.Rulesets.SaveAsync(workflowName, ruleset);
    int version = saveResponse.Version;
    Assert.Equal("draft", saveResponse.Status);

    // Step 3: Submit for approval (if approval required)
    var submitResponse = await client.Rulesets.SubmitForApprovalAsync(workflowName, version);
    Assert.Equal("submitted", submitResponse.Status);

    // Step 4: Approve
    var approveResponse = await client.Rulesets.ApproveAsync(workflowName, version);
    Assert.Equal("approved", approveResponse.Status);

    // Step 5: Activate
    var activateResponse = await client.Rulesets.ActivateAsync(workflowName, version);
    Assert.Equal("active", activateResponse.Status);

    // Verify active version
    var activeRuleset = await client.Rulesets.GetActiveAsync(workflowName);
    Assert.Equal(version, activeRuleset.Version);
}
```

### Test Audit Trail

After activating a ruleset, verify audit entries were created:

```csharp
[Fact]
public async Task RulesetLifecycle_CreatesAuditEntries()
{
    var client = new ControlPlaneApiClient("https://cp.example.com");
    var workflowName = "test-audit-" + Guid.NewGuid();

    // Save → approve → activate
    var ruleset = new { rules = new[] { /* ... */ } };
    var saveResp = await client.Rulesets.SaveAsync(workflowName, ruleset);
    await client.Rulesets.ApproveAsync(workflowName, saveResp.Version);
    await client.Rulesets.ActivateAsync(workflowName, saveResp.Version);

    // Fetch audit log
    var auditLog = await client.Audit.GetByWorkflowAsync(workflowName);

    Assert.NotEmpty(auditLog.Entries);
    Assert.Contains(auditLog.Entries, e => e.Action == "saved" && e.Version == saveResp.Version);
    Assert.Contains(auditLog.Entries, e => e.Action == "approved" && e.Version == saveResp.Version);
    Assert.Contains(auditLog.Entries, e => e.Action == "activated" && e.Version == saveResp.Version);
}
```

### Test Maker-Checker Rejection

When maker-checker is enabled, verify that self-approval is rejected:

```csharp
[Fact]
public async Task Approval_RejectsSelfApproval()
{
    var client = new ControlPlaneApiClient("https://cp.example.com");
    var workflowName = "test-maker-checker-" + Guid.NewGuid();

    var ruleset = new { rules = new[] { /* ... */ } };
    var saveResp = await client.Rulesets.SaveAsync(workflowName, ruleset);

    // Same user tries to approve their own submission
    await Assert.ThrowsAsync<UnauthorizedAccessException>(
        () => client.Rulesets.ApproveAsync(workflowName, saveResp.Version));
}
```

---

## Decision Table Testing

Test decision tables: import, validate, export, and version comparison.

### Import and Validate DMN

```csharp
using Muonroi.ControlPlane.Sdk;
using Xunit;

[Fact]
public async Task DecisionTable_ImportAndValidate()
{
    var client = new ControlPlaneApiClient("https://cp.example.com");
    var dmnXml = @"
        <?xml version='1.0' encoding='UTF-8'?>
        <definitions xmlns='http://www.omg.org/spec/DMN/20151101/dmn.xsd'>
          <decisionTable id='dt_1'>
            <input id='input_1'><inputExpression typeRef='string'/></input>
            <output id='output_1' typeRef='string'/>
            <rule id='rule_1'>
              <inputEntry><text>'approved'</text></inputEntry>
              <outputEntry><text>'PASS'</text></outputEntry>
            </rule>
          </decisionTable>
        </definitions>";

    // Import DMN
    var tableId = Guid.NewGuid().ToString();
    var importResp = await client.DecisionTables.ImportDmnAsync(tableId, dmnXml);

    Assert.NotNull(importResp.Rows);
    Assert.Equal(1, importResp.Rows.Count);

    // Validate table
    var validateResp = await client.DecisionTables.ValidateAsync(tableId, importResp.Version);
    Assert.True(validateResp.IsValid);
    Assert.Empty(validateResp.Errors);
}
```

### Evaluate Table with Test Input

```csharp
[Fact]
public async Task DecisionTable_EvaluateWithInput()
{
    var client = new ControlPlaneApiClient("https://cp.example.com");
    var tableId = "test-table-id";

    var input = new { status = "approved", amount = 5000 };

    var result = await client.DecisionTables.EvaluateAsync(tableId, input);

    Assert.NotNull(result.Output);
    Assert.Equal("APPROVED", result.Output["decision"]);
}
```

### Compare Version History

```csharp
[Fact]
public async Task DecisionTable_CompareVersions()
{
    var client = new ControlPlaneApiClient("https://cp.example.com");
    var tableId = "test-table-id";

    var diff = await client.DecisionTables.DiffVersionsAsync(tableId, fromVersion: 1, toVersion: 2);

    Assert.NotNull(diff.Added);
    Assert.NotNull(diff.Removed);
    Assert.NotNull(diff.Modified);
}
```

---

## Testing FEEL Expressions

Test FEEL evaluation via the `/api/v1/feel/evaluate` endpoint or directly via the expression evaluator.

### Evaluate FEEL Expression via API

```csharp
[Fact]
public async Task Feel_EvaluatesExpression()
{
    var client = new ControlPlaneApiClient("https://cp.example.com");

    var feelExpr = "amount > 1000 and status = 'approved'";
    var context = new { amount = 5000, status = "approved" };

    var result = await client.Feel.EvaluateAsync(feelExpr, context);

    Assert.True(result.Success);
    Assert.Equal(true, result.Value);
}
```

---

## Testing Hot-Reload with SignalR

When `EnableHotReload: true`, verify that rule changes propagate via SignalR without requiring manual app restart.

### Subscribe to Ruleset Changes

```csharp
using Microsoft.AspNetCore.SignalR.Client;
using Xunit;

[Fact]
public async Task HotReload_RulesetChangeNotification()
{
    var connection = new HubConnectionBuilder()
        .WithUrl("https://cp.example.com/hubs/ruleset-changes")
        .WithAutomaticReconnect()
        .Build();

    var tcs = new TaskCompletionSource<string>();

    connection.On<string, int>("RulesetChanged", (workflow, version) =>
    {
        tcs.TrySetResult($"{workflow}:{version}");
    });

    await connection.StartAsync();

    // Trigger ruleset change via API
    var client = new ControlPlaneApiClient("https://cp.example.com");
    await client.Rulesets.ActivateAsync("my-workflow", 42);

    // Wait for SignalR notification
    var notification = await tcs.Task.ConfigureAwait(false);

    Assert.Equal("my-workflow:42", notification);
    await connection.StopAsync();
}
```

---

## CI/CD Configuration

### Running Tests in Pipeline

```yaml
# GitHub Actions example
- name: Run Unit Tests
  run: dotnet test --filter "Category=Unit" --logger "trx" -v minimal

- name: Run Integration Tests
  run: dotnet test --filter "Category=Integration" --logger "trx" -v minimal
  env:
    DATABASE_CONNECTION: "postgres://..."
    REDIS_URL: "redis://..."
```

### Test Categories

Apply `[Trait("Category", "Unit")]` to unit tests (no external dependencies):

```csharp
[Fact]
[Trait("Category", "Unit")]
public async Task MyRule_ShouldWork()
{
    // Uses MRuleOrchestratorSpy, no DB
}
```

Apply `[Trait("Category", "Integration")]` to tests requiring database:

```csharp
[Fact]
[Trait("Category", "Integration")]
public async Task RulesetLifecycle_SaveAndActivate()
{
    // Requires Postgres + Redis
}
```

---

## Best Practices

1. **Isolate contexts** — use `MRuleOrchestratorSpy` for unit tests to avoid database setup.
2. **Test failure paths** — verify both success and failure cases (RuleResult.Failure).
3. **Assert fact changes** — inspect `ExecutionRecords[i].Changes` to verify what the rule modified.
4. **Verify execution order** — use `ExecutionRecords` to confirm dependency resolution worked correctly.
5. **Test multi-tenant isolation** — use keyed service registration to ensure tenant rules don't leak.
6. **Integration tests separate** — tag with `[Trait("Category", "Integration")]` and run in dedicated pipeline.
7. **Mock external services** — use Moq to mock HTTP clients, message queues, etc. in unit tests.

---

## References

- [Rule Engine Guide](/docs/03-guides/rule-engine/rule-engine-guide) — architecture and concepts
- [Decision Tables](/docs/03-guides/rule-engine/decision-tables) — DMN import and FEEL evaluation
- [Control Plane API](/docs/02-architecture/control-plane-api) — ruleset CRUD and approval workflow
