# Template Quickstart Guide

Hướng dẫn chi tiết cách cài đặt và sử dụng Muonroi.BaseTemplate để tạo project mới.

## Prerequisites

- [.NET 9.0 SDK](https://dotnet.microsoft.com/download/dotnet/9.0) hoặc cao hơn
- [EF Core Tools](https://docs.microsoft.com/en-us/ef/core/cli/dotnet) (tùy chọn, cho migrations)

```bash
# Cài đặt EF Core CLI tools
dotnet tool install --global dotnet-ef
```

## 1. Cài đặt Template

### Option A: Từ NuGet (khuyến nghị)

```bash
dotnet new install Muonroi.BaseTemplate
```

### Option B: Từ source code

```bash
# Clone repo
git clone https://github.com/muonroi/MuonroiBuildingBlock.git
cd MuonroiBuildingBlock/src/Muonroi.Base.Template

# Install template từ local
dotnet new install ./
```

### Kiểm tra cài đặt

```bash
dotnet new list | grep "mr-base-sln"
# Output: Muonroi BuildingBlock Solution    mr-base-sln    [C#]    Web/Solution/ASP.NET
```

## 2. Tạo Project Mới

### Cú pháp cơ bản

```bash
dotnet new mr-base-sln -n <ProjectName> [-C <ClassName>]
```

### Parameters

| Parameter | Short | Description | Default |
|-----------|-------|-------------|---------|
| `--name` | `-n` | Tên solution và thư mục project | (required) |
| `--ClassName` | `-C` | Tên base cho classes (DbContext, Repository, etc.) | `BaseTemplate` |

### Ví dụ

```bash
# Tạo project tên "MyApp" với class names mặc định
dotnet new mr-base-sln -n MyApp

# Tạo project với custom class name
dotnet new mr-base-sln -n MyApp -C MyCore
# -> Sẽ generate: MyCoreDbContext, MyCoreRepository, etc.

# Ví dụ thực tế
dotnet new mr-base-sln -n TruyenTM -C TruyenTM
```

### Cấu trúc được tạo

```
MyApp/
├── MyApp.sln
├── scripts/
│   └── ef.sh                    # Helper script cho migrations
├── src/
│   ├── MyApp.API/               # Web API project
│   │   ├── appsettings.json
│   │   ├── appsettings.Development.json
│   │   ├── appsettings.Production.json
│   │   ├── appsettings.Example.json  # Configuration reference
│   │   ├── Program.cs
│   │   ├── Controllers/
│   │   ├── Application/
│   │   └── ...
│   ├── MyApp.Core/              # Domain layer
│   │   ├── Entities/
│   │   └── Interfaces/
│   └── MyApp.Data/              # Infrastructure layer
│       ├── MyCoreDbContext.cs
│       ├── Repositories/
│       └── Persistence/
└── README.md
```

## 3. Cấu hình

### 3.1. Restore packages

```bash
cd MyApp
dotnet restore
```

### 3.2. Cấu hình appsettings

Mở `src/MyApp.API/appsettings.Development.json` và điều chỉnh theo nhu cầu.

#### Database Types được hỗ trợ

| DbType | Description | Connection String Example |
|--------|-------------|---------------------------|
| `Sqlite` | SQLite (mặc định) | `Data Source=app.db` |
| `SqlServer` | SQL Server | `Server=.;Database=mydb;Integrated Security=true;TrustServerCertificate=true;` |
| `MySql` | MySQL/MariaDB | `Server=localhost;Database=mydb;User=root;Password=pass;` |
| `PostgreSql` | PostgreSQL | `Host=localhost;Database=mydb;Username=postgres;Password=pass;` |
| `MongoDb` | MongoDB | `mongodb://localhost:27017/mydb` |

#### Ví dụ cấu hình

```json
{
  "DatabaseConfigs": {
    "DbType": "Sqlite",
    "ConnectionStrings": {
      "SqliteConnectionString": "Data Source=app.db"
    }
  },
  "TokenConfigs": {
    "Issuer": "https://localhost:5001",
    "Audience": "https://localhost:5001",
    "SigningKeys": "your-secret-key-minimum-32-characters!",
    "UseRsa": false,
    "ExpiryMinutes": 60
  },
  "SecretKey": "",
  "EnableEncryption": false
}
```

> **Tip:** Xem file `appsettings.Example.json` để biết tất cả các options và documentation chi tiết.

## 4. Database Migrations

### Sử dụng script helper (khuyến nghị)

Template bao gồm script `ef.sh` hỗ trợ migrations:

```bash
# Hiển thị help
./scripts/ef.sh help

# Thêm migration mới
./scripts/ef.sh add InitialCreate

# Apply migrations vào database
./scripts/ef.sh update

# Liệt kê migrations
./scripts/ef.sh list

# Xóa migration cuối cùng
./scripts/ef.sh remove
```

> **Windows users:** Chạy trong Git Bash hoặc WSL.

### Sử dụng dotnet ef trực tiếp

```bash
# Thêm migration
dotnet ef migrations add "InitialCreate" \
    -p ./src/MyApp.Data \
    --startup-project ./src/MyApp.API \
    -o Persistence/Migrations

# Apply migrations
dotnet ef database update \
    -p ./src/MyApp.Data \
    --startup-project ./src/MyApp.API
```

## 5. Chạy Application

```bash
# Development mode
cd src/MyApp.API
dotnet run

# Hoặc với hot reload
dotnet watch run
```

Mở browser: `https://localhost:5001/swagger`

## 6. Feature Flags

Template hỗ trợ toggle các tính năng qua `FeatureFlags`:

```json
{
  "FeatureFlags": {
    "UseGrpc": false,              // gRPC server
    "UseServiceDiscovery": false,   // Consul registration
    "UseMessageBus": false,         // Kafka/RabbitMQ
    "UseBackgroundJobs": false,     // Hangfire/Quartz
    "UseEnsureCreatedFallback": true // Auto-create DB nếu migration fail
  }
}
```

Chỉ enable các features bạn cần để giảm dependencies và startup time.

## 7. Troubleshooting

### Error: "Connection string is not provided"

**Nguyên nhân:** `DbType` không khớp với connection string key.

**Giải pháp:**
```json
{
  "DatabaseConfigs": {
    "DbType": "MySql",  // <- DbType
    "ConnectionStrings": {
      "MySqlConnectionString": "..."  // <- Phải có key tương ứng
    }
  }
}
```

### Error: "The input is not a valid Base-64 string"

**Nguyên nhân:** `EnableEncryption: true` nhưng values không được encrypt.

**Giải pháp:** Set `EnableEncryption: false` hoặc encrypt values với `SecretKey`.

### Error: "Invalid RedisConfigs"

**Nguyên nhân:** Redis validation fail.

**Giải pháp:**
```json
{
  "RedisConfigs": {
    "Enable": false,  // Disable nếu không dùng Redis
    "Password": ""    // Có thể để trống nếu Redis không có auth
  }
}
```

### API chậm khi start

**Nguyên nhân:** Loading quá nhiều features.

**Giải pháp:** Disable các features không cần trong `FeatureFlags`.

## 8. Next Steps

- [Architecture Overview](/docs/concepts/architecture-overview) - Hiểu kiến trúc
- [Auth Module Guide](/docs/guides/identity-access/auth-module-guide) - Authentication & Authorization
- [Permission Guide](/docs/guides/identity-access/permission-guide) - Hệ thống phân quyền
- [Cache Guide](/docs/guides/integration/cache-guide) - Caching strategies
- [Multi-Tenant Guide](/docs/guides/multi-tenancy/multi-tenant-guide) - Multi-tenancy

## Quick Reference

```bash
# Install template
dotnet new install Muonroi.BaseTemplate

# Create project
dotnet new mr-base-sln -n MyApp -C MyCore

# Setup
cd MyApp && dotnet restore

# Migrations
./scripts/ef.sh add InitialCreate
./scripts/ef.sh update

# Run
cd src/MyApp.API && dotnet run
```
