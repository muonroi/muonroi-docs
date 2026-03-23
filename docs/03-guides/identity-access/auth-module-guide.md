---
title: Auth Module Guide
sidebar_label: Auth Module
sidebar_position: 1
---

# Auth Module Guide

The Muonroi Auth Module provides a flexible, secure authentication and authorization framework for ASP.NET Core applications. It supports JWT bearer tokens, cookie-based sessions, OIDC integration, and multi-tenancy out of the box.

## Overview

Muonroi currently supports several identity and access patterns. The default path for most applications is JWT-based API auth, but the codebase also contains BFF, OIDC login, WebAuthn MFA, and centralized policy-decision integration.

This guide covers the core JWT authentication pipeline, token configuration, middleware flow, and error handling. For specialized scenarios, see the focused guides listed at the end.

## Architecture

The auth module consists of four main layers:

1. **JwtMiddleware** — HTTP request interception, token extraction, claims population
2. **JwtBearerConfig / MTokenInfo** — Configuration and token metadata
3. **MAuthenticateInfoContext** — Request-scoped authentication state
4. **Authorization Filters** — Permission enforcement at the endpoint level

## JwtBearerConfig & MTokenInfo

Token configuration is defined in `appsettings.json` under the `TokenConfigs` section. The `MTokenInfo` class maps this configuration into your application.

### Configuration in appsettings.json

```json
{
  "TokenConfigs": {
    "Issuer": "https://your-auth-server.com",
    "Audience": "https://your-api.com",
    "SymmetricSecretKey": "your-secret-key-32-characters-minimum",
    "ExpiryMinutes": 60,
    "RefreshTokenTtl": 86400,
    "RefreshTokenEim": 1440,
    "UseRsa": false,
    "MultiTenantEnabled": true,
    "EnableCookieAuth": false,
    "CookieName": "AuthToken",
    "CookieSameSite": "Lax"
  }
}
```

### RSA Configuration (Public/Private Keys)

For RSA-based signing (recommended for production):

```json
{
  "TokenConfigs": {
    "UseRsa": true,
    "PublicKeyPath": "keys/public.pem",
    "PrivateKeyPath": "keys/private.pem",
    "Issuer": "https://your-auth-server.com",
    "Audience": "https://your-api.com",
    "ExpiryMinutes": 60
  }
}
```

Alternatively, embed keys inline:

```json
{
  "TokenConfigs": {
    "UseRsa": true,
    "PublicKey": "-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----",
    "PrivateKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
  }
}
```

The `MTokenInfo.GetEffectivePublicKey()` and `GetEffectivePrivateKey()` methods automatically resolve file paths or return inline keys.

### MTokenInfo Properties

| Property | Type | Description |
|----------|------|-------------|
| `SectionName` | string | Config section name (default: "TokenConfigs") |
| `Issuer` | string | Token issuer URL |
| `Audience` | string | Intended token audience |
| `SymmetricSecretKey` | string | HMAC-SHA256 secret (if UseRsa=false) |
| `ExpiryMinutes` | int | Access token lifetime |
| `RefreshTokenTtl` | int | Refresh token lifetime in seconds |
| `RefreshTokenEim` | int | Refresh token expiration in minutes |
| `UseRsa` | bool | Enable RSA signing (recommended) |
| `PublicKey` | string | RSA public key (inline or from file) |
| `PrivateKey` | string | RSA private key (inline or from file) |
| `SigningKeysByTenant` | Dictionary | Per-tenant signing keys (multi-tenant mode) |
| `MultiTenantEnabled` | bool | Enable multi-tenancy |
| `EnableCookieAuth` | bool | Enable cookie-based auth (BFF pattern) |
| `CookieName` | string | Cookie name for auth tokens |
| `CookieSameSite` | string | Cookie SameSite attribute (Strict/Lax/None) |

## Authentication Pipeline

The authentication pipeline is initiated by `JwtMiddleware`, which executes before `app.UseAuthentication()` and `app.UseAuthorization()`.

### Middleware Flow (Mermaid Diagram)

```mermaid
graph TD
    A["HTTP Request"] -->|Check Headers| B{Is Anonymous<br/>Path?}
    B -->|Yes| C["Skip Auth<br/>Continue"]
    B -->|No| D{Has AllowAnonymous<br/>Attribute?}
    D -->|Yes| E["Create Anonymous Context"]
    D -->|No| F["Extract Bearer Token<br/>from Authorization Header"]
    F --> G["Verify Token<br/>callbackVerifyToken"]
    G -->|Invalid/Expired| H["401 Unauthorized"]
    G -->|Valid| I["Populate MAuthenticateInfoContext"]
    I --> J["Resolve Tenant Context<br/>via ITenantContextPolicy"]
    J --> K["Create ClaimsPrincipal<br/>from Claims"]
    K --> L["Apply SystemExecutionContext"]
    L --> M["Continue to Next Middleware"]
    H --> N["Return 401 Response"]
```

### Token Extraction

The middleware automatically extracts the JWT token from the `Authorization` header:

```
Authorization: Bearer <jwt-token>
```

If the header contains only a token without the "Bearer" prefix, the middleware automatically adds it.

### Claims Population

After successful token verification, claims are extracted and populated into:

1. **HttpContext.User** — A `ClaimsPrincipal` with claims for username, user GUID, and tenant ID
2. **MAuthenticateInfoContext** — Request-scoped object containing detailed auth state
3. **SystemExecutionContext** — Internal execution context propagated via `AsyncLocal<T>`

Example claims added:

```csharp
new Claim(nameof(MAuthenticateInfoContext.CurrentUsername), verifyToken.CurrentUsername),
new Claim(nameof(MAuthenticateInfoContext.CurrentUserGuid), verifyToken.CurrentUserGuid),
new Claim(ClaimConstants.TenantId, resolvedContext.TenantId)
```

### Security Features

- **Header Sanitization** — Sensitive identity headers are stripped from incoming requests to prevent spoofing
- **Token Auto-Prefix** — Missing "Bearer" prefix is automatically added for convenience
- **Anonymous Path Bypass** — Known anonymous paths (swagger, health, favicon) skip authentication entirely
- **AllowAnonymous Attribute Support** — Endpoints decorated with `[AllowAnonymous]` bypass auth

## MAuthenticateInfoContext

`MAuthenticateInfoContext` is a scoped service populated after successful authentication. It contains comprehensive authentication and user information.

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `CurrentUserGuid` | string | Unique identifier (GUID) of the authenticated user |
| `CurrentUsername` | string | Username of the authenticated user |
| `TenantId` | string? | ID of the user's tenant (null for non-multi-tenant apps) |
| `CorrelationId` | string | Request correlation ID for tracing |
| `TokenValidityKey` | string | Key used to verify token validity/revocation status |
| `AccessToken` | string? | The actual JWT token (masked in logs) |
| `ApiKey` | string? | Alternative API key if token-less auth was used |
| `Permission` | string? | Comma-separated list of user permissions |
| `Language` | string | User's language preference (from Accept-Language header) |
| `Caller` | string | Caller identifier for audit purposes |
| `CurrentUser` | MUserModel? | Full user model (if loaded from database) |
| `IsAuthenticated` | bool | Whether the user passed authentication checks |

### Dependency Injection

Inject `MAuthenticateInfoContext` (or `IAuthenticateInfoContext`) into controllers, services, or middleware:

```csharp
[ApiController]
[Route("api/[controller]")]
public class OrdersController(MAuthenticateInfoContext authContext) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> GetMyOrders()
    {
        string userId = authContext.CurrentUserGuid;
        string? tenantId = authContext.TenantId;
        var permissions = authContext.Permission?.Split(',') ?? [];

        // Fetch orders for this user and tenant
        return Ok(await _orderService.GetOrdersAsync(userId, tenantId));
    }
}
```

### Accessing Claims Programmatically

Retrieve specific claim values using the static helper:

```csharp
var claims = HttpContext.User.Claims.ToList();
string? username = MAuthenticateInfoContext.GetClaimValue<string>(claims, "CurrentUsername");
string? tenantId = MAuthenticateInfoContext.GetClaimValue<string>(claims, ClaimConstants.TenantId);
```

## Registration & Middleware Pipeline

### Service Registration

The auth module is registered via `AddInfrastructure()` in `Program.cs`:

```csharp
public static void Main(string[] args)
{
    var builder = WebApplication.CreateBuilder(args);

    // Register infrastructure, including auth
    builder.Services.AddInfrastructure(
        configuration: builder.Configuration,
        tokenConfig: new MTokenInfo(),
        paginationConfigs: null,
        isSecretDefault: true,
        secreteKey: "your-secret-key",
        assemblies: typeof(Program).Assembly
    );

    var app = builder.Build();

    // Apply default middleware (including JWT)
    app.UseDefaultMiddleware<MyDbContext, MyPermission>();
    app.UseAuthentication();
    app.UseAuthorization();
    app.ConfigureEndpoints();

    app.Run();
}
```

### What AddInfrastructure Registers

- License protection (`AddLicenseProtection`)
- Core services (`AddCoreServices`)
- Authentication context factory (`AddAuthContext`)
- Tenant resolution (`AddTenantContext`)
- Quota enforcement (`AddTenantQuotaManagement`)
- Policy decision service (`AddMPolicyDecision`)
- Multi-level caching (`AddMultiLevelCaching`)

### Middleware Order

1. **TenantContextMiddleware** — Resolves tenant from header, path, or subdomain (if multi-tenancy enabled)
2. **QuotaEnforcement** — Enforces per-tenant quotas
3. **LicenseMiddleware** — Validates enterprise license
4. **MExceptionMiddleware** — Global exception handling
5. **MCookieAuthMiddleware** — Cookie extraction (if enabled)
6. **JwtMiddleware** — Bearer token validation and context population
7. **Authentication** — ASP.NET Core built-in authentication
8. **Authorization** — Permission filter enforcement

## Error Handling

### 401 Unauthorized

Returned when:
- Token is missing or malformed
- Token has expired
- Token signature validation failed
- User is not authenticated

**Response:**

```json
{
  "statusCode": 401,
  "error": {
    "code": "Unauthorized",
    "message": "Authentication required. Provide a valid JWT token in the Authorization header."
  }
}
```

**Client Action:**
- Request new token from the auth server
- Refresh token if refresh flow is implemented
- Redirect to login page in BFF scenarios

### 403 Forbidden

Returned when:
- User lacks required permissions for the endpoint
- User's tenant does not have access to the resource

**Response:**

```json
{
  "statusCode": 403,
  "error": {
    "code": "Forbidden",
    "message": "You do not have permission to access this resource."
  }
}
```

**Client Action:**
- Display error message to user
- Redirect to lower-privilege view or home page

### Custom Error Responses

Override the default error response by catching exceptions in a custom middleware or filter:

```csharp
public class CustomAuthExceptionFilter : IAsyncExceptionFilter
{
    public async Task OnExceptionAsync(ExceptionContext context)
    {
        if (context.Exception is UnauthorizedAccessException)
        {
            context.Result = new UnauthorizedObjectResult(new
            {
                error = "auth_failed",
                message = "Your session has expired. Please log in again.",
                timestamp = DateTime.UtcNow
            });
        }
        await Task.CompletedTask;
    }
}
```

## Common Scenarios

### 1. Single-Tenant API with Bearer Tokens

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddInfrastructure(
    builder.Configuration,
    new MTokenInfo { MultiTenantEnabled = false }
);

var app = builder.Build();
app.UseDefaultMiddleware<AppDbContext, AppPermission>();
app.UseAuthentication();
app.UseAuthorization();
app.Run();
```

**Client Usage:**
```bash
curl -H "Authorization: Bearer <token>" https://api.example.com/api/orders
```

### 2. Multi-Tenant API with Per-Tenant Keys

```json
{
  "TokenConfigs": {
    "MultiTenantEnabled": true,
    "UseRsa": true,
    "SigningKeysByTenant": {
      "tenant-a": "-----BEGIN PRIVATE KEY-----\n...",
      "tenant-b": "-----BEGIN PRIVATE KEY-----\n..."
    }
  }
}
```

The tenant is resolved from the `x-tenant-id` header, and tokens are validated using the tenant's specific signing key.

### 3. Cookie-Based Auth (BFF)

```json
{
  "TokenConfigs": {
    "EnableCookieAuth": true,
    "CookieName": "AuthToken",
    "CookieSameSite": "Strict"
  }
}
```

Tokens are stored in HTTP-only, Secure cookies and automatically sent with every request.

### 4. Protecting an Endpoint

```csharp
[ApiController]
[Route("api/v1/[controller]")]
[Authorize]  // Requires authentication
public class AdminController(MAuthenticateInfoContext auth) : ControllerBase
{
    [HttpGet("settings")]
    [Authorize(Roles = "Admin")]  // Also requires Admin role
    public IActionResult GetSettings()
    {
        return Ok(new { user = auth.CurrentUsername, role = "Admin" });
    }

    [HttpPost("users")]
    [AllowAnonymous]  // Exception: this endpoint allows anonymous access
    public IActionResult CreatePublicUser([FromBody] UserRequest req)
    {
        return Ok(new { created = true });
    }
}
```

## Related Guides

Use the focused guides when your application needs more than basic bearer-token auth:

- **BFF and secure cookie sessions** — See [BFF Guide](../bff-guide.md)
- **External OpenID Connect login** — See [OIDC Guide](../oidc-guide.md)
- **Passkeys and phishing-resistant MFA** — See [WebAuthn MFA Guide](../webauthn-guide.md)
- **Centralized authorization with OPA or OpenFGA** — See [Policy Decision Guide](../policy-decision-guide.md)
- **Token management and refresh flows** — See [Token Guide](../token-guide.md)
- **Permission design patterns** — See [Permission Guide](../permission-guide.md)

Keep the base auth setup small unless the product requirements explicitly need those flows.

## Troubleshooting

### "Invalid token signature"
- Verify the signing key matches between token issuer and validator
- For RSA, ensure public/private key pair is correct
- Check `appsettings.json` `PublicKeyPath` or `PublicKey` is set correctly

### "Token expired"
- Check system clock is synchronized on both client and server
- Increase `ExpiryMinutes` in token config if tokens are expiring too quickly
- Implement refresh token flow (see Token Guide)

### "401 on valid token"
- Ensure `Authorization: Bearer <token>` header format is exact
- Check middleware order: `JwtMiddleware` must run before `app.UseAuthentication()`
- Verify endpoint is not in the anonymous paths list

### "Permission denied but user has role"
- Ensure role claims are being extracted from token
- Check `Permission` property is populated in `MAuthenticateInfoContext`
- Verify permission filter is registered via `AddPermissionFilter<TPermission>()`

## See Also

- [MTokenInfo](https://github.com/muonroi/muonroi-building-block/blob/develop/src/Muonroi.Core.Abstractions/Models/Common/MTokenInfo.cs)
- [MAuthenticateInfoContext](https://github.com/muonroi/muonroi-building-block/blob/develop/src/Muonroi.Core.Abstractions/Interfaces/MAuthenticateInfoContext.cs)
- [JwtMiddleware](https://github.com/muonroi/muonroi-building-block/blob/develop/src/Muonroi.AspNetCore/Middleware/JwtMiddleware.cs)
- [InfrastructureExtensions](https://github.com/muonroi/muonroi-building-block/blob/develop/src/Muonroi.AspNetCore/Extensions/InfrastructureExtensions.cs)
