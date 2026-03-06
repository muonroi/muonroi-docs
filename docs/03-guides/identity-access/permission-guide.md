# Permission System Guide

Muonroi provides a role-and-permission model built around enums, cached permission resolution, and API helpers for management screens.

## Define permissions

Permissions are usually declared as an enum. If you use bitmask evaluation, mark the enum with `[Flags]`.

```csharp
[Flags]
public enum MyPermission
{
    ViewUser   = 1 << 0,
    CreateUser = 1 << 1,
    UpdateUser = 1 << 2,
    DeleteUser = 1 << 3
}
```

`MPermissionExtension.CalculatePermissionsBitmask` aggregates these values into a `long`. That implies a practical limit of 64 distinct flags in one bitmask.

If your project needs more than 64 permissions, use one of these alternatives:

- Store permission names as claims or strings.
- Split permissions across multiple claims.
- Build a custom resolver backed by database metadata instead of a single bitmask.

## Register permission checks

Dynamic permission evaluation can be added through the built-in filter registration.

```csharp
services.AddDynamicPermission<MyDbContext>();
```

Then decorate controllers or actions with a permission requirement.

```csharp
[AuthorizePermission("User.View")]
public IActionResult GetUsers() => Ok();
```

Resolved permissions are commonly cached by user key, for example `user_permissions:{userId}`, to avoid repeated joins across users, roles, and permission tables.

## Resolution model

A user's effective permissions usually come from two sources:

- Direct user-to-permission assignments.
- Permissions granted through roles.

The stack exposes helpers such as `MAuthControllerBase` and `AuthService<TPermission, TDbContext>` for common identity-management endpoints.

The normal authentication flow is:

1. `JwtMiddleware` parses the token and assigns the principal.
2. `MAuthenMiddleware` verifies token validity state, often with Redis-backed checks.
3. The resolved identity and permissions become available to the request pipeline.

## Default tables

When you use the built-in auth and permission model, `MDbContext` commonly exposes these tables:

| Table | Purpose |
| --- | --- |
| `MUsers` | User accounts |
| `MRoles` | Role definitions |
| `MPermissions` | Permission metadata and enum mapping |
| `MRolePermissions` | Role-to-permission links |
| `MUserRoles` | User-to-role links |
| `MRefreshTokens` | Refresh tokens and token validity state |
| `MUserTokens` | External login tokens when enabled |
| `MUserLoginAttempts` | Login failure and lockout history |
| `MLanguages` | Optional localization metadata |
| `MPermissionGroups` | UI grouping for permissions |
| `MPermissionAuditLogs` | Optional permission audit trail |

These tables are created through the application's migrations and surfaced through `DbSet` properties on `MDbContext`.

## Frontend synchronization

Frontend clients should not hardcode the permission catalog. Instead, load it from the backend so the UI stays aligned with deployed policy data.

`MAuthControllerBase` commonly exposes a `permission-definitions` endpoint similar to:

```json
[
  {
    "groupName": "System",
    "groupDisplayName": "System",
    "permissions": ["Auth_All"]
  }
]
```

Load this during application startup or when the authenticated session changes.

## Checklist

- Keep permission names stable once clients depend on them.
- Do not exceed the 64-bit bitmask model unless you intentionally switch strategies.
- Clear permission caches after changing user roles or direct assignments.
- Prefer backend-driven permission definitions so UI and API policy stay in sync.
