# Quickstart Rule Engine Sample

Source path:

- `muonroi-building-block/samples/Quickstart.RuleEngine`

## What this demonstrates

- Minimal `AddRuleEngine<TContext>()` registration.
- Rule discovery from assembly.
- End-to-end request flow through `RuleOrchestrator<TContext>`.

## Quick run

```powershell
cd <workspace-root>\muonroi-building-block\samples\Quickstart.RuleEngine\src\Quickstart.RuleEngine.Api
dotnet restore
dotnet run
```

## Test request

```powershell
curl -X POST http://localhost:5000/api/orders/evaluate -H "Content-Type: application/json" -d "{\"amount\":1200,\"customerType\":\"premium\",\"countryCode\":\"US\"}"
```
