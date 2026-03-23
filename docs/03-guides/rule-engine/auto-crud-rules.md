---
title: Auto CRUD Rules
sidebar_label: Auto CRUD Rules
sidebar_position: 8
---

# Auto CRUD Rules

Auto CRUD Rules allow you to execute business rules at specific lifecycle points during Create, Read, Update, and Delete operations on your data entities. This feature lets you enforce validation, side effects, audit trails, and complex business logic without writing custom controller code.

## Overview

`MGenericController<TEntity, TDbContext>` provides an automatic REST API for your entities. When you register business rules via `IRule<CrudContext<TEntity>>`, they execute at designated hook points:

- **BeforeCreate** — Validate incoming data before persistence
- **AfterCreate** — Execute side effects (notifications, audit logs, quota deductions)
- **BeforeUpdate** — Validate changes before applying them
- **AfterUpdate** — Record modifications, trigger notifications
- **BeforeDelete** — Prevent deletion if constraints are violated
- **AfterDelete** — Clean up related data, audit the deletion

## Architecture

### Request Flow with Rules

```
HTTP Request (POST/PUT/DELETE)
    ↓
MGenericController action (Create/Update/Delete)
    ↓
License check + Permission check
    ↓
Set audit fields (CreatorUserId, CreationTime, TenantId)
    ↓
[BEFORE HOOK] RuleOrchestrator executes BeforeRule hooks
    ├─ If rule cancels operation → return BadRequest
    └─ If validation errors → aggregate and return BadRequest
    ↓
[DB OPERATION] SaveChangesAsync (Insert/Update/Soft Delete)
    ↓
[AFTER HOOK] RuleOrchestrator executes AfterRule hooks
    └─ Errors logged but don't block response (operation already persisted)
    ↓
HTTP 200 OK with entity
```

### Components

- **`CrudContext<TEntity>`** — Contains entity, operation type, user/tenant info, and validation state
- **`RuleOrchestrator<CrudContext<TEntity>>`** — Executes registered rules at each hook point
- **`IRule<CrudContext<TEntity>>`** — Business rule implementation interface
- **CrudRuleExtensions** — Fluent registration helpers in Dependency Injection

## CrudContext Structure

The context object passed to your rules contains:

```csharp
public sealed class CrudContext<TEntity> where TEntity : MEntity
{
    /// The entity being created, updated, or deleted
    public TEntity Entity { get; set; }

    /// Original entity state (Update only)
    public TEntity? OriginalEntity { get; set; }

    /// Operation type: Create, Update, Delete, Read
    public CrudOperationType OperationType { get; set; }

    /// Current user's ID
    public Guid? UserId { get; set; }

    /// Current tenant ID (multi-tenant scenarios)
    public string? TenantId { get; set; }

    /// Validation errors collected during rule execution
    public List<string> ValidationErrors { get; }

    /// Additional metadata rules can set
    public Dictionary<string, object?> Metadata { get; }

    /// Cancel the operation and provide a reason
    public bool CancelOperation { get; set; }
    public string? CancellationReason { get; set; }
}
```

## Implementing a Business Rule

Every business rule implements `IRule<CrudContext<TEntity>>`:

```csharp
using Muonroi.AspNetCore.Controllers;
using Muonroi.RuleEngine.Core.Abstractions;
using Muonroi.RuleEngine.Core.Models;
using System.Reflection;

namespace MyApp.Rules;

/// Validates Product entities before creation
public class ProductValidationRule<TProduct> : IRule<CrudContext<TProduct>>
    where TProduct : MEntity
{
    public string Code => "PRODUCT_VALIDATION";

    public string Name => "Product Validation Rule";

    /// Order of execution (lower = earlier)
    public int Order => 10;

    public IReadOnlyList<string> DependsOn => [];

    public IEnumerable<Type> Dependencies => [];

    /// Hook point: BeforeCreate, AfterCreate, BeforeUpdate, etc.
    public HookPoint HookPoint => HookPoint.BeforeCreate;

    public RuleType Type => RuleType.Validation;

    /// Phase 1: Evaluate conditions and prepare decisions
    public async Task<RuleResult> EvaluateAsync(
        CrudContext<TProduct> context,
        FactBag facts,
        CancellationToken cancellationToken)
    {
        var errors = new List<string>();

        // Validate Price field
        var priceProperty = typeof(TProduct).GetProperty("Price");
        if (priceProperty != null)
        {
            object? price = priceProperty.GetValue(context.Entity);
            if (price is decimal priceValue && priceValue <= 0)
            {
                errors.Add("Price must be greater than 0");
                context.ValidationErrors.Add("Price must be greater than 0");
            }
        }

        // Validate Stock field
        var stockProperty = typeof(TProduct).GetProperty("Stock");
        if (stockProperty != null)
        {
            object? stock = stockProperty.GetValue(context.Entity);
            if (stock is int stockValue && stockValue < 0)
            {
                errors.Add("Stock cannot be negative");
                context.ValidationErrors.Add("Stock cannot be negative");
            }
        }

        // Validate Name field
        var nameProperty = typeof(TProduct).GetProperty("Name");
        if (nameProperty != null)
        {
            object? name = nameProperty.GetValue(context.Entity);
            if (name is string nameValue && string.IsNullOrWhiteSpace(nameValue))
            {
                errors.Add("Product name is required");
                context.ValidationErrors.Add("Product name is required");
            }
        }

        if (errors.Count > 0)
        {
            return RuleResult.Failure(errors.ToArray());
        }

        return await Task.FromResult(RuleResult.Passed());
    }

    /// Phase 2: Execute side effects (if EvaluateAsync passed)
    public Task ExecuteAsync(CrudContext<TProduct> context, CancellationToken cancellationToken)
    {
        // No side effects for validation rules
        return Task.CompletedTask;
    }
}
```

### Rule Interface Members

| Member | Purpose |
|--------|---------|
| **Code** | Unique identifier for the rule (e.g., "PRODUCT_VALIDATION") |
| **Name** | Human-readable display name |
| **Order** | Execution priority (10, 20, 30...). Lower numbers execute first |
| **HookPoint** | When the rule runs: BeforeCreate, AfterCreate, etc. |
| **Type** | Rule classification: Validation, Action, Decision, Transform |
| **EvaluateAsync** | Phase 1: Check conditions, populate errors, don't modify state |
| **ExecuteAsync** | Phase 2: Apply side effects only if Evaluate passed |

## Registering Rules

Register rules in your DI container using `CrudRuleExtensions`:

```csharp
// Program.cs
var builder = WebApplication.CreateBuilder(args);

// Register ProductEntity with its rules
builder.Services.AddCrudRules<ProductEntity>(services =>
{
    // Register individual rules for ProductEntity
    services.AddCrudRule<ProductEntity, ProductValidationRule<ProductEntity>>();
    services.AddCrudRule<ProductEntity, ProductNotificationRule<ProductEntity>>();
    services.AddCrudRule<ProductEntity, ProductQuotaRule<ProductEntity>>();

    // Register hooks
    services.AddCrudHook<ProductEntity, ProductAuditHook<ProductEntity>>();

    // Register event listeners
    services.AddCrudRuleListener<ProductEntity, ProductEventListener<ProductEntity>>();
});

// Register the generic controller
builder.Services.AddScoped<MGenericController<ProductEntity, MyDbContext>>();

var app = builder.Build();

app.MapControllers();
app.Run();
```

The `AddCrudRules<TEntity>` extension:
1. Invokes your configure action to register rules
2. Registers a `RuleOrchestrator<CrudContext<TEntity>>` in DI
3. Orchestrator automatically discovers all `IRule<CrudContext<TEntity>>` implementations

## Execution Flow Example

Let's trace a POST request to create a product:

1. **HTTP POST /api/v1/products**
   ```json
   {
     "Name": "Widget",
     "Price": -50.00,
     "Stock": 100
   }
   ```

2. **MGenericController.Create() receives the request**
   - Sets EntityId, CreationTime, TenantId
   - Creates CrudContext

3. **BeforeCreate Hook (ExecuteRulesAsync)**
   ```
   ProductValidationRule evaluates:
   - Price is -50.00 → adds error "Price must be greater than 0"
   - Stock is 100 → passes
   - Name is "Widget" → passes

   Result: context.ValidationErrors.Count = 1
   ```

4. **Rule execution returns (false, "Price must be greater than 0")**
   ```
   MGenericController returns: BadRequest(400)
   {
     "error": "Price must be greater than 0"
   }
   ```

5. **Database operation is skipped** — entity never persisted

Now correct the request:
   ```json
   {
     "Name": "Widget",
     "Price": 50.00,
     "Stock": 100
   }
   ```

6. **BeforeCreate Hook succeeds**
   - All validations pass
   - CrudContext continues

7. **SaveChangesAsync persists the entity**

8. **AfterCreate Hook executes**
   - ProductNotificationRule sends email
   - ProductQuotaRule deducts from user quota
   - ProductAuditHook records creation in audit log

9. **Returns HTTP 200 OK** with created entity

## Use Cases

### 1. Validation (BeforeCreate/BeforeUpdate)

Ensure data integrity before persistence:

```csharp
public class InventoryValidationRule<TInventory> : IRule<CrudContext<TInventory>>
    where TInventory : MEntity
{
    public HookPoint HookPoint => HookPoint.BeforeUpdate;

    public async Task<RuleResult> EvaluateAsync(
        CrudContext<TInventory> context,
        FactBag facts,
        CancellationToken cancellationToken)
    {
        var errors = new List<string>();

        // Prevent decreasing stock below current orders
        var quantityProperty = typeof(TInventory).GetProperty("Quantity");
        var openOrdersProperty = typeof(TInventory).GetProperty("OpenOrders");

        if (quantityProperty?.GetValue(context.Entity) is int quantity &&
            openOrdersProperty?.GetValue(context.OriginalEntity) is int openOrders &&
            quantity < openOrders)
        {
            errors.Add($"Cannot reduce quantity below open orders ({openOrders})");
            context.ValidationErrors.Add(errors[0]);
        }

        return errors.Count > 0
            ? RuleResult.Failure(errors.ToArray())
            : await Task.FromResult(RuleResult.Passed());
    }

    public Task ExecuteAsync(CrudContext<TInventory> context, CancellationToken cancellationToken)
        => Task.CompletedTask;
}
```

### 2. Quota Enforcement (AfterCreate)

Deduct from user quota after entity creation:

```csharp
public class QuotaDeductionRule<TOrder> : IRule<CrudContext<TOrder>>
    where TOrder : MEntity
{
    private readonly IQuotaService _quotaService;

    public QuotaDeductionRule(IQuotaService quotaService) => _quotaService = quotaService;

    public HookPoint HookPoint => HookPoint.AfterCreate;

    public async Task<RuleResult> EvaluateAsync(
        CrudContext<TOrder> context,
        FactBag facts,
        CancellationToken cancellationToken) => RuleResult.Passed();

    public async Task ExecuteAsync(CrudContext<TOrder> context, CancellationToken cancellationToken)
    {
        // Deduct quota only after order is persisted
        if (context.UserId.HasValue)
        {
            await _quotaService.DeductAsync(
                context.UserId.Value,
                "orders",
                1,
                cancellationToken);
        }
    }
}
```

### 3. Notifications (AfterCreate/AfterUpdate)

Send emails or messages after changes:

```csharp
public class NotificationRule<TTicket> : IRule<CrudContext<TTicket>>
    where TTicket : MEntity
{
    private readonly INotificationService _notificationService;

    public NotificationRule(INotificationService notificationService)
        => _notificationService = notificationService;

    public HookPoint HookPoint => HookPoint.AfterCreate;

    public async Task<RuleResult> EvaluateAsync(
        CrudContext<TTicket> context,
        FactBag facts,
        CancellationToken cancellationToken) => RuleResult.Passed();

    public async Task ExecuteAsync(CrudContext<TTicket> context, CancellationToken cancellationToken)
    {
        var titleProperty = typeof(TTicket).GetProperty("Title");
        var title = titleProperty?.GetValue(context.Entity) as string ?? "New Ticket";

        await _notificationService.SendEmailAsync(
            to: context.UserId.ToString(),
            subject: $"Ticket Created: {title}",
            body: $"Your support ticket has been created and assigned a ticket number.",
            cancellationToken);
    }
}
```

### 4. Deletion Safeguards (BeforeDelete)

Prevent deletion if constraints are violated:

```csharp
public class DeletionSafeguardRule<TCategory> : IRule<CrudContext<TCategory>>
    where TCategory : MEntity
{
    private readonly IQueryable<TCategory> _productsQuery;

    public DeletionSafeguardRule(MyDbContext dbContext)
        => _productsQuery = dbContext.Set<TCategory>();

    public HookPoint HookPoint => HookPoint.BeforeDelete;

    public async Task<RuleResult> EvaluateAsync(
        CrudContext<TCategory> context,
        FactBag facts,
        CancellationToken cancellationToken)
    {
        // Check if any products reference this category
        var hasProducts = await _productsQuery
            .AnyAsync(p => p.CategoryId == context.Entity.EntityId, cancellationToken);

        if (hasProducts)
        {
            var error = "Cannot delete category with active products";
            context.ValidationErrors.Add(error);
            context.CancelOperation = true;
            context.CancellationReason = error;

            return RuleResult.Failure(error);
        }

        return await Task.FromResult(RuleResult.Passed());
    }

    public Task ExecuteAsync(CrudContext<TCategory> context, CancellationToken cancellationToken)
        => Task.CompletedTask;
}
```

## Hook Points Reference

| Hook Point | When | Use Case | Can Cancel? |
|-----------|------|----------|------------|
| **BeforeCreate** | Before INSERT, before SaveChangesAsync | Validate input | Yes |
| **AfterCreate** | After INSERT, after SaveChangesAsync | Send notification, quota deduction | No* |
| **BeforeUpdate** | Before UPDATE, before SaveChangesAsync | Validate changes, prevent overwrite | Yes |
| **AfterUpdate** | After UPDATE, after SaveChangesAsync | Log changes, notify stakeholders | No* |
| **BeforeDelete** | Before DELETE, before SaveChangesAsync | Prevent deletion, validate constraints | Yes |
| **AfterDelete** | After DELETE, after SaveChangesAsync | Clean up references, audit | No* |

\* _After hooks run after persistence — the operation cannot be rolled back. Use Before hooks for validation._

## Error Handling

### Validation Errors (Before Hooks)

If a Before hook adds validation errors, the operation is cancelled:

```csharp
if (context.ValidationErrors.Count > 0)
{
    return BadRequest(new { error = string.Join("; ", context.ValidationErrors) });
}
```

### Explicit Cancellation

Set `context.CancelOperation = true` to stop execution:

```csharp
if (someConstraint)
{
    context.CancelOperation = true;
    context.CancellationReason = "Business rule prevents this action";
    return RuleResult.Failure(context.CancellationReason);
}
```

### After Hook Exceptions

Exceptions in After hooks are logged but don't fail the request (entity already persisted):

```csharp
try
{
    await _notificationService.SendEmailAsync(...);
}
catch (Exception ex)
{
    // Logged, but won't roll back the operation
    _logger.LogWarning(ex, "Notification failed for entity {0}", context.Entity.EntityId);
}
```

## Accessing Dependencies

Use constructor injection to access services in your rules:

```csharp
public class ComplexRule<TEntity> : IRule<CrudContext<TEntity>>
    where TEntity : MEntity
{
    private readonly MyDbContext _dbContext;
    private readonly ILogger<ComplexRule<TEntity>> _logger;
    private readonly IExternalService _externalService;

    public ComplexRule(MyDbContext dbContext, ILogger<ComplexRule<TEntity>> logger, IExternalService externalService)
    {
        _dbContext = dbContext;
        _logger = logger;
        _externalService = externalService;
    }

    public async Task<RuleResult> EvaluateAsync(
        CrudContext<TEntity> context,
        FactBag facts,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation("Evaluating rule for {Entity}", typeof(TEntity).Name);

        // Access database
        var relatedData = await _dbContext.Set<RelatedEntity>()
            .Where(x => x.ParentId == context.Entity.EntityId)
            .ToListAsync(cancellationToken);

        // Call external service
        var externalCheck = await _externalService.ValidateAsync(context.Entity.EntityId, cancellationToken);

        return externalCheck
            ? RuleResult.Passed()
            : RuleResult.Failure("External validation failed");
    }

    public Task ExecuteAsync(CrudContext<TEntity> context, CancellationToken cancellationToken)
        => Task.CompletedTask;
}
```

## Performance Considerations

1. **Order matters** — Rules execute in Order sequence. Place quick validations first.
2. **Database queries in Evaluate** — Acceptable for Before hooks (operation not yet persisted)
3. **Minimize After hook queries** — After hooks run after persistence; avoid expensive lookups
4. **Cache frequently-checked data** — Use `context.Metadata` to share state between rules
5. **Keep Execute phase minimal** — Offload long-running work to background jobs

## Testing Auto CRUD Rules

```csharp
[TestClass]
public class ProductValidationRuleTests
{
    [TestMethod]
    public async Task Evaluate_WhenPriceIsNegative_ReturnsFailure()
    {
        // Arrange
        var rule = new ProductValidationRule<ProductEntity>();
        var context = new CrudContext<ProductEntity>
        {
            Entity = new ProductEntity { Name = "Widget", Price = -50m, Stock = 100 }
        };
        var factBag = new FactBag();

        // Act
        var result = await rule.EvaluateAsync(context, factBag, CancellationToken.None);

        // Assert
        Assert.IsFalse(result.Passed);
        Assert.IsTrue(context.ValidationErrors.Any(e => e.Contains("Price")));
    }
}
```

## Related Documentation

- [Rule Engine Guide](rule-engine-guide.md) — Core rule execution pipeline and orchestration
- [Rule Hooks Guide](rule-engine-hooks-guide.md) — Hook points and lifecycle management
- [FactBag and Context](rule-engine-factbag.md) — Passing data through rule execution
- [Decision Tables](decision-tables.md) — Table-driven business logic

## Summary

Auto CRUD Rules enable powerful, declarative business logic within your REST API without requiring custom controller code. By separating concerns into focused, reusable rules, you gain:

- **Maintainability** — Rules are small, testable, single-purpose
- **Reusability** — Same rule validates in API, RPC, and workflow contexts
- **Transparency** — Business rules are explicit and discoverable
- **Control** — Fine-grained hook points for before/after operations
- **Safety** — Built-in validation error aggregation and operation cancellation
