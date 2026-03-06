# SignalR Guide

Muonroi can register SignalR with tenant-aware connection filtering for multi-tenant real-time features.

## Register SignalR

```csharp
services.AddSignalRWithTenant(configuration);
```

This helper typically calls `services.AddSignalR()` and conditionally enables tenant filtering when multi-tenancy is active.

## Tenant-aware connections

When `MultiTenantConfigs:Enabled` is `true`, the hub filter resolves the tenant from claims, headers, or host-based resolution and applies it to the current connection scope.

If tenant resolution fails, the connection should be rejected instead of falling back to an undefined tenant context.

In new code, prefer request-scoped abstractions such as `ISystemExecutionContextAccessor` instead of reading static ambient context directly.

## Authentication

SignalR hubs commonly reuse the application's JWT setup. Browser clients can pass the token through the `access_token` query parameter during the initial negotiation if header-based transport is unavailable.

## Hub usage

Inside a hub, keep tenant and user checks explicit before broadcasting or mutating shared state.

```csharp
public class ChatHub(ISystemExecutionContextAccessor contextAccessor) : Hub
{
    private readonly ISystemExecutionContextAccessor _contextAccessor = contextAccessor;

    public Task SendMessage(string message)
    {
        string? tenantId = _contextAccessor.Get().TenantId;
        return Clients.All.SendAsync("Receive", tenantId, message);
    }
}
```

For control-plane-specific rule hot reload, see the dedicated control-plane SignalR documentation.
