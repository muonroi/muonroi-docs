---
title: Observability Guide
sidebar_label: Observability & Telemetry
sidebar_position: 2
---

# Observability Guide

Complete guide to observability in Muonroi-based systems: distributed tracing, metrics, structured logging, and alerting patterns.

:::tip **Quick Start**
Register observability with `AddObservability(configuration)` and export spans/metrics to OpenTelemetry Collector (OTLP), Jaeger, or Zipkin.
:::

---

## Registration

Add observability to your service collection in `Program.cs`:

```csharp
var builder = WebApplicationBuilder.CreateBuilder(args);

// Register observability (tracing, metrics, logs)
builder.Services.AddObservability(builder.Configuration);

var app = builder.Build();
app.Run();
```

The `AddObservability()` method wires:
- OpenTelemetry SDK initialization
- `Muonroi.RuleEngine` ActivitySource for rule execution spans
- Metrics collectors (rules.matched, rules.fired, etc.)
- Tenant-aware span enrichment
- Log correlation via correlation IDs

---

## appsettings.json Configuration

### OpenTelemetry Section

```json
{
  "OpenTelemetry": {
    "Enabled": true,
    "ServiceName": "my-rule-engine-app",
    "ServiceVersion": "1.0.0",
    "Environment": "production",
    "Tracing": {
      "Enabled": true,
      "BatchSize": 512,
      "ExportIntervalMilliseconds": 5000,
      "Exporters": [
        {
          "Type": "Otlp",
          "Endpoint": "http://localhost:4317",
          "Protocol": "grpc"
        }
      ]
    },
    "Metrics": {
      "Enabled": true,
      "IntervalMilliseconds": 60000,
      "Exporters": [
        {
          "Type": "Otlp",
          "Endpoint": "http://localhost:4317",
          "Protocol": "grpc"
        },
        {
          "Type": "Prometheus",
          "Port": 9090,
          "Path": "/metrics"
        }
      ]
    }
  }
}
```

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `Enabled` | bool | true | Master switch for all observability. Set `false` to disable. |
| `ServiceName` | string | app name | Service identifier in traces and metrics. |
| `ServiceVersion` | string | app version | Version tag in traces. |
| `Environment` | string | "production" | Environment tag (development, staging, production). |
| `Tracing.Enabled` | bool | true | Enable distributed tracing. |
| `Tracing.BatchSize` | int | 512 | Spans per batch before export. |
| `Tracing.ExportIntervalMilliseconds` | int | 5000 | Flush interval in ms. |
| `Metrics.IntervalMilliseconds` | int | 60000 | Metrics export interval in ms. |

---

## Exporter Configuration

### OTLP (OpenTelemetry Protocol)

Export to OpenTelemetry Collector, Grafana Cloud, or any OTLP-compatible backend:

```json
{
  "OpenTelemetry": {
    "Tracing": {
      "Exporters": [
        {
          "Type": "Otlp",
          "Endpoint": "http://otel-collector:4317",
          "Protocol": "grpc",
          "TimeoutSeconds": 10,
          "Headers": {
            "Authorization": "Bearer token-if-required"
          }
        }
      ]
    },
    "Metrics": {
      "Exporters": [
        {
          "Type": "Otlp",
          "Endpoint": "http://otel-collector:4317",
          "Protocol": "grpc"
        }
      ]
    }
  }
}
```

### Jaeger

Direct export to Jaeger for trace visualization:

```json
{
  "OpenTelemetry": {
    "Tracing": {
      "Exporters": [
        {
          "Type": "Jaeger",
          "Endpoint": "http://jaeger:14250",
          "Protocol": "grpc"
        }
      ]
    }
  }
}
```

### Zipkin

Alternative trace backend:

```json
{
  "OpenTelemetry": {
    "Tracing": {
      "Exporters": [
        {
          "Type": "Zipkin",
          "Endpoint": "http://zipkin:9411/api/v2/spans"
        }
      ]
    }
  }
}
```

### Prometheus Metrics

Expose metrics on HTTP endpoint for Prometheus scraping:

```json
{
  "OpenTelemetry": {
    "Metrics": {
      "Exporters": [
        {
          "Type": "Prometheus",
          "Port": 9090,
          "Path": "/metrics",
          "UseHttpListener": true
        }
      ]
    }
  }
}
```

**Prometheus Scrape Configuration** (`prometheus.yml`):

```yaml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'muonroi-app'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
    scrape_interval: 15s
    scrape_timeout: 10s

  - job_name: 'rule-engine-metrics'
    static_configs:
      - targets: ['localhost:9090']
    metrics_path: '/metrics'
```

---

## Rule Engine Telemetry

The rule engine emits distributed traces and metrics for observability and debugging.

### ActivitySource: Muonroi.RuleEngine

All rule execution spans are created under the `Muonroi.RuleEngine` ActivitySource:

```
Muonroi.RuleEngine
  └─ RuleOrchestrator.Execute
       ├─ EvaluateRuleSet (per ruleset version)
       │  ├─ Rule.Evaluate (per rule)
       │  │  ├─ FactBag.CoerceValue (type conversion)
       │  │  └─ Condition.Evaluate (FEEL expression)
       │  └─ Dependency.Route (graph edge traversal)
       └─ ExecuteRuleSet (per ruleset version)
          └─ Rule.Execute (side effects)
```

Each span includes:
- **Operation name** — rule ID, ruleset name, phase
- **Tags** — tenant ID, rule status, execution time, error details
- **Events** — quota check, rule matched/fired, side effects executed

### Metrics

**Counter: `rules.matched`**
- Incremented when a rule's condition evaluates to true
- Tags: `tenant_id`, `ruleset_name`, `rule_id`, `status`

**Counter: `rules.fired`**
- Incremented when a rule's execute action completes successfully
- Tags: `tenant_id`, `ruleset_name`, `rule_id`, `status`

**Histogram: `rule.execution.duration_ms`**
- Distribution of rule execution times
- Tags: `ruleset_name`, `phase` (Evaluate|Execute)

**Gauge: `active.rule.executions`**
- Current number of in-flight rule executions
- Tags: `tenant_id`, `ruleset_name`

### Span Enrichment

Spans are automatically enriched with:

```csharp
// Tenant context
span.SetAttribute("tenant.id", TenantContext.CurrentTenantId);
span.SetAttribute("user.id", UserContext.CurrentUserId);
span.SetAttribute("correlation.id", HttpContext.TraceIdentifier);

// Rule execution
span.SetAttribute("rule.id", rule.Id);
span.SetAttribute("ruleset.name", ruleSet.Name);
span.SetAttribute("ruleset.version", ruleSet.Version);
span.SetAttribute("rule.matched", matched);
span.SetAttribute("rule.fired", fired);
span.SetAttribute("execution.mode", executionMode);
```

---

## Structured Logging

Use `IMLog<T>` from `Muonroi.Logging.Abstractions` for structured, correlated logging:

```csharp
public class MyService(IMLog<MyService> log)
{
    public async Task ProcessRuleAsync(string ruleId)
    {
        using (log.BeginProperty("rule.id", ruleId))
        {
            log.Info("Starting rule processing", new { RuleId = ruleId });

            try
            {
                await ExecuteAsync();
                log.Info("Rule completed successfully");
            }
            catch (Exception ex)
            {
                log.Error("Rule execution failed", ex, new { RuleId = ruleId });
                throw;
            }
        }
    }
}
```

### Logging Levels

- **Debug** — diagnostic details, not for production
- **Info** — operational events (rule started, completed, etc.)
- **Warn** — degraded conditions (quota limits, retries)
- **Error** — failures and exceptions
- **Fatal** — unrecoverable errors requiring immediate attention

### Correlation IDs

Correlation IDs link logs across service boundaries:

```csharp
var correlationId = HttpContext.TraceIdentifier;

using (log.BeginProperty("correlation.id", correlationId))
{
    log.Info("Processing request", new { CorrelationId = correlationId });

    // All logs in this scope include correlation.id
}
```

Pass correlation IDs to downstream services (e.g., HTTP headers):

```csharp
var client = new HttpClient();
var correlationId = HttpContext.TraceIdentifier;

client.DefaultRequestHeaders.Add("X-Correlation-ID", correlationId);
var response = await client.GetAsync("https://downstream-service/api/data");
```

---

## Distributed Tracing with Correlation

When calling external services, propagate trace context:

```csharp
public class RuleExecutionService(
    HttpClient httpClient,
    IMLog<RuleExecutionService> log)
{
    public async Task<object?> CallExternalServiceAsync(string ruleId, object input)
    {
        using var activity = new Activity("ExternalServiceCall").Start();
        activity?.SetTag("rule.id", ruleId);
        activity?.SetTag("service", "external-api");

        log.Info("Calling external service", new { RuleId = ruleId, Service = "external-api" });

        try
        {
            // Propagate trace context to HTTP request
            httpClient.DefaultRequestHeaders.Add(
                "traceparent",
                Activity.Current?.Id);

            var response = await httpClient.PostAsJsonAsync(
                "https://external-service/api/execute",
                input);

            log.Info("External service completed", new { Status = response.StatusCode });
            return await response.Content.ReadAsAsync<object>();
        }
        catch (Exception ex)
        {
            log.Error("External service failed", ex, new { RuleId = ruleId });
            activity?.SetStatus(ActivityStatusCode.Error, ex.Message);
            throw;
        }
    }
}
```

---

## Custom Metrics

Create custom meters for domain-specific metrics:

```csharp
public class RuleMetrics
{
    private readonly Meter _meter = new("Muonroi.RuleEngine.Custom", "1.0");

    private readonly Counter<int> _decisionTableHits;
    private readonly Histogram<double> _decisionTableExecutionTime;

    public RuleMetrics()
    {
        _decisionTableHits = _meter.CreateCounter<int>(
            "decision.table.hits",
            description: "Number of decision table evaluations");

        _decisionTableExecutionTime = _meter.CreateHistogram<double>(
            "decision.table.duration_ms",
            description: "Decision table execution time in milliseconds");
    }

    public void RecordDecisionTableHit(string tableId, string tenantId)
    {
        var tags = new TagList
        {
            { "table.id", tableId },
            { "tenant.id", tenantId }
        };
        _decisionTableHits.Add(1, tags);
    }

    public void RecordDecisionTableDuration(string tableId, double durationMs)
    {
        var tags = new TagList { { "table.id", tableId } };
        _decisionTableExecutionTime.Record(durationMs, tags);
    }
}
```

Register the custom metrics:

```csharp
services.AddSingleton<RuleMetrics>();

// Inject and use
app.MapPost("/api/rules/execute", (RuleMetrics metrics) =>
{
    var start = DateTime.UtcNow;
    // ... execute rule ...
    var duration = (DateTime.UtcNow - start).TotalMilliseconds;
    metrics.RecordDecisionTableDuration("my-table", duration);
});
```

---

## Flight Recorder for Debugging

The flight recorder captures recent events for root cause analysis:

```csharp
public interface IFlightRecorder
{
    void RecordEvent(string category, string message, Dictionary<string, object>? tags = null);
    IReadOnlyList<FlightRecorderEvent> GetEvents(int maxCount = 100);
    void Clear();
}

// Usage
public class RuleService(IFlightRecorder flightRecorder)
{
    public async Task<RuleResult> ExecuteAsync(string ruleId, object input)
    {
        flightRecorder.RecordEvent("rule-execution", $"Starting rule {ruleId}", new { RuleId = ruleId });

        try
        {
            var result = await _engine.ExecuteAsync(ruleId, input);
            flightRecorder.RecordEvent("rule-execution", $"Rule {ruleId} completed", new { Status = "success" });
            return result;
        }
        catch (Exception ex)
        {
            flightRecorder.RecordEvent("rule-execution", $"Rule {ruleId} failed", new { Error = ex.Message });
            throw;
        }
    }
}
```

Access flight recorder events via diagnostic endpoint:

```csharp
app.MapGet("/api/diagnostics/flight-recorder", (IFlightRecorder recorder) =>
{
    return new { Events = recorder.GetEvents(500) };
});
```

---

## Alerting Patterns

Define alerts in Prometheus/Grafana to detect rule engine issues:

### Alert Rules (prometheus/rules.yml)

```yaml
groups:
  - name: muonroi_rules
    interval: 30s
    rules:
      - alert: HighRuleFailureRate
        expr: rate(rules.fired{status="error"}[5m]) / rate(rules.matched[5m]) > 0.1
        for: 5m
        annotations:
          summary: "Rule failure rate exceeds 10% ({{ $labels.ruleset_name }})"
          severity: "warning"

      - alert: RuleExecutionSlow
        expr: histogram_quantile(0.95, rule.execution.duration_ms) > 5000
        for: 10m
        annotations:
          summary: "Rule execution p95 > 5s ({{ $labels.ruleset_name }})"
          severity: "warning"

      - alert: QuotaExceeded
        expr: rule_execution_quota_used{job="muonroi-app"} >= rule_execution_quota_limit
        for: 1m
        annotations:
          summary: "Tenant {{ $labels.tenant_id }} has exceeded rule quota"
          severity: "critical"

      - alert: NoRulesMatching
        expr: increase(rules.matched[5m]) == 0 and up{job="muonroi-app"} == 1
        for: 15m
        annotations:
          summary: "No rules matched in last 15 minutes ({{ $labels.ruleset_name }})"
          severity: "info"

      - alert: TelemetryExportFailure
        expr: rate(otel.exporter.otlp.spans_failed_total[5m]) > 0
        for: 5m
        annotations:
          summary: "OpenTelemetry export is failing"
          severity: "warning"
```

### Grafana Alerting

Configure notification channels in Grafana:

- **Slack**: Post alerts to a channel
- **PagerDuty**: Trigger on-call incidents for critical alerts
- **Email**: Send digests
- **Webhook**: Custom integrations (e.g., incident management systems)

---

## Grafana Dashboard Setup

Import a community dashboard or create a custom one:

### Dashboard Panels

**Rule Execution Rate:**
```promql
rate(rules.fired[5m])
```

**Rule Failure Rate:**
```promql
rate(rules.fired{status="error"}[5m]) / rate(rules.matched[5m])
```

**p50 / p95 / p99 Execution Time:**
```promql
histogram_quantile(0.50, rule.execution.duration_ms)
histogram_quantile(0.95, rule.execution.duration_ms)
histogram_quantile(0.99, rule.execution.duration_ms)
```

**Tenant Quota Usage:**
```promql
rule_execution_quota_used / rule_execution_quota_limit
```

**Active Executions:**
```promql
active.rule.executions
```

**Service Latency (by operation):**
```promql
histogram_quantile(0.95, http_request_duration_seconds_bucket{service="muonroi-app"})
```

---

## Additional Telemetry Domains

Beyond the rule engine, Muonroi emits telemetry for:

- `Muonroi.BuildingBlock.Grpc` — gRPC service calls
- `Muonroi.BuildingBlock.MessageBus` — message publishing and consumption
- `Muonroi.BuildingBlock.DistributedCache` — cache hits/misses, evictions
- `Muonroi.BuildingBlock.AuditTrail` — audit log writes, schema changes
- `Muonroi.BuildingBlock.AntiTampering` — license verification, tampering detection
- `Muonroi.BuildingBlock.MultiTenancy` — tenant isolation enforcement, context switches
- `Muonroi.BuildingBlock.Authorization` — policy evaluation, role checks

---

## Best Practices

1. **Enable correlation IDs** — Always propagate `X-Correlation-ID` across services.
2. **Set appropriate batch sizes** — Balance latency vs. throughput (512–2048 spans per batch).
3. **Use consistent service naming** — ServiceName must match across all instances.
4. **Tag all spans** — Include tenant ID, user ID, and request context.
5. **Monitor exporter health** — Check metric export success rates in Prometheus.
6. **Adjust log levels** — Use Debug in development, Info in production.
7. **Alert on SLOs** — Define alerts for p99 latency, error rates, and quota exhaustion.
8. **Archive traces** — Use Jaeger or cloud storage for long-term trace retention.

---

## See Also

- [Background Jobs Guide](./background-jobs-guide.md) — Correlating async job execution
- [appsettings Configuration](../05-reference/appsettings-guide.md) — Full configuration reference
- [Troubleshooting Guide](./troubleshooting-guide.md) — Using traces and logs for debugging
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
