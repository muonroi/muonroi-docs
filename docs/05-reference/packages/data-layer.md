---
title: Data Layer Packages
sidebar_label: Data Layer
sidebar_position: 5
---

# Data Layer Packages

The Muonroi data layer provides a comprehensive abstraction for building multi-tenant, auditable, and transactional applications with support for EF Core, Dapper, and domain event patterns. Core features include automatic soft-delete, timestamp management, unit-of-work coordination, and domain event dispatching.

## Muonroi.Data.Abstractions

**NuGet:** `Muonroi.Data.Abstractions` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Defines the foundational interfaces and marker types used throughout the data layer. Consumed by both EF Core and Dapper implementations, this package establishes contracts for repositories, queries, unit-of-work, entities, and audit patterns.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `IEntityBase<TKey>` | Interface | Marker for typed primary key entities. Consumed entities implement this without inheriting from `MEntity`. |
| `IAuditable` | Interface | Tracks creation and modification timestamps (`CreatedDate`, `UpdatedDate`). |
| `IAuditable<TUserKey>` | Interface | Extends audit with user tracking (`CreatedBy`, `UpdatedBy`). |
| `ISiteScoped` | Interface | Marks entities as site-scoped (schema-divergent multi-tenancy by `SiteCode`). |
| `IMRepositoryBase<T>` | Interface | Base repository contract for any entity implementing `IEntityBase`. Methods: `Add()`, `UpdateAsync()`, `DeleteAsync()`, batch operations (`AddBatchAsync()`, `DeleteBatchAsync()`), transactions, soft-restore, and stored procedures. |
| `IMUnitOfWork` | Interface | Coordinates saves across repositories. Provides `SaveChangesAsync()` for persistence and `SaveEntitiesAsync()` for unit-of-work with domain event dispatch. |
| `IMDataContext` | Interface | Marker for DbContext implementations that can save changes. |
| `IMQueries<T>` | Interface | Query abstraction (typed for `MEntity`). Methods: `GetByIdAsync()`, `GetByGuidAsync()`, `GetAllAsync()`, paged results via `GetPagedAsync<TDto>()`, existence checks, and counts. |
| `MultiDbUnitOfWork` | Class | Coordinates multiple DbContexts in a single transaction boundary. |

### DI Registration

```csharp
// In Program.cs, register the DbContext with permission and auth setup:
services.AddDbContextConfigure<MyDbContext, MyPermissionEnum>(configuration);
```

The helper method `AddDbContextConfigure` handles:
- Database provider selection (SQL Server, PostgreSQL, MySQL, SQLite, MongoDB)
- Connection string resolution and decryption
- Permission sync service registration
- EF Core query filter setup (soft-delete, multi-tenancy, creator filters)
- License guard initialization

### Usage Example

```csharp
// Inject repository and unit of work
public class UserService(IRepository<MUser> userRepo)
{
    public async Task CreateUserAsync(string username)
    {
        var user = new MUser { Username = username };
        userRepo.Add(user);
        
        // Save changes — timestamps and creator ID are auto-populated
        await userRepo.UnitOfWork.SaveChangesAsync();
    }
    
    public async Task CreateAndPublishAsync(string username)
    {
        var user = new MUser { Username = username };
        user.AddDomainEvent(new UserCreatedEvent(user.EntityId));
        userRepo.Add(user);
        
        // Save AND dispatch events in one transaction
        var txId = await userRepo.UnitOfWork.SaveEntitiesAsync();
    }
}
```

---

## Muonroi.Data.EntityFrameworkCore

**NuGet:** `Muonroi.Data.EntityFrameworkCore` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Provides EF Core implementations of the data layer abstractions. Includes the base `MDbContext`, `MRepository<T>`, `MQuery<T>`, and built-in models for identity, permissions, roles, and users. Also defines query filters for multi-tenancy and soft-delete, along with entity configurations and migration management.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MDbContext` | Class | Base DbContext extending `DbContext` and implementing `IMUnitOfWork`, `IMDataContext`, `ITransactionalRuleContext`. Manages automatic timestamps, soft-delete filters, multi-tenant scoping, creator filters, domain event tracking, and transaction lifecycle. |
| `MRepository<T>` | Class | Generic repository for `MEntity`-derived types. Provides CRUD, batch, and transactional methods. Filters deleted rows automatically. Checks license on each operation. |
| `MQuery<T>` | Class | Read-only query handler. Uses `AsNoTracking()` by default. Exposes `Queryable` for LINQ composition. |
| `MEntity` | Class | Base entity with snowflake ID (`EntityId: Guid`), integer ID (`Id: int`), audit timestamps, soft-delete flag, domain events collection, and creator tracking. |
| `MDbContextBase` | Class | Abstract base for custom DbContexts. Used when you want to inherit query filter and configuration logic without using `MDbContext` directly. |
| `MDbContextConfiguration` | Class | Extension method `AddDbContextConfigure<TDbContext, TPermission>()` that wires up EF Core, handles all database providers, and registers auth/permission services. |
| Identity Models | Classes | `MUser`, `MRole`, `MPermission`, `MUserRole`, `MRolePermission`, `MRefreshToken`, `MUserToken`, `MUserLoginAttempt`, `MLanguage`, `MPermissionGroup`, `MPermissionAuditLog`, `MTenantQuota`, `MTenantQuotaUsage`, `MWebAuthnCredential`. |
| EF Configurations | Classes | `IEntityTypeConfiguration<T>` implementations for all identity models. Registered via `ApplyConfiguration()` in `OnModelCreating()`. |
| `CustomColumnOrderConvention` | Class | EF convention ensuring consistent column ordering in migrations (core columns first, then overrides). |
| `ModelBuilderUtcExtension` | Class | Extension `.UseUtcDateTime()` configures all `DateTime` properties to use UTC storage. |
| Database Configurators | Classes | `IDbContextConfigurator` implementations for each provider: `SqlServerDbContextConfigurator`, `PostgreSqlDbContextConfigurator`, `MySqlDbContextConfigurator`, `SqliteDbContextConfigurator`, `MongoDbContextConfigurator`. |
| `AuthenticateRepository` | Class | Repository for identity operations (login, token generation, password verification). |
| `DefaultRefreshTokenValidator` | Class | Token refresh validation. Implements `IRefreshTokenValidator`. |
| `PermissionSyncService` | Class | Syncs permission definitions from the assembly with the database at startup. |
| `InitialHostDbBuilder` | Class | Seeding logic for initial host database setup. |
| `HostRoleAndUserCreator` | Class | Creates default host admin role and user if missing. |
| `LicenseSaveChangesInterceptor` | Class | EF Core `ISaveChangesInterceptor` that enforces license checks on every save operation. |

### Query Filters

`MDbContext.OnModelCreating()` applies three filters to all `MEntity`-derived entities:

1. **Soft-Delete Filter**: `e.IsDeleted == false` — automatically excludes soft-deleted rows.
2. **Tenant Filter** (if `ITenantScoped`): `e.TenantId == TenantContext.CurrentTenantId OR AllowCrossTenantAccess`. Fail-closed: null tenant never matches.
3. **Creator Filter** (exempt list: identity models): `e.CreatorUserId == UserContext.CurrentUserGuid OR AllowCrossTenantAccess`. Allows users to see only their own entities unless admin mode enabled.

All filters bypass when `TenantContext.AllowCrossTenantAccess == true` (admin operations). In-memory databases always bypass tenant/creator filters to facilitate unit testing.

### DI Registration

```csharp
// Program.cs
services.AddDbContextConfigure<MyDbContext, MyPermissionEnum>(configuration);

// Optional: register custom repository
services.TryAddScoped<IRepository<MyEntity>, MyEntityRepository>();

// Optional: register custom query handler
services.TryAddScoped<IMQueries<MyEntity>, MyEntityQueries>();
```

### Configuration

```json
{
  "DatabaseConfigs": {
    "DbType": "SqlServer",
    "ConnectionString": "Server=localhost;Database=myapp;...",
    "IsFromSecret": false
  },
  "TenantConnectionStrings": {
    "tenant1": "Server=localhost;Database=tenant1;...",
    "tenant2": "Server=localhost;Database=tenant2;..."
  },
  "MultiTenant": {
    "Enabled": true,
    "DefaultTenantId": "default"
  }
}
```

### Usage Example

```csharp
// Entity with soft-delete and audit
public class Product : MEntity
{
    public string Name { get; set; }
    public decimal Price { get; set; }
}

// Entity with multi-tenancy
public class SalesOrder : MEntity, ITenantScoped
{
    public string TenantId { get; set; }
    public string OrderNumber { get; set; }
    public List<OrderItem> Items { get; set; }
}

// Custom repository
public class ProductRepository(
    MDbContext dbContext,
    IAuthenticateInfoContext authContext,
    ILicenseGuard licenseGuard,
    IMDateTimeService dateTimeService)
    : MRepository<Product>(dbContext, authContext, licenseGuard, dateTimeService)
{
    public async Task<List<Product>> GetExpensiveAsync(decimal threshold)
    {
        return await Queryable
            .Where(p => p.Price > threshold)
            .OrderByDescending(p => p.Price)
            .ToListAsync();
    }
}

// Service usage
public class ProductService(ProductRepository productRepo, IMediator mediator)
{
    public async Task CreateProductAsync(string name, decimal price)
    {
        var product = new Product { Name = name, Price = price };
        
        // Add domain event
        product.AddDomainEvent(new ProductCreatedEvent(product.EntityId, name));
        
        productRepo.Add(product);
        
        // Save and dispatch events
        var txId = await productRepo.UnitOfWork.SaveEntitiesAsync();
        
        return product;
    }

    public async Task<MPagedResult<ProductDto>> SearchAsync(
        string keyword, int pageIndex, int pageSize)
    {
        var query = productRepo.Queryable;
        
        if (!string.IsNullOrWhiteSpace(keyword))
            query = query.Where(p => p.Name.Contains(keyword));
        
        return await MQuery<Product>(dbContext, authContext, licenseGuard)
            .GetPagedAsync(
                query,
                pageIndex,
                pageSize,
                p => new ProductDto 
                { 
                    Id = p.Id, 
                    Name = p.Name, 
                    Price = p.Price 
                },
                orderBy: q => q.OrderBy(p => p.Name));
    }

    public async Task DeleteProductAsync(int productId)
    {
        var product = await productRepo.Queryable
            .SingleOrDefaultAsync(p => p.Id == productId);
        
        if (product != null)
        {
            await productRepo.DeleteAsync(product);
            // Delete is soft — IsDeleted = true, DeletionTime and DeletedUserId set
        }
    }
}

// Transaction usage
public async Task TransferAsync(int fromOrderId, int toOrderId)
{
    var tx = await dbContext.BeginTransactionAsync();
    try
    {
        var fromOrder = await orderRepo.Queryable
            .FirstOrDefaultAsync(o => o.Id == fromOrderId);
        var toOrder = await orderRepo.Queryable
            .FirstOrDefaultAsync(o => o.Id == toOrderId);
        
        // Business logic
        fromOrder.Items.Clear();
        toOrder.Items.AddRange(fromOrder.Items);
        
        await orderRepo.UpdateAsync(fromOrder);
        await orderRepo.UpdateAsync(toOrder);
        
        await dbContext.CommitTransactionAsync(tx);
    }
    catch
    {
        dbContext.RollbackTransaction();
        throw;
    }
}
```

### Domain Events

Entities track pending domain events via `DomainEvents` collection. After persistence, `MDbContext.SaveEntitiesAsync()` dispatches all events through MediatR:

```csharp
// Entity publishes event
public class MUser : MEntity
{
    public void SetPassword(string newPassword)
    {
        Password = HashPassword(newPassword);
        AddDomainEvent(new PasswordChangedEvent(this.EntityId));
    }
}

// Event handler receives notification
public class PasswordChangedEventHandler : INotificationHandler<PasswordChangedEvent>
{
    public async Task Handle(PasswordChangedEvent notification, CancellationToken ct)
    {
        // Send email, log audit, etc.
    }
}
```

---

## Muonroi.Data.Dapper

**NuGet:** `Muonroi.Data.Dapper` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Provides low-level ADO.NET and Dapper integration for high-performance queries, bulk operations, and direct SQL execution. Used alongside EF Core for read-heavy workloads, analytics, and stored procedure calls.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MDapperRepositoryBase<T>` | Class | Abstract base for Dapper repositories. Provides `CreateCommand()` helper that auto-injects `TenantId` parameter from tenant context. Methods for logging errors and accessing tenant context. |
| `MDapperCommand` | Class | Container for a SQL command: `CommandText`, `Parameters` (DynamicParameters), `Transaction`, `CommandType`. |
| `MDapperExtensions` | Class | Extension methods for `IDbConnection` and Dapper integration. Provides `QueryAsync`, `ExecuteAsync` helpers with automatic tenant resolution. |
| `MConnectionStringProvider` | Interface | Resolves read/write connection strings per tenant. Consumed by Dapper repositories. |
| `MTrimStringHandler` | Class | Dapper type handler for automatic string trimming on deserialization. |
| `MProtobufTimestampHandler` | Class | Dapper type handler for Google Protobuf Timestamp conversion. |
| `MStringConverter` | Class | EF Core value converter for encrypted string storage. |
| `MSqlMapperTypeExtensions` | Class | Dapper extensions for complex type mapping. |

### DI Registration

```csharp
// For Dapper read-write split (when using multi-site Dapper):
services.AddSiteDapperInfrastructure(options =>
{
    options.WriteConnectionString = "server=db;database=write;...";
    options.ReadConnectionString = "server=read-replica;database=read;...";
});

// Register a custom Dapper repository
services.TryAddScoped<IOrderRepository, OrderDapperRepository>();
```

### Usage Example

```csharp
public interface IOrderRepository
{
    Task<List<OrderDto>> GetActiveOrdersAsync(CancellationToken ct);
    Task<int> BulkUpdateStatusAsync(List<int> orderIds, string status);
}

public class OrderDapperRepository(
    IDbConnection connection,
    ITenantContext tenantContext,
    IMLog<OrderDapperRepository>? logger)
    : MDapperRepositoryBase<OrderDapperRepository>(tenantContext, logger), 
      IOrderRepository
{
    public async Task<List<OrderDto>> GetActiveOrdersAsync(CancellationToken ct)
    {
        var cmd = CreateCommand(@"
            SELECT Id, OrderNumber, Status, TotalAmount
            FROM Orders
            WHERE TenantId = @TenantId AND Status = @Status AND IsDeleted = 0
            ORDER BY CreatedDate DESC", 
            new { Status = "Active" });
        
        try
        {
            var orders = await connection.QueryAsync<OrderDto>(
                cmd.CommandText, 
                cmd.Parameters, 
                commandType: cmd.CommandType);
            return orders.ToList();
        }
        catch (Exception ex)
        {
            LogError(ex, cmd.CommandText);
            throw;
        }
    }

    public async Task<int> BulkUpdateStatusAsync(List<int> orderIds, string status)
    {
        var cmd = CreateCommand(@"
            UPDATE Orders 
            SET Status = @Status, LastModificationTime = @Now
            WHERE Id IN (SELECT value FROM STRING_SPLIT(@Ids, ','))
            AND TenantId = @TenantId",
            new { Status = status, Now = DateTime.UtcNow, Ids = string.Join(",", orderIds) });
        
        try
        {
            return await connection.ExecuteAsync(
                cmd.CommandText, 
                cmd.Parameters, 
                commandType: cmd.CommandType);
        }
        catch (Exception ex)
        {
            LogError(ex, cmd.CommandText);
            throw;
        }
    }
}

// Usage
public class OrderService(IOrderRepository orderRepo)
{
    public async Task<List<OrderDto>> GetActiveOrdersAsync()
    {
        return await orderRepo.GetActiveOrdersAsync(CancellationToken.None);
    }
}
```

---

## Muonroi.Data.EntityFrameworkCore.Events

**NuGet:** `Muonroi.Data.EntityFrameworkCore.Events` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Extends EF Core with outbox and inbox patterns for reliable event publishing and message idempotence in distributed systems. Provides saga support for choreography-based workflows and ensures events are persisted in the same transaction as business changes.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MEventOutboxDbContext` | Class | Extends `MDbContext` and implements `IEventOutboxStore`. Holds `OutboxEvents: DbSet<EventOutbox>` and `MessageInbox: DbSet<MessageInbox>` for transactional event and message tracking. |
| `EventOutbox` | Class | Outbox entry: `Id`, `EventName`, `EventType`, `EventContent` (JSON), `Status` (pending/processed/failed), `ErrorMessage`, `CreationTime`, `ProcessedTime`. Used for deferred publishing. |
| `MessageInbox` | Class | Inbox entry: `MessageId` (idempotency key), `ConsumerName`, received timestamp. Prevents duplicate processing of the same message by multiple consumers. |
| `IEventOutboxStore` | Interface | Contract for outbox storage: `AddAsync(outbox)`, `EventOutboxes: IQueryable<EventOutbox>`. |
| `MSagaDbContext` | Class | Saga persistence context. Extends `MEventOutboxDbContext` for workflow state tracking and compensation. |
| `SharedDbContextFactory` | Class | Factory creating shared DbContext instances for transactional outbox + business changes in one call. |
| `MuonroiSagaServiceCollectionExtensions` | Class | Extension `.AddMuonroiSaga()` wires up Saga services: outbox workers, inbox processors, and event handlers. |
| `MDbContextOutboxExtensions` | Class | Extension `.AddOutboxSupport()` configures outbox interceptor and background workers on a DbContext. |

### Configuration Pattern

```csharp
// Program.cs
services.AddMuonroiSaga()
    .AddSagaDbContext<OrderSagaDbContext>(options =>
    {
        options.UseSqlServer(configuration.GetConnectionString("DefaultConnection"),
            sqlOptions => sqlOptions.MigrationsAssembly("MyApp.Migrations"));
    })
    .AddSagaHandlers(typeof(Program).Assembly);
```

### Database Schema

```sql
-- Outbox table
CREATE TABLE EventOutbox (
    Id BIGINT PRIMARY KEY,
    EventName NVARCHAR(512) NOT NULL,
    EventType NVARCHAR(512) NOT NULL,
    EventContent NVARCHAR(MAX) NOT NULL,
    Status INT NOT NULL, -- 0=Pending, 1=Processed, 2=Failed
    ErrorMessage NVARCHAR(2000),
    CreationTime DATETIME2 NOT NULL,
    ProcessedTime DATETIME2 NULL,
    TenantId NVARCHAR(256)
);
CREATE INDEX IX_EventOutbox_Status ON EventOutbox(Status);
CREATE INDEX IX_EventOutbox_CreationTime ON EventOutbox(CreationTime);

-- Inbox table
CREATE TABLE MessageInbox (
    MessageId UNIQUEIDENTIFIER PRIMARY KEY,
    ConsumerName NVARCHAR(256) NOT NULL,
    ReceivedTime DATETIME2 NOT NULL
);
```

### Usage Example

```csharp
// Domain event
public record OrderPlacedEvent(Guid OrderId, string CustomerName, decimal Total) : IDomainEvent;

// Entity with outbox-tracked event
public class Order : MEntity, ITenantScoped
{
    public string TenantId { get; set; }
    public string OrderNumber { get; set; }
    public string CustomerName { get; set; }
    public decimal Total { get; set; }
    
    public static Order Create(string customerName, decimal total)
    {
        var order = new Order 
        { 
            OrderNumber = Guid.NewGuid().ToString("N")[..8],
            CustomerName = customerName,
            Total = total
        };
        
        // Event is added to domain events and outbox
        order.AddDomainEvent(new OrderPlacedEvent(order.EntityId, customerName, total));
        return order;
    }
}

// Saga context
public class OrderSagaDbContext(
    DbContextOptions<OrderSagaDbContext> options,
    IMediator mediator,
    ILicenseGuard licenseGuard = null)
    : MEventOutboxDbContext(options, mediator, licenseGuard)
{
    public DbSet<Order> Orders { get; set; }
    
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        
        modelBuilder.Entity<Order>(entity =>
        {
            entity.ToTable("Orders");
            entity.HasKey(o => o.Id);
            entity.Property(o => o.OrderNumber).HasMaxLength(50).IsRequired();
            entity.Property(o => o.CustomerName).HasMaxLength(200).IsRequired();
            entity.HasIndex(o => o.TenantId);
            entity.HasIndex(o => o.OrderNumber).IsUnique();
        });
    }
}

// Event handler
public class OrderPlacedEventHandler : INotificationHandler<OrderPlacedEvent>
{
    private readonly IPaymentService _paymentService;
    private readonly IMLog<OrderPlacedEventHandler> _logger;

    public async Task Handle(OrderPlacedEvent notification, CancellationToken ct)
    {
        _logger.Info("Processing order {OrderId} for {Customer}", 
            notification.OrderId, notification.CustomerName);
        
        try
        {
            await _paymentService.ChargeCreditCardAsync(
                notification.OrderId, notification.Total, ct);
        }
        catch (Exception ex)
        {
            _logger.Error(ex, "Payment failed for order {OrderId}", notification.OrderId);
            // Outbox marks as failed; worker will retry
            throw;
        }
    }
}

// Saga orchestration (if using choreography)
public class OrderSagaOrchestrator(
    OrderSagaDbContext dbContext,
    IMediator mediator)
{
    public async Task PlaceOrderAsync(OrderRequest request, CancellationToken ct)
    {
        // Create order (adds event to outbox in same transaction)
        var order = Order.Create(request.CustomerName, request.Total);
        dbContext.Orders.Add(order);
        
        // Persist order + outbox entry
        await dbContext.SaveEntitiesAsync(ct);
        
        // Background worker picks up outbox and publishes to event bus
        // Downstream services consume event, process independently
    }
}
```

### Outbox Worker Pattern

Background service picks up outbox entries and publishes them:

```csharp
public class OutboxWorker : BackgroundService
{
    private readonly IServiceProvider _serviceProvider;
    
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            using var scope = _serviceProvider.CreateScope();
            var dbContext = scope.ServiceProvider.GetRequiredService<OrderSagaDbContext>();
            
            var pending = await dbContext.OutboxEvents
                .Where(e => e.Status == EventOutboxStatus.Pending)
                .Take(100)
                .ToListAsync(stoppingToken);
            
            foreach (var outbox in pending)
            {
                try
                {
                    // Publish to event bus (RabbitMQ, Kafka, etc.)
                    var eventType = Type.GetType(outbox.EventType);
                    var @event = JsonSerializer.Deserialize(outbox.EventContent, eventType);
                    
                    await _mediator.Publish(@event, stoppingToken);
                    
                    outbox.Status = EventOutboxStatus.Processed;
                    outbox.ProcessedTime = DateTime.UtcNow;
                }
                catch (Exception ex)
                {
                    outbox.Status = EventOutboxStatus.Failed;
                    outbox.ErrorMessage = ex.Message;
                }
            }
            
            await dbContext.SaveChangesAsync(stoppingToken);
            await Task.Delay(TimeSpan.FromSeconds(5), stoppingToken);
        }
    }
}
```

---

## Muonroi.EntityFrameworkCore.Configuration

**NuGet:** `Muonroi.EntityFrameworkCore.Configuration` | **Tier:** OSS | **Distribution:** NuGet.org

### Purpose

Provides composable entity configuration templates for EF Core. Supports core column/index definitions shared across all sites and site-specific overrides for schema divergence in multi-site deployments.

### Key Types

| Type | Kind | Purpose |
|------|------|---------|
| `MEntityConfigurationBase<TEntity>` | Class | Abstract template for entity configuration. Implements `IEntityTypeConfiguration<T>`. Calls five template methods in order: `ConfigureTable()` → `ConfigureCoreColumns()` → `ConfigureCoreIndexes()` → `ConfigureSiteColumns()` → `ConfigureSiteIndexes()`. |
| `SiteColumnAttribute` | Attribute | Marks a property as site-specific. Used for column metadata discovery and site-specific column map generation. |
| `SiteColumnExtensions` | Class | Helper methods for reading `[SiteColumn]` metadata from property info. |

### Template Pattern

```csharp
// Core configuration (shared by all sites)
public abstract class ProductConfiguration : MEntityConfigurationBase<Product>
{
    protected override void ConfigureTable(EntityTypeBuilder<Product> builder)
    {
        builder.ToTable("Products");
        builder.HasKey(p => p.Id);
    }

    protected override void ConfigureCoreColumns(EntityTypeBuilder<Product> builder)
    {
        builder.Property(p => p.Sku)
            .HasColumnName("SKU")
            .HasMaxLength(50)
            .IsRequired();
        
        builder.Property(p => p.Name)
            .HasMaxLength(200)
            .IsRequired();
        
        builder.Property(p => p.Price)
            .HasPrecision(18, 2);
    }

    protected override void ConfigureCoreIndexes(EntityTypeBuilder<Product> builder)
    {
        builder.HasIndex(p => p.Sku).IsUnique();
        builder.HasIndex(p => p.Name);
    }

    // Site overrides — NOT called in core site
    protected override void ConfigureSiteColumns(EntityTypeBuilder<Product> builder) { }
    protected override void ConfigureSiteIndexes(EntityTypeBuilder<Product> builder) { }
}

// Site A extends: custom columns for site-specific requirements
public class SiteAProductConfiguration : ProductConfiguration
{
    protected override void ConfigureSiteColumns(EntityTypeBuilder<Product> builder)
    {
        // Map an additional column for Site A
        builder.Property(p => p.InternalProductCode)
            .HasColumnName("INTERNAL_CODE")
            .HasMaxLength(50);
    }

    protected override void ConfigureSiteIndexes(EntityTypeBuilder<Product> builder)
    {
        builder.HasIndex(p => p.InternalProductCode);
    }
}

// Site B extends: different column name
public class SiteBProductConfiguration : ProductConfiguration
{
    protected override void ConfigureSiteColumns(EntityTypeBuilder<Product> builder)
    {
        builder.Property(p => p.ExternalProductCode)
            .HasColumnName("EXT_CODE")
            .HasMaxLength(50);
    }
}
```

### Site-Specific Columns

```csharp
public class Product : MEntity, ISiteScoped
{
    public string SiteCode { get; set; }
    public string Sku { get; set; }
    public string Name { get; set; }
    public decimal Price { get; set; }
    
    [SiteColumn] // Mark as site-specific
    public string? InternalProductCode { get; set; }
    
    [SiteColumn]
    public string? ExternalProductCode { get; set; }
}
```

### DI Registration

```csharp
// In DbContext.OnModelCreating():
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);
    
    // Core configuration
    modelBuilder.ApplyConfiguration(new ProductConfiguration());
    
    // OR site-specific
    if (IsSiteA)
        modelBuilder.ApplyConfiguration(new SiteAProductConfiguration());
    else if (IsSiteB)
        modelBuilder.ApplyConfiguration(new SiteBProductConfiguration());
}

// Alternative: auto-discover all configurations
modelBuilder.ApplyConfigurationsFromAssembly(typeof(ProductConfiguration).Assembly);
```

### Usage Example

```csharp
// Entity definition
public class Order : MEntity, ISiteScoped
{
    public string SiteCode { get; set; }
    public string OrderNumber { get; set; }
    public string CustomerName { get; set; }
    public DateTime OrderDate { get; set; }
    
    [SiteColumn]
    public string? SiteInvoiceNumber { get; set; }
}

// Core configuration
public class OrderConfiguration : MEntityConfigurationBase<Order>
{
    protected override void ConfigureTable(EntityTypeBuilder<Order> builder)
    {
        builder.ToTable("Orders");
        builder.HasKey(o => o.Id);
    }

    protected override void ConfigureCoreColumns(EntityTypeBuilder<Order> builder)
    {
        builder.Property(o => o.OrderNumber)
            .HasMaxLength(50)
            .IsRequired();
        
        builder.Property(o => o.CustomerName)
            .HasMaxLength(200)
            .IsRequired();
        
        builder.Property(o => o.OrderDate).IsRequired();
    }

    protected override void ConfigureCoreIndexes(EntityTypeBuilder<Order> builder)
    {
        builder.HasIndex(o => new { o.SiteCode, o.OrderNumber }).IsUnique();
    }

    protected override void ConfigureSiteColumns(EntityTypeBuilder<Order> builder) { }
}

// Site-specific override
public class SiteSpecificOrderConfiguration : OrderConfiguration
{
    protected override void ConfigureSiteColumns(EntityTypeBuilder<Order> builder)
    {
        builder.Property(o => o.SiteInvoiceNumber)
            .HasColumnName("INVOICE_NO")
            .HasMaxLength(50);
    }

    protected override void ConfigureSiteIndexes(EntityTypeBuilder<Order> builder)
    {
        builder.HasIndex(o => o.SiteInvoiceNumber).IsUnique();
    }
}
```

---

## Integration Patterns

### Multi-Tenancy Setup

```csharp
// appsettings.json
{
  "DatabaseConfigs": {
    "DbType": "SqlServer"
  },
  "TenantConnectionStrings": {
    "tenant-1": "Server=db1;Database=app_t1;...",
    "tenant-2": "Server=db2;Database=app_t2;..."
  },
  "MultiTenant": {
    "Enabled": true
  }
}

// Program.cs
services.AddDbContextConfigure<AppDbContext, AppPermissions>(configuration);

// Middleware
app.UseMiddleware<TenantResolutionMiddleware>();

// Entity with tenant scoping
public class Invoice : MEntity, ITenantScoped
{
    public string TenantId { get; set; } // Auto-filtered by query
    public string InvoiceNumber { get; set; }
}
```

### Transaction Boundaries

```csharp
public class OrderService(MDbContext dbContext, IRepository<Order> orderRepo)
{
    public async Task ProcessOrderAsync(Order order)
    {
        // Option 1: Use SaveChangesAsync (simple persistence)
        orderRepo.Add(order);
        await orderRepo.UnitOfWork.SaveChangesAsync();
        
        // Option 2: Use SaveEntitiesAsync (with domain events)
        order.AddDomainEvent(new OrderProcessedEvent(order.EntityId));
        orderRepo.Add(order);
        var txId = await orderRepo.UnitOfWork.SaveEntitiesAsync();
        
        // Option 3: Explicit transaction control
        var tx = await dbContext.BeginTransactionAsync();
        try
        {
            // Multiple operations
            await orderRepo.AddBatchAsync(orders);
            await dbContext.CommitTransactionAsync(tx);
        }
        catch
        {
            dbContext.RollbackTransaction();
            throw;
        }
    }
}
```

### Soft-Delete and Restoration

```csharp
public class UserService(IRepository<MUser> userRepo)
{
    public async Task SoftDeleteUserAsync(int userId)
    {
        var user = await userRepo.Queryable
            .FirstOrDefaultAsync(u => u.Id == userId);
        
        if (user != null)
        {
            // Delete sets IsDeleted=true, DeletionTime, DeletedUserId
            await userRepo.DeleteAsync(user);
        }
    }

    public async Task RestoreUserAsync(int userId)
    {
        // Query includes deleted by default — switch context
        using var scope = TenantContext.AllowCrossAccess();
        var deleted = await userRepo.Queryable
            .IgnoreQueryFilters()
            .FirstOrDefaultAsync(u => u.Id == userId && u.IsDeleted);
        
        if (deleted != null)
        {
            // Restore
            await userRepo.SoftRestoreAsync(deleted);
        }
    }
}
```

---

## Best Practices

1. **Always use repositories**: Don't access `DbSet` directly in application code.
2. **Leverage query filters**: Trust that soft-delete and tenant filters are applied automatically.
3. **Use `SaveEntitiesAsync` for workflows**: When domain events must be published as part of the same business operation.
4. **Batch operations**: Use `AddBatchAsync()`, `DeleteBatchAsync()` for 100+ records.
5. **Explicit transactions**: Use `BeginTransactionAsync()` when coordinating multiple repositories.
6. **Dapper for analytics**: Use Dapper repositories for high-volume reads, reporting, and stored procedure calls.
7. **Entity configurations**: Keep core columns in base config, override in site-specific subclasses.
8. **License checks**: Repository operations enforce license automatically — no manual checks needed.

---

## See Also

- [Data Layer Guide](../../03-guides/integration/data-layer.md)
- [Multi-Tenancy Patterns](../../03-guides/multi-tenancy/multi-tenant-guide.md)
- [Domain Events & Sagas](../../03-guides/integration/messaging-guide.md)
