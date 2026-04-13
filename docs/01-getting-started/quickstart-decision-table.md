---
title: Decision Table Quickstart
sidebar_position: 3
sidebar_label: Decision Tables
---

# Decision Table Quickstart

Decision tables are a visual, business-friendly way to define conditional logic without writing code. This quickstart walks you through creating, configuring, and executing a decision table for a real-world loan approval scenario.

## Prerequisites

- .NET 8+ with ASP.NET Core
- PostgreSQL 14+ running locally or via Docker
- Basic familiarity with JSON and HTTP APIs

## 1. Register the web packages

In your `.csproj` or via Package Manager, install:

```bash
dotnet add package Muonroi.RuleEngine.DecisionTable.Web
dotnet add package Muonroi.FeelEngine.Web
```

Then, in `Program.cs`:

```csharp
using Muonroi.RuleEngine.DecisionTable.Web;
using Muonroi.FeelEngine.Web;

builder.Services.AddFeelWeb();
builder.Services.AddDecisionTableWeb(o =>
{
    o.PostgresConnectionString = builder.Configuration
        .GetConnectionString("RuleDb") 
        ?? "Host=localhost;Database=muonroi_tables;Username=admin;Password=admin";
});
```

Also register the decision table endpoints:

```csharp
app.MapControllers();
```

## 2. Create a decision table

A decision table is a collection of rows where each row tests input conditions and produces outputs. Here's a complete example: a **Loan Approval Decision Table**.

### Decision Table JSON Structure

Save this as `loan-approval-table.json`:

```json
{
  "id": "loan-approval",
  "name": "Loan Approval Policy",
  "description": "Determines loan eligibility based on credit score, income, and debt-to-income ratio",
  "hitPolicy": "First",
  "inputColumns": [
    {
      "id": "input-credit-score",
      "name": "CreditScore",
      "label": "Credit Score",
      "dataType": "number"
    },
    {
      "id": "input-dti-ratio",
      "name": "DebtToIncomeRatio",
      "label": "Debt-to-Income Ratio",
      "dataType": "number"
    },
    {
      "id": "input-employment-years",
      "name": "EmploymentYears",
      "label": "Years of Employment",
      "dataType": "number"
    }
  ],
  "outputColumns": [
    {
      "id": "output-approved",
      "name": "Approved",
      "label": "Loan Approved",
      "dataType": "boolean"
    },
    {
      "id": "output-reason",
      "name": "Reason",
      "label": "Approval Reason",
      "dataType": "string"
    },
    {
      "id": "output-max-amount",
      "name": "MaxLoanAmount",
      "label": "Maximum Loan Amount (USD)",
      "dataType": "number"
    }
  ],
  "rows": [
    {
      "order": 1,
      "description": "High credit score + stable employment + low debt",
      "inputCells": [
        {
          "columnId": "input-credit-score",
          "expression": ">= 750"
        },
        {
          "columnId": "input-dti-ratio",
          "expression": "< 0.35"
        },
        {
          "columnId": "input-employment-years",
          "expression": ">= 3"
        }
      ],
      "outputCells": [
        {
          "columnId": "output-approved",
          "expression": "true"
        },
        {
          "columnId": "output-reason",
          "expression": "\"Excellent credit and financial profile\""
        },
        {
          "columnId": "output-max-amount",
          "expression": "500000"
        }
      ]
    },
    {
      "order": 2,
      "description": "Good credit score + moderate debt + employed",
      "inputCells": [
        {
          "columnId": "input-credit-score",
          "expression": ">= 680"
        },
        {
          "columnId": "input-dti-ratio",
          "expression": "[0.35..0.5)"
        },
        {
          "columnId": "input-employment-years",
          "expression": ">= 2"
        }
      ],
      "outputCells": [
        {
          "columnId": "output-approved",
          "expression": "true"
        },
        {
          "columnId": "output-reason",
          "expression": "\"Good credit and stable income\""
        },
        {
          "columnId": "output-max-amount",
          "expression": "250000"
        }
      ]
    },
    {
      "order": 3,
      "description": "Fair credit + low employment history",
      "inputCells": [
        {
          "columnId": "input-credit-score",
          "expression": "[600..680)"
        },
        {
          "columnId": "input-dti-ratio",
          "expression": "< 0.45"
        },
        {
          "columnId": "input-employment-years",
          "expression": ">= 1"
        }
      ],
      "outputCells": [
        {
          "columnId": "output-approved",
          "expression": "true"
        },
        {
          "columnId": "output-reason",
          "expression": "\"Fair credit profile with adequate income\""
        },
        {
          "columnId": "output-max-amount",
          "expression": "100000"
        }
      ]
    },
    {
      "order": 4,
      "description": "Default rejection: poor credit or high debt",
      "inputCells": [
        {
          "columnId": "input-credit-score",
          "expression": "-"
        },
        {
          "columnId": "input-dti-ratio",
          "expression": "-"
        },
        {
          "columnId": "input-employment-years",
          "expression": "-"
        }
      ],
      "outputCells": [
        {
          "columnId": "output-approved",
          "expression": "false"
        },
        {
          "columnId": "output-reason",
          "expression": "\"Application does not meet minimum requirements\""
        },
        {
          "columnId": "output-max-amount",
          "expression": "0"
        }
      ]
    }
  ],
  "version": 1
}
```

### Create via API

Send a POST request to create the table:

```bash
curl -X POST http://localhost:5000/api/v1/decision-tables \
  -H "Content-Type: application/json" \
  -d @loan-approval-table.json
```

Response:
```json
{
  "id": "loan-approval",
  "name": "Loan Approval Policy",
  "version": 1,
  "createdAt": "2026-03-20T10:30:00Z",
  "modifiedAt": "2026-03-20T10:30:00Z"
}
```

## 3. Understanding Hit Policies

The `hitPolicy` field determines which rows are selected when multiple rows match the input conditions.

### Hit Policy: First

With `"hitPolicy": "First"`, the table returns **only the first matching row** (top-to-bottom). This is ideal for sequential, priority-based logic:

**Loan Approval Example:**
- Row 1: Credit ≥750 AND DTI &lt;0.35 AND Employment ≥3 → **STOP HERE if match**
- Row 2: Credit ≥680 AND DTI &lt;0.5 AND Employment ≥2 → Only checked if Row 1 fails
- Row 3: Credit ≥600 AND DTI &lt;0.45 AND Employment ≥1 → Only checked if Rows 1-2 fail
- Row 4: Any input → Default fallback

**Evaluation Example:**
| Input | CreditScore | DTI | Employment | Matched Row | Approved | Reason | MaxLoan |
|-------|-------------|-----|------------|-------------|----------|--------|---------|
| A | 760 | 0.30 | 5 | Row 1 | true | Excellent credit... | 500000 |
| B | 700 | 0.40 | 3 | Row 2 | true | Good credit... | 250000 |
| C | 650 | 0.35 | 1 | Row 3 | true | Fair credit... | 100000 |
| D | 550 | 0.60 | 0.5 | Row 4 | false | Does not meet... | 0 |

### Other Common Hit Policies

| Policy | Behavior | Use Case |
|--------|----------|----------|
| **First** | Return first match (stop) | Sequential priority |
| **Unique** | Exactly one match required; error if 0 or >1 | Deterministic, non-overlapping rules |
| **Collect** | Return all matching rows as a list | Gather all applicable rules |
| **Priority** | Return highest priority match | Select by priority field |

For this quickstart, **First** is the standard choice.

## 4. Execute the decision table

### Dry-Run: Test with sample input

Before using in production, test with sample data:

```bash
curl -X POST http://localhost:5000/api/v1/decision-tables/loan-approval/execute \
  -H "Content-Type: application/json" \
  -d '{
    "CreditScore": 710,
    "DebtToIncomeRatio": 0.38,
    "EmploymentYears": 2.5
  }'
```

Response:
```json
{
  "matchedRow": 2,
  "outputs": {
    "Approved": true,
    "Reason": "Good credit and stable income",
    "MaxLoanAmount": 250000
  }
}
```

### Evaluate: Execute via .NET

From your application code:

```csharp
using Muonroi.RuleEngine.DecisionTable;

public class LoanService(IDecisionTableEngine engine)
{
    public async Task<LoanDecision> ApproveLoan(LoanApplication app)
    {
        var inputs = new Dictionary<string, object?>
        {
            ["CreditScore"] = app.CreditScore,
            ["DebtToIncomeRatio"] = app.MonthlyDebt / app.MonthlyIncome,
            ["EmploymentYears"] = app.EmploymentMonths / 12.0
        };

        var result = await engine.EvaluateAsync(
            tableId: "loan-approval",
            input: inputs,
            version: null, // uses active version
            cancellationToken: CancellationToken.None
        );

        return new LoanDecision
        {
            Approved = (bool)result.OutputValues["Approved"],
            Reason = (string)result.OutputValues["Reason"],
            MaxLoanAmount = (decimal)result.OutputValues["MaxLoanAmount"]
        };
    }
}
```

## 5. FEEL expressions in decision table cells

### Input Cell Examples

Input cells use **unary test** syntax (implicit left operand from column):

```
> 750              # Greater than 750
>= 680             # Greater than or equal to 680
< 0.5              # Less than 0.5
[600..680)         # Range: 600 to 680 (right-exclusive)
[0.35..0.5)        # Range: 0.35 to 0.5
-                  # Any value (matches always)
*                  # Wildcard (matches always)
"Gold","Silver"    # List of literals
```

### Output Cell Examples

Output cells are full FEEL expressions:

```
true                                        # Boolean literal
"Excellent credit and financial profile"   # String literal
500000                                      # Number literal
if CreditScore >= 750 then 500000 else 250000  # Conditional
CreditScore / 100 * 2                      # Arithmetic
```

### Real Example: Dynamic Max Loan Amount

Modify row 1's max amount to be **credit-based**:

```json
{
  "columnId": "output-max-amount",
  "expression": "(CreditScore - 700) * 1000"
}
```

With `CreditScore = 760`: `(760 - 700) * 1000 = 60000`

## 6. Verify and list tables

### List all decision tables:

```bash
curl http://localhost:5000/api/v1/decision-tables
```

### Get a specific table:

```bash
curl http://localhost:5000/api/v1/decision-tables/loan-approval
```

### Get table versions:

```bash
curl http://localhost:5000/api/v1/decision-tables/loan-approval/versions
```

Response shows version history for audit trails and rollbacks.

## 7. Integration with flow graphs

Decision tables integrate seamlessly with **flow graphs** (BPMN-style workflows). A decision table node in a flow:

1. Receives inputs from the FactBag
2. Evaluates according to hit policy
3. Writes outputs back to the FactBag
4. Passes control to the next step

Example flow node:

```json
{
  "id": "dt-loan-approval",
  "type": "DecisionTableTask",
  "tableId": "loan-approval",
  "label": "Apply Loan Approval Rules",
  "inputs": {
    "CreditScore": "$.applicant.creditScore",
    "DebtToIncomeRatio": "$.applicant.dti",
    "EmploymentYears": "$.applicant.employmentYears"
  },
  "outputs": {
    "Approved": "$.loanDecision.approved",
    "Reason": "$.loanDecision.reason",
    "MaxLoanAmount": "$.loanDecision.maxAmount"
  }
}
```

When executed, the decision table task evaluates the loan-approval table and populates the FactBag with outputs.

See [Decision Table Guide](../03-guides/rule-engine/decision-table-guide.md) for full integration details.

## 8. Next steps

- **[Decision Table Guide](../03-guides/rule-engine/decision-table-guide.md)** — Deep dive into hit policies, validation, versioning, and best practices
- **[FEEL Reference](../03-guides/rule-engine/feel-reference.md)** — Complete FEEL expression language syntax and built-in functions
- **[Decision Table API Reference](../05-reference/decision-table-api.md)** — Full REST endpoint documentation
- **[Loan Approval Sample](../06-resources/samples/loan-approval.md)** — Complete working sample with flow graph integration
- **[Quickstart Decision Table Sample](../06-resources/samples/quickstart-decision-table.md)** — Minimal runnable sample project

---

**Ready to build?** Clone the sample project and run the quickstart API:

```bash
cd muonroi-building-block/samples/Quickstart.DecisionTable/src/Quickstart.DecisionTable.Api
dotnet run
```

Then post the loan-approval-table.json above and start evaluating loan applications!
