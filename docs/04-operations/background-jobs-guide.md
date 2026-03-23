---
title: Background Jobs Guide
sidebar_label: Background Jobs
sidebar_position: 5
---

# Background Jobs Guide

Muonroi-based systems can run scheduled or asynchronous jobs through Hangfire or Quartz.NET, depending on the hosting model and operational requirements.

## Overview

Background jobs enable time-based task execution without blocking HTTP request handling. Muonroi supports two primary engines:

- **Hangfire** — SQL-backed job queue with built-in dashboard, suitable for recurring and fire-and-forget jobs
- **Quartz.NET** — enterprise-grade scheduler with advanced retry policies and distributed execution

## Job Types

### Recurring Jobs

Execute on a fixed schedule (hourly, daily, etc.). Examples: cleanup tasks, reports generation, health checks.

### One-Shot Jobs

Fire once after creation with no repetition. Examples: user onboarding emails, batch imports.

### Delayed Jobs

Execute after a specified delay. Examples: timeout notifications, deferred processing.

## Quartz.NET Registration

Muonroi provides `AddMQuartz()` extension to register Quartz with sensible defaults including tenant-aware context propagation.

### Basic Setup

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddMQuartz(builder.Configuration);

// Optional: customize before build
var app = builder.Build();
await app.RunAsync();
```

### Full Registration Example

```csharp
builder.Services.AddMQuartz(builder.Configuration, options =>
{
    // Register job implementations
    options.RegisterJob<TenantCleanupJob>("TenantCleanup");
    options.RegisterJob<ReportGenerationJob>("ReportGen");
    options.RegisterJob<HealthCheckJob>("HealthCheck");

    // Set retry policy
    options.RetryAttempts = 3;
    options.RetryDelaySeconds = 30;

    // Enable DLQ (dead letter queue)
    options.EnableDeadLetterQueue = true;
});
```

## Cron Expressions

Quartz uses cron format (6 fields: second, minute, hour, day, month, day-of-week).

### Common Schedules

```csharp
// Every hour
"0 0 * * * ?"

// Every day at 2 AM
"0 0 2 * * ?"

// Every Monday at 9 AM
"0 0 9 ? * MON"

// Every 15 minutes
"0 */15 * * * ?"

// First day of month at 3 AM
"0 0 3 1 * ?"

// Every weekday at 5 PM
"0 0 17 ? * MON-FRI"

// Every 30 seconds
"*/30 * * * * ?"
```

## Job Implementation

### Implementing a Job

```csharp
using Quartz;
using Muonroi.Logging;

public class TenantCleanupJob : IJob
{
    private readonly IMLog<TenantCleanupJob> _log;
    private readonly ITenantService _tenantService;

    public TenantCleanupJob(IMLog<TenantCleanupJob> log, ITenantService tenantService)
    {
        _log = log;
        _tenantService = tenantService;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var correlationId = context.Get<string>("CorrelationId") ?? Guid.NewGuid().ToString();

        using var scope = _log.BeginProperty("CorrelationId", correlationId);

        try
        {
            _log.Info("Starting tenant cleanup job");

            var inactiveTenants = await _tenantService.GetInactiveTenants();
            int removed = 0;

            foreach (var tenant in inactiveTenants)
            {
                await _tenantService.RemoveAsync(tenant.Id);
                removed++;
            }

            _log.Info($"Cleanup completed: {removed} tenants removed");
            context.Result = $"Removed {removed} inactive tenants";
        }
        catch (Exception ex)
        {
            _log.Error($"Tenant cleanup job failed: {ex.Message}", ex);
            throw; // Quartz will handle retry
        }
    }
}
```

### Tenant-Aware Job Execution

Background jobs that operate on tenant-scoped data must reconstruct execution context before running business logic. Use `AsyncLocal` propagation via `ContextMirrorScope` to maintain tenant identity across job boundaries.

```csharp
public class TenantAwareReportJob : IJob
{
    private readonly IMLog<TenantAwareReportJob> _log;
    private readonly IReportService _reportService;

    public TenantAwareReportJob(IMLog<TenantAwareReportJob> log, IReportService reportService)
    {
        _log = log;
        _reportService = reportService;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        // Extract tenant context from job data
        var tenantId = context.JobDetail.JobDataMap.GetString("TenantId");
        var userId = context.JobDetail.JobDataMap.GetString("UserId");

        if (string.IsNullOrEmpty(tenantId))
        {
            _log.Error("TenantId not found in job data");
            throw new InvalidOperationException("TenantId is required");
        }

        // Propagate tenant context via AsyncLocal
        using var scope = ContextMirrorScope.Apply(tenantId: tenantId, userId: userId);

        try
        {
            _log.Info($"Generating report for tenant {tenantId}");
            await _reportService.GenerateMonthlyReportAsync();
        }
        catch (Exception ex)
        {
            _log.Error($"Report generation failed: {ex.Message}", ex);
            throw;
        }
    }
}
```

### Scheduling Jobs Programmatically

```csharp
public class JobScheduler
{
    private readonly ISchedulerFactory _schedulerFactory;

    public JobScheduler(ISchedulerFactory schedulerFactory)
    {
        _schedulerFactory = schedulerFactory;
    }

    public async Task ScheduleRecurringJobAsync()
    {
        var scheduler = await _schedulerFactory.GetScheduler();

        // Define job
        var job = JobBuilder.Create<TenantCleanupJob>()
            .WithIdentity("tenant-cleanup", "maintenance")
            .Build();

        // Schedule: every day at 2 AM
        var trigger = TriggerBuilder.Create()
            .WithIdentity("tenant-cleanup-trigger", "maintenance")
            .WithCronSchedule("0 0 2 * * ?")
            .Build();

        await scheduler.ScheduleJob(job, trigger);
    }

    public async Task ScheduleDelayedJobAsync(string tenantId, TimeSpan delay)
    {
        var scheduler = await _schedulerFactory.GetScheduler();

        var job = JobBuilder.Create<NotificationJob>()
            .WithIdentity($"notification-{tenantId}", "notifications")
            .UsingJobData("TenantId", tenantId)
            .Build();

        var trigger = TriggerBuilder.Create()
            .WithIdentity($"notification-trigger-{tenantId}", "notifications")
            .StartAt(DateTimeOffset.Now.Add(delay))
            .Build();

        await scheduler.ScheduleJob(job, trigger);
    }
}
```

## Retry and Dead Letter Queue (DLQ) Configuration

### appsettings.json Configuration

```json
{
  "QuartzConfigs": {
    "Datasource": {
      "ConnectionString": "Server=mydb;Database=quartz;User Id=sa;Password=pass",
      "Provider": "SqlServer"
    },
    "JobStore": {
      "Type": "JobStoreTX",
      "UseProperties": false,
      "MisfireThreshold": 60000
    },
    "ThreadPool": {
      "ThreadCount": 10,
      "ThreadPriority": "Normal"
    },
    "RetryPolicy": {
      "MaxRetries": 3,
      "RetryDelaySeconds": 30,
      "BackoffMultiplier": 2.0
    },
    "DeadLetterQueue": {
      "Enabled": true,
      "TableName": "qrtz_job_failures"
    }
  }
}
```

### Retry Configuration in Code

```csharp
builder.Services.AddMQuartz(builder.Configuration, options =>
{
    // Exponential backoff: 30s → 60s → 120s
    options.RetryAttempts = 3;
    options.InitialRetryDelaySeconds = 30;
    options.RetryBackoffMultiplier = 2.0;

    // On permanent failure, move to DLQ
    options.EnableDeadLetterQueue = true;
    options.DlqTableName = "qrtz_job_failures";
});
```

### Handling DLQ Entries

```csharp
public class DeadLetterQueueService
{
    private readonly IRepository<JobFailure> _dlqRepository;
    private readonly IMLog<DeadLetterQueueService> _log;

    public async Task ReprocessAsync(Guid failureId)
    {
        var failure = await _dlqRepository.GetAsync(failureId);

        if (failure == null)
        {
            _log.Warn($"DLQ entry {failureId} not found");
            return;
        }

        _log.Info($"Reprocessing failed job: {failure.JobName}, attempts: {failure.AttemptCount}");

        // Deserialize job data and reschedule
        var jobData = JsonSerializer.Deserialize<Dictionary<string, object>>(failure.SerializedData);

        // Schedule new attempt with manual trigger or alert admin
        await AlertOnFailureAsync(failure);
    }

    private async Task AlertOnFailureAsync(JobFailure failure)
    {
        // Send email to admin or log to external system
        _log.Error($"Job {failure.JobName} permanently failed after {failure.AttemptCount} attempts");
    }
}
```

## Dashboard Authentication

### Hangfire Dashboard Auth

```csharp
app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = new[] { new HangfireDashboardAuthorizationFilter() }
});

public class HangfireDashboardAuthorizationFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var user = context.GetHttpContext().User;
        return user.Identity?.IsAuthenticated == true
            && user.IsInRole("Admin");
    }
}
```

### Quartz Remoting (Secured Admin UI)

For Quartz, enable remoting with authentication:

```csharp
builder.Services.AddMQuartz(builder.Configuration, options =>
{
    options.UseRemoting = true;
    options.RemoteSchedulerPort = 9009;
    options.RequireRemotingAuth = true;
    options.AllowedRemoteUsers = new[] { "admin@company.com" };
});
```

Then access via dedicated monitoring application with JWT bearer token.

## Error Handling and Logging

### Structured Logging in Jobs

Always use `IMLog<T>` with correlation IDs and property scopes:

```csharp
public class SafeJob : IJob
{
    private readonly IMLog<SafeJob> _log;

    public async Task Execute(IJobExecutionContext context)
    {
        var correlationId = context.Get<string>("CorrelationId") ?? Guid.NewGuid().ToString();
        var tenantId = context.JobDetail.JobDataMap.GetString("TenantId");

        using var scope = _log.BeginProperty("CorrelationId", correlationId)
            .BeginProperty("TenantId", tenantId);

        try
        {
            _log.Info("Job execution started");

            // Business logic

            _log.Info("Job execution completed successfully");
        }
        catch (OperationCanceledException)
        {
            _log.Warn("Job execution cancelled");
            throw;
        }
        catch (Exception ex)
        {
            _log.Error($"Job execution failed: {ex.Message}", ex);
            throw; // Let Quartz handle retry
        }
    }
}
```

### Job Listener for Observability

```csharp
public class JobTelemetryListener : IJobListener
{
    private readonly IMLog<JobTelemetryListener> _log;
    private readonly ActivitySource _activitySource;

    public string Name => "JobTelemetryListener";

    public async Task JobToBeExecuted(IJobExecutionContext context)
    {
        _log.Debug($"Job {context.JobDetail.Key} beginning execution");
    }

    public async Task JobExecutionVetoed(IJobExecutionContext context)
    {
        _log.Warn($"Job {context.JobDetail.Key} was vetoed");
    }

    public async Task JobWasExecuted(IJobExecutionContext context, JobExecutionException jobException)
    {
        if (jobException != null)
        {
            _log.Error($"Job {context.JobDetail.Key} failed: {jobException.Message}");
        }
        else
        {
            _log.Info($"Job {context.JobDetail.Key} completed: {context.Result}");
        }
    }
}
```

## Configuration Reference

### appsettings.json Full Example

```json
{
  "QuartzConfigs": {
    "Datasource": {
      "ConnectionString": "${QUARTZ_CONNECTION_STRING}",
      "Provider": "SqlServer"
    },
    "JobStore": {
      "Type": "JobStoreTX",
      "UseProperties": false,
      "MisfireThreshold": 60000,
      "DriverDelegateType": "Quartz.Impl.AdoJobStore.SqlServerDelegate"
    },
    "ThreadPool": {
      "Type": "Quartz.Simpl.SimpleThreadPool",
      "ThreadCount": 10,
      "ThreadPriority": "Normal",
      "MakeThreadsDaemons": true
    },
    "RetryPolicy": {
      "MaxRetries": 3,
      "RetryDelaySeconds": 30,
      "BackoffMultiplier": 2.0
    },
    "DeadLetterQueue": {
      "Enabled": true,
      "TableName": "qrtz_job_failures"
    },
    "Persistence": {
      "SqlCommandTimeoutSeconds": 30,
      "ClusterCheckinIntervalMilliseconds": 7500
    }
  }
}
```

### Secret Management

Store sensitive configuration in environment variables or a secret provider:

```csharp
// Program.cs
var secretProvider = builder.Services.BuildServiceProvider()
    .GetRequiredService<ISecretProvider>();

var connString = await secretProvider.GetSecretAsync("QuartzConnectionString");

builder.Configuration["QuartzConfigs:Datasource:ConnectionString"] = connString;
```

See [Secret Management Guide](secret-management.md) for details.

## Operational Guidance

- **Idempotency**: Design jobs to be idempotent because retries are normal. Running the same job twice should not cause duplicate side effects.
- **Correlation IDs**: Carry correlation IDs into job logs for end-to-end tracing.
- **Storage separation**: Separate job storage from application OLTP storage when scale grows; use dedicated database or message broker.
- **Monitoring**: Monitor retry storms, stuck queues, and schedule misfires via [observability dashboards](observability-guide.md).
- **Tenant context**: Never run tenant-scoped jobs without an explicit tenant context; always pass `TenantId` in job data.
- **Cleanup**: Implement periodic cleanup of completed/failed jobs to avoid unbounded growth.
- **Testing**: Use in-memory scheduler in unit tests; use real database in integration tests.

## See Also

- [Observability Guide](observability-guide.md) — Trace and monitor job execution
- [Secret Management Guide](secret-management.md) — Secure connection strings and credentials
- [Quartz.NET Documentation](https://www.quartz-scheduler.net/) — Official reference
