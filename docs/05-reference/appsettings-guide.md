---
title: appsettings.json Reference Guide
sidebar_label: appsettings Configuration
sidebar_position: 3
---

# appsettings.json Reference Guide

Complete reference for configuring Muonroi applications. Each configuration section maps to a .NET `IOptions<T>` pattern and supports environment variable overrides.

:::tip **Quick Start**
Copy the [Complete Example](#complete-example) below and customize for your environment.
:::

---

## LicenseConfigs

License activation and verification settings for offline and online modes.

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| Mode | string | "Online" | No | `Online` (phone-home to license server) or `Offline` (use stored proof). Requires `Online` section if Online mode. |
| LicenseFilePath | string | "licenses/license.key" | No | Relative or absolute path to license key JSON file. File format: `{ "LicenseKey": "MRR-xxxxx" }` |
| ActivationProofPath | string | "licenses/activation_proof.json" | No | Relative or absolute path to signed activation proof. Created by license server on first activation. |
| FallbackToOnlineActivation | bool | true | No | If Offline mode and proof is missing/expired, attempt fallback to Online activation. Requires internet connectivity. |
| PublicKeyPath | string | — | No | Path to license server's RSA-2048 public key (PEM format). Used to verify activation proof signature. Auto-bundled if not specified. |
| Online:Endpoint | string | — | Yes (if Mode=Online) | License server base URL (e.g., `https://license.truyentm.xyz`). No trailing slash. |
| Online:EnableHeartbeat | bool | true | No | Enable automatic heartbeat verification every `HeartbeatIntervalMinutes`. Prevents long-running apps from skipping nonce rotation. |
| Online:HeartbeatIntervalMinutes | int | 240 | No | Minutes between heartbeat checks (4h default = 6 checks/day). Range: 1–10080 (7 days). |
| Online:RevocationGraceHours | int | 24 | No | Grace period (hours) to retry after heartbeat failure before degrading to Free tier. Handles network outages. |
| Online:TimeoutSeconds | int | 10 | No | HTTP request timeout for activation and heartbeat. Increase if license server is slow. |

**Example:**
```json
"LicenseConfigs": {
  "Mode": "Online",
  "LicenseFilePath": "licenses/license.key",
  "ActivationProofPath": "licenses/activation_proof.json",
  "FallbackToOnlineActivation": true,
  "Online": {
    "Endpoint": "https://license.truyentm.xyz",
    "EnableHeartbeat": true,
    "HeartbeatIntervalMinutes": 240,
    "RevocationGraceHours": 24,
    "TimeoutSeconds": 10
  }
}
```

**See also:** [License Activation Guide](../03-guides/license-governance/license-activation.md)

---

## ControlPlaneAuth

JWT and authorization settings for Control Plane API.

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| DisableAuthorization | bool | true | No | **Development only.** Disables auth checks for easier testing. Must be `false` in production. |
| SigningKey | string | "dev-control-plane-signing-key-change-this" | Yes | HMAC signing key for JWT tokens. Change in production. Min 32 chars. |
| Issuer | string | "muonroi-control-plane" | No | JWT issuer claim. Used for token validation. |
| Audience | string | "muonroi-control-plane-clients" | No | JWT audience claim. Identifies intended API clients. |

**Example:**
```json
"ControlPlaneAuth": {
  "DisableAuthorization": false,
  "SigningKey": "your-super-secret-key-min-32-chars-here!",
  "Issuer": "muonroi-control-plane",
  "Audience": "muonroi-control-plane-clients"
}
```

:::warning **Production Security**
Never commit actual signing keys to version control. Use environment variables (`ControlPlaneAuth__SigningKey`) or Azure Key Vault / AWS Secrets Manager.
:::

---

## RuleControlPlane

Rule management workflow settings (approval, canary, audit).

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| RequireApproval | bool | true | No | Require manual approval before activating new rule versions. Prevents accidental deployments. |
| NotifyOnStateChange | bool | true | No | Send notifications (email/Slack) when rules are created, submitted, approved, or activated. Requires external notifier integration. |
| EnableCanary | bool | true | No | Enable canary deployments (gradual rollout to percentage of tenants). |
| AuditSignerKeyId | string | "ruleset-control-plane" | No | Key ID for audit trail signing. Used to link audit records to signing keys. |
| AuditPrivateKeyPemPath | string | "" | No | Path to RSA private key (PEM) for signing audit trail entries. Empty = disable audit signing. |

**Example:**
```json
"RuleControlPlane": {
  "RequireApproval": true,
  "NotifyOnStateChange": true,
  "EnableCanary": true,
  "AuditSignerKeyId": "ruleset-control-plane",
  "AuditPrivateKeyPemPath": "config/audit-signer.pem"
}
```

**See also:** [Rule Workflow Guide](../03-guides/rule-engine/rule-engine-guide.md)

---

## DecisionTableEngineOptions

Decision table execution engine configuration.

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| PostgresConnectionString | string | — | Conditional | PostgreSQL connection string. Use if backing decision tables with PostgreSQL. |
| SqlServerConnectionString | string | — | Conditional | SQL Server connection string. Use if backing decision tables with SQL Server. |
| Schema | string | "public" | No | Database schema for decision table storage (PostgreSQL) or prefix (SQL Server). |
| AutoMigrateDatabase | bool | true | No | Automatically run pending migrations on startup. Disable in production if you manage migrations separately. |
| DefaultHitPolicy | string | "FIRST" | No | Default hit policy for new decision tables: `FIRST`, `UNIQUE`, `COLLECT`, `PRIORITY`, `RULE_ORDER`. |
| MaxTableSize | int | 10000 | No | Maximum rows per decision table. Enforced at evaluation time. |

**Example:**
```json
"DecisionTableEngineOptions": {
  "PostgresConnectionString": "Server=db.example.com;Database=muonroi_rules;User=muonroi;Password=***",
  "Schema": "public",
  "AutoMigrateDatabase": true,
  "DefaultHitPolicy": "FIRST",
  "MaxTableSize": 10000
}
```

**See also:** [Decision Table Guide](../03-guides/rule-engine/decision-table-guide.md)

---

## TokenConfigs

JWT and token lifetime settings (Access Token / Refresh Token).

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| Issuer | string | — | Yes | Token issuer. Must match `ControlPlaneAuth:Issuer` or client validation fails. |
| Audience | string | — | Yes | Token audience. Clients validate this claim. |
| AccessTokenExpireMinutes | int | 60 | No | Access token lifetime (minutes). Short-lived. Typical: 15–60 min. |
| RefreshTokenExpireDays | int | 7 | No | Refresh token lifetime (days). Long-lived. Used to obtain new access tokens. |
| SecretKey | string | — | Yes | HMAC secret for token signing (same as `ControlPlaneAuth:SigningKey`). |

**Example:**
```json
"TokenConfigs": {
  "Issuer": "muonroi-control-plane",
  "Audience": "muonroi-control-plane-clients",
  "AccessTokenExpireMinutes": 60,
  "RefreshTokenExpireDays": 7,
  "SecretKey": "your-super-secret-key-min-32-chars-here!"
}
```

**See also:** [Authentication Guide](../03-guides/identity-access/auth-module-guide.md)

---

## TenancyConfigs

Multi-tenancy and data isolation configuration.

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| IsolationMode | string | "SharedSchema" | No | Data isolation strategy: `SharedSchema` (EF query filters), `SeparateSchema` (PostgreSQL SearchPath), `SeparateDatabase` (DB per tenant). |
| DefaultTenantId | string | — | No | System tenant ID for background jobs and system operations. If omitted, job execution requires explicit tenant context. |
| EnableQuotaEnforcement | bool | true | No | Enforce per-tenant quotas (max workflows, concurrent rules, requests/day). |
| QuotaCacheExpiryMinutes | int | 5 | No | Cache quota checks for N minutes. Lower = more accurate but higher DB load. |

**Example:**
```json
"TenancyConfigs": {
  "IsolationMode": "SharedSchema",
  "DefaultTenantId": "system",
  "EnableQuotaEnforcement": true,
  "QuotaCacheExpiryMinutes": 5
}
```

**See also:** [Multi-Tenancy Architecture](../02-concepts/architecture-overview.md)

---

## CacheConfigs

In-memory and distributed cache configuration.

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| Provider | string | "InMemory" | No | Cache provider: `InMemory` (single-server), `Redis` (distributed). |
| DefaultTTLSeconds | int | 300 | No | Default cache TTL (seconds) if not explicitly set per entry. Typical: 300–3600. |
| Redis:ConnectionString | string | — | Conditional | Redis connection string (e.g., `localhost:6379`). Required if `Provider=Redis`. |
| Redis:InstanceName | string | "muonroi:" | No | Key prefix for all Redis entries. Allows multiple apps to share Redis instance. |
| MaxMemoryMB | int | 256 | No | **InMemory only.** Maximum memory before eviction. -1 = unlimited. |

**Example:**
```json
"CacheConfigs": {
  "Provider": "Redis",
  "DefaultTTLSeconds": 300,
  "Redis": {
    "ConnectionString": "localhost:6379,ssl=false",
    "InstanceName": "muonroi:"
  }
}
```

**See also:** [Caching Guide](../03-guides/integration/cache-guide.md)

---

## MessagingConfigs

Message bus and event publishing configuration.

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| Provider | string | "InMemory" | No | Message bus provider: `InMemory`, `RabbitMQ`, `AzureServiceBus`, `EventBridge`. |
| ConnectionString | string | — | Conditional | Connection string for external bus. Required if `Provider` is not InMemory. |
| Topics:RuleSetChanged | string | "ruleset-changes" | No | Topic/queue name for rule set change events. |
| Topics:AuditLog | string | "audit-logs" | No | Topic/queue name for audit trail events. |
| PublisherBatchSize | int | 100 | No | Batch events before publishing. Higher = better throughput, higher latency. |

**Example:**
```json
"MessagingConfigs": {
  "Provider": "RabbitMQ",
  "ConnectionString": "amqp://guest:guest@localhost:5672/",
  "Topics": {
    "RuleSetChanged": "ruleset-changes",
    "AuditLog": "audit-logs"
  },
  "PublisherBatchSize": 100
}
```

**See also:** [Event Messaging Guide](../03-guides/integration/messaging-guide.md)

---

## ObservabilityConfigs

OpenTelemetry tracing and Prometheus metrics configuration.

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| EnableTracing | bool | true | No | Enable distributed tracing via OpenTelemetry. |
| EnableMetrics | bool | true | No | Enable Prometheus metrics export. |
| OtlpEndpoint | string | — | Conditional | OTLP exporter endpoint (e.g., `http://localhost:4317`). Required if `EnableTracing=true` and using external collector. |
| LogLevel | string | "Information" | No | Minimum log level: `Trace`, `Debug`, `Information`, `Warning`, `Error`, `Critical`. |
| SamplingFraction | double | 1.0 | No | Trace sampling ratio (0.0–1.0). 0.1 = 10% of traces. Use in high-volume scenarios. |

**Example:**
```json
"ObservabilityConfigs": {
  "EnableTracing": true,
  "EnableMetrics": true,
  "OtlpEndpoint": "http://localhost:4317",
  "LogLevel": "Information",
  "SamplingFraction": 1.0
}
```

**See also:** [Observability Guide](../04-operations/observability-guide.md)

---

## Connection Strings

Standard database and external service connections.

| Key | Description |
|-----|-------------|
| `RuleControlPlaneDb` | Primary PostgreSQL or SQL Server connection for rule definitions, versions, approvals, and metadata. |
| `Redis` | Redis connection for caching and session state. Format: `host:port[,ssl=true/false]`. |
| `AuditDb` | (Optional) Separate database for immutable audit trail storage. If omitted, uses `RuleControlPlaneDb`. |

**Example:**
```json
"ConnectionStrings": {
  "RuleControlPlaneDb": "Server=localhost;Database=muonroi_rules;User=muonroi;Password=***",
  "Redis": "localhost:6379,ssl=false",
  "AuditDb": "Server=localhost;Database=muonroi_audit;User=muonroi;Password=***"
}
```

---

## Environment Variable Overrides

All configuration keys can be overridden via environment variables using double-underscore (`__`) notation:

| appsettings Key | Environment Variable |
|-----------------|----------------------|
| `LicenseConfigs:Mode` | `LicenseConfigs__Mode` |
| `LicenseConfigs:Online:Endpoint` | `LicenseConfigs__Online__Endpoint` |
| `ControlPlaneAuth:SigningKey` | `ControlPlaneAuth__SigningKey` |
| `CacheConfigs:Redis:ConnectionString` | `CacheConfigs__Redis__ConnectionString` |
| `ConnectionStrings:RuleControlPlaneDb` | `ConnectionStrings__RuleControlPlaneDb` |

**Example (Docker):**
```bash
docker run \
  -e "LicenseConfigs__Mode=Online" \
  -e "LicenseConfigs__Online__Endpoint=https://license.truyentm.xyz" \
  -e "ControlPlaneAuth__SigningKey=your-production-key" \
  -e "CacheConfigs__Redis__ConnectionString=redis:6379" \
  muonroi-app:latest
```

**Example (Linux Bash):**
```bash
export LicenseConfigs__Mode="Online"
export LicenseConfigs__Online__Endpoint="https://license.truyentm.xyz"
export ControlPlaneAuth__SigningKey="your-production-key"
dotnet MyApp.dll
```

---

## Complete Example

Minimal production-ready appsettings.json with all major sections:

```json
{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft": "Warning",
      "Muonroi": "Information"
    }
  },
  "AllowedHosts": "*",
  "ConnectionStrings": {
    "RuleControlPlaneDb": "Server=db.example.com;Database=muonroi_rules;User=muonroi;Password=***;SSL Mode=Require",
    "Redis": "cache.example.com:6379,ssl=true",
    "AuditDb": "Server=db.example.com;Database=muonroi_audit;User=muonroi;Password=***;SSL Mode=Require"
  },
  "LicenseConfigs": {
    "Mode": "Online",
    "LicenseFilePath": "licenses/license.key",
    "ActivationProofPath": "licenses/activation_proof.json",
    "FallbackToOnlineActivation": true,
    "Online": {
      "Endpoint": "https://license.truyentm.xyz",
      "EnableHeartbeat": true,
      "HeartbeatIntervalMinutes": 240,
      "RevocationGraceHours": 24,
      "TimeoutSeconds": 10
    }
  },
  "ControlPlaneAuth": {
    "DisableAuthorization": false,
    "SigningKey": "your-super-secret-key-min-32-chars-here!",
    "Issuer": "muonroi-control-plane",
    "Audience": "muonroi-control-plane-clients"
  },
  "TokenConfigs": {
    "Issuer": "muonroi-control-plane",
    "Audience": "muonroi-control-plane-clients",
    "AccessTokenExpireMinutes": 60,
    "RefreshTokenExpireDays": 7,
    "SecretKey": "your-super-secret-key-min-32-chars-here!"
  },
  "RuleControlPlane": {
    "RequireApproval": true,
    "NotifyOnStateChange": true,
    "EnableCanary": true,
    "AuditSignerKeyId": "ruleset-control-plane",
    "AuditPrivateKeyPemPath": "config/audit-signer.pem"
  },
  "DecisionTableEngineOptions": {
    "PostgresConnectionString": "Server=db.example.com;Database=muonroi_rules;User=muonroi;Password=***;SSL Mode=Require",
    "Schema": "public",
    "AutoMigrateDatabase": true,
    "DefaultHitPolicy": "FIRST",
    "MaxTableSize": 10000
  },
  "TenancyConfigs": {
    "IsolationMode": "SharedSchema",
    "DefaultTenantId": "system",
    "EnableQuotaEnforcement": true,
    "QuotaCacheExpiryMinutes": 5
  },
  "CacheConfigs": {
    "Provider": "Redis",
    "DefaultTTLSeconds": 300,
    "Redis": {
      "ConnectionString": "cache.example.com:6379,ssl=true",
      "InstanceName": "muonroi:"
    }
  },
  "MessagingConfigs": {
    "Provider": "RabbitMQ",
    "ConnectionString": "amqp://guest:guest@rabbitmq.example.com:5672/",
    "Topics": {
      "RuleSetChanged": "ruleset-changes",
      "AuditLog": "audit-logs"
    },
    "PublisherBatchSize": 100
  },
  "ObservabilityConfigs": {
    "EnableTracing": true,
    "EnableMetrics": true,
    "OtlpEndpoint": "http://otel-collector.example.com:4317",
    "LogLevel": "Information",
    "SamplingFraction": 1.0
  }
}
```

---

## Development vs. Production Checklist

| Setting | Development | Production |
|---------|-------------|-----------|
| `LicenseConfigs:Mode` | Offline (local testing) | Online (with heartbeat) |
| `ControlPlaneAuth:DisableAuthorization` | `true` (optional) | `false` (required) |
| `ControlPlaneAuth:SigningKey` | Test value | Unique 32+ char secret from Key Vault |
| `RuleControlPlane:RequireApproval` | `false` (optional) | `true` (required) |
| `CacheConfigs:Provider` | InMemory | Redis |
| `ObservabilityConfigs:SamplingFraction` | 1.0 (all traces) | 0.1–0.5 (reduce noise) |

:::tip **Security Checklist**
- Never commit production secrets to Git. Use environment variables or managed secrets.
- Rotate signing keys every 90 days.
- Use HTTPS for all external endpoints (license server, OTLP, Redis, RabbitMQ).
- Enable `RequireApproval` for all non-development environments.
- Review audit logs monthly.
:::

---

## See Also

- [License Activation Guide](../03-guides/license-governance/license-activation.md) — Step-by-step license setup
- [Authentication Guide](../03-guides/identity-access/auth-module-guide.md) — JWT token generation and validation
- [Multi-Tenancy Architecture](../02-concepts/architecture-overview.md) — Isolation strategies and quota enforcement
- [Caching Guide](../03-guides/integration/cache-guide.md) — In-memory vs. Redis configuration
- [Observability Guide](../04-operations/observability-guide.md) — Tracing and metrics setup
