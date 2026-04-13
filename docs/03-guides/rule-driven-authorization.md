# Rule-driven Authorization

## What is it?

Instead of hard-coding permission logic (`if (user.Role == "admin") ...`),
authorization is delegated to the Muonroi Rule Engine. Rules are defined in
the Control Plane dashboard and hot-reloaded at runtime without redeploy.

A non-developer (security team, BA) can change "who is allowed to do what"
without touching code.

## Quick start

### 1. Install

```bash
dotnet add package Muonroi.AuthZ
```

### 2. Register

```csharp
builder.Services.AddMAuthorizationRuleEngine();

// Register authorization rules (Optional if using Control Plane)
builder.Services.AddScoped<IRule<AuthorizationRuleContext>, MyAuthRule>();

// Optional: hot-reload from Control Plane
builder.Services.AddMAuthorizationHotReload(options =>
    options.ControlPlaneUrl = "https://your-control-plane.com");
```

### 3. Protect endpoints

```csharp
app.MapGet("/api/orders", GetOrders)
   .RequireRuleEngineAuthorization("orders", "read");
```

### 4. Write authorization rules

```csharp
[MExtractAsRule("AuthZ.Orders.Read", Order = 0)]
public sealed class OrderReadRule : IRule<AuthorizationRuleContext>
{
    public Task<RuleResult> ExecuteAsync(
        AuthorizationRuleContext ctx, CancellationToken ct)
    {
        // ABAC/RBAC unified logic
        bool allowed = ctx.Roles.Contains("admin") ||
                       (ctx.Roles.Contains("viewer") && ctx.Action == "read");
                       
        return Task.FromResult(allowed
            ? RuleResult.Success()
            : RuleResult.Failure("Insufficient permissions to read orders"));
    }
}
```

## Row-level security

Apply rule-driven filters to your database queries to restrict which records a user can see.

```csharp
// In your repository:
public async Task<List<Order>> GetOrdersAsync(CancellationToken ct)
{
    var executionCtx = _contextAccessor.Get();
    
    RowFilterContext<Order> filterCtx = new()
    {
        UserId = executionCtx.UserId.ToString(),
        TenantId = executionCtx.TenantId ?? string.Empty,
        Query = _db.Orders.AsQueryable()
    };

    // The rules will modify the 'Query' property in filterCtx
    IQueryable<Order> filtered = await _rowFilter.ApplyAsync(filterCtx, ct);
    
    return await filtered.ToListAsync(ct);
}
```

## Hot-reload workflow

1. Open **Control Plane** → **Auth Rules**.
2. Create or edit a rule (e.g., add "manager" role to `orders/approve`).
3. Click **Activate**.
4. SignalR pushes the change to all connected runtime instances.
5. The next request automatically uses the new rule — **no application restart required**.

## Tier requirements

- `IAuthorizationPolicyEvaluator` + `IRuleRowFilter` → **Licensed tier**
- Hot-reload from Control Plane → **Enterprise tier**
