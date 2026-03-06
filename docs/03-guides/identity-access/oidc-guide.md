# OIDC Guide

Muonroi includes helpers for external OpenID Connect login and a minimal PKCE client for authorization-code flows.

## Server-side OIDC login

Use `AddOidcLogin()` to register cookie auth plus an OpenID Connect challenge handler.

```csharp
services.AddOidcLogin(configuration);
```

The helper binds `OidcConfig` and configures:

- `Authority`
- `ClientId`
- `ClientSecret`
- `CallbackPath`
- `Scopes`
- Authorization Code flow with `response_type=code`

Example configuration:

```json
{
  "OidcConfig": {
    "Authority": "https://identity.example.com",
    "ClientId": "muonroi-app",
    "ClientSecret": "secret",
    "CallbackPath": "/signin-oidc",
    "Scopes": ["openid", "profile", "email"]
  }
}
```

## PKCE client

`Muonroi.Auth.Oidc.PkceClient` provides a minimal Authorization Code plus PKCE implementation for SPA or native-style flows.

It can:

- Create an authorization URL
- Generate code verifier and challenge values
- Redeem an authorization code
- Refresh tokens

Use it when you need a lightweight PKCE helper without bringing in a larger client stack.

## When to use which path

Use `AddOidcLogin()` when:

- The server handles login challenges directly.
- You want cookie-based sign-in after the external identity flow.

Use `PkceClient` when:

- The client application owns the redirect flow.
- You need a minimal PKCE exchange helper.

## Validation checklist

- Match `RedirectUri` exactly.
- Restrict scopes to what the application needs.
- Use HTTPS for all endpoints.
- Verify issuer, audience, and token lifetimes in downstream token validation.
