---
title: License Capability Model
sidebar_label: Capability Model
sidebar_position: 1
---

# License Capability Model

Muonroi implements a **three-tier license capability system** that controls runtime feature access. Every application starts in `Free` tier and can be upgraded to `Licensed` or `Enterprise` based on activation.

## Overview

The capability model enforces feature gates at runtime using:
- **LicenseState** — carries tier, validity, and optional activation metadata
- **ILicenseGuard** — provides feature checking and validation APIs
- **Feature strings** — stable identifiers like `"rule-engine"`, `"multi-tenant"`, etc.

The system is designed to be fail-closed: if a feature check fails at startup, registration fails fast rather than silently degrading.

---

## The Three Tiers

### Free Tier

The default tier for all applications. Includes only core database and HTTP operations—no license key required.

**Available features:**
- `db.query` — Database read operations
- `db.save` — Persist changes to database
- `db.add` — Add new records
- `db.update` — Modify existing records
- `db.delete` — Remove records
- `http.request` — Make outbound HTTP calls
- `api.validate` — Basic API validation

**Use case:** Prototype, hobby projects, community development.

### Licensed Tier

Unlocked with a valid license key. Adds developer productivity tooling and control plane integration.

**Includes all Free features, plus:**
- `vsix.publish` — Publish VSIX packages from Visual Studio
- `vsix.watch` — Watch VSIX files for live reload
- `vsix.explorer` — Code explorer in VSIX extension
- `cp.publish` — Publish rules to Control Plane

**Use case:** Teams building production applications with integrated development workflows.

### Enterprise Tier

Unlocked with an Enterprise license. Includes the full feature set with governance, multi-tenancy, and advanced security.

**Includes all Licensed features, plus:**
- `rule-engine` — Execute dynamic business rules at runtime
- `multi-tenant` — Isolate data and configuration per tenant
- `advanced-auth` — Custom authorization policies (OpenFGA, OPA)
- `audit-trail` — Immutable audit log with HMAC chain verification
- `anti-tampering` — Startup code integrity checks and runtime guards
- `grpc` — gRPC service communication
- `message-bus` — Event distribution via message broker
- `distributed-cache` — Shared cache (Redis) across instances
- `connectors` — External system connectors (Stripe, Salesforce, etc.)
- `js-expressions` — JavaScript expression evaluation in rules

**Use case:** Large organizations requiring multi-tenant SaaS platforms, regulatory compliance, and real-time rule execution.

---

## Complete Feature Matrix

| Feature | Free | Licensed | Enterprise |
|---------|------|----------|------------|
| **Database Operations** | | | |
| db.query | ✓ | ✓ | ✓ |
| db.save | ✓ | ✓ | ✓ |
| db.add | ✓ | ✓ | ✓ |
| db.update | ✓ | ✓ | ✓ |
| db.delete | ✓ | ✓ | ✓ |
| **HTTP & API** | | | |
| http.request | ✓ | ✓ | ✓ |
| api.validate | ✓ | ✓ | ✓ |
| **Developer Tools** | | | |
| vsix.publish | | ✓ | ✓ |
| vsix.watch | | ✓ | ✓ |
| vsix.explorer | | ✓ | ✓ |
| cp.publish | | ✓ | ✓ |
| **Business Logic** | | | |
| rule-engine | | | ✓ |
| multi-tenant | | | ✓ |
| advanced-auth | | | ✓ |
| audit-trail | | | ✓ |
| anti-tampering | | | ✓ |
| **Infrastructure** | | | |
| grpc | | | ✓ |
| message-bus | | | ✓ |
| distributed-cache | | | ✓ |
| **Integrations** | | | |
| connectors | | | ✓ |
| js-expressions | | | ✓ |

---

## API Reference

### ILicenseGuard Interface

The main service for runtime feature checking. Inject `ILicenseGuard` into any .NET service.

```csharp
public interface ILicenseGuard
{
    /// Gets the current license state (tier, validity, payload)
    LicenseState Current { get; }

    /// Gets the effective tier: Free, Licensed, or Enterprise
    LicenseTier Tier { get; }

    /// True if running in Free tier
    bool IsFreeMode { get; }

    /// Validates a feature is available. Throws if not allowed.
    void EnsureValid(string actionType, string? actionName = null,
        string? payloadHash = null, string? correlationId = null);

    /// Checks if a feature is available. Returns bool (no throw).
    bool HasFeature(string featureName);

    /// Ensures a feature is licensed. Throws if unavailable.
    void EnsureFeature(string featureName);

    /// Records an action in the HMAC chain (for audit trail).
    void RecordAction(LicenseActionContext context);

    /// Gets the current rolling token for chain verification.
    string GetChainToken();

    /// Decrypts data using license-derived keys.
    string DecryptSecurely(string purpose, string encryptedData,
        Func<string, string, string> decryptor);
}
```

### LicenseState Model

Represents the complete license state at runtime.

```csharp
public sealed class LicenseState
{
    /// License is valid (not expired, not revoked)
    public bool IsValid { get; init; }

    /// License has exceeded its expiry date
    public bool IsExpired { get; init; }

    /// Error message if validation failed
    public string? Error { get; init; }

    /// Parsed license payload (key, tier, features)
    public LicensePayload? Payload { get; init; }

    /// Server-signed activation proof (tier, heartbeat nonce, expiry)
    public ActivationProof? ActivationProof { get; init; }

    /// Effective tier: Free, Licensed, or Enterprise
    public LicenseTier Tier { get; init; }

    /// License key identifier (from activation proof)
    public string? LicenseId { get; init; }

    /// Organization name (from activation proof)
    public string? OrganizationName { get; init; }

    /// Expiry date (from activation proof)
    public DateTimeOffset? ExpiresAt { get; init; }

    /// List of enabled feature strings
    public string[]? Features { get; init; }

    /// Checks if a specific feature is allowed
    public bool HasFeature(string featureName)
        => LicenseCapabilityResolver.HasAccess(this, featureName);

    /// Creates a Free tier license (always valid)
    public static LicenseState CreateFree() { ... }
}
```

---

## Usage Examples

### Check a Feature at Runtime

Use `HasFeature` when you want to gracefully degrade:

```csharp
public class OrderService(ILicenseGuard license)
{
    public void ProcessOrder(Order order)
    {
        if (license.HasFeature("rule-engine"))
        {
            // Apply advanced business rules
            var result = await _ruleEngine.ExecuteAsync(order);
        }
        else
        {
            // Fall back to basic processing
            ApplyBasicValidation(order);
        }
    }
}
```

### Require a Feature

Use `EnsureFeature` when a feature is mandatory:

```csharp
public class AuditService(ILicenseGuard license)
{
    public void LogAction(string action, object data)
    {
        license.EnsureFeature("audit-trail");  // Throws if not Enterprise
        _auditStore.Insert(new AuditEntry { Action = action, Data = data });
    }
}
```

### Check Tier Directly

Access the tier for conditional logic:

```csharp
public class ConfigService(ILicenseGuard license)
{
    public void ConfigureTenancy()
    {
        if (license.Tier == LicenseTier.Enterprise)
        {
            services.AddMultiTenancy();  // Full isolation
        }
        else
        {
            services.AddBasicTenancy();  // Shared resources
        }
    }
}
```

### Startup-Time Fail-Fast

Ensure a feature exists before registration completes:

```csharp
// Program.cs
services.AddLicenseProtection(configuration);
services.AddRuleEngine();  // Requires "rule-engine" feature

// If license doesn't include "rule-engine", throws at startup
services.EnsureFeatureOrThrow("rule-engine");
```

---

## Runtime Enforcement

### Activation Flow

1. **On Startup:**
   - `LicenseActivator` reads license key from file or environment
   - POST `/activate` to License Server with machine fingerprint
   - Receive signed `ActivationProof` containing tier, nonce, heartbeat config
   - Save proof to `licenses/activation_proof.json`

2. **At Runtime:**
   - `EnsureValid` checks: is license expired? Is it revoked?
   - Grace period applies if heartbeat fails (24 hours default)
   - `HasFeature` resolves capability via `LicenseCapabilityResolver`
   - If Enterprise: HMAC chain verification, anti-tampering checks

3. **Grace Period:**
   - If heartbeat cannot reach License Server, degrade to Free tier
   - Give 24 hours for operator to fix connectivity
   - After 24h, license becomes invalid and fails hard

### Feature Resolution Strategy

`HasFeature` uses this logic:

1. If tier is **Enterprise**, all features allowed (payload: `["*"]`)
2. If tier is **Licensed**, check explicit `Features` list in payload
3. If tier is **Free**, only allow features in `FreeTierFeatures.All`
4. Backward compatibility: legacy feature aliases map to modern names

Example:

```csharp
// Free tier — only core database/HTTP
guard.HasFeature("db.query")      // true
guard.HasFeature("rule-engine")   // false

// Licensed tier — depends on payload
guard.HasFeature("cp.publish")    // depends on Features array

// Enterprise tier — everything
guard.HasFeature("anything")      // true
```

---

## Configuration

### appsettings.json

```json
{
  "LicenseConfigs": {
    "Mode": "Online",
    "LicenseFilePath": "licenses/license.key",
    "ActivationProofPath": "licenses/activation_proof.json",
    "FallbackToOnlineActivation": true,
    "EnableChain": true,
    "FailMode": "Hard",
    "Online": {
      "Endpoint": "https://license.truyentm.xyz",
      "EnableHeartbeat": true,
      "HeartbeatIntervalMinutes": 240,
      "RevocationGraceHours": 24,
      "TimeoutSeconds": 10
    }
  }
}
```

### Program.cs Registration

```csharp
services.AddLicenseProtection(configuration);           // Base license checks
services.AddMEnterpriseGovernance(configuration);       // Anti-tamper + HMAC chain
```

---

## Best Practices

### 1. Prefer `HasFeature` Over `Tier` Checks

Good:
```csharp
if (guard.HasFeature("audit-trail")) { ... }
```

Avoid:
```csharp
if (guard.Tier == LicenseTier.Enterprise) { ... }  // Too specific
```

### 2. Fail Fast at Startup

If a feature is mandatory, validate at registration time:
```csharp
services.EnsureFeatureOrThrow("rule-engine");
```

### 3. Graceful Degradation

For optional features, use `HasFeature` to offer fallback behavior:
```csharp
if (license.HasFeature("multi-tenant"))
    await _tenantsService.IsolateAsync();
else
    await _defaultTenantService.PrepareAsync();
```

### 4. Log License Events

On activation or expiry:
```csharp
logger.LogInformation("License activated: {Tier} for {Organization}",
    license.Current.Tier, license.Current.OrganizationName);
```

### 5. Honor the Grace Period

Don't immediately fail on heartbeat timeout. Wait for the full grace period:
```csharp
// Heartbeat fails
// Wait 24h before degrading to Free
// Operator has time to restore connectivity
```

---

## Cross-References

- **[License Activation](license-activation.md)** — How to activate and renew licenses
- **[Tier Enforcement](tier-enforcement.md)** — Runtime validation and grace period handling
- **[License Server API](../api-reference/license-server.md)** — Generate keys, manage revocations
- **[Multi-Tenancy with Enterprise](../../../advanced/multi-tenancy/overview.md)** — Requires Enterprise tier
- **[Rule Engine Setup](../../../advanced/rule-engine/overview.md)** — Requires `rule-engine` feature
