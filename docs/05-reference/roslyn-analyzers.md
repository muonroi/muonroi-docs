# Roslyn Analyzers

## Ecosystem analyzers

- `MBB001`: forbidden `DateTime.Now` and `UtcNow`
- `MBB002`: forbidden direct `JsonSerializer`
- `MBB003`: forbidden non-`MDbContext` DbContext inheritance
- `MBB004`: forbidden `AsyncLocal` outside the context package
- `MBB005`: abstractions must not reference infrastructure
- `MBB006`: missing startup tier guard
- `MBB007`: forbidden direct Serilog `LogContext`

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
