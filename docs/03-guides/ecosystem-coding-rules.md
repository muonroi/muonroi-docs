# Ecosystem Coding Rules

The Muonroi ecosystem is wrapper-first by design.

## Required wrappers

- use `IMDateTimeService`, not raw `DateTime`
- use `IMJsonSerializeService`, not raw `JsonSerializer`
- use `IMLog<T>` and `IMLogContext`
- use `ISystemExecutionContextAccessor` for tenant and user flow
- inherit `MDbContext` and `MRepository<T>`

## Analyzer map

- `MBB001` through `MBB007` enforce the core rules
- `MRG001` through `MRG009` enforce RuleGen authoring quality
