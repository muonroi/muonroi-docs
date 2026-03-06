# Token Guide

Use the JWT bearer path plus token-state validation filter.

## Service registration

```csharp
services.AddValidateBearerToken<MyDbContext, MTokenInfo, MyPermission>(configuration);
services.AddAuthTokenValidation<MyDbContext, MyPermission>();
```

## Pipeline order

```csharp
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
```

## Refresh flow

- keep `POST /api/v1/auth/refresh-token` anonymous
- send the refresh token in the request body
- send the access token in `Authorization` so claims can still be read

## Context population

Successful validation should populate `MAuthenticateInfoContext` and execution-context data before protected handlers run.
