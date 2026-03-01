# Decision Table Full Upgrade Guide (2026)

Tai lieu nay mo ta day du nhung gi da duoc nang cap cho Decision Table tren ca backend va UI package:

- `Muonroi.RuleEngine.DecisionTable`
- `Muonroi.RuleEngine.DecisionTable.Web`
- `@muonroi/ui-engine-decision-table`

## 1. Pham vi da hoan thanh

Da hoan thanh full 6 nhom gap truoc do:

1. SQL Server persistence (khong chi in-memory).
2. Search/filter cho danh sach.
3. Bulk upsert va bulk delete.
4. Row reorder cho drag-drop runtime UI.
5. Audit trail.
6. Version history.

## 2. Thay doi kien truc

### 2.1 Store contract

`IDecisionTableStore` duoc mo rong voi:

- `QueryAsync(...)`
- `BulkUpsertAsync(...)`, `BulkDeleteAsync(...)`
- `ReorderRowsAsync(...)`
- `GetVersionHistoryAsync(...)`, `GetVersionAsync(...)`
- `GetAuditTrailAsync(...)`

### 2.2 Hai che do luu tru

- Khong cau hinh SQL: `InMemoryDecisionTableStore`
- Co cau hinh SQL: `EfCoreDecisionTableStore`

Bang du lieu moi:

- `DecisionTables`
- `DecisionTableVersions`
- `DecisionTableAuditLogs`

### 2.3 Auto tao schema luc startup

Them options:

```csharp
public sealed class DecisionTableEngineOptions
{
    public string? SqlServerConnectionString { get; set; }
    public string Schema { get; set; } = "dbo";
    public bool AutoMigrateDatabase { get; set; } = true;
}
```

Luc startup:

- Neu co migration: `Migrate()`
- Neu chua co migration: `EnsureCreated()`

## 3. Huong dan cau hinh backend

```csharp
builder.Services.AddDecisionTableWeb(options =>
{
    options.SqlServerConnectionString = builder.Configuration.GetConnectionString("DecisionTableSql");
    options.Schema = "rule";
    options.AutoMigrateDatabase = true;
});
```

Neu khong set `SqlServerConnectionString`, module se chay in-memory.

### appsettings.json mau

```json
{
  "ConnectionStrings": {
    "DecisionTableSql": "Server=.;Database=MuonroiRules;Trusted_Connection=True;TrustServerCertificate=True"
  }
}
```

## 4. API moi va cap nhat

Base route: `/api/v1/decision-tables`

### 4.1 List + filter

`GET /api/v1/decision-tables?page=1&pageSize=20&search=risk&tenantId=t1&hitPolicy=FIRST&includeDeleted=false`

### 4.2 Bulk

- `POST /api/v1/decision-tables/bulk/upsert`
- `POST /api/v1/decision-tables/bulk/delete`

Response:

```json
{
  "processedCount": 2,
  "ids": ["table-a", "table-b"]
}
```

### 4.3 Reorder rows (drag-drop)

`POST /api/v1/decision-tables/{id}/rows/reorder`

Request:

```json
{
  "rowIds": ["row-3", "row-1", "row-2"],
  "actor": "admin",
  "reason": "drag-drop"
}
```

### 4.4 Version APIs

- `GET /api/v1/decision-tables/{id}/versions?page=1&pageSize=20`
- `GET /api/v1/decision-tables/{id}/versions/{version}`

### 4.5 Audit APIs

- `GET /api/v1/decision-tables/{id}/audit?page=1&pageSize=50`
- `GET /api/v1/decision-tables/audit?page=1&pageSize=50`

### 4.6 Endpoint cu van giu

- CRUD
- `POST /{id}/validate`
- `POST /{id}/export/json`
- `POST /{id}/export/dmn`

## 5. Su dung tu UI package

### 5.1 API client

```ts
const api = new MDecisionTableApiClient({ apiBase: "/api/v1/decision-tables" });

await api.MList({ page: 1, pageSize: 20, search: "risk", hitPolicy: "FIRST" });
await api.MBulkUpsert([tableA, tableB], "admin", "seed");
await api.MBulkDelete(["table-a"], "admin", "cleanup");
await api.MReorderRows("table-a", ["row-2", "row-1"], "admin", "drag-drop");
await api.MGetVersions("table-a", 1, 20);
await api.MGetAudit("table-a", 1, 50);
```

### 5.2 Editor model

```ts
const model = new MDecisionTableEditorModel({ apiBase: "/api/v1/decision-tables" });

model.MReorderRows(["row-2", "row-1"]);  // cap nhat local
await model.MPersistRowOrder("admin", "drag-drop");

await model.MBulkUpsert([model.MGetTable()], "admin", "seed");
await model.MBulkDelete(["table-a"], "admin", "cleanup");

const versions = await model.MLoadVersionHistory();
const audit = await model.MLoadAuditTrail();
```

### 5.3 PrimeNG toolbar actions moi

Adapter PrimeNG da them:

- `reorder`
- `bulk-save`
- `bulk-delete`

## 6. Mau drag-drop runtime

```ts
onDrop(newOrder: string[]) {
  this.model.MReorderRows(newOrder);
  this.model.MPersistRowOrder("admin", "drag-drop")
    .then(() => this.toast.success("Luu thu tu dong thanh cong"))
    .catch((error) => this.toast.error(error.message));
}
```

## 7. Checklist test da su dung

Backend:

```bash
dotnet test tests/Muonroi.RuleEngine.DecisionTable.Tests/Muonroi.RuleEngine.DecisionTable.Tests.csproj -v minimal
```

UI package:

```bash
npm test --workspace @muonroi/ui-engine-decision-table
npm run build --workspace @muonroi/ui-engine-decision-table
```

Da verify:

- CRUD + validate + export
- Filter list
- Reorder rows
- Version history
- Audit trail
- Bulk upsert/delete
- TypeScript strict build

## 8. Khuyen nghi rollout

1. Bat SQL mode tren staging truoc, verify tao bang thanh cong.
2. Test dong thoi nhieu user drag-drop reorder.
3. Theo doi toc do tang cua audit trail va dat policy archive.
4. Bo sung metric theo tenant: so lan update table, loi validate, tan suat reorder.

## 9. Tai lieu lien quan

- [Decision Table Guide](/docs/guides/rule-engine/decision-table-guide)
- [Decision Table API Reference](/docs/guides/rule-engine/decision-table-api-reference)
- [Rule Engine Guide](/docs/guides/rule-engine/rule-engine-guide)
