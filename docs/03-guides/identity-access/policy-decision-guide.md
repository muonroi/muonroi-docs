# Policy Decision Guide

Muonroi supports centralized policy decisions through `IMPolicyDecisionService`. The current implementation can call either OPA or OpenFGA-style decision endpoints.

## Register the service

```csharp
services.AddMPolicyDecision(configuration);
```

The service binds `MPolicyDecision` settings and registers an HTTP client named `MuonroiPolicyDecision`.

Example configuration:

```json
{
  "MPolicyDecision": {
    "Enabled": true,
    "Provider": "Opa",
    "Endpoint": "https://pdp.example.com",
    "DecisionPath": "/v1/data/authz/allow",
    "TimeoutSeconds": 5,
    "FailureMode": "FallbackToLocal",
    "EnableDecisionLogging": true,
    "DefaultHeaders": {
      "x-api-key": "replace-me"
    }
  }
}
```

## Providers

Supported providers:

- `Opa`
- `OpenFga`

If `DecisionPath` is omitted, the service uses provider defaults:

- OPA: `/v1/data/authz/allow`
- OpenFGA-style: `/check`

Both requests currently send `{ input: ... }` payloads and parse either a direct boolean result or an object containing `allow`.

## Failure modes

Two failure strategies are available:

- `FallbackToLocal`
- `Deny`

`FallbackToLocal` keeps local RBAC as the safety net if the PDP is unavailable or returns an unsupported response. `Deny` makes the remote PDP authoritative even during failures.

## Where it is used

Permission filters in the ASP.NET layer can resolve `IMPolicyDecisionService` and perform a centralized authorization check before completing the request.

This means the effective flow can be:

1. Local auth establishes the caller identity.
2. Permission filter builds a `MPolicyDecisionRequest`.
3. Remote PDP returns allow or deny.
4. Runtime either honors the remote decision or falls back locally based on configuration.

## Operational guidance

- Keep request timeouts short.
- Add correlation and tenant context to decision logs.
- Choose `Deny` only when PDP availability is operationally strong.
- Version and test policy bundles independently from app deployments.
