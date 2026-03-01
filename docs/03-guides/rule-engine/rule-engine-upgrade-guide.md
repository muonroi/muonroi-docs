# Rule Engine Upgrade Guide

This guide summarizes the Rule Engine upgrade package and how to verify it in real projects generated from Muonroi templates.

## 1. Main upgrades

1. Typed orchestrator registration with `AddRuleEngine<TContext>()`.
2. Runtime execution modes: `Traditional`, `Rules`, `Hybrid`, `Shadow`.
3. Workflow JSON enhancements (code-based + expression-based flows).
4. Code extraction and registration pipeline with `Muonroi.RuleGen`.
5. Testing toolkit for orchestrator and fact assertions.
6. Extended FEEL expression support.

## 2. Supported rule groups

- Typed rule orchestration (`IRule<TContext>`)
- Workflow runner with execution mode switching
- Decision table runtime (validate/export/execute)
- NRules integration
- CEP stream rules
- Rule generation toolkit (`Muonroi.RuleGen`)

## 3. Runtime mode example

```json
{
  "RuleEngine": {
    "ExecutionMode": "Hybrid",
    "TraditionalWeight": 0.3,
    "RulesWeight": 0.7,
    "LogDifferences": true
  }
}
```

## 4. DI registration example

```csharp
services.AddRuleEngine<MyContext>(o =>
{
    o.ExecutionMode = RuleExecutionMode.Hybrid;
    o.TraditionalWeight = 0.3;
    o.RulesWeight = 0.7;
})
.AddRule<MyValidationRule>()
.AddRule<MyBusinessRule>()
.AddHook<MyAuditHook>()
.AddListener<MyRuleEventListener>();
```

## 5. RuleGen quick flow

```powershell
dotnet run --project tools/Muonroi.RuleGen -- extract --source src/MyHandler.cs --output src/GeneratedRules --namespace MyFeature.Generated.Rules --context MyFeature.MyContext
dotnet run --project tools/Muonroi.RuleGen -- verify --source src/MyHandler.cs --rules src/GeneratedRules
dotnet run --project tools/Muonroi.RuleGen -- register --rules src/GeneratedRules --output src/GeneratedRules/MGeneratedRuleRegistrationExtensions.g.cs --namespace MyFeature.Generated.Rules
```

Then register generated rules:

```csharp
services.AddMGeneratedRules();
```

## 6. Verification checklist

1. Typed rule flow executes in correct dependency order.
2. Runtime mode switching works for all 4 modes.
3. JSON workflow versioning + rollback works.
4. RuleGen extraction, verification, and registration all pass.
5. Decision table APIs and UI runtime behavior are validated.
6. NRules and CEP groups can be invoked from runtime test screens.

## 7. Related docs

- [Rule Engine Guide](rule-engine-guide.md)
- [Rule Engine Configuration Reference](rule-engine-configuration-reference.md)
- [Rule Engine Testing Guide](rule-engine-testing-guide.md)
- [Decision Table Full Upgrade Guide (2026)](decision-table-upgrade-guide-2026.md)
