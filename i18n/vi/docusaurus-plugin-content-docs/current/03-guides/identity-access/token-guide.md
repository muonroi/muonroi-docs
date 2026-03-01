# Hướng dẫn Token

Xem thêm [Hướng dẫn Auth/AuthZ/BFF](auth-module-guide.md) để biết cách cấu hình tổng thể.

`JwtMiddleware` giải mã JWT và gán thông tin người dùng vào `HttpContext`. `MAuthenMiddleware` kiểm tra khóa `TokenValidityKey` từ Redis để đảm bảo token còn hiệu lực.

```csharp
app.UseMiddleware<JwtMiddleware>();
app.UseMiddleware<MAuthenMiddleware<MyDbContext, MyPermission>>();
// Tuỳ chọn xác thực cookie
app.UseMiddleware<MCookieAuthMiddleware>();
```

### `MCookieAuthMiddleware`

Middleware này đọc access token được mã hoá trong cookie rồi gắn vào header `Authorization`. Rất hữu ích cho ứng dụng BFF khi muốn lưu token phía server và hạn chế lộ thông tin trên client. Bật tính năng này trong cấu hình token:

```json
"TokenConfigs": {
  "EnableCookieAuth": true,
  "CookieName": "AuthToken",
  "CookieSameSite": "Lax"
}
```

Sử dụng `MAuthenticateTokenHelper` để tạo access token và refresh token cho người dùng.

## Tuỳ biến kiểm tra refresh token

`DefaultRefreshTokenValidator` xác thực refresh token trực tiếp từ database và Redis. Bạn có thể cài đặt `IRefreshTokenValidator` riêng để tự định nghĩa luồng kiểm tra (ví dụ gọi API khác, lưu trên Redis hay dịch vụ bên thứ ba).

```csharp
services.AddScoped<IRefreshTokenValidator, MyRefreshTokenValidator>();
```

Service implement `ValidateAsync` trả về `MAuthenticateInfoContext` sau khi xác thực thành công.
