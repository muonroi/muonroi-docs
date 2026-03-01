# Hướng dẫn Auth, AuthZ, BFF và Multi-Tenant

Tài liệu này mô tả cách cấu hình các module xác thực, phân quyền, BFF và đa tenant trong Muonroi Building Block.

**Tài liệu liên quan**

- [Token Guide](token-guide.md)
- [External Auth Guide](/docs/guides/identity-access/external-auth-guide)
- [BFF Guide](/docs/guides/identity-access/bff)
- [OPA Integration Guide](/docs/guides/integration/opa-integration-guide)

## Auth module (Authentication)

### Đăng ký middleware

```csharp
// Giải mã JWT và kiểm tra refresh token
app.UseMiddleware<JwtMiddleware>();
app.UseMiddleware<MAuthenMiddleware<MyDbContext, MyPermission>>();
// Tuỳ chọn xác thực cookie
app.UseMiddleware<MCookieAuthMiddleware>();
```

`JwtMiddleware` giải mã access token và gán thông tin vào `HttpContext`. `MAuthenMiddleware` dùng `TokenValidityKey` từ Redis để đảm bảo token hợp lệ.

`MCookieAuthMiddleware` hữu ích cho các ứng dụng BFF khi muốn lưu access token trong cookie an toàn. Khi `TokenConfigs.EnableCookieAuth` bật và header `Authorization` vắng mặt, middleware sẽ đọc cookie (mặc định là `AuthToken`), giải mã và đính kèm vào request.

Nếu muốn thiết lập nhanh, có thể dùng `app.UseDefaultMiddleware<MyDbContext, MyPermission>()` để tự động thêm `MExceptionMiddleware`, `MCookieAuthMiddleware` và `MAuthenMiddleware` theo đúng thứ tự.

### Phát hành token

```csharp
string access = MAuthenticateTokenHelper.CreateAccessToken(user);
```

### Các API sẵn có trong `MAuthControllerBase`

Controller cơ sở này cung cấp sẵn nhiều endpoint phục vụ quản lý người dùng và quyền hạn:

- `POST /login`, `POST /refresh-token`, `POST /logout`, `POST /logout-all`.
- `POST /register` để tạo tài khoản mới.
- `POST /create-role`, `POST /assign-role`, `POST /assign-permission`, `DELETE /remove-permission/{roleId}/{permissionId}`.
- `GET /roles`, `GET /permissions`, `GET /role-permissions/{roleId}`, `GET /user-permissions/{userId}`.
- `GET /permission-definitions` và `GET /permission-tree/{userId}` hỗ trợ đồng bộ và cache quyền cho frontend.

Các endpoint trên đều sử dụng cache `user_permissions:{userId}` để tăng hiệu năng. Khi thay đổi vai trò/quyền hãy xoá cache để dữ liệu cập nhật.

## Authorization (AuthZ)

Thêm filter kiểm tra quyền và attribute động:

```csharp
services.AddPermissionFilter<MyPermission>();
services.AddDynamicPermission<MyDbContext>();
```

Sử dụng `[AuthorizePermission(MyPermission.ViewUser)]` để hạn chế truy cập theo quyền.

## BFF

```csharp
services.AddBffAuthentication();
```

`AddBffAuthentication` cấu hình cookie `Secure`, `HttpOnly`, `SameSite=Strict` và đăng ký `ITokenStore` để lưu refresh token phía server.

`ITokenStore` là interface lưu trữ `refresh token`. Triển khai mặc định dùng `InMemoryTokenStore` chỉ phù hợp cho môi trường phát triển. Khi triển khai thực tế hãy cài đặt `ITokenStore` riêng (ví dụ lưu vào Redis hoặc database) và đăng ký vào DI.

Trong mô hình SPA + BFF, frontend chỉ giữ cookie xác thực. SPA gọi BFF, BFF lấy `access token` từ cookie, đọc `refresh token` từ `ITokenStore` khi cần và gọi API nội bộ. Điều này giúp token không xuất hiện trên trình duyệt và hạn chế tấn công XSS.

### OPA Authorization

Khi cần kiểm soát truy cập chi tiết hơn, tích hợp `OpaAuthorizationService` trước khi proxy tới dịch vụ downstream. Xem thêm [OPA Integration Guide](/docs/guides/integration/opa-integration-guide) để cấu hình OPA server và kết nối từ .NET.

## Multi-Tenant

```csharp
services.AddTenantContext(builder.Configuration);
app.UseMiddleware<TenantContextMiddleware>();
```

`TenantContextMiddleware` lấy `tenantId` từ claim, header hoặc subdomain và gán vào `TenantContext.CurrentTenantId`. Có thể cài `ITenantIdResolver` riêng nếu cần.

## Mẫu hoàn chỉnh

```csharp
WebApplicationBuilder builder = WebApplication.CreateBuilder(args);
builder.Services.AddBffAuthentication();
builder.Services.AddAuthorization();
builder.Services.AddPermissionFilter<MyPermission>();
builder.Services.AddTenantContext(builder.Configuration);

WebApplication app = builder.Build();
app.UseMiddleware<TenantContextMiddleware>();
app.UseMiddleware<JwtMiddleware>();
app.UseMiddleware<MAuthenMiddleware<MyDbContext, MyPermission>>();
```

Tham khảo thêm `Samples/AuthAuthzBff` để xem luồng đầy đủ kết hợp OIDC, OPA và BFF.

Xem thêm [BFF Guide](/docs/guides/identity-access/bff) và [OPA Integration Guide](/docs/guides/integration/opa-integration-guide) để biết cách cấu hình chi tiết.
