# Background Jobs Guide

Muonroi-based systems can run scheduled or asynchronous jobs through Hangfire or Quartz, depending on the hosting model and operational requirements.

## Basic configuration

Example configuration:

```json
{
  "BackgroundJobConfigs": {
    "JobType": "Hangfire",
    "ConnectionString": "Server=mydb;Database=jobs;User Id=sa;Password=pass"
  }
}
```

Example Hangfire registration:

```csharp
services.AddHangfire(x =>
    x.UseSqlServerStorage(configuration["BackgroundJobConfigs:ConnectionString"]));

app.UseHangfireDashboard();
```

## Tenant-aware job execution

Background jobs that operate on tenant-scoped data must reconstruct execution context before running business logic.

Legacy code may use `TenantAwareJobBase` to populate tenant and user context from job parameters. In newer code, prefer the same system execution context abstractions used by the rest of the platform so transport boundaries stay consistent.

```csharp
public class SampleJob : TenantAwareJobBase
{
    protected override Task ExecuteAsync(CancellationToken cancellationToken)
    {
        return Task.CompletedTask;
    }

    public Task Handle(string tenantId, string userGuid, string username)
        => RunAsync(tenantId, userGuid, username);
}
```

## Operational guidance

- Use idempotent handlers because retries are normal.
- Carry correlation IDs into job logs.
- Separate job storage from application OLTP storage when scale grows.
- Monitor retry storms, stuck queues, and schedule misfires.
- Do not run tenant-scoped jobs without an explicit tenant context.
