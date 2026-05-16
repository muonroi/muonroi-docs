# Gateway Integration Guide

Muonroi services can sit behind Kong, Azure API Management, YARP, or other reverse proxies as long as the gateway preserves the headers required for authentication, correlation, and tenant resolution.

## YARP + Muonroi service discovery (Microservices template)

The **Microservices template** includes a `Muonroi.Microservices.Gateway` project pre-configured with YARP. Service discovery is commented out by default; follow these steps to activate it.

### 1. Add the service discovery package

In `Muonroi.Microservices.Gateway.csproj`:

```xml
<PackageReference Include="Muonroi.AspNetCore" Version="*" />
```

### 2. Wire service discovery in Program.cs

```csharp
// Program.cs — Gateway project
var builder = WebApplication.CreateBuilder(args);

builder.Services
    .AddReverseProxy()
    .LoadFromConfig(builder.Configuration.GetSection("ReverseProxy"));

// Uncomment to enable Muonroi service discovery
// builder.Services.AddMServiceDiscovery(builder.Configuration, builder.Environment);
// TODO: verify exact AddMServiceDiscovery overload in Muonroi.AspNetCore

var app = builder.Build();
app.MapReverseProxy();
await app.RunAsync();
```

### 3. ReverseProxy appsettings block

Add to `appsettings.json` in the Gateway project:

```json
{
  "ReverseProxy": {
    "Routes": {
      "catalog-route": {
        "ClusterId": "catalog-cluster",
        "Match": { "Path": "/api/catalog/{**catch-all}" },
        "Transforms": [
          { "PathRemovePrefix": "/api/catalog" }
        ]
      }
    },
    "Clusters": {
      "catalog-cluster": {
        "Destinations": {
          "catalog/primary": {
            "Address": "http://localhost:5001"
          }
        }
      }
    }
  }
}
```

### Tenant header forwarding

The Gateway is the canonical point for injecting `X-Tenant-Id`. Add a YARP transform to forward the header resolved from the incoming request:

```json
{
  "Transforms": [
    { "RequestHeadersCopy": "true" },
    { "RequestHeader": "X-Tenant-Id", "Set": "{header:x-tenant-id}" }
  ]
}
```

Downstream services resolve the tenant from this forwarded header — no further configuration is required in the Catalog or Identity services.

## Core requirements

Your gateway should preserve or forward:

- `Authorization`
- Correlation headers used by your platform
- Tenant headers or host information when tenant resolution depends on them
- WebSocket upgrades for SignalR endpoints when applicable

## Kong example

Typical Kong setup:

1. Register the upstream service.
2. Create a route for the API path.
3. Add auth, rate limit, or IP filtering plugins as needed.

```bash
curl -i -X POST http://localhost:8001/services/ \
  --data name=my-service \
  --data url=http://localhost:5000
```

```bash
curl -i -X POST http://localhost:8001/services/my-service/routes \
  --data paths[]=/api
```

## Azure API Management example

Typical APIM flow:

1. Import the backend API from OpenAPI or define it manually.
2. Point the backend to the Muonroi service URL.
3. Apply policies for auth, headers, quotas, and transformations.
4. Publish the API through the managed gateway endpoint.

## Validation checklist

- Confirm bearer tokens arrive unchanged at the application.
- Confirm tenant resolution still works behind the gateway.
- Confirm SignalR and gRPC routes are handled explicitly if you expose them.
- Confirm rate limiting and retries do not break idempotency assumptions in your APIs.
