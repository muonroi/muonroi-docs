# Rule Source Generator Deep Dive

Muonroi's source-generator workflow turns code-first rule authoring into a repeatable development loop:

1. annotate methods with `[MExtractAsRule]`
2. run the RuleGen CLI or let the source generators emit registration code
3. compile with diagnostics that catch rule-graph mistakes early
4. test execution with `MRuleOrchestratorSpy`

This guide goes deeper than the quick RuleGen overview and focuses on what gets emitted, what diagnostics mean, and how to keep the workflow reliable in a real repo.

## What the generator does

The source-generator layer serves two related but different goals:

- extraction tooling takes methods marked with `[MExtractAsRule]` and helps you turn them into structured rule artifacts
- the Roslyn source generator emits `RuleEngineRegistrationExtensions.g.cs` so discovered `IRule<TContext>` implementations can be registered through DI automatically

The generated registration extension currently looks like:

```csharp
namespace Muonroi.RuleEngine.Generated;

public static class RuleEngineRegistrationExtensions
{
    public static IServiceCollection AddGeneratedRules(this IServiceCollection services)
    {
        // generated AddTransient<IRule<TContext>, TConcreteRule>() registrations
        return services;
    }
}
```

That gives you a simple developer loop:

- keep rule logic in normal C# files
- let generators and CLI tools handle the wiring and diagnostics

## Attribute reference

The primary marker is:

```csharp
[MExtractAsRule("RULE_CODE")]
```

The current attribute type is `Muonroi.RuleEngine.Abstractions.MExtractAsRuleAttribute`.

There is also a backward-compatible alias:

```csharp
[ExtractAsRule("RULE_CODE")]
```

### Required metadata

#### `Code`

`Code` is the constructor argument and must be unique in the logical rule set.

Good examples:

- `HIGH_VALUE_ORDER`
- `DEBT_RATIO`
- `PRICING_ENTERPRISE`

Bad examples:

- `rule1`
- duplicated codes across the same workflow
- codes that encode environment or tenant names

#### `Order`

`Order` is optional in code, but if you use it you must understand its limitations. The analyzer already warns when you rely on `Order` without a dependency graph.

Example:

```csharp
[MExtractAsRule("DEBT_RATIO", Order = 1)]
```

### Optional metadata

#### `HookPoint`

`HookPoint` selects where the rule participates in the lifecycle. The attribute defaults to `HookPoint.BeforeRule`.

Example:

```csharp
[MExtractAsRule("SCORE_ENRICHMENT", HookPoint = HookPoint.BeforeRule)]
```

#### `DependsOn`

`DependsOn` declares rule codes that must run first.

Example:

```csharp
[MExtractAsRule("FINAL_APPROVAL", DependsOn = new[] { "CREDIT_SCORE", "DEBT_RATIO" })]
```

Prefer `DependsOn` over raw numeric ordering because the dependency graph is explicit and survives refactoring better.

## Basic code-first example

```csharp
using Muonroi.RuleEngine.Abstractions;

public sealed class DiscountRules
{
    [MExtractAsRule("LOYALTY_DISCOUNT", Order = 0)]
    public RuleResult Loyalty(OrderContext context, FactBag facts)
    {
        if (context.CustomerTier is "gold" or "platinum")
        {
            facts["discountPercent"] = 10;
            return RuleResult.Success();
        }

        return RuleResult.Failure("Customer tier is not eligible.");
    }
}
```

Pair that with the generated registration extension:

```csharp
using Muonroi.RuleEngine.Generated;

builder.Services.AddRuleEngine<OrderContext>();
builder.Services.AddGeneratedRules();
```

## What gets emitted

The current source generator scans classes that implement `IRule<T>` and emits DI registrations.

That means the generated code is about registration, not business logic transformation. Business logic extraction and file generation are handled by the CLI toolchain.

In practice the output gives you:

- `services.AddTransient<IRule<TContext>, ConcreteRule>()` per discovered rule type
- one generated extension method for the project

Benefits:

- fewer hand-maintained registration blocks
- fewer missing-DI bugs after refactors
- easier review because the wiring is deterministic

## RuleGen CLI commands

The current CLI entry point supports:

- `extract`
- `verify`
- `register`
- `generate-tests`
- `merge`
- `split`
- `watch`

The CLI help text describes them as:

- `extract`: extract methods marked with `[MExtractAsRule]` into rule classes
- `verify`: validate consistency, circular dependencies, and rule graph issues
- `register`: generate DI registration and optional dispatcher classes
- `generate-tests`: scaffold test files for extracted rules
- `merge`: merge runtime JSON, generated `*.g.cs`, or attributed source into a target class
- `split`: split rules from one file into individual rule files
- `watch`: auto-regenerate on source changes

## Common command flows

### Extract rules from source

```bash
muonroi-rule extract --source src/Handlers --output Generated/Rules
```

If you omit `--output`, the CLI infers a `Rules` folder relative to the source location.

### Verify before commit

```bash
muonroi-rule verify --source-dir src/Handlers
```

Use `verify` in CI or as a pre-commit habit for rule-heavy projects.

### Generate registration

```bash
muonroi-rule register \
  --rules Generated/Rules \
  --output Generated/MGeneratedRuleRegistrationExtensions.g.cs
```

Optional dispatcher output is also supported by the CLI.

### Generate test scaffolds

```bash
muonroi-rule generate-tests --rules Generated/Rules --output tests/GeneratedRules
```

### Merge generated rules into a partial class

```bash
muonroi-rule merge \
  --rules-dir Generated/Rules \
  --target src/Handlers/MyHandler.cs \
  --namespace My.App \
  --class MyHandler
```

The current merge command also supports source-folder based merging and multiple merge strategies.

### Split attributed handlers back out

```bash
muonroi-rule split \
  --source src/Handlers \
  --output Generated/Rules \
  --workflow loan-approval
```

### Watch mode

```bash
muonroi-rule watch --source src/Handlers --output Generated/Rules
```

Watch mode is useful in developer workflows and editor integrations, but keep CI deterministic by running explicit one-shot commands there.

## Configuration file

The CLI looks for `.rulegenrc.json` in the working directory.

Good uses for the config file:

- standard source directory
- standard output directory
- namespace override
- generated test settings
- team-wide command defaults

Use the config to keep scripts short and make local and CI behavior consistent.

## Diagnostics overview

The current analyzer set goes beyond the original first five diagnostics. As of March 9, 2026, the package ships `MRG001` through `MRG009`.

The five most important diagnostics for day-to-day work are still `MRG001` to `MRG005`, so start there and then layer in the newer warnings.

### MRG001: Duplicate Rule Code

Severity: Error

Meaning:

- the same rule code appears more than once in the analyzed set

Typical causes:

- copied rule method without changing the code
- merge conflict resolved incorrectly
- split/extract flow produced two rules with the same identifier

Fix:

- keep one canonical code
- rename the duplicate
- re-run `verify`

### MRG002: Invalid Hook Point

Severity: Error

Meaning:

- the value given for `HookPoint` is not valid for the enum

Typical causes:

- stale code after enum changes
- typo in manual attribute edits

Fix:

- use a valid `HookPoint` enum member
- prefer compile-time enum references instead of strings in custom tooling

### MRG003: Non-interface dependency

Severity: Warning

Meaning:

- a dependency field is a concrete type rather than an interface

Why it matters:

- rule classes become harder to test
- DI replacement becomes harder
- coupling grows silently

Fix:

- depend on interfaces where practical
- keep concrete dependencies rare and deliberate

### MRG004: Helper method extraction failed

Severity: Warning

Meaning:

- RuleGen could not safely extract a helper method

Current expectation:

- private methods in the same class are supported best

Fix:

- keep helper methods private and local when you expect extraction support
- move shared logic into a separately testable service if the helper is too complex

### MRG005: Missing `DependsOn` reference

Severity: Warning

Meaning:

- a rule declares a dependency on a code that does not exist

Typical causes:

- renamed upstream rule code
- typo in `DependsOn`
- partial refactor across multiple files

Fix:

- update the reference to the real rule code
- remove the dependency if it is no longer needed

## Additional current diagnostics

The analyzer set currently also includes:

- `MRG006`: order used without `DependsOn`
- `MRG007`: fact consumption without dependency path
- `MRG008`: nullable assigned to non-nullable string risk
- `MRG009`: fact guard throws `InvalidOperationException`

These warnings are especially useful in larger rule graphs where dependency order and fact production are no longer obvious from a single file.

## How to think about `Order` vs `DependsOn`

Treat `Order` as a hint and `DependsOn` as the real execution relationship.

Why:

- `Order` is easy to abuse
- numeric ordering hides intent
- dependency edges survive refactoring better

Good:

```csharp
[MExtractAsRule("FINAL_APPROVAL", DependsOn = new[] { "CREDIT_SCORE", "DEBT_RATIO" })]
```

Weaker:

```csharp
[MExtractAsRule("FINAL_APPROVAL", Order = 99)]
```

If you see `MRG006`, the analyzer is telling you the same thing.

## Generated code review strategy

Generated files should be:

- deterministic
- short enough to diff comfortably
- excluded from manual business edits

Good review practice:

- review generated registration changes when rules are added or removed
- do not hand-edit generated outputs
- regenerate from source instead of patching generated files

## VS Code extension

The repo also includes a VS Code extension with:

- rule extraction commands
- CodeLens integration
- diagnostics integration
- watch mode helpers

Useful commands exposed by the extension include:

- extract all rules
- watch mode
- go to rule

Cross-reference [RuleGen VS Code Extension](./rulegen-vscode-extension.md) for the editor-facing workflow.

## Testing with `MRuleOrchestratorSpy`

`MRuleOrchestratorSpy<TContext>` captures:

- execution records
- the final fact snapshot
- per-rule success and duration
- fact changes for fired rules

Example:

```csharp
var rules = new IRule<OrderContext>[]
{
    new LoyaltyDiscountRule()
};

var spy = new MRuleOrchestratorSpy<OrderContext>(rules);
FactBag facts = await spy.ExecuteAsync(new OrderContext("gold"));

Assert.Single(spy.ExecutionRecords);
Assert.True(spy.ExecutionRecords[0].IsSuccess);
Assert.Equal(10, facts["discountPercent"]);
```

Use the spy when you want integration-style confidence without spinning up the whole runtime host.

## netstandard2.0 and source-generator constraints

The repo still carries some compatibility constraints that matter for generator and CLI code:

- use `"\n"` instead of `Environment.NewLine` in generated output
- avoid `ToHashSet()` in compatibility-sensitive code paths
- use the compatible `string.Replace` overloads expected by the target
- keep the `IsExternalInit` polyfill when record-like patterns need it

These constraints are easy to forget if you mostly work in newer .NET targets, so keep them in mind when changing generator code.

## Common mistakes

### Treating generated code as source of truth

Generated code is a build artifact. The source method and attribute metadata remain the source of truth.

### Encoding hidden workflow meaning in rule codes

Keep rule codes stable, short, and business-relevant. Do not encode environments, machines, or tenant ids in the code unless that is truly the business identity of the rule.

### Depending on concrete services everywhere

This makes `MRG003` inevitable and makes rule testing harder.

### Using exceptions for normal missing-fact logic

`MRG009` exists because exception-driven rule flow becomes noisy and expensive. Prefer explicit failure results when a missing fact is part of expected control flow.

### Skipping `verify`

Extraction can succeed while the dependency graph is still wrong. `verify` is what catches those issues before runtime.

## Suggested CI workflow

For rule-heavy repositories, a reliable CI sequence is:

1. restore tools and packages
2. run `muonroi-rule verify --source-dir ...`
3. build the solution so Roslyn diagnostics fail fast
4. run unit tests or spy-based integration tests

This keeps rule graph problems out of runtime environments.

## FAQ

### Do I need both the CLI and the source generator?

Usually yes.

- the source generator helps with compile-time DI registration
- the CLI helps with extraction, verification, merge, split, and watch workflows

### Should I commit generated files?

Commit policy is a repo decision. If your team commits them, treat them as derived artifacts and regenerate rather than hand-editing.

### Can I use the workflow without the VS Code extension?

Yes. The CLI and generators are independent of the editor integration.

### What is the minimum habit that prevents most problems?

Keep rule codes unique, use `DependsOn`, and run `verify` before merging.

## Recommended next reading

- [RuleGen Guide](./rulegen-guide.md)
- [Rule Engine Testing Guide](./rule-engine-testing-guide.md)
- [Rule Engine Guide](./rule-engine-guide.md)
- [RuleGen VS Code Extension](./rulegen-vscode-extension.md)
