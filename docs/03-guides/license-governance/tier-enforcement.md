---
title: Tier Enforcement
sidebar_label: Tier Enforcement
sidebar_position: 2
---

Licensing in Muonroi is enforced at both startup and runtime using layered guards. This document explains the enforcement pipeline, anti-tamper protection, grace periods, and degradation flows.

---

## Overview

Tier enforcement ensures that only features licensed for your tier are accessible. The system uses two complementary guards:

- **Startup Guard** — Verifies code integrity and detects tampering before business logic runs
- **Runtime Guard** — Enforces feature checks on every action, with fail-closed behavior on license expiry

Enforcement operates in two tiers:
1. **OSS** — `AddLicenseProtection()` with `NoopLicenseGuardEnhancer` (no anti-tamper)
2. **Enterprise** — `AddMEnterpriseGovernance()` with `EnterpriseLicenseGuardEnhancer` (full protection)

---

## Registration & Startup Pipeline

### OSS Registration

For open-source projects, register the base license protection:

```csharp
// Program.cs / Startup.cs
services.AddLicenseProtection(configuration);

// Registers:
// - LicenseStore, LicenseVerifier, LicenseState
// - ILicenseGuard scoped service
// - LicenseRefreshHostedService (if online mode)
// - NoopLicenseGuardEnhancer (no anti-tamper, no HMAC chain)
```

**appsettings.json**:
```json
{
  "LicenseConfigs": {
    "Mode": "Offline",
    "LicenseFilePath": "licenses/license.key",
    "ActivationProofPath": "licenses/activation_proof.json"
  }
}
```

### Enterprise Registration

For enterprise deployments, register full governance with anti-tamper protection:

```csharp
// Program.cs / Startup.cs
services.AddMEnterpriseGovernance(configuration);

// Registers (in addition to AddLicenseProtection):
// 1. CodeIntegrityVerifier — SHA256 assembly hash verification
// 2. AntiTamperDetector — debugger, profiler, breakpoint detection
// 3. EnterpriseLicenseGuardEnhancer — fail-closed + HMAC chain
// 4. LicenseHeartbeatService (if heartbeat enabled)
// 5. ChainSubmissionHostedService (if server validation enabled)
```

**appsettings.json**:
```json
{
  "LicenseConfigs": {
    "Mode": "Online",
    "LicenseFilePath": "licenses/license.key",
    "ActivationProofPath": "licenses/activation_proof.json",
    "FallbackToOnlineActivation": true,
    "EnableAntiTampering": true,
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

---

## Startup Protection Flow

The startup pipeline runs **before any business logic** to verify code integrity and detect tampering:

```
Application Startup
    ↓
LicenseState loaded & verified
    ↓
[Enterprise Mode Only]
    CodeIntegrityVerifier.VerifyIntegrity()
        ↓
        Collect runtime assembly hashes (SHA256)
        Compare against ActivationProof.AllowedAssemblyHashes
        ↓
        ✗ Mismatch → Throw exception (Hard mode) or Log warning (Soft mode)
    ↓
    AntiTamperDetector.DetectTampering()
        ↓
        Check Debugger.IsAttached
        Check native debugger (Windows: IsDebuggerPresent)
        Check environment vars (CORECLR_PROFILER, MicrosoftInstrumentationEngine*)
        Check hardware breakpoints (Windows, if enabled)
        ↓
        ✗ Detected → Log security event + Degrade to Free
    ↓
EnterpriseLicenseGuardEnhancer.OnStartup()
    ↓
✓ Startup succeeds with full license features
```

### Code Integrity Verification

The **CodeIntegrityVerifier** ensures that loaded assemblies match the approved manifest from your license:

```csharp
public class MyStartupClass
{
    private readonly CodeIntegrityVerifier _integrityVerifier;

    // Injected by DI container (enterprise builds only)
    public MyStartupClass(CodeIntegrityVerifier integrityVerifier)
    {
        _integrityVerifier = integrityVerifier;
    }

    // Called from Startup (automatic in AddMEnterpriseGovernance)
    public void VerifyIntegrity(LicenseState state)
    {
        bool isValid = _integrityVerifier.VerifyIntegrity(
            state,
            throwOnFailure: true  // Throw on mismatch (Hard fail mode)
        );

        if (!isValid)
        {
            // Log: assembly mismatch detected
            // Action: block startup or downgrade
        }
    }
}
```

**What gets verified:**
- Assembly name
- Version
- SHA256 hash
- Public key token

**When verification fails:**
- **Hard mode** — Throw exception, block startup
- **Soft mode** — Log warning, continue (reduced security)

### Anti-Tamper Detection

The **AntiTamperDetector** runs at startup and periodically at runtime to detect instrumentation:

```csharp
public sealed class AntiTamperDetector(LicenseConfigs configs)
{
    /// <summary>
    /// Detects debuggers, profilers, hooks, and hardware breakpoints.
    /// Covers 32-bit and 64-bit architectures on Windows and Linux.
    /// </summary>
    public bool DetectTampering()
    {
        // Managed debugger check
        if (Debugger.IsAttached) return true;

        // Native debugger check (Windows only)
        if (IsDebuggerPresent()) return true;

        // Profiler check (all platforms, 32/64-bit)
        // Detects: CORECLR_PROFILER, MicrosoftInstrumentationEngine_*,
        //          COMPlus_*, Datadog, New Relic, etc.
        if (IsProfilerAttached()) return true;

        // Hardware breakpoint check (Windows only, if enabled)
        if (configs.EnableHardwareBreakpointDetection)
        {
            if (CheckHardwareBreakpoints()) return true;
        }

        return false;
    }
}
```

**Detection methods:**
1. **Managed debugger** — `Debugger.IsAttached` check
2. **Native debugger** — Windows: `IsDebuggerPresent()` API
3. **Profiler** — Environment variables: `CORECLR_PROFILER`, `MicrosoftInstrumentationEngine_*`, etc.
4. **Hardware breakpoints** — Windows: `GetThreadContext()` check (when enabled)

**When tampering is detected:**
- Security event logged
- License state downgraded to **Free tier**
- All non-Free features blocked at runtime

---

## Runtime Guard Pattern

At runtime, use the **ILicenseGuard** service to enforce feature access:

```csharp
public class MyService
{
    private readonly ILicenseGuard _guard;

    public MyService(ILicenseGuard guard)
    {
        _guard = guard;
    }

    // Pattern 1: Guard (throws on unauthorized)
    public void ExecuteRule(string ruleId)
    {
        _guard.EnsureValid("rule-engine");  // Throws if not licensed
        // ... execute rule
    }

    // Pattern 2: Check (returns bool)
    public void EnableMultiTenant()
    {
        if (_guard.HasFeature("multi-tenant"))
        {
            // ... enable multi-tenant UI
        }
    }

    // Pattern 3: Tier (branch by tier)
    public void ApplyPolicy()
    {
        switch (_guard.Tier)
        {
            case LicenseTier.Enterprise:
                // Full features: anti-tamper, audit trail, advanced auth
                break;
            case LicenseTier.Licensed:
                // Partial: rule-engine, workflow, db.query
                break;
            case LicenseTier.Free:
                // Basic: http.request, api.validate only
                break;
        }
    }
}
```

### Feature Matrix by Tier

| Feature | Free | Licensed | Enterprise |
|---------|------|----------|------------|
| `db.query` / save / add / update / delete | ✓ | ✓ | ✓ |
| `http.request` | ✓ | ✓ | ✓ |
| `api.validate` | ✓ | ✓ | ✓ |
| `rule-engine` | — | ✓ | ✓ |
| `workflow` | — | ✓ | ✓ |
| `multi-tenant` | — | — | ✓ |
| `advanced-auth` | — | — | ✓ |
| `audit-trail` | — | — | ✓ |
| `anti-tampering` | — | — | ✓ |
| `grpc` / `message-bus` / `distributed-cache` | — | — | ✓ |

---

## Grace Period & Heartbeat

The **LicenseHeartbeatService** periodically validates your license with the license server. If heartbeat fails, a grace period activates:

```
Enterprise License Active
    ↓
Heartbeat sends → License Server
    ↓
    ✗ Network error / Server offline / License revoked
    ↓
Grace Period Starts (24 hours by default)
    ├─ Full functionality maintained
    ├─ Every heartbeat failure extends grace
    └─ Warnings logged
    ↓
Grace Period Expires
    ↓
Tier downgraded to Free
    └─ Enterprise features blocked
    └─ Recurring heartbeat attempts continue
```

### Heartbeat Configuration

```json
{
  "LicenseConfigs": {
    "Online": {
      "EnableHeartbeat": true,
      "HeartbeatIntervalMinutes": 240,        // Every 4 hours
      "RevocationGraceHours": 24               // 24-hour grace period
    }
  }
}
```

### Grace Period Behavior

- **During grace**: Full functionality, no restrictions
- **After grace**: Automatically degrade to Free tier
- **On license expiry**: Immediate degrade to Free (no grace period)
- **Nonce rotation**: Each heartbeat receives a new nonce from the server

### What Triggers Grace Period?

1. Heartbeat network failure (timeout, connection refused)
2. License server HTTP error
3. Invalid response format
4. License payload validation failure

**What does NOT trigger grace period:**
- Successful heartbeat (extends license freshness)
- Offline mode (no heartbeat service runs)
- Free tier (no heartbeat needed)

---

## Degradation Flow

License tiers degrade in one direction only:

```
Enterprise ──(heartbeat fail + grace expire)──→ Free
   ↓
Licensed ──(heartbeat fail + grace expire)──→ Free
   ↓
Free (always works, no license needed)
```

### Trigger Conditions

| Condition | Result |
|-----------|--------|
| License not found | Free tier |
| License expired | Free tier |
| Activation proof invalid | Free tier |
| Heartbeat failed + grace expired | Free tier |
| Tampering detected | Free tier |
| Assembly hash mismatch | Free tier (soft mode) or blocked startup (hard mode) |
| Debugger attached | Free tier |
| Profiler attached | Free tier |

### Prevented Reverse Upgrade

Once degraded to Free, the tier does **not** automatically upgrade back. You must:
1. Resolve the underlying issue (fix tampering, restore license, restart heartbeat)
2. **Restart the application**

This ensures that compromised or expired licenses cannot silently re-enable enterprise features mid-session.

---

## HMAC Chain Verification

Enterprise deployments use an HMAC chain to prevent license tampering. The chain is verified on each heartbeat:

**Chain key derivation:**
```
key = SHA256(licenseSignature + projectSeed + salt + serverNonce)
```

**Chain data format:**
```
{previous_hash}|{sequence}|{tenantId}|{action}|{hash}|{timestamp}
```

**Verification flow:**
```
Heartbeat Request
    ↓
Include HMAC chain from last heartbeat
    ↓
License Server verifies chain:
    Recompute key = SHA256(signature + seed + salt + nonce)
    Hash current data
    Compare against last hash in chain
    ↓
    ✗ Mismatch → License revoked, error response
    ✓ Match → Return new nonce, extend license
```

**If chain is tampered:**
- Server rejects the heartbeat
- License revocation recorded
- Grace period still applies (24h)
- After grace: Downgrade to Free

---

## Implementation Checklist

### For OSS Projects

- [ ] Call `services.AddLicenseProtection(configuration)` in Startup
- [ ] Provide `LicenseConfigs` section in appsettings.json
- [ ] Place license key in `licenses/license.key`
- [ ] Inject `ILicenseGuard` in services that call OSS features
- [ ] Use `.HasFeature()` or `.EnsureValid()` guards

### For Enterprise Deployments

- [ ] Call `services.AddMEnterpriseGovernance(configuration)` in Startup
- [ ] Enable anti-tampering: `"EnableAntiTampering": true`
- [ ] Enable heartbeat: `"EnableHeartbeat": true`
- [ ] Set grace period: `"RevocationGraceHours": 24`
- [ ] Set heartbeat interval: `"HeartbeatIntervalMinutes": 240` (4h)
- [ ] Configure fail mode: `"FailMode": "Hard"` (recommended) or `"Soft"`
- [ ] Provide assemblies approved list in license activation
- [ ] Monitor logs for anti-tamper events: `[License]` and `[AntiTamper]` prefixes

---

## Monitoring & Logging

All enforcement events are logged with prefixes:

| Prefix | Meaning | Level |
|--------|---------|-------|
| `[License]` | License state transitions | Info/Warn/Error |
| `[AntiTamper]` | Tampering detected | Warn/Error |
| `[Policy]` | Policy enforcement | Info/Warn/Error |
| `[Integrity]` | Assembly hash verification | Info/Warn/Error |

**Example log events:**
```
[License] Heartbeat failed. Grace period active until 2026-03-21 10:30:00Z
[AntiTamper] Debugger detected. Downgrading to Free tier.
[Integrity] Assembly Muonroi.RuleEngine.dll hash mismatch. Expected: abc123... Got: def456...
[Policy] API rate limit exceeded for tenant tenant-xyz.
```

---

## Cross-References

- **License Activation** — See [License Activation](./license-activation.md) for setup steps
- **License Capability Model** — See [License Capability Model](./license-capability-model.md) for feature definitions
- **Multi-Tenant Quotas** — See [Multi-Tenancy Guide](../multi-tenancy.md) for quota enforcement
- **Auth Rules** — See [Authorization](../authorization.md) for policy-driven access control

---

## Troubleshooting

### License not being picked up

- Verify path: `licenses/license.key` exists
- Check file format: Valid JSON with `LicenseKey` field
- Verify env var: `MUONROI_LICENSE_KEY=MRR-xxxxx` if using env var
- Check config binding: `appsettings.json` has `LicenseConfigs` section

### Anti-tamper blocking startup

- Detach debugger (Visual Studio, VS Code)
- Check for profilers: Disable Application Insights, Datadog, New Relic profilers
- Verify hardware breakpoints are disabled in debugger settings
- Check logs for `[AntiTamper]` events

### Heartbeat failing

- Verify endpoint: `LicenseConfigs.Online.Endpoint` is reachable
- Check network: Firewall, proxy, VPN blocking `license.truyentm.xyz`
- Verify license key: Not revoked or expired
- Increase timeout: `LicenseConfigs.Online.TimeoutSeconds`
- Check grace period: Grace period still active? Check logs for timestamp

### Features still blocked after grace period

- **Restart the application** — Grace period expires but tier doesn't auto-upgrade mid-session
- Fix underlying issue: Restore heartbeat, activate new license, etc.
- Then restart

---

## API Reference

### ILicenseGuard Interface

```csharp
public interface ILicenseGuard
{
    /// <summary>Throws if feature not available in current tier.</summary>
    void EnsureValid(string actionType);

    /// <summary>Returns true if feature is available.</summary>
    bool HasFeature(string actionType);

    /// <summary>Current license tier.</summary>
    LicenseTier Tier { get; }

    /// <summary>License payload (license ID, expiry, etc).</summary>
    LicensePayload? Payload { get; }
}

public enum LicenseTier
{
    Free,       // Default, no license needed
    Licensed,   // Standard features
    Enterprise  // All features
}
```

### EnterpriseLicenseGuardEnhancer Lifecycle

```csharp
public interface ILicenseGuardEnhancer
{
    /// <summary>Called once at application startup.</summary>
    void OnStartup(LicenseConfigs configs, LicenseState state);

    /// <summary>Called before each feature access.</summary>
    void OnEnsureValid(string actionType, LicenseState state);

    /// <summary>Called after action logging.</summary>
    void OnRecordAction(LicenseActionContext context, LicenseState state);
}
```
