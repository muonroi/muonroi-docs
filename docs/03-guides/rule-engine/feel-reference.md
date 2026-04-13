---
title: FEEL Reference
sidebar_label: FEEL Reference
sidebar_position: 5
---

FEEL (Friendly Enough Expression Language) is the expression language used throughout Muonroi for rule conditions, decision table logic, and workflow calculations. This guide covers syntax, functions, and best practices.

## API Overview

The FEEL evaluation service is exposed at:

- `POST /api/v1/feel/evaluate` — Evaluate a FEEL expression
- `POST /api/v1/feel/autocomplete` — Get expression suggestions
- `GET /api/v1/feel/examples` — Fetch example expressions

### Evaluate Endpoint

Request payload:
```json
{
  "expression": "if score >= 80 then \"pass\" else \"fail\"",
  "context": {
    "score": 92
  }
}
```

Response:
```json
{
  "result": "pass",
  "type": "String"
}
```

---

## Expression Types

### 1. Full FEEL Expressions

**Complete DMN FEEL specification** with support for complex logic, functions, and control flow.

**Use cases:**
- Complex conditional logic
- Multi-step calculations
- List/array operations
- Custom business logic

**Syntax:**
```feel
if score >= 80 then "pass" else "fail"
```

**Performance:** Compiled on first use, cached thereafter.

### 2. Unary Tests (Input Column Expressions)

**Simplified syntax for decision table input columns.** A unary test evaluates whether an input value matches a condition.

**Format:** `expression` where `input` is the implicit variable.

**Use cases:**
- Decision table row matching
- Input column validation
- Range/list membership checks

---

## Unary Test Syntax

Unary tests are used in **decision table input columns** to match incoming values.

### Comparison Operators

Compare `input` to a literal value:

```feel
> 100           // Greater than
>= 50           // Greater than or equal
< 10            // Less than
<= 5            // Less than or equal
= 42            // Equal
!= 0            // Not equal
```

**Examples in a decision table:**

| Score    | Result  |
|----------|---------|
| >= 80    | Pass    |
| >= 60    | Fail    |
| else     | Retry   |

**Evaluates to:**
```csharp
input >= 80  // If input=92 → true
input >= 60  // If input=92 → false (already matched above)
```

### Range Syntax

Match values within a range using bracket notation:

```feel
[1..100]        // Inclusive: 1 ≤ input ≤ 100
[1..100)        // Inclusive-exclusive: 1 ≤ input < 100
(1..100]        // Exclusive-inclusive: 1 < input ≤ 100
(1..100)        // Exclusive: 1 < input < 100
```

**Examples:**

```feel
[0..18)         // Ages 0-17 (minors)
[18..65]        // Ages 18-65 (working age)
(65..120]       // Ages 65+ (seniors)
```

**Decision table usage:**

| Age      | Category |
|----------|----------|
| [0..18)  | Minor    |
| [18..65] | Adult    |
| (65..120]| Senior   |

### List/Enumeration Syntax

Match one of several values:

```feel
"Gold","Silver","Platinum"    // String list
1,2,3,5,8                      // Numeric list
true,false                     // Boolean list
```

**Examples:**

```feel
"NY","CA","TX"                 // US states
"Premium","Standard"           // Subscription tiers
```

**Decision table usage:**

| Tier          | Price   |
|---------------|---------|
| Premium,Gold  | 99.99   |
| Standard      | 49.99   |
| Free,Trial    | 0       |

### Null/Empty Checks

```feel
null            // Matches null/undefined
not(null)       // Matches non-null values
-               // Wildcard: matches any value (including null)
```

**Decision table usage:**

| Status   | Action       |
|----------|--------------|
| null     | Initialize   |
| not(null)| Update       |

### Negation

Negate a value or list:

```feel
not("Bronze")                  // NOT equal to "Bronze"
not(1,2,3)                     // NOT in list [1,2,3]
```

**Examples:**

```feel
not("Inactive")                // Exclude inactive users
not([0..18))                   // NOT minors (i.e., >= 18)
```

---

## Expression vs Unary Test

### Key Differences

| Feature | Unary Test | Full Expression |
|---------|-----------|-----------------|
| Context | Input column only | Any context variables |
| Syntax | Shorthand (`> 100`) | Full FEEL syntax |
| Variables | Implicit `input` | Explicit variable names |
| Use case | Decision table matching | Rules, output fields, workflows |

### Examples

**Unary Test (decision table input):**
```feel
>= 80      // input >= 80
```

**Full Expression (rule condition):**
```feel
score >= 80 and attempts <= 3
```

**Output field expression:**
```feel
if score >= 80 then "pass" else if score >= 60 then "fail" else "retry"
```

---

## Control Flow

### If-Then-Else

```feel
if condition then value1 else value2
```

**Example:**
```feel
if score >= 80 then "pass" else "fail"

if age >= 18 and country = "US"
then "eligible"
else "ineligible"
```

### For Expression

Iterate over a list:

```feel
for x in list return x + 1
```

**Example:**
```feel
for item in items return item.price * 1.1  // Add 10% to each price
```

### Quantified Expressions

Check list membership:

```feel
some x in list satisfies x > 100      // At least one > 100
every x in list satisfies x > 0       // All are positive
```

**Example:**
```feel
some item in cartItems satisfies item.quantity > 10  // Bulk order
```

---

## Standard Library Functions

### String Functions

| Function | Signature | Description | Example |
|----------|-----------|-------------|---------|
| `string` | `string(val)` | Convert to string | `string(123)` → `"123"` |
| `string length` | `string_length(str)` | Character count | `string_length("hello")` → `5` |
| `substring` | `substring(str, start, [length])` | Extract substring | `substring("hello", 1, 2)` → `"el"` |
| `upper case` | `upper_case(str)` | Convert to uppercase | `upper_case("hello")` → `"HELLO"` |
| `lower case` | `lower_case(str)` | Convert to lowercase | `lower_case("HELLO")` → `"hello"` |
| `substring before` | `substring_before(str, match)` | Text before match | `substring_before("hello world", " ")` → `"hello"` |
| `substring after` | `substring_after(str, match)` | Text after match | `substring_after("hello world", " ")` → `"world"` |
| `replace` | `replace(str, search, replace, [flags])` | Replace text | `replace("hello", "l", "L")` → `"heLLo"` |
| `contains` | `contains(str, search)` | Check if contains | `contains("hello", "ll")` → `true` |
| `starts with` | `starts_with(str, prefix)` | Check prefix | `starts_with("hello", "he")` → `true` |
| `ends with` | `ends_with(str, suffix)` | Check suffix | `ends_with("hello", "lo")` → `true` |
| `matches` | `matches(str, regex)` | Regex match | `matches("test123", "[0-9]+")` → `true` |
| `split` | `split(str, delimiter)` | Split into list | `split("a,b,c", ",")` → `["a", "b", "c"]` |

### Numeric Functions

| Function | Signature | Description | Example |
|----------|-----------|-------------|---------|
| `decimal` | `decimal(str)` | Parse decimal | `decimal("3.14")` → `3.14` |
| `floor` | `floor(num)` | Round down | `floor(3.7)` → `3` |
| `ceiling` | `ceiling(num)` | Round up | `ceiling(3.2)` → `4` |
| `round` | `round(num, [digits])` | Round to precision | `round(3.14159, 2)` → `3.14` |
| `abs` | `abs(num)` | Absolute value | `abs(-5)` → `5` |
| `modulo` | `modulo(a, b)` | Remainder | `modulo(10, 3)` → `1` |
| `sqrt` | `sqrt(num)` | Square root | `sqrt(16)` → `4` |
| `log` | `log(num)` | Natural logarithm | `log(2.718)` → `1` |
| `exp` | `exp(num)` | e raised to power | `exp(1)` → `2.718` |
| `odd` | `odd(num)` | Check if odd | `odd(3)` → `true` |
| `even` | `even(num)` | Check if even | `even(4)` → `true` |

### List Functions

| Function | Signature | Description | Example |
|----------|-----------|-------------|---------|
| `list contains` | `list_contains(list, value)` | Check membership | `list_contains([1,2,3], 2)` → `true` |
| `count` | `count(list)` | Count elements | `count([1,2,3])` → `3` |
| `min` | `min(list)` | Minimum value | `min([3,1,2])` → `1` |
| `max` | `max(list)` | Maximum value | `max([3,1,2])` → `3` |
| `sum` | `sum(list)` | Sum all elements | `sum([1,2,3])` → `6` |
| `mean` | `mean(list)` | Average value | `mean([1,2,3])` → `2` |
| `all` | `all(list)` | All true (AND) | `all([true, true])` → `true` |
| `any` | `any(list)` | Any true (OR) | `any([true, false])` → `true` |
| `append` | `append(list, value)` | Add to end | `append([1,2], 3)` → `[1,2,3]` |
| `concatenate` | `concatenate(list1, list2, ...)` | Merge lists | `concatenate([1,2], [3,4])` → `[1,2,3,4]` |
| `insert before` | `insert_before(list, position, value)` | Insert at index | `insert_before([1,3], 2, 2)` → `[1,2,3]` |
| `remove` | `remove(list, value)` | Remove value | `remove([1,2,3], 2)` → `[1,3]` |
| `reverse` | `reverse(list)` | Reverse order | `reverse([1,2,3])` → `[3,2,1]` |
| `index of` | `index_of(list, value)` | Find position | `index_of([1,2,3], 2)` → `2` |
| `union` | `union(list1, list2)` | Combine unique | `union([1,2], [2,3])` → `[1,2,3]` |
| `distinct values` | `distinct_values(list)` | Remove duplicates | `distinct_values([1,1,2])` → `[1,2]` |
| `flatten` | `flatten(list)` | Flatten nested list | `flatten([[1,2], [3,4]])` → `[1,2,3,4]` |
| `sort` | `sort(list)` | Sort ascending | `sort([3,1,2])` → `[1,2,3]` |

### Date/Time Functions

| Function | Signature | Description | Example |
|----------|-----------|-------------|---------|
| `today` | `today()` | Current date | `today()` → `date(2026,3,20)` |
| `now` | `now()` | Current date-time | `now()` → `date and time(2026,3,20, 10:30:00)` |
| `date` | `date(year, month, day)` | Create date | `date(2026, 3, 20)` |
| `time` | `time(hour, minute, [second])` | Create time | `time(14, 30, 0)` |
| `date and time` | `date_and_time(date, time)` | Combine date+time | `date_and_time(date(...), time(...))` |
| `duration` | `duration(str)` | Parse duration | `duration("P1Y2M3D")` → ISO 8601 duration |
| `years and months duration` | `years_and_months_duration(from, to)` | Months between dates | `years_and_months_duration(date1, date2)` |
| `days and time duration` | `days_and_time_duration(from, to)` | Days + hours between | `days_and_time_duration(date1, date2)` |
| `day of week` | `day_of_week(date)` | Day number (1-7) | `day_of_week(date(2026, 3, 20))` → `5` (Friday) |
| `day of year` | `day_of_year(date)` | Day number (1-365) | `day_of_year(date(2026, 1, 1))` → `1` |
| `week of year` | `week_of_year(date)` | Week number (1-53) | `week_of_year(date(2026, 3, 20))` → `12` |
| `month of year` | `month_of_year(date)` | Month number (1-12) | `month_of_year(date(2026, 3, 20))` → `3` |
| `year` | `year(date)` | Extract year | `year(date(2026, 3, 20))` → `2026` |

### Context Functions

| Function | Signature | Description | Example |
|----------|-----------|-------------|---------|
| `get entries` | `get_entries(context)` | List all key-value pairs | `get_entries(myContext)` |
| `get value` | `get_value(context, key)` | Get by key | `get_value(myContext, "name")` |

---

## Keywords

Reserved words in FEEL expressions:

- `if`, `then`, `else` — Conditional logic
- `for`, `in` — Iteration
- `some`, `every`, `satisfies` — List quantification
- `between`, `and` — Range checks
- `instance of` — Type checks
- `or`, `not` — Boolean operators

---

## IFeelCellEvaluator Interface

The `IFeelCellEvaluator` interface evaluates FEEL expressions within decision tables.

### Interface Definition

```csharp
public interface IFeelCellEvaluator
{
    /// <summary>
    /// Evaluates a single input-cell expression against an input value.
    /// </summary>
    bool Evaluate(string expression, object? inputValue, string? columnDataType = null);

    /// <summary>
    /// Validates expression syntax. Returns null when valid; otherwise an error message.
    /// </summary>
    string? Validate(string expression, string? columnDataType = null);
}
```

### Implementations

**FullFeelCellEvaluator** (default)
- Supports complete FEEL syntax for unary tests
- Normalizes shorthand syntax (`> 100` → `input > 100`)
- Type coercion for numeric, boolean, date types
- Falls back to simplified evaluator on parse errors

**SimplifiedFeelCellEvaluator**
- Fast evaluation subset of FEEL
- Optimized for common decision table patterns
- No external dependency compilation
- Used as fallback in FullFeelCellEvaluator

### Example: Custom Evaluator

```csharp
public class CustomFeelEvaluator : IFeelCellEvaluator
{
    public bool Evaluate(string expression, object? inputValue, string? columnDataType = null)
    {
        // Custom logic: e.g., domain-specific operators
        if (expression == "premium_range")
        {
            return inputValue is >= 100 and < 1000;
        }

        // Delegate to built-in evaluator
        return new FullFeelCellEvaluator().Evaluate(expression, inputValue, columnDataType);
    }

    public string? Validate(string expression, string? columnDataType = null)
    {
        return null;  // Custom validation
    }
}
```

### Registration

```csharp
services.AddDecisionTableEngine()
    .ConfigureFeel(options =>
    {
        options.CellEvaluator = new CustomFeelEvaluator();
    });
```

---

## Decision Table Integration Examples

### Input Column with Unary Tests

Decision table:

| Age      | Tier      | Discount |
|----------|-----------|----------|
| [0..18)  | Child     | 50%      |
| [18..65] | Adult     | 0%       |
| (65..120]| Senior    | 20%      |

Evaluation:
```csharp
var table = await engine.EvaluateTableAsync("PricingTable", new { age = 35 });
// Input "35" matches row 2: [18..65] → Adult, 0%
```

### Output Column with Expressions

Decision table:

| Score    | Rating |
|----------|--------|
| >= 90    | A      |
| >= 80    | B      |
| >= 70    | C      |
| else     | F      |

Output column can use expressions:
```feel
if score >= 90 then "Excellent" else if score >= 80 then "Good" else "Needs Improvement"
```

### Cross-Column References

Decision table with computed output:

| Units | Price | Total |
|-------|-------|-------|
| > 100 | 10    | units * 9  |
| else  | 10    | units * 10 |

Expression: `units * price * 0.9` (for units > 100)

---

## Best Practices

### 1. Keep Expressions Readable

**Bad:**
```feel
if x>10&&y<20||z==30then"ok"else"fail"
```

**Good:**
```feel
if (x > 10 and y < 20) or z = 30 then "ok" else "fail"
```

### 2. Use Type Hints in Decision Tables

```csharp
var options = new DecisionTableOptions
{
    ColumnDataTypes = new Dictionary<string, string>
    {
        ["age"] = "numeric",
        ["joinDate"] = "date",
        ["status"] = "string"
    }
};
```

### 3. Null Safety

Always check for null in complex expressions:
```feel
if name != null and string_length(name) > 0 then name else "Unknown"
```

### 4. List Operations

Use list functions for cleaner logic:
```feel
if list_contains(["NY", "CA", "TX"], state) then "major_hub" else "standard"
```

### 5. Performance

- Cache compiled expressions at runtime
- Use simplified FEEL for high-throughput operations
- Avoid deeply nested conditionals

---

## Error Handling

### Validation Errors

```csharp
var validator = evaluator as IFeelCellEvaluator;
string? error = validator?.Validate("> 100", "numeric");
if (error != null)
{
    Console.WriteLine($"Validation error: {error}");
}
```

### Type Coercion

FEEL automatically coerces types when possible:

```feel
"42" > 40      // String "42" coerced to 42, true
```

If coercion fails, the expression returns `null`:

```feel
"abc" > 40     // Cannot coerce "abc" to number → null → false
```

---

## See Also

- [Decision Table Guide](./decision-table-guide.md) — Detailed decision table reference
- [Rule Engine Advanced Patterns](./rule-engine-advanced-patterns.md) — Complex rule orchestration
- [Workflow Guide](../workflows/workflow-guide.md) — Using FEEL in workflows
