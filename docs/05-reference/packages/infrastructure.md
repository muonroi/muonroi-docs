---
title: Infrastructure Packages
sidebar_label: Infrastructure
sidebar_position: 10
---

# Infrastructure Packages

Overview of background jobs, resilience patterns, secrets management, Kubernetes integration, and service discovery for Muonroi applications.

---

## Muonroi.BackgroundJobs.Abstractions

**NuGet:** `Muonroi.BackgroundJobs.Abstractions` | **Tier:** OSS | **Distribution:** NuGet

### Purpose

Unified abstraction layer for background job scheduling. Provides provider-agnostic interface with automatic context capture and propagation, supporting both Hangfire and Quartz.NET as pluggable backends.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IBackgroundJobScheduler` | Interface | Unified scheduler: `Enqueue<T>()`, `Schedule<T>()`, `AddOrUpdateRecurring<T>()`, `RemoveRecurring()` |
| `BackgroundJobHandler` | Static | Provider registry and dispatcher. Self-registers providers via `[ModuleInitializer]` |
| `JobType` | Enum | Supported backends: `Hangfire`, `Quartz` |
| `TenantAwareJobBase` | Abstract Class | Base for jobs requiring system execution context restoration |
| `IMuonroiJobExecutionContext` | Interface | Captures job context: `JobId`, `JobType`, `ScheduledAt`, plus tenant/user/correlation context |
| `MuonroiJobExecutionContext` | Record | Default implementation with sealed constructor |
| `BackgroundJobConfigs` | Class | Configuration: `JobType`, `ConnectionString` |

### DI Registration

```csharp
// Program.cs
using Muonroi.BackgroundJobs.Abstractions;

// Automatic: AddBackgroundJobs dispatches to Hangfire or Quartz provider
services.AddBackgroundJobs(configuration);

// Configuration reads from "BackgroundJobConfigs" section
{
  "BackgroundJobConfigs": {
    "JobType": "Hangfire",  // or "Quartz"
    "ConnectionString": "Server=localhost;Database=hangfire"
  }
}
```

### Usage Example

```csharp
public class ReportJob : TenantAwareJobBase
{
    private readonly IReportService _reportService;
    
    public ReportJob(
        ISystemExecutionContextAccessor contextAccessor,
        ITenantContextPolicy tenantPolicy,
        IReportService reportService) 
        : base(contextAccessor, tenantPolicy)
    {
        _reportService = reportService;
    }

    protected override async Task ExecuteAsync()
    {
        // Context (TenantId, UserId, CorrelationId) already restored
        await _reportService.GenerateMonthlyReportAsync();
    }
}

// Schedule via injected scheduler
public class ReportController(IBackgroundJobScheduler scheduler)
{
    public IActionResult ScheduleReport()
    {
        var context = new MuonroiJobExecutionContext(
            tenantId: "tenant-123",
            userId: "user-456",
            username: "john.doe",
            correlationId: Guid.NewGuid().ToString("N"),
            accessToken: null,
            apiKey: null,
            isAuthenticated: true,
            permissions: ["read:reports"],
            sourceType: "api",
            jobId: Guid.NewGuid().ToString("N"),
            jobType: nameof(ReportJob),
            scheduledAt: DateTimeOffset.UtcNow);

        // Enqueue immediately
        string jobId = scheduler.Enqueue<ReportJob>(job => job.RunAsync(context));

        // Or schedule for later
        string jobId2 = scheduler.Schedule<ReportJob>(
            job => job.RunAsync(context),
            DateTimeOffset.UtcNow.AddHours(2));

        // Or recurring (every day at 2 AM)
        scheduler.AddOrUpdateRecurring<ReportJob>(
            "daily-report",
            job => job.RunAsync(context),
            "0 0 2 * * ?");  // Cron: second minute hour day month dayofweek

        return Ok(new { jobId });
    }
}
```

### Module Initializer Pattern (AOT-Safe)

Provider packages self-register via `[ModuleInitializer]` at assembly load time—no reflection, fully AOT-compatible:

```csharp
// In Muonroi.BackgroundJobs.Hangfire
[ModuleInitializer]
internal static void Register()
{
    BackgroundJobHandler.RegisterProvider(
        JobType.Hangfire,
        static (services, configuration) =>
            Hangfire.BackgroundJobHandler.AddBackgroundJobs(services, configuration));
}
```

---

## Muonroi.BackgroundJobs.Hangfire

**NuGet:** `Muonroi.BackgroundJobs.Hangfire` | **Tier:** OSS | **Distribution:** NuGet

### Purpose

Hangfire provider implementation. Suitable for smaller deployments, fire-and-forget jobs, and dashboard-based monitoring. SQL-backed job queue with built-in dashboard and recurring job support.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `HangfireJobScheduler` | Implementation | Adapts Hangfire API to `IBackgroundJobScheduler` |
| `HangfireProviderRegistration` | Module Initializer | Self-registers with `BackgroundJobHandler` |
| `JobContextActivatorFilter` | Server Filter | Restores Muonroi execution context (`TenantId`, `UserId`, `CorrelationId`) before job runs |

### DI Registration

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Automatic via AddBackgroundJobs
builder.Services.AddBackgroundJobs(builder.Configuration);

// OR explicit
builder.Services.AddHangfire((sp, config) =>
{
    config.UseSimpleAssemblyNameTypeSerializer();
    config.UseRecommendedSerializerSettings();
    config.UseFilter(new AutomaticRetryAttribute
    {
        Attempts = 3,
        DelaysInSeconds = [5, 10, 30]
    });
    config.UseFilter(sp.GetRequiredService<JobContextActivatorFilter>());
});
builder.Services.AddHangfireServer();
builder.Services.TryAddScoped<IBackgroundJobScheduler, HangfireJobScheduler>();

var app = builder.Build();
app.UseHangfireDashboard("/hangfire");
```

### Configuration (appsettings.json)

```json
{
  "BackgroundJobConfigs": {
    "JobType": "Hangfire",
    "ConnectionString": "Server=localhost;Database=hangfire;User Id=sa;Password=Your_Password;"
  }
}
```

### Usage Example

```csharp
public class UserNotificationJob : TenantAwareJobBase
{
    private readonly IEmailService _emailService;

    public UserNotificationJob(
        ISystemExecutionContextAccessor contextAccessor,
        ITenantContextPolicy tenantPolicy,
        IEmailService emailService)
        : base(contextAccessor, tenantPolicy)
    {
        _emailService = emailService;
    }

    protected override async Task ExecuteAsync()
    {
        var context = ExecutionContextAccessor.Get();
        await _emailService.SendWelcomeEmailAsync(context.UserId);
    }
}

// In service
public class UserService(IBackgroundJobScheduler scheduler)
{
    public async Task RegisterUserAsync(User user)
    {
        // ... user creation logic ...

        // Fire notification asynchronously
        var context = new MuonroiJobExecutionContext(
            tenantId: user.TenantId,
            userId: user.Id,
            username: user.Email,
            correlationId: Guid.NewGuid().ToString("N"),
            accessToken: null,
            apiKey: null,
            isAuthenticated: true,
            permissions: [],
            sourceType: "api",
            jobId: Guid.NewGuid().ToString("N"),
            jobType: nameof(UserNotificationJob),
            scheduledAt: DateTimeOffset.UtcNow);

        scheduler.Enqueue<UserNotificationJob>(job => job.RunAsync(context));
    }
}
```

### Dashboard Access

```csharp
public class HangfireDashboardAuthFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var user = context.GetHttpContext().User;
        return user.Identity?.IsAuthenticated == true 
            && user.IsInRole("Admin");
    }
}

// Register in Program.cs
app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = [new HangfireDashboardAuthFilter()]
});
```

Access dashboard at: `https://yourapp.com/hangfire`

### Trade-offs vs Quartz

| Aspect | Hangfire | Quartz |
|--------|----------|--------|
| **Expression Jobs** | Supported natively | Not supported (class-based only) |
| **Dashboard** | Built-in, web-based | Requires external monitoring app |
| **Recurring Jobs** | Simple, declarative | Requires trigger builder |
| **Distributed Mode** | Requires SQL lock contention | True cluster-aware with Quartz Clustering Plugin |
| **Storage** | SQL only | SQL, in-memory, MongoDB options |
| **Ease of Use** | Simpler, less config | More complex, more flexible |

---

## Muonroi.BackgroundJobs.Quartz

**NuGet:** `Muonroi.BackgroundJobs.Quartz` | **Tier:** OSS | **Distribution:** NuGet

### Purpose

Quartz.NET provider implementation. Enterprise-grade scheduler for distributed systems with advanced retry policies, clustering, and job persistence. Recommended for multi-instance deployments requiring high availability.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `QuartzJobScheduler` | Implementation | Adapts Quartz API to `IBackgroundJobScheduler` (expression jobs throw `NotSupported`) |
| `QuartzProviderRegistration` | Module Initializer | Self-registers with `BackgroundJobHandler` |
| `QuartzContextJobListener` | Job Listener | Restores Muonroi execution context before/after job runs |

### DI Registration

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Automatic via AddBackgroundJobs
builder.Services.AddBackgroundJobs(builder.Configuration);

// OR explicit with custom job registration
builder.Services.AddQuartz(q =>
{
    // Jobs are registered by application code or configuration
});
builder.Services.AddSingleton<QuartzContextJobListener>();
builder.Services.AddQuartzHostedService(o => o.WaitForJobsToComplete = true);
builder.Services.TryAddScoped<IBackgroundJobScheduler, QuartzJobScheduler>();

var app = builder.Build();
```

### Configuration (appsettings.json)

```json
{
  "BackgroundJobConfigs": {
    "JobType": "Quartz",
    "ConnectionString": "Server=localhost;Database=quartz;User Id=sa;Password=Your_Password;"
  },
  "Quartz": {
    "Properties": {
      "quartz.scheduler.instanceName": "MyScheduler",
      "quartz.jobStore.type": "Quartz.Impl.AdoJobStore.JobStoreTX, Quartz",
      "quartz.jobStore.driverDelegateType": "Quartz.Impl.AdoJobStore.SqlServerDelegate, Quartz",
      "quartz.jobStore.dataSource": "default",
      "quartz.jobStore.useProperties": false,
      "quartz.dataSource.default.connectionString": "Server=localhost;Database=quartz;User Id=sa;Password=Your_Password;",
      "quartz.dataSource.default.provider": "SqlServer",
      "quartz.threadPool.threadCount": 10,
      "quartz.threadPool.type": "Quartz.Simpl.SimpleThreadPool, Quartz"
    }
  }
}
```

### Usage Example

```csharp
// Define a class-based job (Quartz requires this)
public class InventoryAuditJob : IJob
{
    private readonly IInventoryService _inventoryService;
    private readonly IMLog<InventoryAuditJob> _log;

    public InventoryAuditJob(IInventoryService inventoryService, IMLog<InventoryAuditJob> log)
    {
        _inventoryService = inventoryService;
        _log = log;
    }

    public async Task Execute(IJobExecutionContext context)
    {
        var correlationId = context.Get<string>("CorrelationId") ?? Guid.NewGuid().ToString("N");
        using var scope = _log.BeginProperty("CorrelationId", correlationId);

        try
        {
            _log.Info("Starting inventory audit");
            await _inventoryService.AuditAsync();
            _log.Info("Inventory audit completed");
        }
        catch (Exception ex)
        {
            _log.Error($"Inventory audit failed: {ex.Message}", ex);
            throw;
        }
    }
}

// Register job and schedule via ISchedulerFactory (from Quartz DI)
public class JobSchedulingService(ISchedulerFactory schedulerFactory)
{
    public async Task ScheduleAuditAsync()
    {
        var scheduler = await schedulerFactory.GetScheduler();

        var job = JobBuilder.Create<InventoryAuditJob>()
            .WithIdentity("inventory-audit", "maintenance")
            .UsingJobData("CorrelationId", Guid.NewGuid().ToString("N"))
            .Build();

        var trigger = TriggerBuilder.Create()
            .WithIdentity("inventory-audit-trigger", "maintenance")
            .WithCronSchedule("0 0 1 * * ?")  // Daily at 1 AM
            .Build();

        await scheduler.ScheduleJob(job, trigger);
    }
}
```

### Cluster Configuration

For distributed deployments, enable Quartz clustering:

```json
{
  "Quartz": {
    "Properties": {
      "quartz.jobStore.clustered": true,
      "quartz.scheduler.instanceId": "AUTO",
      "quartz.jobStore.clusterCheckinInterval": 7500
    }
  }
}
```

### Cron Expression Reference

Quartz uses 6-field cron: `second minute hour dayOfMonth month dayOfWeek`

```csharp
"0 0 * * * ?"           // Every hour
"0 0 2 * * ?"           // Every day at 2 AM
"0 0 9 ? * MON"         // Every Monday at 9 AM
"0 */15 * * * ?"        // Every 15 minutes
"0 0 3 1 * ?"           // First day of month at 3 AM
"0 0 17 ? * MON-FRI"    // Every weekday at 5 PM
"*/30 * * * * ?"        // Every 30 seconds
```

---

## Muonroi.Resilience

**NuGet:** `Muonroi.Resilience` | **Tier:** OSS | **Distribution:** NuGet

### Purpose

Resilience patterns using Polly 8+ library. Provides standardized retry, circuit breaker, timeout, and bulkhead policies for handling transient failures and protecting against cascading failures.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MuonroiResilienceExtensions` | Static | `AddMuonroiResilience()` extension registers standard pipeline |
| `PolicyHandler` | Class | Builds custom resilience pipelines with logging |

### DI Registration

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Register standard Muonroi resilience pipeline
builder.Services.AddMuonroiResilience();

var app = builder.Build();
```

### Standard Policy Details

The standard `"muonroi-standard"` pipeline includes:

1. **Retry** — Exponential backoff with jitter
   - Max attempts: 3
   - Initial delay: 1s → 2s → 4s
   - Handles: `MTransientException`, `HttpRequestException`

2. **Circuit Breaker** — Protects downstream services
   - Failure ratio threshold: 50%
   - Sampling duration: 30s
   - Minimum throughput: 5 requests
   - Break duration: 30s

3. **Timeout** — Prevents indefinite hangs
   - Timeout duration: 10s

### Usage Example

```csharp
public class ExternalApiService(ResiliencePipelineProvider<HttpResponseMessage> pipelineProvider)
{
    private readonly HttpClient _httpClient = new();

    public async Task<string> FetchDataAsync(string endpoint)
    {
        var pipeline = pipelineProvider.GetPipeline<HttpResponseMessage>("muonroi-standard");
        
        var outcome = await pipeline.ExecuteAsync(
            async (ct) =>
            {
                var response = await _httpClient.GetAsync(endpoint, ct);
                return response;
            },
            CancellationToken.None);

        return await outcome.Result.Content.ReadAsStringAsync();
    }
}
```

### Custom Policy Example

```csharp
public class PolicyHandler(IMLog<PolicyHandler> logger)
{
    public ResiliencePipeline<T> CreateDefaultPipeline<T>(string serviceName)
    {
        return new ResiliencePipelineBuilder<T>()
            .AddRetry(new RetryStrategyOptions<T>
            {
                ShouldHandle = new PredicateBuilder<T>().Handle<Exception>(),
                BackoffType = DelayBackoffType.Exponential,
                UseJitter = true,
                MaxRetryAttempts = 3,
                Delay = TimeSpan.FromSeconds(1),
                OnRetry = args =>
                {
                    logger.LogWarning("Retrying {ServiceName} due to {Exception}",
                        serviceName, args.Outcome.Exception?.Message);
                    return default;
                }
            })
            .AddCircuitBreaker(new CircuitBreakerStrategyOptions<T>
            {
                ShouldHandle = new PredicateBuilder<T>().Handle<Exception>(),
                FailureRatio = 0.5,
                SamplingDuration = TimeSpan.FromSeconds(30),
                MinimumThroughput = 5,
                BreakDuration = TimeSpan.FromSeconds(30)
            })
            .AddTimeout(TimeSpan.FromSeconds(10))
            .Build();
    }
}
```

---

## Muonroi.Secrets

**NuGet:** `Muonroi.Secrets` | **Tier:** OSS | **Distribution:** NuGet

### Purpose

Abstraction layer for secret management. Decouples applications from specific secret stores (configuration, Vault, Azure Key Vault) enabling environment-specific provider selection without code changes.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `ISecretProvider` | Interface | `GetSecret(name) → string?` |
| `ConfigurationSecretProvider` | Implementation | Reads from .NET configuration (suitable for dev only) |

### DI Registration

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Default: read from configuration/environment variables
builder.Services.AddSingleton<ISecretProvider, ConfigurationSecretProvider>();

// OR use a custom provider (see Secret Management Guide for Vault/AzureKeyVault)
// builder.Services.AddHashiCorpVaultSecretProvider(configuration.GetSection("VaultConfigs"));

var app = builder.Build();
```

### Configuration (appsettings.json)

```json
{
  "Secrets": {
    "JwtSigningKey": "your-secret-key-here",
    "DatabasePassword": "secure-password",
    "ApiKey": "external-api-key"
  }
}
```

### Usage Example

```csharp
public class AuthService(ISecretProvider secretProvider)
{
    public async Task<JwtSecurityToken> CreateTokenAsync(string userId)
    {
        var signingKey = secretProvider.GetSecret("Secrets:JwtSigningKey");
        
        if (string.IsNullOrEmpty(signingKey))
        {
            throw new InvalidOperationException("JWT signing key not configured");
        }

        var tokenHandler = new JwtSecurityTokenHandler();
        var key = Encoding.ASCII.GetBytes(signingKey);

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(new[] { new Claim("sub", userId) }),
            Expires = DateTime.UtcNow.AddHours(1),
            SigningCredentials = new SigningCredentials(new SymmetricSecurityKey(key), SecurityAlgorithms.HmacSha256Signature)
        };

        return tokenHandler.CreateJwtSecurityToken(tokenDescriptor);
    }
}
```

### Advanced: Vault Provider

For production, use HashiCorp Vault (requires `Muonroi.Secrets.Vault` extension package):

```csharp
builder.Services.AddHashiCorpVaultSecretProvider(
    configuration.GetSection("VaultConfigs"));
```

Configuration:

```json
{
  "VaultConfigs": {
    "Type": "HashiCorp",
    "Address": "https://vault.example.com:8200",
    "Token": "${VAULT_TOKEN}",
    "Namespace": "muonroi",
    "SecretsPath": "secret/data/production",
    "AuthMethod": "token",
    "TlsSkipVerify": false,
    "RequestTimeoutSeconds": 30,
    "CacheDurationMinutes": 5
  }
}
```

Store secrets:

```bash
vault kv put secret/production/jwt \
  signing-key="LS0tLS1CRUdJTi..."

vault kv put secret/production/db \
  connection-string="Server=db.internal;Database=muonroi;User=admin;Password=xxx"
```

See [Secret Management Guide](../../04-operations/secret-management.md) for detailed Vault, Azure KeyVault, and Kubernetes patterns.

---

## Muonroi.Kubernetes

**NuGet:** `Muonroi.Kubernetes` | **Tier:** OSS | **Distribution:** NuGet

### Purpose

Configuration and helpers for Kubernetes cluster integration. Enables feature detection, cluster type-aware behavior, and RBAC/service account discovery.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `KubernetesConfigs` | Class | Cluster configuration: `ClusterType`, `ClusterEndpoint` |
| `KubernetesClusterType` | Enum | Supported: `K8S` (upstream), `K3S` (lightweight), `Eks` (AWS) |

### DI Registration

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

var kubeConfig = builder.Configuration.GetSection("KubernetesConfigs");
builder.Services.Configure<KubernetesConfigs>(kubeConfig);

var app = builder.Build();
```

### Configuration (appsettings.json)

```json
{
  "KubernetesConfigs": {
    "ClusterType": "K8S",
    "ClusterEndpoint": "https://kubernetes.default.svc.cluster.local:443"
  }
}
```

### Usage Example

```csharp
public class KubeHealthCheckService(IOptions<KubernetesConfigs> kubeOptions)
{
    public void CheckClusterType()
    {
        var config = kubeOptions.Value;
        
        switch (config.ClusterType)
        {
            case KubernetesClusterType.K8S:
                Console.WriteLine("Running on upstream Kubernetes");
                break;
            case KubernetesClusterType.K3S:
                Console.WriteLine("Running on K3s lightweight distribution");
                break;
            case KubernetesClusterType.Eks:
                Console.WriteLine("Running on AWS EKS");
                break;
        }
    }
}
```

### Integration with external-secrets-operator

For production secret injection from Vault/Azure KeyVault, use external-secrets-operator (ESO):

```bash
helm repo add external-secrets https://charts.external-secrets.io
helm install external-secrets external-secrets/external-secrets \
  --namespace external-secrets-system --create-namespace
```

Define SecretStore:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-secret-store
  namespace: muonroi
spec:
  provider:
    vault:
      server: "https://vault.example.com:8200"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "muonroi-app"
```

Define ExternalSecret mapping:

```yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: muonroi-secrets
  namespace: muonroi
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: vault-secret-store
    kind: SecretStore
  target:
    name: muonroi-app-secrets
    creationPolicy: Owner
  data:
    - secretKey: JwtSigningKey
      remoteRef:
        key: production/jwt
        property: signing-key
    - secretKey: DatabaseConnectionString
      remoteRef:
        key: production/db
        property: connection-string
```

Pod references secrets:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: muonroi-control-plane
  namespace: muonroi
spec:
  template:
    spec:
      containers:
      - name: control-plane
        env:
        - name: MUONROI_JWT_SIGNING_KEY
          valueFrom:
            secretKeyRef:
              name: muonroi-app-secrets
              key: JwtSigningKey
```

---

## Muonroi.ServiceDiscovery.Consul

**NuGet:** `Muonroi.ServiceDiscovery.Consul` | **Tier:** OSS | **Distribution:** NuGet

### Purpose

Service discovery and registration for distributed Muonroi deployments. Integrates with Consul for dynamic service registration, health checks, and DNS-based service routing.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `ConsulConfigs` | Class | Configuration: enable, service name, address, port, metadata |
| `ConsulHandler` | Static | Registration helpers: `AddServiceDiscovery()`, `UseServiceDiscovery()`, `UseServiceDiscoveryAsync()` |

### DI Registration

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Register Consul client if enabled
builder.Services.AddServiceDiscovery(builder.Configuration, builder.Environment);

var app = builder.Build();

// Register with Consul on startup
await app.UseServiceDiscoveryAsync(app.Environment);

await app.RunAsync();
```

### Configuration (appsettings.json)

```json
{
  "ConsulConfigs": {
    "Enable": true,
    "UseDiscovery": true,
    "Id": "muonroi-control-plane-instance-1",
    "ServiceName": "muonroi-control-plane",
    "ConsulAddress": "http://consul.example.com:8500",
    "ServiceAddress": "control-plane.muonroi.svc.cluster.local",
    "ServicePort": 8080,
    "ServiceMetadata": {
      "version": "1.0.0",
      "environment": "production",
      "region": "us-east-1"
    }
  }
}
```

### Usage Example

```csharp
public class ServiceDiscoveryStartup : IHostedService
{
    private readonly ConsulConfigs _consulConfigs;
    private readonly IConsulClient? _consulClient;
    private readonly IMLog<ServiceDiscoveryStartup> _log;

    public ServiceDiscoveryStartup(
        IOptions<ConsulConfigs> consulOptions,
        IConsulClient? consulClient,
        IMLog<ServiceDiscoveryStartup> log)
    {
        _consulConfigs = consulOptions.Value;
        _consulClient = consulClient;
        _log = log;
    }

    public async Task StartAsync(CancellationToken cancellationToken)
    {
        if (!_consulConfigs.Enable || _consulClient == null)
        {
            _log.Info("Service discovery is disabled");
            return;
        }

        // Service registration occurs in UseServiceDiscovery middleware
        _log.Info($"Service {_consulConfigs.ServiceName} registered with Consul");
        await Task.CompletedTask;
    }

    public async Task StopAsync(CancellationToken cancellationToken)
    {
        // Deregistration handled automatically by ConsulHandler on app shutdown
        await Task.CompletedTask;
    }
}

// Query services from Consul (in client application)
public class ServiceLocator(IConsulClient? consulClient)
{
    public async Task<string?> LocateServiceAsync(string serviceName)
    {
        if (consulClient == null)
        {
            return null;
        }

        var services = await consulClient.Health.Service(serviceName, null, true);
        var service = services.Response.FirstOrDefault();

        if (service != null)
        {
            return $"http://{service.Service.Address}:{service.Service.Port}";
        }

        return null;
    }
}
```

### Health Check Registration

Consul can perform periodic health checks. Implement a liveness endpoint:

```csharp
// In your controller
[HttpGet("/health")]
public IActionResult Health()
{
    return Ok(new { status = "healthy", timestamp = DateTime.UtcNow });
}
```

Then configure in Consul or via service metadata:

```json
{
  "ConsulConfigs": {
    "ServiceMetadata": {
      "health-check-url": "http://localhost:8080/health",
      "health-check-interval": "10s",
      "health-check-timeout": "5s"
    }
  }
}
```

### Kubernetes Integration

For K8s deployments, typically use native K8s DNS (`service-name.namespace.svc.cluster.local`) instead of Consul:

```json
{
  "ConsulConfigs": {
    "Enable": false
  }
}
```

But Consul can still be used for service discovery across namespaces or outside K8s:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: muonroi-consul-config
  namespace: muonroi
data:
  ConsulConfigs.Enable: "true"
  ConsulConfigs.ServiceName: "muonroi-control-plane"
  ConsulConfigs.ConsulAddress: "http://consul.external.svc:8500"
```

---

## Comparison Matrix

| Feature | BackgroundJobs.Hangfire | BackgroundJobs.Quartz | Resilience | Secrets | Kubernetes | ServiceDiscovery.Consul |
|---------|------------------------|-----------------------|------------|---------|------------|--------------------------|
| **Purpose** | Job scheduling | Job scheduling | Retry/circuit breaker | Secret access | K8s config | Service discovery |
| **Provider** | SQL queue | SQL/in-memory store | Polly 8+ | Pluggable (config/Vault/Azure) | Native K8s | Consul |
| **Expression Jobs** | ✓ Yes | ✗ No (class-based) | — | — | — | — |
| **Dashboard** | Built-in | External required | — | — | — | — |
| **Clustering** | SQL locks | Native clustering | — | — | Native | Native |
| **Single Instance** | ✓ Good | ✓ Good | — | — | ✓ OK | — |
| **Multi-Instance** | OK (contention) | ✓ Best | — | — | ✓ Best | ✓ Best |

---

## Best Practices

### Background Jobs

- **Idempotency**: Design jobs to be safely retryable—running twice should not cause duplicate side effects
- **Tenant Context**: Always pass `IMuonroiJobExecutionContext` to capture tenant/user/correlation context
- **Correlation IDs**: Carry correlation IDs through logs for end-to-end tracing
- **Error Handling**: Log errors with context before re-throwing; let the scheduler handle retries
- **Testing**: Use in-memory Quartz or mock Hangfire in unit tests; use real database in integration tests

### Resilience

- **Circuit Breaker**: Protects downstream services from cascading failures—monitor break duration
- **Timeouts**: Always use timeouts to prevent indefinite hangs on slow/failing services
- **Jitter**: Enable jitter on retries to avoid thundering herd during service recovery
- **Monitoring**: Track retry counts and circuit breaker state via metrics/logs

### Secrets

- **Never commit secrets**: Store all sensitive config in secret provider, never in code/config files
- **Rotate regularly**: License keys annually, API keys every 6–12 months, DB passwords every 90 days
- **Principle of least privilege**: Grant secret access only to required applications
- **Audit access**: Enable logging in Vault/Azure KeyVault to track who accessed what and when

### Kubernetes

- **Use native DNS**: For in-cluster service discovery, prefer K8s Service DNS over Consul
- **External Secrets Operator**: Use ESO to sync secrets from Vault/Azure KeyVault into K8s Secrets
- **RBAC**: Restrict service account permissions to only required APIs and resources
- **Health Checks**: Implement liveness and readiness probes in your controllers

### Service Discovery

- **Metadata**: Include version, environment, region, and other attributes in service metadata
- **Health Checks**: Implement periodic health checks so Consul can deregister unhealthy instances
- **Graceful Shutdown**: Deregister service on shutdown to avoid routing traffic to dead instances
- **DNS Integration**: Use Consul DNS (`service-name.service.consul`) for service lookup

---

## Related Guides

- [Background Jobs Guide](../../04-operations/background-jobs-guide.md) — Detailed job scheduling and retry patterns
- [Secret Management Guide](../../04-operations/secret-management.md) — Vault, Azure KeyVault, Kubernetes secret injection
- [Kubernetes Deployment Guide](../../04-operations/kubernetes-deployment-guide.md) — K8s native secret and config patterns
- [Observability Guide](../../04-operations/observability-guide.md) — Monitoring jobs, resilience, and service discovery
- [Resilience Patterns in Microsoft Docs](https://learn.microsoft.com/en-us/azure/architecture/patterns/resilience)
- [Consul Documentation](https://www.consul.io/docs)
- [Quartz.NET Documentation](https://www.quartz-scheduler.net/documentation/)
