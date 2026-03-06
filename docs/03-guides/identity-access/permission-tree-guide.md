# Permission Tree and UI Metadata

This guide explains how to attach UI metadata to permissions and expose the result as a tree for menus, tabs, and actions.

## Model permissions with UI metadata

Permissions still start as enum values:

```csharp
[Flags]
public enum MyPermission
{
    User_View   = 1 << 0,
    User_Create = 1 << 1,
    User_Edit   = 1 << 2,
    User_Delete = 1 << 3
}
```

Each permission can then be mapped to a row in `MPermissions` with metadata that the frontend can consume.

Important columns:

- `UiKey`: stable key used by the frontend.
- `ParentUiKey`: optional parent reference for tree construction.
- `Type`: UI node kind such as `Menu`, `Tab`, or `Action`.
- `Label`, `Icon`, `Url`, `Description`: display metadata.

Example metadata row:

```json
{
  "name": "User_Create",
  "uiKey": "user.create",
  "parentUiKey": "user",
  "type": "Action",
  "label": "Create User",
  "icon": "plus"
}
```

## API shape

`MAuthControllerBase` commonly exposes endpoints such as:

- `GET permission-definitions`
- `GET menu-metadata/{userId}`
- `GET permission-tree/{userId}`

The tree response typically looks like this:

```json
[
  {
    "uiKey": "user",
    "name": "User Management",
    "icon": "user",
    "url": "/user",
    "publish": false,
    "type": "menu",
    "children": [
      {
        "uiKey": "user.view",
        "name": "View List",
        "type": "action",
        "publish": false
      },
      {
        "uiKey": "user.create",
        "name": "Create User",
        "type": "button",
        "publish": false
      }
    ]
  }
]
```

## Frontend integration

A typical frontend flow is:

1. Authenticate the user.
2. Load `permission-tree/{userId}`.
3. Render menus, tabs, or buttons from `uiKey`, `type`, and display metadata.
4. Cache the tree client-side until the session or permission stamp changes.

Example:

```ts
constructor(private permissionService: PermissionService) {
  this.permissionService.load(userId);
}
```

```html
<button *appHasPermission="'user.create'">Create User</button>
```

This approach keeps UI navigation and actions driven by backend policy data instead of duplicated frontend configuration.
