# Gateway Integration Guide

Muonroi services can sit behind Kong, Azure API Management, or other reverse proxies as long as the gateway preserves the headers required for authentication, correlation, and tenant resolution.

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
