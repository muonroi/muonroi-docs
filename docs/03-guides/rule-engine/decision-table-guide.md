---
title: Decision Table Guide
sidebar_position: 4
sidebar_label: Decision Tables
---

# Decision Table Guide

Decision tables are a powerful way to model business logic visually using a DMN-style (Decision Model and Notation) table structure. Each row represents a rule, with input columns defining conditions and output columns defining the results. Decision tables excel at managing complex conditional logic that would be cumbersome to express as code.

## What is a Decision Table?

A decision table organizes business rules into a grid where:

- **Input columns** contain FEEL unary test expressions that match against facts in the FactBag
- **Output columns** contain FEEL expressions that compute result values
- **Rows** represent individual rules evaluated in sequence or according to a hit policy
- **Hit policy** determines which rows are selected when multiple rows match

## Core Concepts

### Structure

Every decision table has:

```csharp
public class DecisionTable
{
    public string Id { get; set; }                      // Unique identifier
    public string Name { get; set; }                    // Table name
    public string Description { get; set; }            // Documentation
    public HitPolicy HitPolicy { get; set; }           // How to select matching rows
    public List<DecisionTableColumn> InputColumns { get; set; }
    public List<DecisionTableColumn> OutputColumns { get; set; }
    public List<DecisionTableRow> Rows { get; set; }
    public int Version { get; set; }                   // Version number
    public string? TenantId { get; set; }              // Multi-tenant support
    public DateTimeOffset CreatedAt { get; set; }
    public DateTimeOffset ModifiedAt { get; set; }
}
```

### Hit Policies (Critical)

Hit policies determine which rows to select when evaluating a decision table:

| Policy | Behavior | Use Case |
|--------|----------|----------|
| **First** | Return the first matching row (top-to-bottom) | Default; for sequential rule priority |
| **Unique** | Exactly one row must match; error if multiple or none | Ensure deterministic, non-overlapping rules |
| **Collect** | Return all matching rows as a collection | Gather all applicable rules (e.g., applicable discounts) |
| **Priority** | Return the highest priority matching row | Select based on explicit priority field |
| **OutputOrder** | Return all matching rows ordered by output column | Order results by a specific output value |
| **CollectSum** | Collect all matching rows and sum their primary output | Aggregate numeric results |
| **CollectMin** | Collect all matching rows and return the minimum value | Find lowest applicable value |
| **CollectMax** | Collect all matching rows and return the maximum value | Find highest applicable value |
| **CollectCount** | Count all matching rows | Count applicable rules |

## FEEL Cell Evaluation

Decision table cells use FEEL (Friendly Enough Expression Language) expressions for both conditions and outputs.

### Input Columns (Unary Tests)

Input column cells define conditions as unary tests (expressions with an implicit left operand):

```
> 100              # Greater than 100
>= 21              # Greater than or equal to 21
< 50               # Less than 50
[1..10]            # Range: 1 to 10 (inclusive)
(10..20)           # Range: 10 to 20 (exclusive endpoints)
"Gold","Silver"    # Literal list (comma-separated)
-                  # Any value (matches always)
*                  # Wildcard (matches always)
any                # Any value (matches always)
```

The unary test is applied to the input value. For example, if an input column has expression `"> 100"` and the input value is `150`, the test evaluates as `150 > 100` → true.

### Output Columns (Expressions)

Output column cells contain standard FEEL expressions that compute result values:

```
true                           # Boolean literal
"gold"                         # String literal
100 * 0.1                      # Arithmetic
if Age >= 65 then "senior" else "adult"  # Conditional
[Day1, Day2, Day3]             # List construction
```

Output expressions can reference input values from the FactBag, enabling derived outputs.

## Evaluation Pipeline

The evaluation process follows these steps:

1. **Input matching** — For each row, evaluate all input column cells as unary tests against input values
2. **Row selection** — If all input cells match, the row matches
3. **Hit policy application** — Apply the hit policy to determine which matching rows to select
4. **Output computation** — For selected rows, evaluate output column expressions
5. **Result aggregation** — Combine outputs based on hit policy (single result, list, sum, etc.)
6. **FactBag forward-propagation** — Add outputs to the FactBag for downstream rules

## Practical Example

### Decision Table JSON

Here's a realistic customer discount table:

```json
{
  "id": "discount-table-001",
  "name": "Customer Discount Policy",
  "description": "Determines discount and free shipping eligibility",
  "hitPolicy": "Collect",
  "inputColumns": [
    {
      "id": "col-cust-type",
      "name": "CustomerType",
      "label": "Customer Type",
      "dataType": "string"
    },
    {
      "id": "col-order-amt",
      "name": "OrderAmount",
      "label": "Order Amount",
      "dataType": "number"
    }
  ],
  "outputColumns": [
    {
      "id": "col-discount",
      "name": "Discount",
      "label": "Discount %",
      "dataType": "number"
    },
    {
      "id": "col-shipping",
      "name": "FreeShipping",
      "label": "Free Shipping",
      "dataType": "boolean"
    }
  ],
  "rows": [
    {
      "order": 1,
      "inputCells": [
        {
          "columnId": "col-cust-type",
          "expression": "Gold"
        },
        {
          "columnId": "col-order-amt",
          "expression": ">= 500"
        }
      ],
      "outputCells": [
        {
          "columnId": "col-discount",
          "expression": "15"
        },
        {
          "columnId": "col-shipping",
          "expression": "true"
        }
      ]
    },
    {
      "order": 2,
      "inputCells": [
        {
          "columnId": "col-cust-type",
          "expression": "Silver"
        },
        {
          "columnId": "col-order-amt",
          "expression": "[100..499]"
        }
      ],
      "outputCells": [
        {
          "columnId": "col-discount",
          "expression": "10"
        },
        {
          "columnId": "col-shipping",
          "expression": "false"
        }
      ]
    },
    {
      "order": 3,
      "inputCells": [
        {
          "columnId": "col-cust-type",
          "expression": "-"
        },
        {
          "columnId": "col-order-amt",
          "expression": ">= 1000"
        }
      ],
      "outputCells": [
        {
          "columnId": "col-discount",
          "expression": "20"
        },
        {
          "columnId": "col-shipping",
          "expression": "true"
        }
      ]
    }
  ],
  "version": 1
}
```

With `CustomerType = "Gold"` and `OrderAmount = 750`:
- Row 1 matches (Gold ✓, >= 500 ✓) → output: Discount=15, FreeShipping=true
- Row 3 matches (any ✓, >= 1000 ✗) → does not match

Result (Collect policy): All matching rows are returned.

## Programmatic Usage

### .NET Integration

Use the decision table engine via dependency injection:

```csharp
var engine = serviceProvider.GetRequiredService<IDecisionTableEngine>();

var input = new Dictionary<string, object?>
{
    ["CustomerType"] = "Gold",
    ["OrderAmount"] = 750
};

var result = await engine.EvaluateAsync(
    tableId: "discount-table-001",
    input: input,
    cancellationToken: CancellationToken.None
);

// result.MatchedRows contains all matching rows
// result.OutputValues contains computed outputs
foreach (var (key, value) in result.OutputValues)
{
    Console.WriteLine($"{key}: {value}");
}
```

### Rule Conversion

Decision tables are converted to rules internally for execution within the rule engine pipeline:

```csharp
var converter = new DecisionTableToRuleConverter();
var rules = converter.Convert<MyContext>(table, ctx => ctx.FactBag);

foreach (var rule in rules.OrderBy(r => r.Order))
{
    var evaluation = await rule.EvaluateAsync(context, factBag, token);
    if (evaluation.IsSuccess)
    {
        await rule.ExecuteAsync(context, token);
    }
}
```

## Integration with Flow Graphs

Decision table nodes can be embedded in flow graphs (BPMN-style workflows):

```json
{
  "nodes": [
    {
      "id": "dt-node-1",
      "type": "DecisionTableTask",
      "tableId": "discount-table-001",
      "label": "Apply Discount Policy"
    }
  ],
  "edges": [
    {
      "from": "start",
      "to": "dt-node-1",
      "label": "always"
    },
    {
      "from": "dt-node-1",
      "to": "end",
      "label": "always"
    }
  ]
}
```

When the flow executes the decision table task:
- Input facts are passed from the FactBag
- Table is evaluated according to hit policy
- Output values are written back to the FactBag
- Execution proceeds to the next node

## Template fixture

All three Muonroi templates ship with `RuleEngineModules:DecisionTable:Enabled = false` in `appsettings.json`. To activate and seed a minimal shipping-discount table from a freshly generated project:

### 1. Enable the module

In `appsettings.json` (or `appsettings.Development.json`):

```json
{
  "RuleEngineModules": {
    "DecisionTable": {
      "Enabled": true,
      "Store": "InMemory"
    }
  }
}
```

### 2. Add the package reference

```xml
<!-- In your .csproj (enterprise tier or above) -->
<PackageReference Include="Muonroi.RuleEngine.DecisionTable.Web" Version="*" />
```

### 3. Seed the fixture at startup

Create a `DecisionTableSeeder` that runs once on application start:

```csharp
// Infrastructure/Seed/DecisionTableSeeder.cs
public class DecisionTableSeeder
{
    private readonly IDecisionTableStore _store;

    public DecisionTableSeeder(IDecisionTableStore store) => _store = store;

    public async Task SeedAsync()
    {
        var shippingDiscount = new DecisionTable
        {
            Id = "shipping-discount-001",
            Name = "Shipping Discount Policy",
            HitPolicy = HitPolicy.First,
            InputColumns =
            [
                new() { Id = "col-order-amt", Name = "OrderAmount", DataType = "number" }
            ],
            OutputColumns =
            [
                new() { Id = "col-discount-pct", Name = "DiscountPercent", DataType = "number" }
            ],
            Rows =
            [
                new() { Order = 1,
                    InputCells  = [new() { ColumnId = "col-order-amt", Expression = ">= 500" }],
                    OutputCells = [new() { ColumnId = "col-discount-pct", Expression = "15" }] },
                new() { Order = 2,
                    InputCells  = [new() { ColumnId = "col-order-amt", Expression = "[100..499]" }],
                    OutputCells = [new() { ColumnId = "col-discount-pct", Expression = "5" }] },
                new() { Order = 3,
                    InputCells  = [new() { ColumnId = "col-order-amt", Expression = "-" }],
                    OutputCells = [new() { ColumnId = "col-discount-pct", Expression = "0" }] }
            ],
            Version = 1
        };

        await _store.UpsertAsync(shippingDiscount);
    }
}
```

Register and invoke in `Program.cs`:

```csharp
// After app.Build()
using var scope = app.Services.CreateScope();
await scope.ServiceProvider.GetRequiredService<DecisionTableSeeder>().SeedAsync();
```

This makes the template self-exercising: the table is available immediately after `dotnet run` and can be called via `IDecisionTableEngine.EvaluateAsync("shipping-discount-001", ...)`.

## Versioning and History

Decision tables support full versioning with snapshot-based storage:

```bash
# Get all versions
GET /api/v1/decision-tables/{id}/versions

# Get a specific version
GET /api/v1/decision-tables/{id}/versions/{version}

# Compare two versions
GET /api/v1/decision-tables/{id}/versions/{v1}/diff/{v2}
```

The diff response includes:
- Column additions, removals, and modifications
- Row-level changes (added, removed, modified)
- Cell-level differences for changed rows

This enables audit trails and safe rollbacks. See [Decision Table Versioning](decision-table-versioning.md) for details.

## Validation and Testing

### Validation

Decision tables are validated for:

- **Schema validity** — all columns and cells well-formed
- **Expression syntax** — FEEL expressions are valid
- **Hit policy correctness** — Unique policy enforces single-match rules
- **Column uniqueness** — no duplicate column names
- **Data type compatibility** — output values match declared types

```csharp
var validator = new DecisionTableValidator();
var result = validator.Validate(table);
if (!result.IsValid)
{
    foreach (var error in result.Errors)
    {
        Console.WriteLine($"Error: {error}");
    }
}
```

### Dry-Run Execution

Test a decision table with sample inputs before deployment:

```bash
POST /api/v1/decision-tables/{id}/execute
Content-Type: application/json

{
  "customerType": "Gold",
  "orderAmount": 750
}
```

Response:
```json
{
  "matchedRows": [1, 3],
  "outputs": {
    "Discount": 15,
    "FreeShipping": true
  }
}
```

## Export and Import

Decision tables can be:

- **Exported** as JSON, DMN/XML, or CSV
- **Imported** from Excel, JSON, or DMN/XML files
- **Bulk operations** for large-scale migrations

```bash
# Export as DMN
GET /api/v1/decision-tables/{id}/export?format=dmn

# Import from file
POST /api/v1/decision-tables/import
Content-Type: multipart/form-data

file=...
```

## Best Practices

1. **Keep input columns simple** — Use 2-4 input columns per table; complex conditions belong in flow gates
2. **Use meaningful names** — Column names should be self-documenting (e.g., `CustomerType`, not `CT`)
3. **Order rows by priority** — With `First` hit policy, place most specific rules first
4. **Test edge cases** — Use dry-run to verify behavior with boundary values
5. **Document with descriptions** — Add table and column descriptions for future maintainers
6. **Version before major changes** — Create a new version before modifying hit policy or adding columns
7. **Avoid overlapping rules with Unique** — If using Unique hit policy, ensure rules are mutually exclusive

## Related Documentation

- [FEEL Reference](feel-reference.md) — Complete FEEL expression syntax and functions
- [Decision Table API Reference](decision-table-api-reference.md) — REST endpoint details
- [Decision Table Versioning](decision-table-versioning.md) — Version history and diff
- [Rule Engine Guide](rule-engine-guide.md) — Integration with the full rule execution pipeline
