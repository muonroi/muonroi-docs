---
title: RuleGen CLI Guide
sidebar_label: RuleGen CLI
sidebar_position: 2
---

# RuleGen CLI Guide

**RuleGen** (muonroi-rule) is the code-first rule extraction and generation CLI for the Muonroi rule engine. It transforms C# methods marked with `[MExtractAsRule]` into production-ready rule classes, test scaffolds, and DI registration code.

Current version: **v2.0.0**

## Installation

Install as a global .NET tool:

```bash
dotnet tool install -g Muonroi.RuleGen
```

Or update an existing installation:

```bash
dotnet tool update -g Muonroi.RuleGen
```

Then invoke via:

```bash
muonroi-rule <command> [options]
```

## Core Concepts

### Attribute Model

Rule extraction centers on the `[MExtractAsRule(...)]` attribute. When you mark a method with this attribute, RuleGen's Roslyn analyzer extracts it and generates a standalone rule class implementing `IRuleDefinition<TContext>`.

**Key metadata captured:**
- **Rule Code**: Unique identifier (e.g., `LOAN_APPROVAL_CHECK`)
- **Order**: Execution priority (default: 1)
- **HookPoint**: Lifecycle stage (e.g., `OnStart`, `OnValidate`, `OnExecute`)
- **DependsOn**: List of rule codes this rule depends on (for dependency graph)
- **Context Type**: The FactBag context type (e.g., `LoanApplicationContext`)

### Rule Extraction Flow

```
Source Code (handlers with [MExtractAsRule])
    ↓
RoslynRuleExtractor (syntax + semantic analysis)
    ↓
ExtractedRuleDefinition (metadata model)
    ↓
RuleClassWriter (generates IRuleDefinition<T>)
    ↓
GeneratedRuleName.g.cs
```

RuleGen uses **Roslyn** for full semantic analysis, ensuring type-safe extraction without compilation.

## Commands

### extract

Extract methods marked with `[MExtractAsRule]` into individual rule class files.

```bash
muonroi-rule extract \
  --source src/Handlers \
  --output Generated/Rules \
  --namespace MyApp.Generated.Rules \
  --context-type MyApp.Domain.LoanContext
```

**Options:**
- `--source` — Single source file or directory to scan
- `--source-dir` — Alternative to `--source`
- `--output` — Directory where rule classes are written (default: `<source>/Rules`)
- `--project` — Optional .csproj to infer settings
- `--namespace` — Output namespace for generated rules
- `--context-type` — Override inferred FactBag context type
- `--pattern` — Glob pattern for source files (default: `**/*.cs`)
- `--exclude-patterns` — Patterns to exclude (e.g., `**/bin/**`, `**/*.g.cs`)
- `--validate` — Run validation after extraction (default: true)
- `--parallel` — Use parallel extraction (default: true)
- `--organize-by-namespace` — Group outputs by source namespace (default: false)

**Output:**
```
Generated/Rules/
├── LOAN_APPROVAL_CHECK.g.cs
├── LOAN_ELIGIBILITY_VERIFY.g.cs
└── LOAN_INTEREST_CALC.g.cs
```

Each file contains:
```csharp
public class LOAN_APPROVAL_CHECKRule : IRuleDefinition<LoanApplicationContext>
{
    public string Code => "LOAN_APPROVAL_CHECK";
    public int Order => 10;
    public HookPoint Hook => HookPoint.OnValidate;
    public IReadOnlyList<string> DependsOn => new[] { "LOAN_ELIGIBILITY_VERIFY" };

    public async Task<RuleEvaluationResult> EvaluateAsync(LoanApplicationContext fact)
    {
        // Generated from source method body
        return fact.ApprovedAmount > 0
            ? new RuleEvaluationResult { Passed = true }
            : new RuleEvaluationResult { Passed = false, Message = "Not approved" };
    }

    public async Task ExecuteAsync(LoanApplicationContext fact)
    {
        // Side effects
        fact.Status = "APPROVED";
    }
}
```

### verify

Validate extracted rules for consistency, circular dependencies, duplicate codes, and missing references.

```bash
muonroi-rule verify --source-dir src/Handlers
```

**Checks:**
- **Duplicate rule codes** — Same code in multiple files
- **Invalid HookPoint** — Code name doesn't match enum `HookPoint`
- **Missing dependencies** — DependsOn references non-existent rules
- **Circular dependencies** — Cyclic DependsOn chain
- **Type mismatches** — FactBag context type inconsistencies

**Output example:**
```
[rulegen] ERROR: Duplicate rule code 'LOAN_CHECK' at Handler1.cs:45, Handler2.cs:78
[rulegen] WARNING: Rule 'CALC_INTEREST' depends on missing rule 'CALC_FEES'
[rulegen] ERROR: Circular dependency detected: LOAN_CHECK -> ELIGIBILITY_CHECK -> LOAN_CHECK
```

Exit code: `0` = pass, `1` = validation errors.

### register

Generate DI registration code and optional dispatcher classes.

```bash
muonroi-rule register \
  --rules Generated/Rules \
  --output Generated/MGeneratedRuleRegistrationExtensions.g.cs
```

**Options:**
- `--rules` — Directory containing generated rule files
- `--output` — Output file for registration extension method
- `--dispatcher-output` — Optional directory for dispatcher classes
- `--namespace` — Override registration namespace

**Generated registration code:**
```csharp
public static class MGeneratedRuleRegistrationExtensions
{
    public static IServiceCollection AddGeneratedRules(this IServiceCollection services)
    {
        services.AddScoped<IRuleDefinition<LoanApplicationContext>, LOAN_APPROVAL_CHECKRule>();
        services.AddScoped<IRuleDefinition<LoanApplicationContext>, LOAN_ELIGIBILITY_VERIFYRule>();
        services.AddScoped<IRuleDefinition<LoanApplicationContext>, LOAN_INTEREST_CALCRule>();
        return services;
    }
}
```

Then in `Program.cs`:
```csharp
builder.Services.AddGeneratedRules();
```

**With dispatcher:**
```bash
muonroi-rule register --rules Generated/Rules --dispatcher-output Generated/Dispatchers
```

Creates context-specific dispatchers (one per unique context type) for efficient rule lookup.

### generate-tests

Scaffold xUnit test files for each extracted rule using Arrange/Act/Assert pattern.

```bash
muonroi-rule generate-tests \
  --rules Generated/Rules \
  --output Tests/Generated
```

**Options:**
- `--rules` — Directory with rule files
- `--output` — Output directory for test files
- `--test-framework` — `xunit` (default) or `nunit`
- `--include-mocks` — Generate mock FactBag builders (default: true)

**Generated test scaffold:**
```csharp
public class LOAN_APPROVAL_CHECKRuleTests
{
    [Fact]
    public async Task EvaluateAsync_WhenApprovedAmountGreaterThanZero_ReturnsPassed()
    {
        // Arrange
        var context = new LoanApplicationContext
        {
            ApprovedAmount = 50000m,
            ApplicantId = "TEST_001"
        };
        var rule = new LOAN_APPROVAL_CHECKRule();

        // Act
        var result = await rule.EvaluateAsync(context);

        // Assert
        Assert.True(result.Passed);
    }

    [Fact]
    public async Task EvaluateAsync_WhenApprovedAmountIsZero_ReturnsFailed()
    {
        // Arrange
        var context = new LoanApplicationContext
        {
            ApprovedAmount = 0m,
            ApplicantId = "TEST_002"
        };
        var rule = new LOAN_APPROVAL_CHECKRule();

        // Act
        var result = await rule.EvaluateAsync(context);

        // Assert
        Assert.False(result.Passed);
        Assert.Contains("Not approved", result.Message);
    }
}
```

Tests include:
- Happy path scenarios
- Edge cases (null, empty, boundary values)
- Exception handling
- FactBag assertion helpers

### merge

Merge runtime rules, generated rule files, or `[MExtractAsRule]` source folders into a target handler class.

```bash
muonroi-rule merge \
  --rules-dir Generated/Rules \
  --target src/Handlers/LoanHandler.cs \
  --class LoanHandler \
  --namespace MyApp.Handlers
```

**Options:**
- `--rules-dir` — Source of rule files to merge
- `--source-dir` — Alternative: merge from [MExtractAsRule] source folder
- `--target` — Target handler file to merge into
- `--class` — Target class name
- `--namespace` — Target namespace
- `--require-partial` — Require target class be partial (default: true)

**Before merge:**
```csharp
// LoanHandler.cs
public partial class LoanHandler
{
    public LoanHandler(IRepository repo) => _repo = repo;
    // Rules will be injected here
}
```

**After merge:**
```csharp
public partial class LoanHandler
{
    public LoanHandler(IRepository repo) => _repo = repo;

    [MExtractAsRule("LOAN_APPROVAL_CHECK", Order = 10, HookPoint = HookPoint.OnValidate)]
    public async Task<RuleEvaluationResult> ApprovalCheck(LoanApplicationContext fact)
    {
        return fact.ApprovedAmount > 0
            ? new RuleEvaluationResult { Passed = true }
            : new RuleEvaluationResult { Passed = false, Message = "Not approved" };
    }

    [MExtractAsRule("LOAN_ELIGIBILITY_VERIFY", Order = 20, HookPoint = HookPoint.OnValidate)]
    public async Task<RuleEvaluationResult> EligibilityVerify(LoanApplicationContext fact)
    {
        // ...
    }
}
```

### split

Split rules from a handler class back into individual rule files (reverse of merge).

```bash
muonroi-rule split \
  --source src/Handlers/LoanHandler.cs \
  --output Generated/Rules \
  --workflow loan-approval
```

**Options:**
- `--source` — Handler file with [MExtractAsRule] methods
- `--output` — Output directory for rule files
- `--workflow` — Optional: filter by workflow name
- `--preserve-attributes` — Keep original attributes (default: true)

Useful for refactoring monolithic handlers into modular rule files.

### watch

Watch source directory for changes and auto-regenerate rules in real-time.

```bash
muonroi-rule watch \
  --source src/Handlers \
  --output Generated/Rules \
  --namespace MyApp.Generated.Rules
```

**Options:**
- `--source` — Directory to watch
- `--output` — Auto-generation output directory
- `--validate` — Run validation on changes (default: true)
- `--debounce-ms` — Debounce delay in milliseconds (default: 500)

**Output:**
```
[rulegen] Watching src/Handlers...
[rulegen] File changed: src/Handlers/LoanHandler.cs
[rulegen] Extracting 2 rules...
[rulegen] + LOAN_APPROVAL_CHECK
[rulegen] + LOAN_ELIGIBILITY_VERIFY
[rulegen] Generated 2 rules in 234ms
```

Press `Ctrl+C` to stop watching.

## Configuration File

The CLI searches for `.rulegenrc.json` in the working directory to standardize settings across team environments.

### Example .rulegenrc.json

```json
{
  "extract": {
    "sourceDir": "src/Handlers",
    "outputDir": "src/Generated/Rules",
    "namespace": "MyApp.Generated.Rules",
    "contextType": "MyApp.Domain.OrderContext",
    "pattern": "**/*Handler.cs",
    "excludePatterns": [
      "**/bin/**",
      "**/obj/**",
      "**/*.g.cs",
      "**/*.Generated.cs"
    ],
    "generateTests": true,
    "validate": true,
    "organizeByNamespace": false,
    "parallel": true
  },
  "conventions": {
    "requirePartialForMerge": true
  },
  "validation": {
    "detectCycles": true,
    "requireUniqueCode": true,
    "requireXmlDocs": false
  }
}
```

### Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `extract.sourceDir` | string | `src` | Directory containing handlers with [MExtractAsRule] |
| `extract.outputDir` | string | `<sourceDir>/Rules` | Where to write generated rule classes |
| `extract.namespace` | string | `{project}.Generated.Rules` | Output namespace for generated classes |
| `extract.contextType` | string | Auto-detected | Override inferred FactBag context type |
| `extract.pattern` | string | `**/*.cs` | File pattern to match |
| `extract.excludePatterns` | string[] | `[]**/bin/**, **/obj/**` | Patterns to exclude |
| `extract.generateTests` | bool | `true` | Auto-scaffold test files |
| `extract.validate` | bool | `true` | Run validation after extraction |
| `extract.organizeByNamespace` | bool | `false` | Group outputs by source namespace |
| `extract.parallel` | bool | `true` | Use parallel extraction |
| `conventions.requirePartialForMerge` | bool | `true` | Require target class be partial for merge |
| `validation.detectCycles` | bool | `true` | Detect circular dependencies |
| `validation.requireUniqueCode` | bool | `true` | Enforce unique rule codes |
| `validation.requireXmlDocs` | bool | `false` | Require XML doc comments |

When `.rulegenrc.json` exists, invoke commands with minimal options:

```bash
# Uses settings from .rulegenrc.json
muonroi-rule extract

# Or override specific settings
muonroi-rule extract --namespace MyApp.Generated
```

## Diagnostics

RuleGen validates rules during extraction and verification. Diagnostics are categorized as errors (fail extraction) or warnings (logged but continue).

### Diagnostic Reference

| ID | Severity | Description | Example |
|----|----------|-------------|---------|
| **MRG001** | Error | Duplicate rule code | `Duplicate rule code 'LOAN_CHECK' at Handler1.cs:45, Handler2.cs:78` |
| **MRG002** | Error | Invalid HookPoint enum | `Rule 'CALC_INTEREST' has invalid HookPoint 'OnCustom'` |
| **MRG003** | Warning | Missing [MExtractAsRule] attribute | `Method 'CalculateRate' not marked with [MExtractAsRule]` |
| **MRG004** | Error | Circular dependency detected | `Circular dependency: LOAN_CHECK -> ELIGIBILITY -> LOAN_CHECK` |
| **MRG005** | Warning | Missing dependency reference | `Rule 'CALC_INTEREST' depends on missing rule 'CALC_FEES'` |
| **MRG006** | Warning | Order > 1 without dependency | `Rule has Order 20 but no DependsOn references` |
| **MRG007** | Error | Context type mismatch | `Rule references LoanContext but others use OrderContext` |
| **MRG008** | Error | Unsupported rule class attribute | `Rule class must not be abstract or sealed` |
| **MRG009** | Warning | Type inference failed | `Could not infer context type from method signature` |

**Example diagnostic output:**
```bash
$ muonroi-rule extract --source src/Handlers --validate

[rulegen] Extracting rules from src/Handlers...
[rulegen] + LOAN_APPROVAL_CHECK
[rulegen] + LOAN_ELIGIBILITY_VERIFY
[rulegen] ! LOAN_INTEREST_CALC (MRG006: Order 15 without DependsOn)
[rulegen] ERROR: Circular dependency detected: VERIFY -> CALC -> APPROVE -> VERIFY (MRG004)
[rulegen] Extraction failed with 1 error, 1 warning.
```

## Attribute Reference

### [MExtractAsRule]

Mark a method to be extracted into a standalone rule class.

```csharp
[MExtractAsRule(
    code: "LOAN_APPROVAL_CHECK",
    Order = 10,
    HookPoint = HookPoint.OnValidate,
    DependsOn = new[] { "LOAN_ELIGIBILITY_VERIFY" }
)]
public async Task<RuleEvaluationResult> ApproveLoans(LoanApplicationContext fact)
{
    return new RuleEvaluationResult { Passed = fact.ApprovedAmount > 0 };
}
```

**Parameters:**
- `code` — Unique rule identifier (required, case-insensitive)
- `Order` — Execution priority (default: 1, range: 1-255)
- `HookPoint` — Lifecycle stage: `OnStart`, `OnValidate`, `OnExecute`, `OnCompensate`, `OnError` (default: `OnExecute`)
- `DependsOn` — Array of rule codes this rule depends on (default: empty)

## Common Workflows

### Workflow 1: Extract → Verify → Register

Code-first development cycle:

```bash
# 1. Extract rules from source
muonroi-rule extract --source src/Handlers --output Generated/Rules

# 2. Verify extracted rules
muonroi-rule verify --source-dir src/Handlers

# 3. Generate registration code
muonroi-rule register --rules Generated/Rules --output Generated/MGeneratedRuleRegistrationExtensions.g.cs

# 4. In Program.cs
# services.AddGeneratedRules();
```

### Workflow 2: Watch + Auto-Generate

Development with live refresh:

```bash
# Terminal 1: Watch and auto-generate
muonroi-rule watch --source src/Handlers --output Generated/Rules

# Terminal 2: Build and test (watches for Generated/*.g.cs changes)
dotnet watch run
```

### Workflow 3: Generate Tests

Create test scaffolds for all rules:

```bash
# Generate rule files
muonroi-rule extract --source src/Handlers --output Generated/Rules

# Generate test scaffolds
muonroi-rule generate-tests --rules Generated/Rules --output Tests/Generated

# Tests/Generated/LOAN_APPROVAL_CHECKRuleTests.cs is ready for customization
```

### Workflow 4: Runtime → Code (Merge Back)

Migrate runtime rules to code-first:

```bash
# Export runtime rules from database/JSON
# Merge into target handler

muonroi-rule merge \
  --rules-dir exported-runtime-rules/ \
  --target src/Handlers/LoanHandler.cs \
  --class LoanHandler
```

## Version-Aware Dispatch

RuleGen v2.0.0 supports the `--workflow-name` flag for version selection:

- **v1** — Code-first rules extracted to `IRuleDefinition<T>` classes
- **v2+** — Flow graph rules managed via `RulesEngineService` (Control Plane API)

Dispatch example:

```csharp
// v1: code-first via DI
var rule = serviceProvider.GetRequiredService<IRuleDefinition<LoanContext>>();
await rule.EvaluateAsync(context);

// v2+: flow graph via RulesEngineService
var service = serviceProvider.GetRequiredService<RulesEngineService>();
var result = await service.ExecuteWorkflowAsync("loan-approval", context);
```

## Troubleshooting

### "No methods marked with [MExtractAsRule] were found"

Verify:
1. Source directory path is correct: `muonroi-rule extract --source <path>`
2. Methods are marked with `[MExtractAsRule(...)]` attribute
3. Class is public, method is public
4. Using `Muonroi.RuleEngine.Abstractions` namespace

### "Circular dependency detected"

Review rule dependencies:

```bash
muonroi-rule verify --source-dir src/Handlers
```

Check `DependsOn` arrays for cycles. Use **Proliferation** analysis to visualize dependency graph.

### "Duplicate rule code"

Ensure unique `code` parameter across all `[MExtractAsRule]` attributes:

```csharp
// Bad: duplicate
[MExtractAsRule("LOAN_CHECK")] // Handler1.cs
[MExtractAsRule("LOAN_CHECK")] // Handler2.cs

// Good: unique
[MExtractAsRule("LOAN_CHECK_V1")]
[MExtractAsRule("LOAN_CHECK_V2")]
```

### "Invalid HookPoint"

HookPoint must match enum values:

```csharp
// Valid
HookPoint = HookPoint.OnStart
HookPoint = HookPoint.OnValidate
HookPoint = HookPoint.OnExecute
HookPoint = HookPoint.OnCompensate
HookPoint = HookPoint.OnError

// Invalid
HookPoint = "OnCustom"  // String, not enum
HookPoint = HookPoint.Custom  // Doesn't exist
```

## See Also

- [Rule Engine Architecture](../architecture/rule-engine-architecture.md) — How rules execute
- [Proliferation Engine](../advanced/proliferation-engine.md) — Test scenario generation
- [Control Plane API](../../api/control-plane/rules-api.md) — Manage v2+ flow graphs
- [RuleGen VS Code Extension](rulegen-vscode-extension.md) — IDE integration
- [Ecosystem Coding Rules](../../coding-standards/ecosystem-rules.md) — Development standards
