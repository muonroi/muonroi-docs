# Tier Enforcement

Use startup and runtime guards together.

## Startup guard

```csharp
services.EnsureFeatureOrThrow("rule-engine");
```

## Runtime guard

```csharp
_licenseGuard.EnsureFeature("rule-engine");
_licenseGuard.EnsureValid("rule-engine.execute");
```

## Implementations

- OSS uses `NoopLicenseGuardEnhancer`
- enterprise builds can override with `EnterpriseLicenseGuardEnhancer`
