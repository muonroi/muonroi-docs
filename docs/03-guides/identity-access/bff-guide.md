# BFF Guide

Muonroi includes a BFF-oriented authentication helper for SPA applications that should not manage refresh tokens directly in the browser.

## What it does

`AddBffAuthentication()` configures:

- Cookie authentication
- Antiforgery services
- A server-side token store

The implementation uses secure, `HttpOnly`, `SameSite=Strict` cookies so browser JavaScript cannot read the session cookie directly.

```csharp
services.AddBffAuthentication(useRedisTokenStore: true);
```

## Token storage choices

Two server-side token-store implementations are available:

- `InMemoryTokenStore`
- `RedisTokenStore`

Use Redis when:

- You run multiple application nodes.
- You need session continuity across restarts.
- You want refresh-token state outside process memory.

Use the in-memory store only for local development or single-node deployments.

## Security model

The BFF approach keeps refresh tokens on the server and lets the browser communicate through cookies and server-side session handling. That reduces token exposure in SPA runtime code.

The built-in setup applies:

- `HttpOnly` cookies
- `Secure` cookies
- `SameSite=Strict`
- Antiforgery support

## Operational guidance

- Use HTTPS only.
- Prefer Redis-backed token storage in production.
- Align cookie lifetime with your backend session and refresh-token policy.
- Keep CSRF protection enabled for state-changing routes.
