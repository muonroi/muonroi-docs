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
Bound from the `LicenseConfigs` section to `Muonroi.Governance.Abstractions.License.LicenseConfigs`.

### Core / activation

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| Mode | enum | `Offline` | No | `Offline` (verify a license file locally) or `Online` (phone-home to the license server). **Default is `Offline`.** An invalid string (e.g. `"office"`) fails enum binding at startup. |
| LicenseFilePath | string | — | No | Relative (to content root) or absolute path to the license file. **Offline:** must be a signed payload JSON (`{ "LicenseId": ..., "Signature": ... }`); a raw-key file `{ "LicenseKey": "MRR-..." }` is ignored by `LicenseStore.Load()`. **Online:** the raw-key file is used to activate against the server. |
| PublicKeyPath | string | — | No | Path to the license server's RSA public key (PEM). **Required for non-free licenses** — signature verification is mandatory and cannot be bypassed via config. Get it from `GET {Endpoint}/api/v1/signing-key/public`. |
| ActivationProofPath | string | `licenses/activation_proof.json` | No | Path to the signed activation proof. Created on first online activation; lets production verify offline without internet. |
| ActivationJwtPath | string | `licenses/activation_jwt.txt` | No | Path to the activation JWT for frontend verification (`MLicenseVerifier`). Created during online activation when the server returns a JWT. |
| FallbackToOnlineActivation | bool | `true` | No | In Offline mode, if the proof is missing/expired, attempt online activation. Requires connectivity. Set `false` in production to require pre-activation. |
| ProjectSeed | string | — | No | Per-project seed for the runtime fingerprint (stored obfuscated in memory). Used only when fingerprint/hardware binding applies; a license with `Fingerprint`/`HardwareId` = null is not bound, so changing this does not invalidate it. |
| FingerprintSalt | string | — | No | Salt mixed into the runtime fingerprint. Same binding caveat as `ProjectSeed`. |

> **One license, multiple projects?** Yes — verification does **not** compare the payload `ProjectId`/`TenantId` against the consuming app; those fields are only part of the signed canonical data (`LicenseVerifier.VerifySignature`). A license file with null `Fingerprint`/`HardwareId` validates in any project on any machine. `ProjectId` is metadata/audit only. Prefer a dedicated key per project so revocation, expiry, and `MaxActivations` are tracked independently.

### Enforcement / failure handling

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| FailMode | enum | `Soft` | No | `Soft` = log and degrade (no throw); `Hard` = throw `MInternalException` (`[SEC_ERR_01]`) on validation/chain failure. Use `Hard` in production with a valid license. |
| EnforceOnDatabase | bool | `false` | No | Enforce license checks on database operations. |
| EnforceOnMiddleware | bool | `false` | No | Enforce license checks on the HTTP middleware pipeline. |
| EnforcementMode | enum? | `null` | No | Force `Free`/`Development`/`Production` enforcement. If null, derived from tier + `ASPNETCORE_ENVIRONMENT`. |
| SkipSignatureVerification | bool | `false` | No | **Dev/test only.** Ignored for non-free licenses (signature is always mandatory). Never set in production. |
| SkipAssemblyWhitelist | bool | `false` | No | **Dev/test only.** Skip assembly whitelist verification during activation. |
| RequireSignedPolicy | bool | `false` | No | Require a valid signed policy file (`PolicyFilePath`) for the app to run. Recommended for enterprise. |
| PolicyFilePath | string | — | No | Path to the signed policy file (e.g. `licenses/policy.json`). |
| TrustedPublicKeyTokens | string[] | — | No | Hex-encoded public key tokens of assemblies trusted to call sensitive operations. |

### Anti-tampering (Licensed/Enterprise, production)

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| EnableAntiTampering | bool | `false` | No | Enable runtime anti-tampering protection. |
| AntiTamperingCheckIntervalSeconds | int | `30` | No | Min seconds between anti-tampering checks per tenant partition. `0` = check every guarded call. |
| EnableHardwareBreakpointDetection | bool | `false` | No | Detect hardware breakpoints on compatible runtimes. |
| EnableTpmAnchoring | bool | `false` | No | Anchor the license to the machine via Windows DPAPI/TPM, making the file non-transferable. |

### Action chain / audit trail

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| EnableChain | bool | `false` | No | Enable action-chain tracking (audit trail). Enable only for Licensed/Enterprise. |
| ChainStorage | enum | `None` | No | `None` / `File` (other backends per `LicenseChainStorage`). |
| ChainFilePath | string | — | No | Path to the chain log file when `ChainStorage = File` (e.g. `logs/license-chain.log`). |
| EnableServerValidation | bool | `false` | No | Submit action chains to the license server for remote audit. |
| ChainSubmissionIntervalMinutes | int | `60` | No | How often to submit chains to the server. |
| ChainSubmissionBatchSize | int | `100` | No | Max chain entries per submission batch. |

### Online (used only when `Mode = "Online"`)

| Key | Type | Default | Required | Description |
|-----|------|---------|----------|-------------|
| Online:Endpoint | string | — | Yes (if Mode=Online) | License server base URL (e.g. `https://license.muonroi.com`). No trailing slash. Host must be in `Enterprise.TrustedLicenseServerHosts` for Enterprise+Production. |
| Online:ChainSubmissionEndpoint | string | `/api/v1/chain/submit` | No | Relative path for submitting action chains. |
| Online:TimeoutSeconds | int | `10` | No | HTTP timeout for activation/heartbeat/refresh. |
| Online:RefreshMinutes | int | `1440` | No | Interval for the background refresh hosted service (disabled entirely in Offline mode). |
| Online:EnableHeartbeat | bool | `false` | No | Enable periodic heartbeat verification (nonce rotation). |
| Online:HeartbeatIntervalMinutes | int | `240` | No | Minutes between heartbeat checks. |
| Online:RevocationGraceHours | int | `24` | No | Grace period after heartbeat failure before degrading to Free. Handles outages. |
| Online:EnableCertificatePinning | bool | `true` | No | Pin the server certificate to block MITM/fake servers. |
| Online:ExpectedCertificateThumbprint | string | — | Yes (if pinning) | SHA-256 thumbprint of the expected server certificate. |
| Online:TrustedCertificateThumbprints | string[] | — | No | Additional trusted thumbprints for certificate rotation. |

### Enterprise security profile (`LicenseConfigs:Enterprise`)

Secure-by-default for Enterprise + Production. Key knobs: `EnableSecureDefaults` (`true`), `AllowPolicyBypassInProduction` (`false`), `AllowEndpointTrustBypassInProduction` (`false`), `RequireCertificatePinningInProduction` (`true`), `RequireTrustedEndpointInProduction` (`true`), `RequireServerResponseSignatureInProduction` (`true`), and `TrustedLicenseServerHosts` (default: `license.muonroi.com`, `license-backup.muonroi.com`, `license.muonroi.net`, `license-api.muonroi.com`).

> Because `RequireTrustedEndpointInProduction` defaults to `true`, an `Online:Endpoint` whose host is not in `TrustedLicenseServerHosts` is rejected in Enterprise+Production. Use `license.muonroi.com` (already trusted) or add your host to the list.

**Compliance** (`LicenseConfigs:Compliance`) controls evidence-pack export — `Enabled` (`false`), `ExportRootPath`, `ExportIntervalMinutes` (`15`), `EnableBackgroundExport` (`false`), `EvidencePackRetentionDays` (`365`), etc.

**Example — Offline (Enterprise, full feature):**
```json
"LicenseConfigs": {
  "Mode": "Offline",
  "ProjectSeed": "your-project-seed-min-16-chars",
  "LicenseFilePath": "licenses/license.json",
  "PublicKeyPath": "licenses/public.pem",
  "FingerprintSalt": "your-project-salt",
  "EnableChain": true,
  "ChainStorage": "File",
  "ChainFilePath": "logs/license-chain.log",
  "FailMode": "Soft",
  "EnforceOnDatabase": false,
  "EnforceOnMiddleware": false,
  "Online": {
    "Endpoint": "https://license.muonroi.com",
    "ChainSubmissionEndpoint": "/api/v1/chain/submit",
    "TimeoutSeconds": 10,
    "RefreshMinutes": 60
  }
}
```

**Example — Online (with heartbeat + pinning):**
```json
"LicenseConfigs": {
  "Mode": "Online",
  "LicenseFilePath": "licenses/license.key",
  "PublicKeyPath": "licenses/public.pem",
  "FailMode": "Hard",
  "Online": {
    "Endpoint": "https://license.muonroi.com",
    "EnableHeartbeat": true,
    "HeartbeatIntervalMinutes": 240,
    "RevocationGraceHours": 24,
    "TimeoutSeconds": 10,
    "EnableCertificatePinning": true,
    "ExpectedCertificateThumbprint": "A1:B2:C3:..."
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
