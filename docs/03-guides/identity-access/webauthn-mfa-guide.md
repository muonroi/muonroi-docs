# WebAuthn MFA Guide

Muonroi contains WebAuthn registration and authentication services built on FIDO2 for passkey and security-key flows.

## Register WebAuthn services

```csharp
services.AddWebAuthn(configuration);
```

The registration binds these settings:

- `WebAuthn:ServerDomain`
- `WebAuthn:ServerName`
- `WebAuthn:Origins`

Example:

```json
{
  "WebAuthn": {
    "ServerDomain": "app.example.com",
    "ServerName": "Muonroi",
    "Origins": ["https://app.example.com"]
  }
}
```

## Service responsibilities

`WebAuthenticateService` supports two primary flows:

- Registration
  - `BeginRegistrationAsync()`
  - `CompleteRegistrationAsync()`
- Authentication
  - `BeginAuthenticationAsync()`
  - `CompleteAuthenticationAsync()`

Challenges are stored in distributed cache with a five-minute TTL, and credentials are persisted in `MWebAuthnCredentials` through `MDbContext`.

## Assurance level behavior

The service returns an `Aal` value:

- `2` for standard verified assertions
- `3` when the credential is syncable or backup-capable

That lets downstream code distinguish stronger phishing-resistant MFA states.

## Operational guidance

- Use distributed cache in production so challenge state survives across nodes.
- Keep allowed origins exact.
- Treat credential registration as a privileged account-management action.
- Log registration and authentication outcomes without logging raw attestation payloads.
