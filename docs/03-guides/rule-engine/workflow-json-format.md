# Workflow JSON Format

This page defines the JSON workflow payload format used by Muonroi Rule Engine.

## 1. Code-based workflow format

```json
[
  {
    "WorkflowName": "RuntimeWorkflow",
    "Rules": [ "JsonBase", "JsonPlusFive" ]
  }
]
```

Use this format when `Rules` contains rule codes that map to compiled `IRule<TContext>` classes.

## 2. Expression-based workflow format

```json
[
  {
    "WorkflowName": "ExpressionWorkflow",
    "Rules": [
      {
        "RuleName": "Double",
        "RuleExpressionType": "LambdaExpression",
        "Expression": "input1.value > 0",
        "Actions": {
          "OnSuccess": {
            "Name": "OutputExpression",
            "Context": { "expression": "input1.value * 2" }
          }
        }
      }
    ]
  }
]
```

Use this format when rule conditions and actions are evaluated directly from expressions.

## 3. Versioning notes

- Save each workflow update as a new version.
- Verify workflow before activation.
- Keep rollback path (`SetActiveVersionAsync`) for production safety.

## 4. Related docs

- [Rule Engine Guide](rule-engine-guide.md)
- [Rule Engine Upgrade Guide](rule-engine-upgrade-guide.md)
