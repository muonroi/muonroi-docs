# Tổng quan kiến trúc

Tài liệu này cung cấp cái nhìn tổng quát về các thành phần chính trong thư viện và luồng xử lý cho việc xác thực, phân quyền và multi-tenant.

## 1. Luồng xác thực và phân quyền

```text
Request
  │
  ├─> JwtMiddleware
  │
  ├─> MAuthenMiddleware
  │
  └─> Controller ──[PermissionFilter]──> Action
```

1. **JwtMiddleware** giải mã JWT để lấy thông tin người dùng.
2. **MAuthenMiddleware** kiểm tra `TokenValidityKey` trên Redis và khởi tạo `MAuthenticateInfoContext`.
3. **PermissionFilter** xác thực quyền truy cập trước khi action được thực thi.

## 2. Luồng multi-tenant

```text
Request
  │
  └─> TenantContextMiddleware ──> TenantContext.CurrentTenantId
                                   │
                                   └─> MDbContext (lọc theo TenantId)
```

Middleware đọc `tenantId` từ header hoặc subdomain và gán vào `TenantContext`. Các truy vấn từ `MDbContext` sẽ tự động thêm điều kiện `TenantId` khi tồn tại.

## 3. Các bảng dữ liệu chính

- **MUsers**: thông tin tài khoản người dùng.
- **MRoles**: danh sách vai trò.
- **MPermissions**: danh sách quyền tương ứng với enum.
- **MRolePermissions**: liên kết vai trò - quyền.
- **MUserRoles**: liên kết người dùng - vai trò.
- **MRefreshTokens**: lưu refresh token của người dùng.

## 4. Kiến trúc phân lớp

```text
Presentation (API Controllers)
              │
Application Layer (Services, Handlers)
              │
Domain Layer (Entities, Aggregates)
              │
Infrastructure (EF Core, Redis, Kafka, ...)
```

- **Presentation**: gồm controllers, middlewares và các filter.
- **Application**: chứa logic nghiệp vụ, xử lý lệnh và truy vấn.
- **Domain**: định nghĩa entities, value objects và quy tắc nghiệp vụ cốt lõi.
- **Infrastructure**: cung cấp các triển khai như EF Core, Redis, Kafka/RabbitMQ.

## 5. Các thành phần bổ trợ

- **Caching**: sử dụng Redis để lưu trữ dữ liệu tạm thời.
- **Background Jobs**: Hangfire hoặc Quartz đảm nhiệm các tác vụ chạy nền.
- **Message Bus**: Kafka hoặc RabbitMQ thông qua MassTransit hỗ trợ giao tiếp bất đồng bộ.

## 6. Tham khảo thêm

- [Hướng dẫn Permission](/docs/guides/identity-access/permission-guide)
- [Hướng dẫn Multi-Tenant](/docs/guides/multi-tenancy/multi-tenant-guide)
- [Hướng dẫn Token](/docs/guides/identity-access/token-guide)
- [Cache Guide](/docs/guides/integration/cache-guide)
- [Background Jobs Guide](/docs/operations/background-jobs-guide)
- [Saga Pattern with Kafka](/docs/guides/integration/saga-kafka)
