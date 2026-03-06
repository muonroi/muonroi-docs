# Observability Guide

## Rule engine telemetry

The rule engine emits:

- `ActivitySource = "Muonroi.RuleEngine"`
- counters `rules.matched`
- counters `rules.fired`

## Additional telemetry domains

- `Muonroi.BuildingBlock.Grpc`
- `Muonroi.BuildingBlock.MessageBus`
- `Muonroi.BuildingBlock.DistributedCache`
- `Muonroi.BuildingBlock.AuditTrail`
- `Muonroi.BuildingBlock.AntiTampering`

## OpenTelemetry setup

`AddObservability(...)` wires tracing and metrics exporters and enriches spans with tenant tags.

## Logging pattern

Prefer:

- `IMLog<T>.Info(...)`
- `IMLog<T>.Warn(...)`
- `IMLog<T>.Error(...)`
- `IMLog<T>.Debug(...)`
- `IMLog<T>.BeginProperty(...)`

When legacy static mirrors are still needed, pair context scopes with `ContextMirrorScope.Apply(...)`.
