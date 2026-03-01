---
slug: /resources/buildingblock/readme
---

# Muonroi Building Block
[![Ask DeepWiki](https://raw.githubusercontent.com/muonroi/MuonroiBuildingBlock/main/src/Muonroi.BuildingBlock/Images/deep-wiki.png)](https://deepwiki.com/muonroi/MuonroiBuildingBlock)

## Introduction
This library provides entities such as `User`, `Role`, `Permission`, and `Language`, along with built-in dependency injection, bearer token management, JSON handling utilities, string conversion, and localization for multiple languages. It also sets up linking tables like `MUserRoles` and `MRolePermissions` together with token and audit tables. See [Database Structure](/docs/reference/database-structure) for the full schema. It now also includes a lightweight rule engine that supports strongly typed rules and dynamic JSON workflows. See the [Rule Engine Guide](/docs/guides/rule-engine/rule-engine-guide) for details. The package is designed to accelerate the development of .NET applications following a clean architecture.

### Rule Engine Features

* Compose strongly typed `IRule<T>` classes with dependency ordering and feature toggles.
* Run versioned JSON workflows via `RulesEngineService` and `IRuleSetStore`.
* Hook into rule execution with `RuleOrchestrator` and `IHookHandler` for logging or audits.
* Sign and verify rule artifacts while emitting OpenTelemetry metrics.
* Generate workflows from existing code with the `MR.RuleGen` CLI.
* Execute generated workflows at runtime through `MR.RuleRuntime`.

## Prerequisites
*   .NET SDK **9.0** or higher must be installed. You can download it from the [official website](https://dotnet.microsoft.com/download).

## Installation
Install the package from NuGet:

```bash
dotnet add package Muonroi.BuildingBlock
```

The command above installs the latest available version. You can also browse the [NuGet Gallery](https://www.nuget.org/packages/Muonroi.BuildingBlock) to select a specific version or install it via the Visual Studio package manager.

### Building from source
If you'd like to contribute or customize the library locally, clone this repository and run:

```bash
dotnet build
dotnet pack
```

## Quick Start
You can also use the `muonroibase.template` dotnet template:

```bash
dotnet new install muonroibase.template
dotnet new muonroibase -n YourNewProjectName -C MyCoreName
```

See the [`Samples/Program.cs`](https://github.com/muonroi/MuonroiBuildingBlock/blob/main/Samples/Program.cs) file for a minimal setup example.
Additional samples are provided in the `Samples` folder:
* `MemoryCache` demonstrates basic in-memory caching.
* `MultiLevelCache` shows how to combine memory and distributed caches.
* `RedisCache` illustrates using Redis as a distributed cache.
* `MultipleCache` demonstrates using both `IMemoryCache` and `IMultiLevelCacheService`.
* `HelloRules` highlights the built-in rule engine.
* `ImportExportRules` shows versioned JSON workflows.
* `PaymentApproval` orchestrates multiple rules for a business scenario.
* `AuthAuthzBff` shows how to combine authentication, authorization and the BFF pattern.

## Project Structure

```text
MuonroiBuildingBlock/
├── src/
│   ├── Muonroi.BuildingBlock/
│   ├── Muonroi.RuleEngine/
│   ├── Muonroi.Tenancy/
│   ├── Muonroi.Bff/
│   └── Muonroi.Base.Template/
├── Samples/
├── docs/
├── tests/
├── db/
├── deploy/
├── k8s/
└── tools/
```

| Folder | Description |
| --- | --- |
| `src/` | Core source code for the library and related packages. Key projects include `Muonroi.BuildingBlock`, `Muonroi.RuleEngine`, `Muonroi.Tenancy`, `Muonroi.Bff`, and `Muonroi.Base.Template`. |
| `Samples/` | Standalone examples demonstrating caching, rule engine workflows, BFF patterns, and more. |
| `docs/` | DocFX documentation and guides covering configuration, permissions, rules, and other topics. |
| `tests/` | Unit and integration tests for each module. |
| `db/` | Database migration scripts and schema definitions. |
| `deploy/` | Deployment scripts and release tooling. |
| `k8s/` | Kubernetes manifests and configuration files. |
| `tools/` | Development utilities and helper scripts. |

## Usage Guide

### 1. Configuring `Program.cs`

Here's how to configure your `Program.cs` file to use the library's features:

```csharp
using System.Reflection;
using Muonroi.BuildingBlock.External;
using Muonroi.BuildingBlock.External.Common.Constants;
using Muonroi.BuildingBlock.External.Cors;
using Muonroi.BuildingBlock.External.DI;
using Muonroi.BuildingBlock.External.Entity;
using Muonroi.BuildingBlock.External.Entity.DataSample;
using Muonroi.BuildingBlock.External.Logging;
using Muonroi.BuildingBlock.External.Messaging;
using Muonroi.BuildingBlock.External.Caching.Distributed.MultiLevel;
using Muonroi.BuildingBlock.External.Grpc;
using Muonroi.BuildingBlock.External.Consul;
using Serilog;
// Replace with your project's using statements
// using YourProject.Data; 
// using YourProject.Permissions;

WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
Assembly assembly = Assembly.GetExecutingAssembly();
ConfigurationManager configuration = builder.Configuration;

builder.AddAppConfiguration();
builder.AddAutofacConfiguration();
builder.Host.UseSerilog((context, services, loggerConfiguration) =>
{
    MSerilogAction.Configure(context, services, loggerConfiguration, false);
});

Log.Information("Starting {ApplicationName} API up", builder.Environment.ApplicationName);

try
{
    IServiceCollection services = builder.Services;

    // Register services
    services.AddApplication(assembly);
    services.AddInfrastructure(configuration);
    services.SwaggerConfig(builder.Environment.ApplicationName);
    services.AddScopeServices(typeof(<YourDbContext>).Assembly);
    services.AddValidateBearerToken<<YourDbContext>, MTokenInfo, <YourPermissionEnum>>(configuration);
    services.AddDbContextConfigure<<YourDbContext>, <YourPermissionEnum>>(configuration);
    services.AddCors(configuration);
    services.AddPermissionFilter<<YourPermissionEnum>>();
    services.ConfigureMapper();

    // Optional Integrations
    services.AddMultiLevelCaching(configuration);
    services.AddMessageBus(configuration, assembly);
    services.AddGrpcServer();
    services.AddServiceDiscovery(configuration, builder.Environment);
    services.AddObservability(configuration);

    WebApplication app = builder.Build();
    
    await app.UseServiceDiscoveryAsync(builder.Environment);
    app.UseCors("MAllowDomains");
    app.UseDefaultMiddleware<<YourDbContext>, <YourPermissionEnum>>();
    app.AddLocalization(assembly);
    app.UseRouting();
    app.UseAuthentication();
    app.UseAuthorization();
    app.ConfigureEndpoints();
    app.MigrateDatabase<<YourDbContext>>();

    await app.RunAsync();
}
catch (Exception ex)
{
    Log.Fatal(ex, "Unhandled exception: {Message}", ex.Message);
}
finally
{
    Log.Information("Shut down {ApplicationName} complete", builder.Environment.ApplicationName);
    await Log.CloseAndFlushAsync();
}
```

### 2. Example `appsettings.json` Configuration

Here's a comprehensive example of the `appsettings.json` configuration:

```json
{
  "DatabaseConfigs": {
    "DbType": "Sqlite",
    "ConnectionStrings": {
      "SqliteConnectionString": "Your encrypted connection string by secret key",
      "MongoDbConnectionString": "Your encrypted connection string by secret key",
      "SqlServerConnectionString": "Your encrypted connection string by secret key",
      "MySqlConnectionString": "Your encrypted connection string by secret key",
      "PostgreSqlConnectionString": "Your encrypted connection string by secret key"
    }
  },
  "ApiKey": "",
  "CacheConfigs": {
    "CacheType": "MultiLevel"
  },
  "RuleStore": {
    "RootPath": "rules",
    "UseContentRoot": true
  },
  "LicenseConfigs": {
    "Mode": "Offline",
    "LicenseFilePath": "licenses/license.json",
    "PublicKeyPath": "licenses/public.pem",
    "FingerprintSalt": "your-salt-here",
    "EnableChain": true,
    "ChainStorage": "File",
    "ChainFilePath": "logs/license-chain.log",
    "FailMode": "Hard",
    "EnforceOnDatabase": true,
    "EnforceOnMiddleware": true,
    "Online": {
      "Endpoint": "https://license.example.com/validate",
      "TimeoutSeconds": 10,
      "RefreshMinutes": 1440
    }
  },
  "RedisConfigs": {
    "Enable": true,
    "Host": "Your host encrypted by secret key",
    "Port": "Your port encrypted by secret key",
    "Password": "Your password encrypted by secret key",
    "Expire": 30,
    "KeyPrefix": "Your prefix encrypted by secret key",
    "AllMethodsEnableCache": false
  },
  "TokenConfigs": {
    "Issuer": "https://exampledomain.com",
    "Audience": "https://searchpartners.exampledomain.com",
    "SymmetricSecretKey": "Your secret key (at least 32 chars) encrypted by secret key",
    "UseRsa": true,
    "ExpiryMinutes": 30,
    "EnableCookieAuth": true,
    "CookieName": "AuthToken",
    "CookieSameSite": "Lax",
    "PublicKeyPath": "keys/public.pem",
    "PrivateKeyPath": "keys/private.pem"
  },
  "PaginationConfigs": {
    "DefaultPageIndex": 1,
    "DefaultPageSize": 10,
    "MaxPageSize": 100
  },
  "ResourceSetting": {
    "ResourceName": "Resources.ErrorMessages",
    "lang": "vi-VN"
  },
  "Serilog": {
    "Using": [ "Serilog.Sinks.Console", "Serilog.Sinks.File", "Elastic.Serilog.Sinks" ],
    "MinimumLevel": {
      "Default": "Information",
      "Override": {
        "Microsoft.AspNetCore": "Warning",
        "System": "Warning"
      }
    },
    "WriteTo": [
      { "Name": "Console" },
      {
        "Name": "File",
        "Args": { 
            "path": "logs/log-.txt", 
            "rollingInterval": "Day",
            "formatter": "Serilog.Formatting.Elasticsearch.ElasticsearchJsonFormatter, Serilog.Formatting.Elasticsearch"
        }
      },
      {
        "Name": "Elasticsearch",
        "Args": {
          "bootstrapMethod": "Silent",
          "nodes": [ "http://localhost:9200" ],
          "dataStream": "logs-muonroi-default",
          "ilmPolicy": "muonroi-policy"
        }
      }
    ],
    "Enrich": [ "FromLogContext", "WithMachineName", "WithThreadId" ],
    "Properties": {
      "Application": "MyApplication"
    }
  },
  "MAllowDomains": "https://localhost:52182,http://localhost:4200",
  "GrpcServices": {
    "Services": {
      "YourService1": { "Uri": "http://localhost:5001" },
      "YourService2": { "Uri": "http://localhost:5002" }
    }
  },
  "ConsulConfigs": {
    "ServiceName": "MyService",
    "ConsulAddress": "http://localhost:8500",
    "ServiceAddress": "http://localhost",
    "ServicePort": 5000
  },
  "MessageBusConfigs": {
    "BusType": "RabbitMq",
    "RabbitMq": {
      "Host": "localhost",
      "VirtualHost": "/",
      "Username": "guest",
      "Password": "guest"
    },
    "Kafka": {
      "Host": "localhost:9092",
      "Topic": "sample-topic",
      "GroupId": "sample-group"
    }
  },
  "BackgroundJobConfigs": {
    "JobType": "Hangfire",
    "ConnectionString": "Your job storage connection string"
  },
  "KubernetesConfigs": {
    "ClusterType": "K8s",
    "ClusterEndpoint": "https://your-cluster-api"
  },
  "OpenTelemetry": {
    "ServiceName": "MyService",
    "OtlpEndpoint": "http://localhost:4317"
  },
  "SecretKey": "Your secret key used to encrypt important values",
  "EnableEncryption": true
}
```

### 3. Providing Resource Files
Create a `Resources` directory in your project and place localization JSON files inside it. Each file should follow the pattern `ErrorMessages-<culture>.json` (e.g., `ErrorMessages-en-US.json`) and contain key-value pairs of error codes and messages. Ensure the `ResourceSetting.ResourceName` value in `appsettings.json` matches the base file name.

## Main Components

*   **Entities**: Core data models like `MUser`, `MRole`, `MPermission`, and `MLanguage`.
*   **Dependency Injection**: Pre-configured DI using Autofac for managing application services and lifecycles.
*   **Authentication & Authorization**: Robust token-based security with JWT, refresh tokens, and a flexible permission system.
*   **Data Access**: Generic repositories (`MRepository<T>`) and query classes (`MQuery<T>`) for Entity Framework Core, along with Dapper integration for performance-critical queries.
*   **Auto-CRUD API**: Automatically generates standard CRUD endpoints (`GET`, `POST`, `PUT`, `DELETE`) for any entity inheriting from `MEntity`.
*   **Caching**: Multi-level caching support (in-memory and Redis) to improve performance.
*   **Rule Engine**: Compose strongly typed `IRule<T>` classes and dynamic JSON workflows with dependency ordering and feature toggles.
*   **Service Discovery**: Consul integration for registering and discovering services in a microservices environment.
*   **Message Bus**: MassTransit integration for both RabbitMQ and Kafka to enable asynchronous communication and Saga patterns.
*   **Background Jobs**: Configuration helpers for background job schedulers like Hangfire or Quartz.
*   **gRPC**: Helpers to easily configure gRPC servers and clients.
*   **Logging**: Centralized logging with Serilog, including out-of-the-box support for Elasticsearch.
*   **Cryptography**: `MCryptographyExtension` uses SHA-256 for secure hashing and AES for configuration encryption.
*   **Localization**: Built-in support for multiple languages using JSON resource files.
*   **License (preview)**: Optional offline/online license validation with fingerprint-based action chaining.

## Rule Engine

The `Muonroi.RuleEngine` packages provide a flexible way to evaluate business rules. Rules implement `IRule<T>` and can declare dependencies, hook points, and optional feature flags. JSON workflows can be loaded at runtime through `RulesEngineService`, and results are collected in a `FactBag` for later rules.

For projects with existing conditional logic, the `MR.RuleGen` CLI can generate workflow definitions automatically. At runtime, `MR.RuleRuntime` loads these workflows, registers custom types and actions, and executes them against supplied parameters.


```csharp
services.AddRuleEngine().AddRulesFromAssemblies(typeof(Program).Assembly);
```

For practical examples see the `HelloRules`, `ImportExportRules`, and `PaymentApproval` samples or read the [Rule Engine Guide](/docs/guides/rule-engine/rule-engine-guide).

## Integrations

### Redis Caching
Configure caching via `CacheConfigs` and `RedisConfigs` in your settings.
```csharp
// In Program.cs
services.AddMultiLevelCaching(configuration);
```

Sample advanced config:

```json
{
  "CacheConfigs": {
    "CacheType": "MultiLevel",
    "KeyNamespace": "catalog-service",
    "EnableStampedeProtection": true,
    "DefaultAbsoluteExpirationInMinutes": 30,
    "TtlJitterPercent": 5
  },
  "RedisConfigs": {
    "Enable": true,
    "Host": "localhost",
    "Port": "6379",
    "Password": "",
    "KeyPrefix": "catalog",
    "AbortOnConnectFail": false
  }
}
```

Runtime behavior:
* License guard for `distributed-cache` is enforced when using external distributed providers (Redis, etc.).
* OpenTelemetry spans/metrics are emitted for cache `get`, `set`, `remove`, `refresh`, and `get_or_set`
  (`Muonroi.BuildingBlock.DistributedCache`).
* Tenant-aware cache keys are isolated by tenant context and optional `KeyNamespace`.
* Stampede protection is enabled by default for `GetOrSetAsync` in `MultiLevelCacheService`.
* Contract governance gate:
  `bash ./scripts/check-distributed-cache-contracts.sh`
* Optional SLO gate script for KPI checks:
  `pwsh ./scripts/check-distributed-cache-slo.ps1 -CurrentMetricsPath current.json -BaselineMetricsPath baseline.json`

### gRPC Integration
Use helpers in `External/Grpc` to configure gRPC. The `GrpcHandler` class provides extension methods for registering servers and clients from `appsettings.json`.

```csharp
services.AddGrpcServer(configuration); // server + interceptor + telemetry + health checks
services.AddGrpcClients(configuration, new Dictionary<string, Type>
{
    ["BillingClient"] = typeof(Billing.BillingClient)
});

app.UseGrpcTransport(configuration); // gRPC-Web (when enabled)
```

Sample advanced config (`GrpcServicesConfig` or legacy `GrpcServices`):

```json
{
  "GrpcServicesConfig": {
    "Server": {
      "EnableGrpcWeb": true,
      "EnableGrpcWebForAllServices": false,
      "EnableJsonTranscoding": false,
      "RequireMutualTls": false,
      "RateLimit": {
        "Enabled": true,
        "RequestsPerMinutePerApiKey": 600,
        "RequestsPerMinutePerTenant": 1200
      }
    },
    "ClientDefaults": {
      "TimeoutSeconds": 10,
      "RetryCount": 3,
      "LoadBalancingPolicy": "pick_first"
    },
    "Services": {
      "BillingClient": {
        "Uri": "https://billing.internal",
        "TimeoutSeconds": 8,
        "RetryCount": 2,
        "LoadBalancingPolicy": "round_robin"
      }
    }
  }
}
```

Runtime behavior:
* License guard for `grpc` is always enforced.
* OpenTelemetry spans/metrics are emitted for all server call types (unary + streaming).
* Health endpoints: `/health`, `/health/live`, `/health/ready`, `/grpc/live`, `/grpc/ready`.
* Optional SLO gate script for KPI checks:
  `pwsh ./scripts/check-grpc-slo.ps1 -CurrentMetricsPath current.json -BaselineMetricsPath baseline.json`

### Consul Integration
Service discovery support is provided in `External/Consul`. The `ConsulHandler` registers and deregisters your service with Consul automatically. Call `AddServiceDiscovery` and `UseServiceDiscoveryAsync` in `Program.cs`.

### License System

The library includes a three-tier license system. **By default, the library runs in FREE mode with no configuration required.**

#### Open Source + Commercial Model

- Source code in this repository is MIT-licensed.
- Paid tiers are for commercial capabilities around license governance and operations (signed policy workflow, server-side validation, anti-tampering hardening, enterprise support process).
- Detailed positioning: [COMMERCIAL-EDITIONS.md](./COMMERCIAL-EDITIONS.md)

#### License Tiers Comparison

| Capability | Free | Licensed | Enterprise |
|-----------|------|----------|------------|
| Core CRUD/API/Auth | ✅ | ✅ | ✅ |
| Multi-tenancy / RBAC+ / Rule Engine / gRPC / Message Bus / Distributed Cache / Audit Trail | ❌ | ✅ | ✅ |
| Signed policy enforcement (Tier 2) | ❌ | Optional | ✅ Recommended |
| Server-side validation + nonce rotation (Tier 3) | ❌ | Optional | ✅ Recommended |
| Centralized authorization (PDP mode with local fallback) | ❌ | Optional | ✅ Recommended |
| Compliance evidence pack + immutable export pipeline | ❌ | Optional | ✅ Recommended |
| Upgrade compatibility checker + SLO gate presets + LTS ops runbook | ❌ | Optional | ✅ Recommended |
| Anti-tampering hardening in production | ❌ | Optional | ✅ |
| Future premium features | ❌ | Per-license scope | ✅ via `AllowedFeatures=["*"]` |
| Typical buyer profile | Solo/small/internal | Product teams needing premium modules | Regulated or high-risk enterprise systems |

#### Capability Mapping and Runtime Guard Resolution

`AllowedFeatures` supports both legacy feature keys and capability keys. Runtime checks resolve them through a
capability model with backward compatibility:

- Legacy keys (still supported):
  - `multi-tenant`, `advanced-auth`, `rule-engine`, `grpc`, `message-bus`, `distributed-cache`, `audit-trail`, `anti-tampering`
- Capability keys (recommended for new paid licenses):
  - `tenancy.strict`, `auth.rbac_plus`, `rules.runtime`, `transport.grpc`, `transport.message_bus`, `cache.distributed`, `audit.trail`, `runtime.anti_tampering`

For paid tiers, core runtime actions (`api.*`, `db.*`, `http.*`) are mapped automatically to `core.runtime`.
You no longer need to enumerate action keys like `api.list` or `db.savechanges` in license payloads.

See the detailed schema and compatibility matrix in [License Capability Model](/docs/guides/enterprise/license-capability-model).

#### Configuration Examples

**1. FREE Mode (Default - No configuration needed)**

```json
{
  "LicenseConfigs": {
    // Empty or omit entirely - FREE mode is automatic
  },
  "EnableEncryption": false
}
```

**2. Licensed Mode (Offline - with license file)**

```json
{
  "LicenseConfigs": {
    "Mode": "Offline",
    "LicenseFilePath": "licenses/license.json",
    "PublicKeyPath": "licenses/public.pem",
    "EnableChain": true,
    "ChainStorage": "File",
    "ChainFilePath": "logs/license-chain.log",
    "FailMode": "Hard",
    "EnforceOnDatabase": true,
    "EnforceOnMiddleware": true
  }
}
```

**3. Licensed Mode (Online - with license server)**

```json
{
  "LicenseConfigs": {
    "Mode": "Online",
    "LicenseFilePath": "licenses/license.json",
    "EnableChain": true,
    "FailMode": "Hard",
    "EnforceOnDatabase": true,
    "EnforceOnMiddleware": true,
    "Online": {
      "Endpoint": "https://license.muonroi.com/api",
      "TimeoutSeconds": 10,
      "RefreshMinutes": 1440
    }
  }
}
```

**4. Enterprise Mode (Full features)**

```json
{
  "LicenseConfigs": {
    "Mode": "Online",
    "LicenseFilePath": "licenses/license.json",
    "EnableChain": true,
    "ChainStorage": "File",
    "FailMode": "Hard",
    "EnforceOnDatabase": true,
    "EnforceOnMiddleware": true,
    "EnableAntiTampering": true,
    "Online": {
      "Endpoint": "https://license.muonroi.com/api",
      "TimeoutSeconds": 10,
      "RefreshMinutes": 60
    }
  }
}
```

#### License File Format (`license.json`)

```json
{
  "LicenseId": "LIC-XXXX-XXXX-XXXX",
  "ProjectId": "your-project-id",
  "TenantId": "your-tenant-id",
  "AllowedFeatures": [
    "tenancy.strict",
    "auth.rbac_plus",
    "rules.runtime",
    "transport.grpc",
    "transport.message_bus",
    "cache.distributed",
    "audit.trail",
    "runtime.anti_tampering"
  ],
  "NotBefore": "2024-01-01T00:00:00Z",
  "ExpiresAt": "2025-01-01T00:00:00Z",
  "Signature": "base64-encoded-signature"
}
```

For Enterprise tier, use `"AllowedFeatures": ["*"]` to enable all features.

#### Configuration Options Reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `Mode` | `Offline`/`Online` | `Offline` | License validation mode |
| `LicenseFilePath` | string | null | Path to license.json file |
| `PublicKeyPath` | string | null | Path to public key for signature verification |
| `EnableChain` | bool | `false` | Enable action audit trail |
| `ChainStorage` | `None`/`File` | `None` | Where to store audit logs |
| `FailMode` | `Soft`/`Hard` | `Soft` | `Soft`: log only, `Hard`: throw exception |
| `EnforceOnDatabase` | bool | `false` | Check license on DB operations |
| `EnforceOnMiddleware` | bool | `false` | Check license on HTTP requests |
| `EnableAntiTampering` | bool | `false` | Enable runtime integrity checks |
| `AntiTamperingCheckIntervalSeconds` | int | `30` | Interval between anti-tampering runtime checks per tenant partition |
| `EnableHardwareBreakpointDetection` | bool | `false` | Enable Windows hardware breakpoint checks on compatible runtimes |
| `Online.Endpoint` | string | null | License server URL |
| `Online.TimeoutSeconds` | int | 10 | Server request timeout |
| `Online.RefreshMinutes` | int | 1440 | License refresh interval |

#### Obtaining a License

Visit [https://muonroi.com/pricing](https://muonroi.com/pricing) for license options.

#### Enterprise Control Plane MVP (E1)

For enterprise operations, use the E1 control-plane API with branded `M*` developer entrypoints:

```csharp
using Muonroi.BuildingBlock.Shared.ControlPlane;

var signer = MRsaControlPlaneSigner.FromPrivateKeyFile("licenses/control-plane-private.pem", "cp-key-2026");
builder.Services.AddMEnterpriseControlPlane("licenses/control-plane-registry.json", signer);

var app = builder.Build();
app.MapMEnterpriseControlPlaneEndpoints();
```

Key lifecycle APIs:

- `MIssueLicenseRequest` -> issue signed license payload.
- `MRevokeLicenseRequest` -> revoke managed license.
- `MAssignTenantsRequest` -> tenant assignment.
- `MCreatePolicyDraftRequest` -> `MApprovePolicyBundleRequest` -> `MActivatePolicyBundleRequest`.
- `MRollbackPolicyBundleRequest` -> rollback active policy to an earlier version.

Detailed guide: [Enterprise Control Plane MVP](/docs/guides/enterprise/control-plane-mvp)

#### Enterprise Secure-By-Default Profile (E2)

E2 adds deterministic Enterprise Production defaults:

- Valid signed policy required (`fail-closed`).
- Runtime fail-closed matrix by capability area.
- Hardened remote trust path for server validation:
  - trusted license host enforcement,
  - certificate pinning requirements,
  - signed server response requirements.

Guide: [Enterprise Secure Profile E2](/docs/guides/enterprise/enterprise-secure-profile-e2)

#### Enterprise Centralized Authorization (E3)

E3 adds optional centralized authorization with branded `M*` entrypoints and local fallback safety:

- `MPolicyDecisionConfigs` controls provider (`Opa` / `OpenFga`), endpoint, timeout, failure mode.
- `IMPolicyDecisionService` + `MPolicyDecisionService` evaluate remote policy decisions.
- `PermissionFilter<TPermission>` and `AuthorizePermissionFilter<TDbContext>` now support:
  - authoritative PDP allow/deny,
  - local RBAC fallback when PDP is unavailable (configurable fail mode),
  - structured decision logging with tenant + correlation context.

Example config:

```json
{
  "MPolicyDecision": {
    "Enabled": true,
    "Provider": "Opa",
    "Endpoint": "http://localhost:8181",
    "DecisionPath": "/v1/data/authz/allow",
    "TimeoutSeconds": 5,
    "FailureMode": "FallbackToLocal",
    "EnableDecisionLogging": true,
    "DefaultHeaders": {
      "X-Policy-Api-Key": "replace-me"
    }
  }
}
```

Guide: [Enterprise Centralized Authorization E3](/docs/guides/enterprise/enterprise-centralized-authorization-e3)

#### Enterprise Compliance and Evidence (E4)

E4 adds compliance-grade evidence tooling with branded `M*` entrypoints:

- `IMComplianceExportService` + `MComplianceExportService`:
  incremental immutable NDJSON export with hash-chain continuity.
- `IMComplianceEvidencePackService` + `MComplianceEvidencePackService`:
  on-demand evidence pack generation with summary, verification, and signature.
- `MComplianceEndpointExtensions.MapMComplianceEndpoints(...)`:
  enterprise compliance endpoints for export/verify/generate/prune operations.

Example config:

```json
{
  "LicenseConfigs": {
    "Compliance": {
      "Enabled": true,
      "ExportRootPath": "logs/compliance",
      "ExportFileName": "compliance-export.ndjson",
      "CheckpointFileName": "compliance-export.checkpoint.json",
      "EvidencePackFolderName": "evidence-packs",
      "EnableBackgroundExport": true,
      "ExportIntervalMinutes": 15,
      "EnableAutoPruneEvidencePacks": true,
      "EvidencePackRetentionDays": 365
    }
  }
}
```

Map endpoints:

```csharp
using Muonroi.BuildingBlock.Shared.Compliance;

app.MapMComplianceEndpoints();
```

Guide: [Enterprise Compliance and Evidence E4](/docs/guides/enterprise/enterprise-compliance-e4)

#### Enterprise Operations Package (E5)

E5 standardizes enterprise operations with upgrade-safety + SLO guardrails:

- `IMUpgradeCompatibilityService` + `MUpgradeCompatibilityService`:
  compatibility evaluation for package/version/license/policy/config transitions.
- `IMEnterpriseSloPresetService` + `MEnterpriseSloPresetService`:
  built-in SLO presets (`balanced`, `strict`, `regulated`) for runtime paths.
- `MEnterpriseOperationsEndpointExtensions.MapMEnterpriseOperationsEndpoints(...)`:
  API entrypoints for compatibility checks and preset retrieval.
- CI scripts:
  - `pwsh ./scripts/check-enterprise-upgrade-compat.ps1`
  - `pwsh ./scripts/check-enterprise-slo-gates.ps1`

Map endpoints:

```csharp
using Muonroi.BuildingBlock.Shared.Operations;

app.MapMEnterpriseOperationsEndpoints();
```

Preset files:

- `deploy/enterprise/slo-presets/balanced.json`
- `deploy/enterprise/slo-presets/strict.json`
- `deploy/enterprise/slo-presets/regulated.json`

Guide: [Enterprise Operations Package E5](/docs/guides/enterprise/enterprise-operations-e5)

### Message Bus (Kafka/RabbitMQ)
Configure your message broker via `MessageBusConfigs`. The helper in `External/Messaging` uses MassTransit to select the broker. Register consumers and sagas easily:
```csharp
// In Program.cs
services.AddMessageBus(configuration, Assembly.GetExecutingAssembly(), cfg => { 
    /* Optional Saga/Consumer configuration */ 
});
```
Use `PublishWithAuthContext` on `IPublishEndpoint` to automatically include authentication headers when publishing messages.

Sample advanced config:

```json
{
  "MessageBusConfigs": {
    "BusType": "RabbitMq",
    "Runtime": {
      "RetryCount": 3,
      "RetryIntervalMs": 500,
      "PrefetchCount": 32,
      "ConcurrentMessageLimit": 16,
      "EnableInMemoryOutbox": true,
      "EndpointPrefix": "svc-a"
    },
    "RabbitMq": {
      "Host": "localhost",
      "VirtualHost": "/",
      "Username": "guest",
      "Password": "guest",
      "Port": 5672,
      "UseSsl": false,
      "PublisherConfirmation": true
    },
    "Kafka": {
      "Host": "localhost:9092",
      "Topic": "events",
      "GroupId": "consumer-group",
      "ClientId": "muonroi-messagebus"
    }
  }
}
```

Runtime behavior:
* License guard for `message-bus` is always enforced at publish/send/consume runtime pipeline.
* OpenTelemetry spans/metrics are emitted for publish/send/consume (`Muonroi.BuildingBlock.MessageBus`).
* Tenant context from message headers is isolated per message and always reset after processing.
* Contract governance gate:
  `bash ./scripts/check-messagebus-contracts.sh`
* Optional SLO gate script for KPI checks:
  `pwsh ./scripts/check-messagebus-slo.ps1 -CurrentMetricsPath current.json -BaselineMetricsPath baseline.json`

### Audit Trail (Chain Logging)
Enable chain logging through `LicenseConfigs` for paid tiers:

```json
{
  "LicenseConfigs": {
    "EnableChain": true,
    "ChainStorage": "File",
    "ChainFilePath": "logs/license-chain.log"
  }
}
```

Runtime behavior:
* License guard for `audit-trail` is enforced when `EnableChain` is enabled.
* Chain signatures are isolated per tenant partition to avoid cross-tenant contamination.
* OpenTelemetry spans/metrics are emitted for record/store/submit operations (`Muonroi.BuildingBlock.AuditTrail`).
* Contract governance gate:
  `bash ./scripts/check-audittrail-contracts.sh`
* Optional SLO gate script for KPI checks:
  `pwsh ./scripts/check-audittrail-slo.ps1 -CurrentMetricsPath current.json -BaselineMetricsPath baseline.json`

### Anti-Tampering Protection
Enable anti-tampering checks through `LicenseConfigs`:

```json
{
  "LicenseConfigs": {
    "EnableAntiTampering": true,
    "AntiTamperingCheckIntervalSeconds": 30,
    "FailMode": "Hard"
  }
}
```

Runtime behavior:
* License guard for `anti-tampering` is enforced whenever anti-tampering is enabled.
* Runtime anti-tampering checks are partitioned by tenant to prevent cross-tenant state bleed.
* OpenTelemetry spans/metrics are emitted for startup/runtime checks (`Muonroi.BuildingBlock.AntiTampering`).
* Contract governance gate:
  `bash ./scripts/check-antitamper-contracts.sh`
* Optional SLO gate script for KPI checks:
  `pwsh ./scripts/check-antitamper-slo.ps1 -CurrentMetricsPath current.json -BaselineMetricsPath baseline.json`

### Background Job Configuration
Configure background jobs using the `BackgroundJobConfigs` section. Choose `Hangfire` or `Quartz` and specify a connection string for job storage.

```csharp
// Example for Hangfire with SQL Server
services.AddHangfire(x => x.UseSqlServerStorage(configuration["BackgroundJobConfigs:ConnectionString"]));
app.UseHangfireDashboard();
BackgroundJob.Enqueue(() => Console.WriteLine("Hello from Hangfire"));
```

### Kubernetes Integration
Specify deployment details for `k8s` or `k3s` clusters under `KubernetesConfigs`, including the cluster type and API endpoint.

## Documentation
This project uses [DocFX](https://dotnet.github.io/docfx/) to generate documentation.
*   To build the documentation, run: `docfx build`
*   To preview the documentation locally, run: `docfx serve _site`

For more details, see the guides in the `docs` directory:
*   [Permission System Guide](/docs/guides/identity-access/permission-guide)
*   [Permission Tree Guide](/docs/guides/identity-access/permission-tree-guide)
*   [Rule Engine Guide](/docs/guides/rule-engine/rule-engine-guide)
*   [Rule Rollout Guide](/docs/guides/rule-engine/rule-rollout-guide)
*   [Rule Governance Guide](/docs/guides/rule-engine/rule-governance-guide)
*   [Data Layer Guide](/docs/guides/integration/data-layer)
*   [Database Structure](/docs/reference/database-structure)
*   [Gateway Configuration](/docs/guides/integration/gateway-guide)
*   [Multi-Tenant Guide](/docs/guides/multi-tenancy/multi-tenant-guide)
*   [Cache Guide](/docs/guides/integration/cache-guide)
*   [Token Guide](/docs/guides/identity-access/token-guide)
*   [Appsettings Guide](/docs/reference/appsettings-guide)
*   [Background Jobs Guide](/docs/operations/background-jobs-guide)
*   [Quickstart: Multi-Tenant API with JWT & RBAC](/docs/getting-started/quickstart-multi-tenant-api)
*   [CI/CD with Docker and Kubernetes](/docs/operations/ci-cd-docker-k8s)
*   [NRules Integration](/docs/guides/rule-engine/nrules-integration)
*   [ASVS Checklist](../../06-resources/asvs-checklist.md)
*   [License Capability Model](/docs/guides/enterprise/license-capability-model)
*   [Enterprise Control Plane MVP](/docs/guides/enterprise/control-plane-mvp)
*   [Enterprise Secure Profile E2](/docs/guides/enterprise/enterprise-secure-profile-e2)
*   [Enterprise Centralized Authorization E3](/docs/guides/enterprise/enterprise-centralized-authorization-e3)
*   [Enterprise Compliance and Evidence E4](/docs/guides/enterprise/enterprise-compliance-e4)
*   [Enterprise Operations Package E5](/docs/guides/enterprise/enterprise-operations-e5)

## ASVS Pre-Merge Checklist
- [ ] **Security Configuration (V14)** – verify secure configuration and secret management.
- [ ] **Input Validation (V5)** – validate and sanitize all inputs.
- [ ] **Authorization (V4)** – enforce RBAC and deny by default.

For a detailed checklist see [../../06-resources/asvs-checklist.md](../../06-resources/asvs-checklist.md).

## Documentation Index
For a complete list of guides, visit the [Documentation Hub](../../README.md).

*   **Essentials**: [Getting Started](/docs/getting-started/getting-started) | [Appsettings](/docs/reference/appsettings-guide) | [Architecture](/docs/guides/integration/backend-guide)
*   **Security**: [Auth Module](/docs/guides/identity-access/auth-module-guide) | [Permissions](/docs/guides/identity-access/permission-guide) | [Multi-Tenant](/docs/guides/multi-tenancy/multi-tenant-guide)
*   **Features**: [Auto-CRUD](/docs/guides/integration/backend-guide#6-auto-crud-api-zero-code) | [Rule Engine](/docs/guides/rule-engine/rule-engine-guide) | [Rule Engine Guide](/docs/guides/rule-engine/rule-engine-guide) | [Caching](/docs/guides/integration/cache-guide)
*   **Ops**: [Docker & K8s](/docs/operations/ci-cd-docker-k8s) | [Observability](/docs/operations/observability-guide) | [License Capability Model](/docs/guides/enterprise/license-capability-model) | [Enterprise Centralized Authorization E3](/docs/guides/enterprise/enterprise-centralized-authorization-e3) | [Enterprise Compliance and Evidence E4](/docs/guides/enterprise/enterprise-compliance-e4) | [Enterprise Operations Package E5](/docs/guides/enterprise/enterprise-operations-e5) | [Enterprise Upgrade Research](ENTERPRISE-UPGRADE-RESEARCH-PHASE.md)

## Formatting
Run `dotnet format Muonroi.BuildingBlock.sln` to apply the coding style defined in `.editorconfig`.

## Contribution
Please read [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines on how to fork the project,
run tests, and format your code. Feel free to submit pull requests or open issues on GitHub to
contribute or report bugs for this project.

## License
This repository is licensed under the MIT License. See `LICENSE`.

Commercial offerings (Licensed/Enterprise tiers) are service and governance layers on top of the OSS package, described in [COMMERCIAL-EDITIONS.md](COMMERCIAL-EDITIONS.md).

