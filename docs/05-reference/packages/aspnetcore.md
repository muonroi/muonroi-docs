---
title: ASP.NET Core Packages
sidebar_label: ASP.NET Core
sidebar_position: 3
---

# ASP.NET Core Packages

The Muonroi ASP.NET Core packages provide production-ready middleware, controllers, filters, and OpenAPI integration for building secure, multi-tenant APIs with permission-based authorization, license enforcement, and comprehensive exception handling.

## Muonroi.AspNetCore

**NuGet:** `Muonroi.AspNetCore` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Foundation package providing ASP.NET Core middleware, controller base classes, action filters, and DI registration for building secure APIs with permission-based authorization, license enforcement, quota tracking, and standardized error handling.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MControllerBase` | Abstract Class | Base controller with `IMediator` and logging support; routes: `api/v{version}/[controller]` |
| `MAuthControllerBase<TPermission, TDbContext>` | Abstract Class | Pre-built authentication/authorization endpoints for login, token refresh, roles, permissions, UI manifest generation |
| `AuthorizePermissionFilter<TDbContext>` | Action Filter | Validates endpoint permissions; supports multi-tenant tenant validation and policy decision services (PDP) |
| `PermissionFilter<TPermission>` | Action Filter | Permission bitmask evaluation from JWT claims; supports Any/All matching strategies |
| `AuthorizePermissionAttribute` | Attribute | Marks endpoints requiring specific permission keys; supports multiple attributes per endpoint |
| `PermissionAttribute<TPermission>` | Attribute | Decorates endpoints with enum-based permission requirements |
| `LicenseMiddleware` | Middleware | Enforces license validity; records action usage; computes request hash for audit |
| `MExceptionMiddleware` | Middleware | Catches unhandled exceptions; standardizes error responses; logs with correlation ID |
| `MCookieAuthMiddleware` | Middleware | Extracts JWT from cookies; supports fallback to Authorization header |
| `JwtMiddleware` | Middleware | JWT validation and extraction from Authorization header |
| `QuotaEnforcementMiddleware` | Middleware | Checks tenant quota limits; blocks requests exceeding quotas |
| `PermissionService<TPermission, TDbContext>` | Service | RBAC management: roles, permissions, role-permission assignments, user management |
| `PermissionQueryService<TDbContext>` | Service | Query helpers for roles, permissions, and role-permission mappings |
| `UiEngineManifestOrchestrator<TDbContext>` | Service | Orchestrates UI engine manifest generation from component registry, screens, actions |
| `UiManifestBuilder` | Service | Builds MUiManifest with navigation groups, screens, and actions |
| `MDefaultControllerExecutionContextResolver` | Service | Resolves execution context from HTTP request (user, tenant, language) |

### DI Registration

```csharp
// Basic API setup with versioning, Swagger, health checks
services.AddBaseApi();

// Full infrastructure with permission, licensing, and tenancy
services.AddInfrastructure(configuration, assembly);

// Cookie-based authentication
services.AddMCookieAuth(configuration);

// JWT middleware
services.AddJwtMiddleware(configuration);

// Permission-based authorization
services.AddAuthorizePermission<MyPermission, MyDbContext>();

// Application layer: mediator, mappers, HTTP context accessor
services.AddApplication(assembly);

// Swagger with security definitions and error documentation
services.SwaggerConfig("API Name");
```

### Usage Example

**Define Permission-Protected Endpoint:**

```csharp
[ApiController]
[Route("api/v{version:apiVersion}/orders")]
public class OrderController : MControllerBase
{
    private readonly IMediator _mediator;

    public OrderController(IMediator mediator, IMLog<OrderController> logger) 
        : base(mediator, logger) { }

    [HttpPost("create")]
    [AuthorizePermission("orders.create", PermissionMatchMode.All)]
    public async Task<IActionResult> CreateOrder([FromBody] CreateOrderRequest request)
    {
        var result = await Mediator.Send(request);
        return Ok(result);
    }

    [HttpGet("list")]
    [AuthorizePermission("orders.read", PermissionMatchMode.All)]
    public async Task<IActionResult> ListOrders([FromQuery] int page = 1)
    {
        var result = await Mediator.Send(new ListOrdersQuery { Page = page });
        return Ok(result);
    }
}
```

**Configure in Program.cs:**

```csharp
var builder = WebApplicationBuilder.CreateBuilder(args);
var configuration = builder.Configuration;
var assembly = typeof(Program).Assembly;

// Register services
builder.Services
    .AddBaseApi()
    .AddInfrastructure(configuration, assembly)
    .AddApplication(assembly)
    .SwaggerConfig("Order API");

var app = builder.Build();

// Enable middleware
app
    .UseRouting()
    .UseAuthentication()
    .UseAuthorization()
    .UseLicense()
    .UseQuotaEnforcement()
    .MapControllers();

app.Run();
```

**Inherit from Specialized Base Classes:**

```csharp
public class AuthController : MAuthControllerBase<PermissionEnum, AppDbContext>
{
    public AuthController(
        IAuthService<PermissionEnum, AppDbContext> authService,
        IPermissionService<PermissionEnum> permissionService)
        : base(authService, permissionService)
    {
    }
    
    // Pre-built endpoints:
    // POST /api/v1/auth/login
    // POST /api/v1/auth/refresh-token
    // POST /api/v1/auth/register
    // POST /api/v1/auth/logout
    // POST /api/v1/auth/create-role
    // GET /api/v1/auth/user-permissions/{userId}
    // GET /api/v1/auth/ui-engine/current
}
```

---

## Muonroi.AspNetCore.OpenApi

**NuGet:** `Muonroi.AspNetCore.OpenApi` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

OpenAPI/Swagger integration providing automatic error response documentation, schema generation, and standardized API documentation through Swashbuckle filters.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MErrorResponseFilter` | Operation Filter | Auto-generates 400/500 error response documentation; adds `MErrorResponse` schema to all endpoints |
| `SwaggerDefaultValues` | Operation Filter | Normalizes Swagger operation parameters and response types; removes unused content types |

### DI Registration

```csharp
services.SwaggerConfig("API Name");

// In Program.cs after services are configured:
var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}
```

### Usage Example

**Automatic Error Documentation:**

All endpoints automatically generate:
- **400 Bad Request** — validation or domain logic errors
- **500 Internal Server Error** — unhandled exceptions

Response schema for both HTTP 400 and 500:
```json
{
  "isSuccess": false,
  "result": null,
  "errors": [
    {
      "code": "VALIDATION_ERROR",
      "message": "Field 'email' is required"
    }
  ],
  "timestamp": "2026-05-20T10:30:00Z"
}
```

**Parameter Default Values:**

SwaggerDefaultValues automatically:
- Sets parameter descriptions from model metadata
- Populates default values from query parameters
- Marks required parameters
- Filters content types to match declared response types

---

## Muonroi.AspNetCore.RuleEngine

**NuGet:** `Muonroi.AspNetCore.RuleEngine` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

ASP.NET Core integration for the rule engine providing generic CRUD controllers for entities, rule change tracking, and UI engine change notifications.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MGenericController<TEntity, TDbContext>` | Controller | Provides standard CRUD HTTP endpoints (GET, POST, PUT, DELETE) for any `MEntity` subclass; enforces permissions, tenancy, and license guards |
| `GenericControllerFeatureProvider` | Feature Provider | Dynamically registers `MGenericController<T>` instances for all `MEntity` subclasses discovered via reflection |
| `GenericControllerRouteConvention` | Route Convention | Maps generic controller routes to `api/v{version}/[entity-plural]` using automatic plural naming |
| `CrudRuleExtensions` | Extension Methods | Helper methods for CRUD permission checks and entity filtering |
| `IRuleChangeStore` | Interface | Persistent store for rule change history; supports approval workflows |
| `InMemoryRuleChangeStore` | Implementation | Volatile in-memory store for rule changes |
| `IRuleChangeProposalStore` | Interface | Tracks rule change proposals and their states |
| `InMemoryRuleChangeProposalStore` | Implementation | Volatile in-memory proposal storage |
| `UiEngineChangesController` | Controller | Broadcasts rule/entity changes to connected UI Engine clients via change notifications |

### DI Registration

```csharp
// Registers generic controllers, rule change stores, and infrastructure
services.AddRuleEngineInfrastructure(configuration, typeof(Program).Assembly);

// Alternative: explicit registration
services.AddRuleEngineStore(configuration);
services.AddSingleton<IRuleChangeStore, InMemoryRuleChangeStore>();
services.AddSingleton<IRuleChangeProposalStore, InMemoryRuleChangeProposalStore>();
services.AddControllers(options =>
{
    options.Conventions.Add(new GenericControllerRouteConvention());
})
.ConfigureApplicationPartManager(manager =>
{
    manager.FeatureProviders.Add(new GenericControllerFeatureProvider(typeof(Program).Assembly));
});
```

### Usage Example

**Automatic CRUD Endpoints:**

For an entity:
```csharp
public class Product : MEntity
{
    public string Name { get; set; }
    public decimal Price { get; set; }
    public bool IsActive { get; set; }
}
```

Automatically generates endpoints:
- `GET /api/v1/products?pageIndex=1&pageSize=10` — List with pagination
- `GET /api/v1/products/{id}` — Get by ID
- `POST /api/v1/products` — Create
- `PUT /api/v1/products/{id}` — Update
- `DELETE /api/v1/products/{id}` — Soft delete

**Request/Response Examples:**

```bash
# Create
POST /api/v1/products HTTP/1.1
Content-Type: application/json

{
  "name": "Widget",
  "price": 9.99,
  "isActive": true
}

# Response
HTTP/1.1 201 Created
{
  "isSuccess": true,
  "result": {
    "entityId": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Widget",
    "price": 9.99,
    "isActive": true,
    "creationTime": "2026-05-20T10:30:00Z"
  }
}
```

**Custom Rules in Generic Controller:**

```csharp
public class ProductController : MGenericController<Product, AppDbContext>
{
    [HttpPost("bulk-import")]
    [AuthorizePermission("products.import")]
    public async Task<IActionResult> BulkImport([FromBody] List<CreateProductRequest> requests)
    {
        // Custom business logic
        return Ok();
    }
}
```

**Rule Change Propagation:**

When a rule or entity changes:

```csharp
public class ProductService
{
    private readonly IRuleChangeStore _changeStore;

    public async Task UpdateProduct(Guid productId, UpdateProductRequest request)
    {
        var product = await _dbContext.Products.FindAsync(productId);
        product.Price = request.Price;
        
        await _dbContext.SaveChangesAsync();
        
        // Record change for UI Engine
        await _changeStore.RecordChangeAsync(new RuleChangeRecord
        {
            EntityName = "Product",
            EntityId = productId,
            ChangeType = "Update",
            ChangedProperties = new[] { "Price" }
        });
    }
}
```

---

## Common Workflows

### Multi-Tenant Authorization Flow

1. **Request arrives** → `TenantResolutionMiddleware` sets `TenantContext.CurrentTenantId`
2. **Authentication** → `JwtMiddleware` extracts JWT and validates claims
3. **License check** → `LicenseMiddleware` validates license and records action
4. **Quota enforcement** → `QuotaEnforcementMiddleware` checks tenant quotas
5. **Permission validation** → `AuthorizePermissionFilter` evaluates endpoint requirements
6. **Authorization decision:**
   - If `IMPolicyDecisionService` is enabled: delegates to policy engine
   - Otherwise: falls back to local RBAC from `PermissionService`
7. **Endpoint execution** → Controller handles request with resolved tenant context

### Permission Matching Strategies

**All Mode (Default):**
```csharp
[AuthorizePermission("orders.read", PermissionMatchMode.All)]
[AuthorizePermission("orders.export", PermissionMatchMode.All)]
// User must have BOTH permissions
```

**Any Mode:**
```csharp
[AuthorizePermission("admin.access", PermissionMatchMode.Any)]
[AuthorizePermission("super.access", PermissionMatchMode.Any)]
// User must have AT LEAST ONE permission
```

**Mixed:**
```csharp
[AuthorizePermission("orders.read", PermissionMatchMode.All)]     // Required
[AuthorizePermission("export.pdf", PermissionMatchMode.Any)]       // OR
[AuthorizePermission("export.excel", PermissionMatchMode.Any)]    // OR
// User must have orders.read AND (export.pdf OR export.excel)
```

### Exception Handling Pipeline

1. **Controller action throws** → `MExceptionMiddleware` catches
2. **Exception classification** → Determines error category and code
3. **Response building** → Creates `MErrorResponse` with:
   - HTTP status code (400/500)
   - Error code and message
   - Correlation ID for tracking
   - Tenant context for multi-tenant logging
4. **Logging** → Logs with structured scope (layer, tenant, user)
5. **Response sent** → JSON response with `Content-Type: application/json`

### Generic Controller Permission Checks

```csharp
public class MGenericController<TEntity, TDbContext>
{
    [HttpGet]
    public virtual async Task<IActionResult> Get([FromQuery] int pageIndex = 1)
    {
        licenseGuard.EnsureValid("api.list", typeof(TEntity).Name);
        
        if (!await CheckPermissionAsync("View"))  // "View" permission required
        {
            return Forbid();
        }
        
        // List returns only records visible to current tenant
        var items = ApplyTenantFilter(dbContext.Set<TEntity>());
        
        return Ok(items);
    }
}
```

---

## Configuration Examples

### appsettings.json

```json
{
  "ApiVersioning": {
    "DefaultApiVersion": "1.0"
  },
  "Authentication": {
    "Jwt": {
      "Authority": "https://auth.example.com",
      "Audience": "api"
    },
    "Cookie": {
      "Name": "auth_token",
      "SameSite": "Strict"
    }
  },
  "License": {
    "EnforceOnMiddleware": true,
    "FilePath": "licenses/license.lic"
  },
  "MultiTenantConfigs": {
    "Enabled": true,
    "RequireTenantClaimForAuthenticatedUser": true
  },
  "Quota": {
    "DefaultLimit": 1000
  }
}
```

### Swagger Security Definition

Automatically configured by `SwaggerConfig()`:

```csharp
services.SwaggerConfig("Order API");

// Generates:
// - Bearer token definition (JWT)
// - Global security requirement
// - Schemas for MErrorResponse (400, 500)
// - Operation filters for standardization
```

---

## Best Practices

### 1. Always Inherit from Base Controllers

```csharp
// Good: Gets mediator, logging, and version routing
public class ProductController : MControllerBase { }

// Or for auth endpoints:
public class AuthController : MAuthControllerBase<PermissionEnum, DbContext> { }
```

### 2. Use Permission Attributes Consistently

```csharp
// Mark all endpoints with permissions
[HttpGet("{id}")]
[AuthorizePermission("products.read")]
public async Task<IActionResult> GetProduct(Guid id) { }

// Multiple permissions for complex scenarios
[HttpPost("export")]
[AuthorizePermission("products.read", PermissionMatchMode.All)]
[AuthorizePermission("export.pdf", PermissionMatchMode.Any)]
public async Task<IActionResult> ExportProducts() { }
```

### 3. Rely on Middleware for Cross-Cutting Concerns

```csharp
app.UseRouting();
app.UseAuthentication();      // JWT/Cookie extraction
app.UseAuthorization();        // ASP.NET authorization
app.UseLicense();              // License validation
app.UseQuotaEnforcement();     // Quota checks
app.UseExceptionHandler();     // Global exception handling
app.MapControllers();
```

### 4. Use Generic Controllers for Standard CRUD

```csharp
// Minimal code: register entities and get full CRUD
services.AddRuleEngineInfrastructure(configuration, assembly);

// Automatically get: GET, POST, PUT, DELETE
// With: permission checks, tenancy filters, license guards
```

### 5. Extend UI Manifest for Dynamic UI Generation

```csharp
var manifest = await permissionService.GetUiEngineManifestAsync(userId);

// Returns screens, actions, navigation, components, rule bindings
// Can be projected with ?minimalFor=routing for route-only response
```

---

## Related Documentation

- [Permission-Based Authorization](../../03-guides/identity-access/permission-guide.md)
- [Multi-Tenancy Setup](../../03-guides/multi-tenancy/tenant-isolation.md)
- [License Configuration](../../03-guides/license-governance/license-activation.md)
- [Rule Engine Integration](../../03-guides/rule-engine/rule-engine-guide.md)
