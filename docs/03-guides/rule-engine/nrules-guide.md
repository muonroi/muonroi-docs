---
title: NRules Integration Guide
sidebar_label: NRules Integration
sidebar_position: 4
---

# NRules Integration Guide

Muonroi provides a native integration surface for [NRules](https://github.com/NRules/NRules) — a mature .NET Rete-based rule engine. While the primary rule execution path uses typed C# rules and decision tables, NRules integration is available for scenarios requiring complex pattern matching, forward chaining, or Rete algorithm semantics.

:::info
**Use case**: Complex event processing, temporal patterns, multi-fact correlations. For simple business logic, prefer typed rules or decision tables instead.
:::

## When to Choose NRules

| Approach | Best For | Complexity | Execution | Cost |
|----------|----------|-----------|-----------|------|
| **Typed C# Rules** | Code-first workflows, compile-time safety | Low | Fast | Low |
| **Decision Tables** | Business users, tabular logic, CRUD via UI | Medium | Medium | Medium |
| **FEEL Expressions** | Simple calculations, decision table cells | Low | Fast | Low |
| **NRules** | Complex pattern matching, forward chaining, Rete optimization | High | Varies | High |
| **Flow Graphs** | Orchestration, sequential workflows, complex routing | High | Medium | Medium |

### When NOT to Use NRules

- **Single-rule evaluation**: Overhead of Rete network compilation not justified. Use typed rules.
- **Simple conditions**: `if (x > 10) { ... }` belongs in FEEL or C# rules, not NRules.
- **UI-driven business rules**: Users cannot edit Rete networks. Use decision tables.
- **Real-time latency-critical systems**: Rete memory state and compilation can add unpredictable overhead.
- **High audit requirements**: NRules fact matching is implicit; typed rules provide explicit trace points.

---

## Architecture: NRules in the Muonroi Pipeline

NRules operates **alongside** the primary rule execution pipeline, not replacing it:

```
Client → RuleOrchestrator
  ├─ Execute typed C# rules (IRule<TContext>)
  ├─ Execute decision tables
  ├─ Execute FEEL expressions
  └─ Execute NRules (via NRulesRuleAdapter)
         └─ Rete network → fact matching → forward chain
         └─ Writes results back to FactBag
```

### Integration Points

1. **FactBag Bridge**: NRules fact sessions interact with the shared FactBag dictionary
2. **Execution Mode**: NRules respects `AllOrNothing`, `BestEffort`, `CompensateOnFailure` modes
3. **Quota Enforcement**: Each NRules fact evaluation counts toward `RuleEvaluationsPerSecond` quota
4. **Telemetry**: Execution duration and fact match counts tracked via OTel ActivitySource
5. **Multi-Tenancy**: NRules execution inherits TenantContext; automatic tenant isolation

---

## Complete NRules Rule Example

### Step 1: Define Rule Class

```csharp
using NRules.RuleModel;
using NRules.Fluent.Dsl;

namespace Acme.Rules
{
    // Rule definition inheriting from Rule<T> base
    public class ApplyApprovalDiscountRule : Rule
    {
        public override void Define()
        {
            PendingOrder order = null;
            Customer customer = null;

            When()
                .Match<PendingOrder>(() => order,
                    o => o.Status == "Pending",
                    o => o.Total > 1000m)
                .Match<Customer>(() => customer,
                    c => c.Id == order.CustomerId,
                    c => c.CreditScore > 700);

            Then()
                .Do(ctx => ApplyDiscount(order, customer))
                .Do(ctx => ctx.TriggerChain(new DiscountAppliedEvent(order.Id)));
        }

        private void ApplyDiscount(PendingOrder order, Customer customer)
        {
            order.AppliedDiscount = order.Total * 0.15m; // 15% discount
            order.Status = "Approved";
        }
    }

    // Fact classes
    public record PendingOrder(
        string Id,
        string CustomerId,
        decimal Total,
        string Status)
    {
        public decimal AppliedDiscount { get; set; }
        public string Status { get; set; } = Status;
    }

    public record Customer(
        string Id,
        string Name,
        int CreditScore);

    public record DiscountAppliedEvent(string OrderId);
}
```

### Step 2: Register with DI

```csharp
using NRules;
using NRules.RuleModel;
using NRules.Fluent;
using Microsoft.Extensions.DependencyInjection;

// In Program.cs or Startup.cs
public static class NRulesServiceCollectionExtensions
{
    public static IServiceCollection AddNRulesEngine(
        this IServiceCollection services,
        Action<NRulesEngineOptions>? configureOptions = null)
    {
        var options = new NRulesEngineOptions();
        configureOptions?.Invoke(options);

        // Compile and register repository
        var repository = new RuleRepository();
        repository.Load(x => x.From(
            typeof(ApplyApprovalDiscountRule).Assembly));

        var factory = repository.Compile();
        var session = factory.CreateSession();

        services.AddSingleton(factory);
        services.AddScoped(_ => factory.CreateSession());
        services.AddSingleton<NRulesEngine>();

        return services;
    }
}

public class NRulesEngineOptions
{
    public int MaxFactCount { get; set; } = 10_000;
    public TimeSpan CompilationTimeout { get; set; } = TimeSpan.FromSeconds(30);
    public bool EnableDependencyAnalysis { get; set; } = true;
}
```

### Step 3: Execute Rules

```csharp
using NRules;

public class NRulesEngine
{
    private readonly ISessionFactory _factory;

    public NRulesEngine(ISessionFactory factory)
    {
        _factory = factory;
    }

    public async Task<NRulesResult> ExecuteAsync<TFact>(
        IEnumerable<TFact> facts,
        CancellationToken cancellationToken = default)
        where TFact : class
    {
        using var session = _factory.CreateSession();
        var result = new NRulesResult();

        try
        {
            // Insert all facts
            foreach (var fact in facts)
            {
                session.Insert(fact);
            }

            // Fire rules
            var firedCount = session.Fire();
            result.FiredRuleCount = firedCount;

            // Collect results
            var workingMemory = session.Query<object>().ToList();
            result.UpdatedFacts = workingMemory;
            result.Success = true;
        }
        catch (Exception ex)
        {
            result.Error = ex.Message;
            result.Success = false;
        }

        return result;
    }
}

public class NRulesResult
{
    public bool Success { get; set; }
    public int FiredRuleCount { get; set; }
    public List<object> UpdatedFacts { get; set; } = new();
    public string? Error { get; set; }
}
```

### Step 4: Connect to FactBag

```csharp
using Muonroi.RuleEngine.Abstractions;

public class NRulesFactBagAdapter
{
    private readonly NRulesEngine _engine;

    public NRulesFactBagAdapter(NRulesEngine engine)
    {
        _engine = engine;
    }

    // Export FactBag to NRules facts
    public IEnumerable<object> ExtractFacts(FactBag factBag)
    {
        var facts = new List<object>();

        foreach (var key in factBag.Keys)
        {
            if (factBag.TryGet<object>(key, out var value) && value != null)
            {
                // Filter: only object types that match rule fact patterns
                if (IsRuleFact(value.GetType()))
                {
                    facts.Add(value);
                }
            }
        }

        return facts;
    }

    // Import NRules results back into FactBag
    public void MergeFacts(FactBag factBag, NRulesResult result)
    {
        foreach (var fact in result.UpdatedFacts)
        {
            var typeName = fact.GetType().Name;
            factBag.Set<object>($"nrules.{typeName}", fact);
        }
    }

    private bool IsRuleFact(Type type)
    {
        // Only record types and simple classes
        return type.IsValueType ||
               type is { IsClass: true, Name: not "String" };
    }
}
```

---

## Integration with RuleOrchestrator

To include NRules in the main orchestration pipeline:

```csharp
using Muonroi.RuleEngine.Core;
using Muonroi.RuleEngine.Abstractions;

public class NRulesRuleAdapter : IRule<MyContext>
{
    private readonly NRulesEngine _engine;
    private readonly NRulesFactBagAdapter _adapter;

    public string Code => "nrules.execute";
    public string Name => "NRules Execution";
    public int Order => 50; // Runs after typed rules (order 0-49)
    public string[] DependsOn => Array.Empty<string>();

    public NRulesRuleAdapter(
        NRulesEngine engine,
        NRulesFactBagAdapter adapter)
    {
        _engine = engine;
        _adapter = adapter;
    }

    public async Task<RuleResult> EvaluateAsync(
        MyContext context,
        FactBag facts,
        CancellationToken cancellationToken = default)
    {
        try
        {
            // Extract domain facts from FactBag
            var domainFacts = _adapter.ExtractFacts(facts);

            // Execute NRules engine
            var result = await _engine.ExecuteAsync(
                domainFacts.Cast<object>().ToList(),
                cancellationToken);

            if (!result.Success)
            {
                return RuleResult.Failure(result.Error ?? "NRules execution failed");
            }

            // Merge results back into FactBag
            _adapter.MergeFacts(facts, result);

            facts.Set("nrules.firedCount", result.FiredRuleCount);
            return RuleResult.Passed();
        }
        catch (OperationCanceledException)
        {
            return RuleResult.Failure("NRules execution timed out");
        }
    }

    public async Task<RuleResult> ExecuteAsync(
        MyContext context,
        FactBag facts,
        CancellationToken cancellationToken = default)
    {
        // NRules executes side effects during fire() phase
        // No additional ExecuteAsync logic needed
        return RuleResult.Passed();
    }
}
```

Register the adapter in DI:

```csharp
services.AddNRulesEngine();
services.AddScoped<NRulesFactBagAdapter>();
services.AddScoped<IRule<MyContext>>(sp =>
    new NRulesRuleAdapter(
        sp.GetRequiredService<NRulesEngine>(),
        sp.GetRequiredService<NRulesFactBagAdapter>())
);
```

---

## Configuration Options

### Basic Setup

```csharp
services.AddNRulesEngine(options =>
{
    // Maximum facts allowed in working memory
    options.MaxFactCount = 5_000;

    // Compilation timeout
    options.CompilationTimeout = TimeSpan.FromSeconds(60);

    // Enable dependency analysis (slower compilation, better optimization)
    options.EnableDependencyAnalysis = true;
});
```

### Loading Rules from Assembly

```csharp
var repository = new RuleRepository();

// Load from current assembly
repository.Load(x => x.From(typeof(MyRule).Assembly));

// Load from multiple assemblies
repository.Load(x =>
{
    x.From(typeof(MyRule).Assembly);
    x.From(typeof(AnotherRule).Assembly);
});

// Load from specific namespace
repository.Load(x =>
    x.From(typeof(MyRule).Assembly)
     .Where(t => t.Namespace == "Acme.Rules"));

var factory = repository.Compile();
```

---

## REST API Endpoints

The `NRulesController` exposes these routes under `/api/v1/rule-engine`:

### List Rules
```http
GET /nrules
```

Response:
```json
[
  {
    "id": "rule-1",
    "name": "ApplyApprovalDiscount",
    "description": "Apply 15% discount to orders over $1000",
    "updatedAtUtc": "2026-03-20T10:30:00Z"
  }
]
```

### Get Rule Details
```http
GET /nrules/{id}
```

### Update Rule
```http
PUT /nrules/{id}
Content-Type: application/json

{
  "name": "ApplyApprovalDiscount",
  "description": "Apply discount logic",
  "ruleExpression": "order.Total > 1000 && customer.CreditScore > 700",
  "actionExpression": "order.AppliedDiscount = 0.15"
}
```

### Test Execution
```http
POST /api/v1/rule-engine/test
Content-Type: application/json

{
  "ruleId": "rule-1",
  "factBag": {
    "order": { "id": "ord-123", "total": 1500, "customerId": "cust-1" },
    "customer": { "id": "cust-1", "creditScore": 750 }
  }
}
```

Response:
```json
{
  "success": true,
  "firedRuleCount": 1,
  "updatedFacts": [
    {
      "nrules.PendingOrder": {
        "id": "ord-123",
        "appliedDiscount": 225.00,
        "status": "Approved"
      }
    }
  ]
}
```

---

## UI Component

The `mu-nrules-editor` custom element provides a browser-based editor:

```html
<mu-nrules-editor
  api-base="/api/v1/rule-engine/nrules"
  test-endpoint="/api/v1/rule-engine/test"
  rule-id="rule-1">
</mu-nrules-editor>
```

The component emits:

- `save` — fired when user saves a rule
- `validate` — fired when user requests validation
- `test` — fired when user executes a test

Listening to events:

```typescript
const editor = document.querySelector('mu-nrules-editor');

editor.addEventListener('save', (event) => {
  console.log('Rule saved:', event.detail);
});

editor.addEventListener('test', (event) => {
  console.log('Test result:', event.detail);
});
```

---

## Limitations and Trade-offs

### Rete Algorithm Overhead

- **Compilation cost**: Rule network is compiled into Rete format on first load. For simple rules, this overhead outweighs benefits.
- **Memory footprint**: Rete working memory can grow large with many facts. Limit `MaxFactCount`.
- **Unpredictable latency**: Complex Rete networks may exhibit non-linear performance degradation.

### Debugging Complexity

- **Implicit matching**: It's not immediately clear which rules fired or why. Traced fact matching is opaque.
- **Forward chaining side effects**: Rules can trigger other rules unpredictably; hard to reason about control flow.
- **Limited breakpoint support**: Most .NET debuggers show Rete internals poorly.

### Ecosystem Friction

- **Different semantics**: NRules uses facts + working memory; Muonroi uses FactBag + explicit rule execution.
- **Audit trail gaps**: NRules fact matching doesn't integrate with Muonroi audit trail automatically.
- **Canary / hot-reload**: NRules rule changes require recompilation; not hot-reloadable like decision tables.

### When NRules Becomes Liability

| Scenario | Problem |
|----------|---------|
| Single-condition rules | Rete overhead unjustified; use FEEL or C# |
| Business user editing | NRules rules cannot be edited via UI; use decision tables |
| Compliance audit | Implicit fact matching breaks trace requirements; use typed rules |
| High-frequency execution (>1000 req/s) | Unpredictable latency; consider caching or pre-compilation |
| Team lacking Rete expertise | Maintenance burden; prefer familiar typed rules |

---

## Best Practices

1. **Prefer typed rules first**: Only introduce NRules if you need Rete's pattern-matching semantics.
2. **Isolate NRules logic**: Keep NRules rules in a separate namespace and adapter; don't mix with core business logic.
3. **Test comprehensively**: Fact ordering and timing can affect rule firing. Use unit tests with deterministic fact sets.
4. **Monitor performance**: Enable OTel tracing and alert on execution duration > baseline.
5. **Document fact schema**: Keep a data dictionary of all fact types and their constraints.
6. **Limit working memory**: Set reasonable `MaxFactCount` to prevent memory growth.
7. **Version NRules rules**: Store NRules definitions in source control, version alongside decision tables.

---

## Comparison with Decision Tables

For most business use cases, **decision tables are preferred over NRules**:

| Aspect | Decision Table | NRules |
|--------|---|---|
| Business user editing | Yes (via Control Plane UI) | No (code-based) |
| Audit trail | Full integration | Implicit only |
| Hot-reload | Supported (no restart) | Requires recompilation |
| Debugging | Transparent hit policy | Complex Rete semantics |
| Performance | O(1) to O(n) lookups | Rete compilation cost + matching |
| Expressiveness | Tabular + FEEL cells | Complex patterns + forward chaining |
| Team expertise | Lower (rule authors) | Higher (Rete knowledge required) |

---

## Next Steps

- Explore [NRules documentation](https://github.com/NRules/NRules/wiki) for advanced Rete patterns
- Review [Rule Engine Guide](./rule-engine-guide.md) for typed rule alternatives
- Check [Decision Table Guide](./decision-table-guide.md) for tabular logic
- See [FEEL Reference](./feel-reference.md) for expression syntax
