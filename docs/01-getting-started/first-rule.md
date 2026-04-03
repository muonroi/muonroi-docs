---
title: Your First Rule
sidebar_label: Your First Rule
sidebar_position: 3
---

# Your First Rule

This walkthrough shows how to define, register, and execute a minimal code-first rule using Muonroi abstractions. You'll learn the two-phase execution model, how to use FactBag for shared data flow, and how to integrate rules with your application.

:::info Prerequisites
Read [Architecture Overview](../02-concepts/architecture-overview.md) for a 5-minute system overview if you're new to Muonroi.
:::

---

## 1. Define Your Context

Start by defining the data structure that rules will evaluate. This is the fact bag's "schema."

```csharp
public sealed class LoanApplication
{
    public int CreditScore { get; set; }
    public decimal MonthlyIncome { get; set; }
    public decimal MonthlyDebt { get; set; }
    public decimal RequestedAmount { get; set; }
}
```

---

## 2. Understand Two-Phase Execution

Every rule in Muonroi executes in **two phases**:

### Phase 1 — Evaluate (EvaluateAsync)
- **Purpose**: Pure evaluation — check conditions, compute outputs, **no side effects**
- **Returns**: `RuleResult` (passed/failed)
- **Example**: Check credit score, calculate debt-to-income ratio

### Phase 2 — Execute (ExecuteAsync)
- **Purpose**: Side effects — only if Phase 1 passed
- **Returns**: Success or failure with optional error
- **Example**: Call external API, update database, send notification

This split ensures:
- Phase 1 results are deterministic and safe to evaluate multiple times
- Side effects only happen when all conditions pass
- Failed rules never trigger side effects

---

## 3. Implement a Rule

Rules implement `IRule<TContext>` with both phases:

```csharp
using Muonroi.RuleEngine.Abstractions;

[RuleGroup("loan-approval")]
public sealed class CreditScoreRule : IRule<LoanApplication>
{
    // Unique identifier within the rule group
    public string Code => "CREDIT_SCORE";

    // Execution order (lower = earlier)
    public int Order => 0;

    /// <summary>
    /// Phase 1: Evaluate — Check conditions, write to FactBag, no side effects.
    /// </summary>
    public Task<RuleResult> EvaluateAsync(
        LoanApplication context,
        FactBag facts,
        CancellationToken ct)
    {
        bool eligible = context.CreditScore >= 650;

        // Write evaluation result to shared FactBag
        // Other rules can read this later
        facts.Set("creditScoreEligible", eligible);
        facts.Set("creditScore", context.CreditScore);

        return Task.FromResult(
            eligible
                ? RuleResult.Passed()
                : RuleResult.Failure("Credit score must be >= 650.")
        );
    }

    /// <summary>
    /// Phase 2: Execute — Only called if EvaluateAsync returned Passed.
    /// Use for side effects: API calls, database updates, notifications.
    /// </summary>
    public async Task<RuleResult> ExecuteAsync(
        LoanApplication context,
        FactBag facts,
        CancellationToken ct)
    {
        // Example: Log the decision to audit trail
        try
        {
            // Simulate async work (e.g., audit service call)
            await Task.Delay(10, ct);

            facts.Set("auditLogged", true);
            return RuleResult.Success();
        }
        catch (Exception ex)
        {
            return RuleResult.Failure($"Failed to log audit: {ex.Message}");
        }
    }

    // Optional: Helper method that can be auto-extracted by RuleGen
    [MExtractAsRule("CREDIT_SCORE", Order = 0)]
    private static bool HasMinimumCreditScore(int creditScore) => creditScore >= 650;
}
```

---

## 4. Add a Second Rule (with Dependencies)

Rules can depend on each other. The orchestrator respects ordering and dependencies:

```csharp
[RuleGroup("loan-approval")]
public sealed class DebtToIncomeRule : IRule<LoanApplication>
{
    public string Code => "DEBT_TO_INCOME";
    public int Order => 1; // Run after CREDIT_SCORE

    // Optional: Declare dependencies
    public string[] DependsOn => new[] { "CREDIT_SCORE" };

    public Task<RuleResult> EvaluateAsync(
        LoanApplication context,
        FactBag facts,
        CancellationToken ct)
    {
        // Only evaluate if credit score check passed
        if (!facts.Get<bool>("creditScoreEligible"))
        {
            return Task.FromResult(RuleResult.Failure("Credit score check failed."));
        }

        // Calculate debt-to-income ratio
        decimal ratio = context.MonthlyDebt / context.MonthlyIncome;
        bool eligible = ratio < 0.43m; // Standard lending threshold

        facts.Set("debtToIncome", ratio);
        facts.Set("debtToIncomeEligible", eligible);

        return Task.FromResult(
            eligible
                ? RuleResult.Passed()
                : RuleResult.Failure($"Debt-to-income ratio {ratio:P} exceeds 43%.")
        );
    }

    public Task<RuleResult> ExecuteAsync(
        LoanApplication context,
        FactBag facts,
        CancellationToken ct)
    {
        return Task.FromResult(RuleResult.Success());
    }
}
```

---

## 5. Register Rules in Dependency Injection

Configure the rule engine in your `Program.cs`:

```csharp
using Muonroi.RuleEngine.Abstractions;
using Muonroi.RuleEngine.Runtime.Rules;

var builder = WebApplicationBuilder.CreateBuilder(args);

// Register license protection (required)
builder.Services.AddLicenseProtection(builder.Configuration);

// Register the rule engine for your context type
builder.Services.AddRuleEngine<LoanApplication>();

// Auto-discover and register all rules in this assembly
builder.Services.AddRulesFromAssemblies(typeof(Program).Assembly);

// Optional: Register specific rule instance
builder.Services.AddScoped<IRule<LoanApplication>>(
    sp => new CreditScoreRule()
);

var app = builder.Build();
```

---

## 6. Complete Working Example

Now, execute rules in your application code:

```csharp
using Muonroi.RuleEngine.Abstractions;
using Muonroi.RuleEngine.Core;

public sealed class LoanService
{
    private readonly RuleOrchestrator<LoanApplication> _orchestrator;
    private readonly ILogger<LoanService> _logger;

    public LoanService(
        RuleOrchestrator<LoanApplication> orchestrator,
        ILogger<LoanService> logger)
    {
        _orchestrator = orchestrator;
        _logger = logger;
    }

    public async Task<LoanApprovalResult> EvaluateLoanAsync(
        LoanApplication application,
        ExecutionMode mode = ExecutionMode.AllOrNothing,
        CancellationToken ct = default)
    {
        // Initialize a shared fact bag for all rules
        var facts = new FactBag();

        // Optional: Pre-populate facts with derived values
        facts.Set("applicationId", Guid.NewGuid().ToString());
        facts.Set("evaluatedAt", DateTime.UtcNow);

        try
        {
            // Execute all registered rules in order
            // Phase 1 (Evaluate): Evaluate all conditions, populate FactBag
            // Phase 2 (Execute): Run side effects for rules that passed
            var result = await _orchestrator.ExecuteWithResultAsync(
                application,
                facts,
                mode,
                ct
            );

            // Check overall success
            if (!result.IsSuccessful)
            {
                _logger.LogWarning(
                    "Loan evaluation failed. Errors: {Errors}",
                    string.Join("; ", result.Errors)
                );

                return new LoanApprovalResult
                {
                    Approved = false,
                    Errors = result.Errors.ToList(),
                    FactBag = facts
                };
            }

            // Extract results from FactBag
            bool creditScoreEligible = facts.Get<bool>("creditScoreEligible");
            bool debtToIncomeEligible = facts.Get<bool>("debtToIncomeEligible");
            decimal ratio = facts.Get<decimal>("debtToIncome");

            _logger.LogInformation(
                "Loan evaluation passed. Credit: {CreditEligible}, DTI: {DtiEligible} ({Ratio:P})",
                creditScoreEligible,
                debtToIncomeEligible,
                ratio
            );

            return new LoanApprovalResult
            {
                Approved = creditScoreEligible && debtToIncomeEligible,
                Errors = new(),
                FactBag = facts
            };
        }
        catch (OperationCanceledException ex)
        {
            _logger.LogError("Loan evaluation was cancelled: {Message}", ex.Message);
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unexpected error during loan evaluation");
            throw;
        }
    }
}

public sealed class LoanApprovalResult
{
    public bool Approved { get; set; }
    public List<string> Errors { get; set; } = new();
    public FactBag FactBag { get; set; } = new();
}
```

---

## 7. Using FactBag — The Shared Data Context

`FactBag` is a `Dictionary<string, object?>` that flows through all rules in the pipeline. All rules read from and write to it.

### FactBag Operations

```csharp
// Set a value
facts.Set("key", value);

// Get a value with type inference
var value = facts.Get<int>("key");

// Safe read with default
bool success = facts.TryGet("key", out var value);

// Remove a value
facts.Remove("key");

// Read-only snapshot
var snapshot = facts.AsReadOnly();

// Check existence
bool exists = facts.Keys.Contains("key");

// Access by index
var value = facts["key"];
```

### Key Patterns

**Rule-to-rule communication:**
```csharp
// In Rule A (Phase 1)
facts.Set("interestRate", 0.08m);

// In Rule B (Phase 1, Order > A)
decimal rate = facts.Get<decimal>("interestRate");
```

**Flow graph outputs:**
```csharp
// In rules within a flow graph, keys use the prefix __graph.node.{nodeId}.*
// Automatically handled by GraphRuleDispatchAdapter
var nodeOutput = facts.Get<object>("__graph.node.rule-1.result");
```

**JSON coercion:**
```csharp
// FactBag automatically converts JsonElement to CLR types
var jsonFact = facts.Get<JsonElement>("data");  // Converted automatically
var intValue = facts.Get<int>("data");          // Coerced if possible
```

---

## 8. Execution Modes

Three execution modes affect how rules are orchestrated:

```csharp
// 1. AllOrNothing (default)
// Stop on first failure, no compensation
var result = await _orchestrator.ExecuteWithResultAsync(
    application,
    facts,
    ExecutionMode.AllOrNothing,
    ct
);

// 2. BestEffort
// Continue on failure, aggregate all errors
var result = await _orchestrator.ExecuteWithResultAsync(
    application,
    facts,
    ExecutionMode.BestEffort,
    ct
);

// 3. CompensateOnFailure
// Execute all rules; if any fails, reverse completed rules in LIFO order
// (Requires rules to implement ICompensatableRule<TContext>)
var result = await _orchestrator.ExecuteWithResultAsync(
    application,
    facts,
    ExecutionMode.CompensateOnFailure,
    ct
);
```

---

## 9. Error Handling

### Handling Rule Failures

```csharp
var result = await _orchestrator.ExecuteWithResultAsync(
    application,
    facts,
    ExecutionMode.AllOrNothing,
    ct
);

if (!result.IsSuccessful)
{
    // Collect all rule failures
    var failures = result.RuleResults
        .Where(r => !r.Passed)
        .Select(r => new
        {
            RuleCode = r.Code,
            Errors = r.Errors
        })
        .ToList();

    foreach (var failure in failures)
    {
        _logger.LogWarning(
            "Rule {RuleCode} failed: {Errors}",
            failure.RuleCode,
            string.Join("; ", failure.Errors)
        );
    }
}
```

### Implementing Compensatable Rules

For transactions that may need rollback:

```csharp
[RuleGroup("loan-approval")]
public sealed class LoanReservationRule : ICompensatableRule<LoanApplication>
{
    public string Code => "LOAN_RESERVATION";
    public int Order => 10;

    private string _reservationId;

    public async Task<RuleResult> EvaluateAsync(
        LoanApplication context,
        FactBag facts,
        CancellationToken ct)
    {
        // Pure evaluation
        return RuleResult.Passed();
    }

    public async Task<RuleResult> ExecuteAsync(
        LoanApplication context,
        FactBag facts,
        CancellationToken ct)
    {
        try
        {
            // Reserve funds in external system
            _reservationId = await ReserveLoanAmountAsync(context.RequestedAmount, ct);
            facts.Set("reservationId", _reservationId);
            return RuleResult.Success();
        }
        catch (Exception ex)
        {
            return RuleResult.Failure($"Failed to reserve loan: {ex.Message}");
        }
    }

    /// <summary>
    /// Called if another rule fails (only in CompensateOnFailure mode).
    /// Must reverse the side effect from ExecuteAsync.
    /// </summary>
    public async Task<RuleResult> CompensateAsync(
        LoanApplication context,
        CancellationToken ct)
    {
        if (string.IsNullOrEmpty(_reservationId))
            return RuleResult.Success();

        try
        {
            await ReleaseLoanReservationAsync(_reservationId, ct);
            return RuleResult.Success();
        }
        catch (Exception ex)
        {
            return RuleResult.Failure($"Failed to release reservation: {ex.Message}");
        }
    }

    private Task<string> ReserveLoanAmountAsync(decimal amount, CancellationToken ct)
    {
        // TODO: Call external loan service API
        return Task.FromResult(Guid.NewGuid().ToString());
    }

    private Task ReleaseLoanReservationAsync(string reservationId, CancellationToken ct)
    {
        // TODO: Release the reservation
        return Task.CompletedTask;
    }
}
```

---

## 10. Testing Your Rules

Here's a minimal xUnit test:

```csharp
using Xunit;
using Muonroi.RuleEngine.Abstractions;
using Muonroi.RuleEngine.Core;

public sealed class CreditScoreRuleTests
{
    [Fact]
    public async Task EvaluateAsync_WithGoodCreditScore_ReturnsPassed()
    {
        // Arrange
        var rule = new CreditScoreRule();
        var context = new LoanApplication { CreditScore = 700 };
        var facts = new FactBag();

        // Act
        var result = await rule.EvaluateAsync(context, facts, CancellationToken.None);

        // Assert
        Assert.True(result.Passed);
        Assert.True(facts.Get<bool>("creditScoreEligible"));
    }

    [Fact]
    public async Task EvaluateAsync_WithLowCreditScore_ReturnsFailure()
    {
        // Arrange
        var rule = new CreditScoreRule();
        var context = new LoanApplication { CreditScore = 600 };
        var facts = new FactBag();

        // Act
        var result = await rule.EvaluateAsync(context, facts, CancellationToken.None);

        // Assert
        Assert.False(result.Passed);
        Assert.False(facts.Get<bool>("creditScoreEligible"));
        Assert.Contains("must be >= 650", result.Errors[0]);
    }
}
```

---

## 11. Next Steps

- **[Rule Engine Guide](../03-guides/rule-engine/rule-engine-guide.md)** — Advanced topics: flow graphs, sub-flows, connectors
- **[Decision Table Guide](../03-guides/rule-engine/decision-table-guide.md)** — Tabular rules with multiple inputs/outputs
- **[Multi-Tenant Guide](../03-guides/multi-tenancy/multi-tenant-guide.md)** — Tenant isolation in rule execution
- **[RuleGen CLI Guide](../03-guides/rule-engine/rulegen-guide.md)** — Auto-extract rules from helper methods
- **[Loan Approval Sample](../06-resources/samples/loan-approval.md)** — Complete working example

---

## Key Takeaways

1. **Two-phase execution**: Phase 1 (Evaluate) = pure conditions, Phase 2 (Execute) = side effects
2. **FactBag** = shared dictionary; all rules read/write to it
3. **Ordering** = explicit `Order` or `DependsOn` properties
4. **Modes** = AllOrNothing (fail-fast), BestEffort (best-attempt), CompensateOnFailure (rollback)
5. **Error handling** = check `OrchestratorResult.IsSuccessful` and `RuleResults`
