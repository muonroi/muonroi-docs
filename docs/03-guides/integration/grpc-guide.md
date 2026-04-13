# gRPC Guide

Muonroi supports gRPC server and client registration for service-to-service communication.

## Register server and clients

In `Program.cs`, register the server and named clients:

```csharp
services.AddGrpcServer();
services.AddGrpcClients(configuration, new Dictionary<string, Type>
{
    { "SampleService", typeof(SampleGrpc.SampleGrpcClient) }
});
```

The target service endpoints are typically stored in `GrpcServicesConfig`:

```json
{
  "GrpcServicesConfig": {
    "Services": {
      "SampleService": {
        "Uri": "https://localhost:5001"
      }
    }
  }
}
```

Client forwarding defaults can also be configured centrally:

```json
{
  "GrpcServicesConfig": {
    "ClientDefaults": {
      "ForwardAuthToken": true,
      "ForwardTenantId": true
    },
    "Services": {
      "SampleService": {
        "Uri": "https://localhost:5001",
        "ForwardAuthToken": true
      }
    }
  }
}
```

`ForwardAuthToken` uses the current `ISystemExecutionContext.AccessToken`. `ForwardTenantId` uses `ISystemExecutionContext.TenantId`. Per-service values override the defaults.

## Wrap client calls

You can inherit from `BaseGrpcService` so outbound calls automatically carry common metadata such as correlation and tenant context.

```csharp
public class SampleGrpcService(
    MAuthenticateInfoContext auth,
    SampleGrpc.SampleGrpcClient client) : BaseGrpcService(auth)
{
    private readonly SampleGrpc.SampleGrpcClient _client = client;

    public Task<SampleReply> GetDataAsync(int id)
    {
        return CallGrpcServiceAsync(meta =>
            _client.GetDataAsync(new SampleRequest { Id = id }, meta));
    }
}
```

## Aggregator pattern

An aggregator service can depend on the wrapper and translate the gRPC result to an internal DTO.

```csharp
public class AggregatorService(SampleGrpcService sample)
{
    public async Task<MyDto> GetAsync(int id)
    {
        SampleReply reply = await sample.GetDataAsync(id);
        return new MyDto { Message = reply.Message };
    }
}
```

## Direct client factory usage

If needed, you can resolve a named client directly through `GrpcClientFactory`.

```csharp
public class AggregatorService(GrpcClientFactory factory, MAuthenticateInfoContext auth)
    : BaseGrpcService(auth)
{
    private readonly SampleGrpc.SampleGrpcClient _client =
        factory.CreateClient<SampleGrpc.SampleGrpcClient>("SampleService");
}
```

Use wrappers for repeated call patterns, retries, metadata propagation, and shared error handling. Use direct factory access only when a dedicated wrapper adds no value.

## Forwarded metadata

Track 8 adds `GrpcClientAuthInterceptor`, which appends outbound metadata from the current execution context when enabled:

- `authorization: Bearer <token>` when `ForwardAuthToken = true`
- `x-tenant-id` when `ForwardTenantId = true`
- `x-correlation-id` whenever a correlation id is present

Existing client metadata is preserved. The interceptor will not overwrite a header that the caller already supplied explicitly.
