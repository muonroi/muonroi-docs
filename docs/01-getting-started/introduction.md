# Giới thiệu

Muonroi Building Block là bộ thư viện hỗ trợ xây dựng các ứng dụng .NET theo kiến trúc sạch và dễ mở rộng. Dự án cung cấp sẵn nhiều thành phần như:

- **Dependency Injection** cấu hình sẵn.
- **Logging** với Serilog và khả năng đẩy log.
- **Middleware** xác thực và phân quyền dựa trên JWT.
- **Các lớp cơ sở** cho controller, handler và repository.
- **Hệ thống caching**, background job và message bus.
- **Rule engine** hỗ trợ rule C# và workflow JSON. Xem thêm: [Hướng dẫn Rule Engine](/docs/guides/rule-engine/rule-engine-guide).

Những tính năng này giúp dự án khởi tạo nhanh, thống nhất và dễ bảo trì. Hãy xem các hướng dẫn bên dưới để bắt đầu sử dụng.

## Lộ trình đọc tài liệu

Nếu bạn mới làm quen với Muonroi Building Block, nên tham khảo theo thứ tự:

1. **Tạo project mới** bằng [Template Quickstart Guide](./template-quickstart.md) - Hướng dẫn chi tiết từng bước.
2. Cấu hình các thành phần cơ bản qua [Bắt đầu sử dụng](./getting-started.md).
3. Tìm hiểu các khái niệm nền tảng:
   - [Dependency Injection và cấu hình dịch vụ](../06-resources/usage-guide.md).
   - [Xác thực và ủy quyền](/docs/guides/identity-access/auth-module-guide).
   - [Phân quyền chi tiết](/docs/guides/identity-access/permission-guide).
4. Khi cần mở rộng, khám phá các module nâng cao:
   - [Caching](/docs/guides/integration/cache-guide).
   - [Message Bus](/docs/reference/appsettings-guide#message-bus) và [Saga với Kafka](/docs/guides/integration/saga-kafka).
5. Tối ưu hiệu năng với [Performance Guide](/docs/operations/performance-guide).

Để nắm được kiến trúc tổng quan của thư viện, xem thêm [Kiến trúc tổng quan](/docs/concepts/architecture-overview).

## Kế tiếp

- [Template Quickstart Guide](./template-quickstart.md): Tạo project mới từ template với hướng dẫn chi tiết.
- [Bắt đầu sử dụng](./getting-started.md): cấu hình nhanh API và appsettings.
- [Performance Guide](/docs/operations/performance-guide): Tối ưu hiệu năng cho production.
