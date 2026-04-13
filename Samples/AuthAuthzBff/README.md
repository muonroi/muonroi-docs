# Auth + AuthZ + BFF sample

This sample demonstrates how to combine authentication, authorization and the backend-for-frontend (BFF) pattern.

## Flow

1. `GET /login` starts the OpenID Connect authorization code flow with PKCE and redirects to the identity provider.
2. `GET /callback` exchanges the code for tokens, stores the refresh token via `ITokenStore` and signs the user in with a cookie.
3. `GET /data` requires authentication and performs an additional check against an OPA policy before returning data.

Run the sample with:

```bash
dotnet run --project Samples/AuthAuthzBff
```

The OIDC and OPA endpoints in `Program.cs` are placeholders; adjust them to match your environment.
