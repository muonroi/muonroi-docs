# Auth Module Guide

Muonroi currently supports several identity and access patterns. The default path for most applications is JWT-based API auth, but the codebase also contains BFF, OIDC login, WebAuthn MFA, and centralized policy-decision integration.

## Recommended API setup

For a standard bearer-token API:

```csharp
services.AddValidateBearerToken<MyDbContext, MTokenInfo, MyPermission>(configuration);
services.AddAuthTokenValidation<MyDbContext, MyPermission>();
services.AddPermissionFilter<MyPermission>();
services.AddDynamicPermission<MyDbContext>();
```

Pipeline:

```csharp
app.UseRouting();
app.UseDefaultMiddleware<MyDbContext, MyPermission>();
app.UseAuthentication();
app.UseAuthorization();
app.ConfigureEndpoints();
```

## Built-in responsibilities

- JWT validation populates `HttpContext.User`.
- Auth token validation checks token state and revocation rules.
- Permission filters enforce endpoint permissions.
- Tenant resolution runs before data access.

## Related guides

Use the focused guides when your application needs more than basic bearer-token auth:

- BFF and secure cookie sessions: `BFF Guide`
- External OpenID Connect login: `OIDC Guide`
- Passkeys and phishing-resistant MFA: `WebAuthn MFA Guide`
- Centralized authorization with OPA or OpenFGA: `Policy Decision Guide`

Keep the base auth setup small unless the product requirements explicitly need those flows.
