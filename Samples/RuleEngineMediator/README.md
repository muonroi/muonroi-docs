# RuleEngineMediator sample

This sample demonstrates basic and advanced usage of the Muonroi rule engine.

- **Basic**: directly executes `RuleOrchestrator<int>` with `PositiveRule`, `EvenRule` and `SquareRule`.
- **Advanced**: uses the built-in `IMediator` to dispatch `EvaluateNumberQuery`, which in turn runs the rules.

Run the sample with:

```bash
dotnet run --project Samples/RuleEngineMediator
```
