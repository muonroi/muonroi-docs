---
title: Authentication & Authorization Packages
sidebar_label: Auth & Identity
sidebar_position: 3
---

# Authentication & Authorization Packages

Enterprise-grade authentication and authorization packages providing JWT token management, rule-driven permission evaluation, and Backend-for-Frontend (BFF) patterns for secure SPA communication.

## Muonroi.Auth

**NuGet:** `Muonroi.Auth` | **Tier:** OSS | **Distribution:** NuGet.org | **License:** MIT

### Purpose

Provides JWT authentication infrastructure including token generation, validation, cryptographic signing, and password hashing. Supports RSA key rotation, token revocation, WebAuthn (FIDO2) authentication, and OIDC integration.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `JwtService` | Class | Generate, validate, revoke JWT tokens. Manages RSA signing credentials and token revocation. |
| `IRsaKeyStore` | Interface | Abstraction for RSA key management (in-memory or Redis-backed). |
| `ITokenRevocationStore` | Interface | Token blacklist/revocation management. |
| `HmacTokenSigner` | Class | HMAC-SHA256 token signing for symmetric key scenarios. |
| `RsaTokenSigner` | Class | RSA token signing with asymmetric keys. |
| `MPasswordHelper` | Class | BCrypt password hashing and verification utilities. |
| `BCryptPasswordHasher` | Class | IPasswordHasher implementation using BCrypt.NET. |
| `IPasswordHasher` | Interface | Pluggable password hashing contract. |
| `InMemoryRsaKeyStore` | Class | In-memory RSA key storage (development/testing). |
| `RedisRsaKeyStore` | Class | Redis-backed RSA key store (production). |
| `TokenRevocationStore` | Class | In-memory token revocation store. |
| `RedisTokenRevocationStore` | Class | Redis-backed token revocation store. |
| `WebAuthnService` | Class | FIDO2 WebAuthn registration and authentication. |
| `PkceClient` | Class | OAuth 2.0 PKCE (Proof Key for Code Exchange) client. |
| `DPoPBindingService` | Class | DPoP (Demonstration of Proof-of-Possession) token binding. |
| `OidcHandler` | Class | OpenID Connect authentication handler. |

### Configuration

Bind JWT settings from `appsettings.json`:

```json
{
  "Jwt": {
    "Issuer": "https://your-auth-server.com",
    "Audience": "your-application",
    "Expires": 3600
  },
  "Authentication": {
    "RefreshTokenLifetimeMinutes": 43200
  }
}
```

### DI Registration

```csharp
using Muonroi.Auth;

var services = new ServiceCollection();

// Option 1: In-memory RSA key store (development)
services.AddInMemoryRsaKeyStore();

// Option 2: Redis-backed RSA key store (production)
services.AddRedisRsaKeyStore(configuration);

// Option 3: Register token revocation separately
services.AddDefaultTokenRevocationStore();

// Access the JWT service
var jwtService = services.BuildServiceProvider()
    .GetRequiredService<JwtService>();
```

### Usage Example

```csharp
// Generate a JWT token
var token = jwtService.GenerateToken(
    subject: "user-123",
    lifetime: TimeSpan.FromHours(1),
    notBefore: DateTime.UtcNow);

// Validate a token
try
{
    var principal = jwtService.ValidateToken(token);
    var userId = principal.FindFirst(ClaimTypes.NameIdentifier)?.Value;
}
catch (SecurityTokenException ex)
{
    // Token is invalid or revoked
}

// Revoke a token
jwtService.RevokeToken(token);

// Rotate RSA keys
jwtService.RotateKeys();

// Get public keys (JWKS endpoint)
var jwks = jwtService.GetJsonWebKeySet();
```

### WebAuthn Setup

```csharp
services.AddWebAuthnServices();

var webAuthnService = sp.GetRequiredService<WebAuthnService>();

// Register a credential
var registerResponse = await webAuthnService.RegisterAsync(
    userId: "user-123",
    userName: "john.doe@example.com",
    credentialName: "MacBook Pro");

// Authenticate with a credential
var authenticateResponse = await webAuthnService.AuthenticateAsync(
    userId: "user-123",
    credential: clientResponse);
```

---

## Muonroi.AuthZ

**NuGet:** `Muonroi.AuthZ` | **Tier:** Commercial | **Distribution:** GitHub Packages | **License:** Proprietary

### Purpose

Rule-driven authorization engine integrating the Muonroi Rule Engine with ASP.NET Core authorization. Supports attribute-based access control (ABAC), role-based access control (RBAC), row-level security (RLS), and hot-reload of authorization rules from the Control Plane without application restart.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IAuthorizationPolicyEvaluator` | Interface | Evaluates authorization rules against a context. |
| `RuleEngineAuthorizationPolicyEvaluator` | Class | Implementation using Muonroi Rule Engine with caching. |
| `AuthorizationRuleContext` | Class | Rule evaluation context carrying user, tenant, resource, action, and claims. |
| `AuthorizationResult` | Class | Allow/Deny decision with optional denial reason. |
| `MuonroiAuthorizationHandler` | Class | ASP.NET Core authorization handler that bridges claims and rules. |
| `MuonroiAuthorizationRequirement` | Class | ASP.NET Core authorization requirement for rule-engine policies. |
| `AuthorizationRuleOrchestratorAdapter` | Class | Adapter wrapping RuleOrchestrator for authorization context. |
| `IRuleRowFilter<T>` | Interface | Applies rule-driven row-level filtering to queryables. |
| `RuleRowFilter<T>` | Class | Implementation using Rule Engine for RLS. |
| `RowFilterContext<T>` | Class | Row filter evaluation context. |
| `OpaAuthorizationService` | Class | Alternative Open Policy Agent (OPA) integration. |
| `IAuthRuleChangeHandler` | Interface | Handles authorization rule changes from hot-reload. |
| `AuthRuleHotReloadClient` | Class | SignalR client for Control Plane rule updates. |
| `DefaultAuthRuleChangeHandler` | Class | Default hot-reload handler (resets cache/refreshes rules). |

### Authorization Context Model

```csharp
public sealed class AuthorizationRuleContext : IRuleContext
{
    public string UserId { get; init; }              // User requesting access
    public string TenantId { get; init; }            // Tenant context
    public string Resource { get; init; }            // Resource (e.g., "orders", "reports")
    public string Action { get; init; }              // Action (e.g., "read", "write", "delete")
    public IReadOnlyList<string> Roles { get; init; } // User roles
    public IReadOnlyDictionary<string, object?> Claims { get; init; } // Additional claims
    public void HaltGroup()                          // Signal engine to stop rule group
    public bool IsHalted { get; }
}
```

### DI Registration

```csharp
using Muonroi.AuthZ.Extensions;

var services = new ServiceCollection();

// Register the rule-engine-driven authorization handler
services.AddMAuthorizationRuleEngine();

// Register your authorization rules
services.AddScoped<IRule<AuthorizationRuleContext>, CanReadOrdersRule>();
services.AddScoped<IRule<AuthorizationRuleContext>, CanDeleteInvoicesRule>();

// Optional: Enable hot-reload from Control Plane
services.AddMAuthorizationHotReload(options =>
{
    options.ControlPlaneUrl = "https://control-plane.example.com";
    options.TenantId = "tenant-123";
    options.AccessTokenFactory = async () => await GetTokenAsync();
    options.ReconnectDelay = TimeSpan.FromSeconds(10);
});
```

### Authorization Rule Example

```csharp
using Muonroi.AuthZ.Authorization;
using Muonroi.RuleEngine.Abstractions;

public class CanReadOrdersRule : IRule<AuthorizationRuleContext>
{
    public string Code => "can-read-orders";
    public int Order => 1;
    public string[] DependsOn => [];
    public HookPoint HookPoint => HookPoint.BeforeRule;
    public RuleType Type => RuleType.Business;

    public async Task<RuleResult> EvaluateAsync(
        AuthorizationRuleContext context,
        FactBag facts,
        CancellationToken ct = default)
    {
        // Check if action is "read"
        if (context.Action != "read")
        {
            return RuleResult.Passed();
        }

        // Allow if user has "Sales" role
        if (context.Roles.Contains("Sales"))
        {
            return RuleResult.Success();
        }

        return RuleResult.Failure(["User lacks Sales role"]);
    }

    public Task ExecuteAsync(AuthorizationRuleContext context, CancellationToken ct = default)
    {
        return Task.CompletedTask;
    }
}
```

### Usage in Controllers

```csharp
[ApiController]
[Route("api/[controller]")]
public class OrdersController : ControllerBase
{
    private readonly IAuthorizationService _authorizationService;

    [HttpGet("{id}")]
    [RequireRuleEngineAuthorization("orders", "read")]
    public async Task<ActionResult<OrderDto>> GetOrder(string id)
    {
        // Authorization is enforced by the policy
        return Ok(new OrderDto { Id = id });
    }

    [HttpDelete("{id}")]
    public async Task<IActionResult> DeleteOrder(string id)
    {
        // Manual authorization check
        var result = await _authorizationService
            .AuthorizeAsync(User, new MuonroiAuthorizationRequirement("orders", "delete"));

        if (!result.Succeeded)
        {
            return Forbid();
        }

        return NoContent();
    }
}
```

### Row-Level Security (RLS)

```csharp
// Define a row filter rule
public class UserCanAccessOwnInvoicesRule : IRule<RowFilterContext<Invoice>>
{
    public string Code => "access-own-invoices";
    public int Order => 1;

    public async Task<RuleResult> EvaluateAsync(
        RowFilterContext<Invoice> context,
        FactBag facts,
        CancellationToken ct = default)
    {
        // Filter invoices to only those owned by the current user
        var userId = context.UserId;
        context.Query = context.Query.Where(inv => inv.OwnerId == userId);

        return RuleResult.Success();
    }

    public Task ExecuteAsync(RowFilterContext<Invoice> context, CancellationToken ct = default)
    {
        return Task.CompletedTask;
    }
}

// In your data access layer
public class InvoiceRepository
{
    private readonly IRuleRowFilter<Invoice> _rowFilter;
    private readonly ISystemExecutionContextAccessor _contextAccessor;

    public async Task<List<Invoice>> GetAllAsync()
    {
        var context = _contextAccessor.Get();
        var filterContext = new RowFilterContext<Invoice>
        {
            UserId = context.UserId,
            TenantId = context.TenantId,
            Query = _dbContext.Invoices.AsQueryable()
        };

        var filtered = await _rowFilter.ApplyAsync(filterContext);
        return await filtered.ToListAsync();
    }
}
```

### Decision Caching

Authorization decisions are cached with a 1-minute TTL to balance security with performance. Cache keys include UserId, Resource, and Action.

```
authz:decision:{UserId}:{Resource}:{Action}
```

---

## Muonroi.Bff

**NuGet:** `Muonroi.Bff` | **Tier:** Commercial | **Distribution:** GitHub Packages | **License:** Proprietary

### Purpose

Implements the Backend-for-Frontend (BFF) security pattern for Single-Page Applications (SPAs). Provides server-side token management, cookie-based session handling, and CSRF protection. Refresh tokens are stored server-side and never exposed to the browser.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `ITokenStore` | Interface | Server-side refresh token storage abstraction. |
| `InMemoryTokenStore` | Class | In-memory token storage (development/testing). |
| `RedisTokenStore` | Class | Redis-backed distributed token storage (production). |

### Token Store Interface

```csharp
public interface ITokenStore
{
    Task StoreRefreshTokenAsync(string subject, string refreshToken);
    Task<string?> GetRefreshTokenAsync(string subject);
    Task RemoveRefreshTokenAsync(string subject);
}
```

### Configuration

Bind token lifetime settings from `appsettings.json`:

```json
{
  "Bff": {
    "RefreshTokenLifetimeMinutes": 43200
  },
  "Authentication": {
    "RefreshTokenLifetimeMinutes": 43200
  }
}
```

Defaults to 30 days (43,200 minutes) if not configured.

### DI Registration

```csharp
using Muonroi.Bff;

var services = new ServiceCollection();

// Option 1: In-memory token store (development)
services.AddBffAuthentication(useRedisTokenStore: false);

// Option 2: Redis-backed token store (production)
services.AddBffAuthentication(useRedisTokenStore: true);
```

### Cookie Security Settings

BFF automatically configures secure cookies:

| Setting | Value | Purpose |
|---------|-------|---------|
| `HttpOnly` | `true` | Prevents JavaScript access to cookies. |
| `SecurePolicy` | `Always` | Requires HTTPS transmission. |
| `SameSite` | `Strict` | Prevents cross-site cookie submission. |

### Usage Example

```csharp
[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly ITokenStore _tokenStore;
    private readonly JwtService _jwtService;

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        // Validate user credentials
        var user = await ValidateUserAsync(request.Email, request.Password);
        if (user == null)
            return Unauthorized();

        // Generate tokens
        var accessToken = _jwtService.GenerateToken(
            subject: user.Id,
            lifetime: TimeSpan.FromMinutes(15));

        var refreshToken = GenerateRefreshToken();

        // Store refresh token server-side
        await _tokenStore.StoreRefreshTokenAsync(user.Id, refreshToken);

        // Return access token in response, set refresh token in secure cookie
        Response.Cookies.Append("refresh_token", refreshToken,
            new CookieOptions
            {
                HttpOnly = true,
                Secure = true,
                SameSite = SameSiteMode.Strict,
                Expires = DateTimeOffset.UtcNow.AddDays(30)
            });

        return Ok(new { accessToken });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> RefreshToken()
    {
        // Get refresh token from cookie (not exposed to JavaScript)
        var refreshToken = Request.Cookies["refresh_token"];
        if (string.IsNullOrEmpty(refreshToken))
            return Unauthorized();

        // Validate stored token
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var storedToken = await _tokenStore.GetRefreshTokenAsync(userId);

        if (storedToken != refreshToken)
            return Unauthorized();

        // Issue new access token
        var newAccessToken = _jwtService.GenerateToken(
            subject: userId,
            lifetime: TimeSpan.FromMinutes(15));

        return Ok(new { accessToken = newAccessToken });
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout()
    {
        var userId = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

        // Remove server-side refresh token
        await _tokenStore.RemoveRefreshTokenAsync(userId);

        // Clear cookie
        Response.Cookies.Delete("refresh_token");

        return NoContent();
    }
}
```

### SPA Integration Pattern

```typescript
// SPA: auth.service.ts
export class AuthService {
  async login(email: string, password: string) {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      credentials: 'include', // Include cookies
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await response.json();
    // Access token stored in memory (not in cookies)
    localStorage.setItem('access_token', data.accessToken);
  }

  async refreshAccessToken() {
    // Refresh token is automatically sent via secure cookie
    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'include'
    });

    const data = await response.json();
    localStorage.setItem('access_token', data.accessToken);
  }

  logout() {
    localStorage.removeItem('access_token');
    return fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  }
}
```

### Tenant-Scoped Token Storage

`RedisTokenStore` automatically tenant-scopes tokens when used in a multi-tenant application:

```csharp
// Tokens are stored with tenant prefix in Redis
// Key: {TenantId}:bff:refresh:{Subject}
await _tokenStore.StoreRefreshTokenAsync("user-123", "refresh-token-xyz");
// → Stores in: "tenant-456:bff:refresh:user-123" (if TenantId="tenant-456")
```

---

## Comparison Matrix

| Feature | Muonroi.Auth | Muonroi.AuthZ | Muonroi.Bff |
|---------|--------------|---------------|------------|
| JWT Generation/Validation | ✓ | ✗ | ✗ |
| Password Hashing (BCrypt) | ✓ | ✗ | ✗ |
| Rule-Driven Authorization | ✗ | ✓ | ✗ |
| Row-Level Security (RLS) | ✗ | ✓ | ✗ |
| Hot-Reload Rules | ✗ | ✓ | ✗ |
| BFF Pattern | ✗ | ✗ | ✓ |
| Server-Side Token Storage | ✗ | ✗ | ✓ |
| WebAuthn/FIDO2 | ✓ | ✗ | ✗ |
| OIDC Support | ✓ | ✗ | ✗ |

---

## Integration Patterns

### Complete Authentication + Authorization Flow

```csharp
public void ConfigureServices(IServiceCollection services)
{
    services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
        .AddJwtBearer(options =>
        {
            options.Authority = "https://auth-server.com";
            options.Audience = "api";
        });

    // JWT token management
    services.AddRedisRsaKeyStore(Configuration);

    // Rule-driven authorization
    services.AddMAuthorizationRuleEngine();
    services.AddMAuthorizationHotReload(opts =>
    {
        opts.ControlPlaneUrl = Configuration["ControlPlane:Url"];
    });

    // Register authorization rules
    services.AddScoped<IRule<AuthorizationRuleContext>, UserCanReadOrdersRule>();
    services.AddScoped<IRule<AuthorizationRuleContext>, AdminCanDeleteOrdersRule>();
    services.AddScoped<IRule<RowFilterContext<Order>>, UserSeeOwnOrdersRule>();
}

public void Configure(IApplicationBuilder app)
{
    app.UseAuthentication();
    app.UseAuthorization();

    app.UseRouting();
    app.UseEndpoints(endpoints =>
    {
        endpoints.MapControllers();
    });
}
```

### SPA + BFF Pattern

```csharp
public void ConfigureServices(IServiceCollection services)
{
    // BFF authentication with secure cookies
    services.AddBffAuthentication(useRedisTokenStore: true);

    // JWT for backend token validation
    services.AddRedisRsaKeyStore(Configuration);

    // Authorization rules
    services.AddMAuthorizationRuleEngine();
}
```

---

## Related Documentation

- [Rule Engine Guide](../../03-guides/rule-engine/rule-engine-guide.md) — Rule design and orchestration
- [Multi-Tenancy Guide](../../03-guides/multi-tenancy/tenant-isolation.md) — Tenant-scoped operations
- [License Setup](../../03-guides/license-governance/license-activation.md) — Feature-tier enforcement
