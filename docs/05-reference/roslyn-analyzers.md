# Roslyn Analyzers

## Ecosystem analyzers

- `MBB001`: forbidden `DateTime.Now` and `UtcNow`
- `MBB002`: forbidden direct `JsonSerializer`
- `MBB003`: forbidden non-`MDbContext` DbContext inheritance
- `MBB004`: forbidden `AsyncLocal` outside the context package
- `MBB005`: abstractions must not reference infrastructure
- `MBB006`: missing startup tier guard
- `MBB007`: forbidden direct Serilog `LogContext`
- `MBB008`: cross-capability type reference inside an `AddM*` method without an `IMEcosystemRegistry.Has(MCapability.X)` guard
- `MBB009`: raw exception thrown inside a `Muonroi.*` namespace — use `MException` hierarchy instead (test assemblies exempt)
- `MBB010`: public method has a non-nullable reference-type parameter without a null guard (`MGuard.NotNull`, `ArgumentNullException.ThrowIfNull`, `if (x==null)`, `x ?? throw`); value types and `T?` exempt; test assemblies exempt

## Rule authoring analyzers

- `MRG001`: duplicate rule code
- `MRG002`: invalid hook point
- `MRG003`: non-interface dependency
- `MRG004`: helper extraction failed
- `MRG005`: missing dependency reference
- `MRG006`: order without dependency
- `MRG007`: fact consumption without dependency
- `MRG008`: nullable assignment risk
- `MRG009`: fact guard throws `InvalidOperationException`
