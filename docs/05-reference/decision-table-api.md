---
title: Decision Table API
sidebar_label: Decision Table API
sidebar_position: 3
---

# Decision Table API Reference

Complete REST API reference for managing and evaluating decision tables in Muonroi Control Plane.

**Base URL:** `/api/v1/decision-tables`

**Authentication:** All endpoints require valid JWT or API key authentication via `Authorization: Bearer <token>` header.

**Content-Type:** `application/json`

---

## Overview

The Decision Table API provides endpoints for:

- **CRUD operations** — create, read, update, delete decision tables
- **Evaluation** — execute tables against input facts
- **Versioning** — list versions, retrieve specific versions, compare versions
- **Validation** — validate table structure and FEEL expressions
- **Import/Export** — bulk load and export in multiple formats
- **Audit** — track changes and rule execution history

---

## CRUD Operations

### List Decision Tables

Retrieve all decision tables accessible to the current tenant.

**Endpoint:** `GET /api/v1/decision-tables`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number (1-based). Default: `1` |
| `pageSize` | integer | Items per page. Default: `50`. Max: `200` |

**Response:** 200 OK

```json
[
  {
    "id": "discount-table-001",
    "name": "Customer Discount Rules",
    "description": "Discount rates by customer type and region",
    "inputColumnCount": 3,
    "outputColumnCount": 2,
    "rowCount": 12,
    "version": 5,
    "updatedAt": "2026-03-20T10:30:00Z"
  }
]
```

**Example (curl):**

```bash
curl -X GET "https://cp.truyentm.xyz/api/v1/decision-tables?page=1&pageSize=10" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

---

### Get Decision Table

Retrieve the full definition of a specific decision table (latest version).

**Endpoint:** `GET /api/v1/decision-tables/{id}`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique decision table identifier |

**Response:** 200 OK

```json
{
  "id": "discount-table-001",
  "name": "Customer Discount Rules",
  "description": "Discount rates by customer type and region",
  "inputColumns": [
    {
      "name": "customerType",
      "type": "string",
      "required": true
    },
    {
      "name": "amount",
      "type": "number",
      "required": true
    },
    {
      "name": "region",
      "type": "string",
      "required": false
    }
  ],
  "outputColumns": [
    {
      "name": "discountRate",
      "type": "number"
    },
    {
      "name": "freeShipping",
      "type": "boolean"
    }
  ],
  "hitPolicy": "First",
  "rows": [
    {
      "id": "row-1",
      "priority": 1,
      "inputConditions": {
        "customerType": "\"premium\"",
        "amount": ">= 5000",
        "region": "-"
      },
      "outputs": {
        "discountRate": 0.20,
        "freeShipping": true
      }
    }
  ],
  "version": 5,
  "createdAt": "2026-02-15T08:00:00Z",
  "modifiedAt": "2026-03-20T10:30:00Z"
}
```

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Table found and returned |
| `404` | Table not found |
| `401` | Unauthorized |

**Example (curl):**

```bash
curl -X GET "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Create Decision Table

Create a new decision table.

**Endpoint:** `POST /api/v1/decision-tables`

**Request Body:**

```json
{
  "name": "Customer Discount Rules",
  "description": "Discount rates by customer type and region",
  "inputColumns": [
    {
      "name": "customerType",
      "type": "string",
      "required": true
    },
    {
      "name": "amount",
      "type": "number",
      "required": true
    }
  ],
  "outputColumns": [
    {
      "name": "discountRate",
      "type": "number"
    }
  ],
  "hitPolicy": "First",
  "rows": [
    {
      "priority": 1,
      "inputConditions": {
        "customerType": "\"premium\"",
        "amount": ">= 5000"
      },
      "outputs": {
        "discountRate": 0.20
      }
    }
  ]
}
```

**Response:** 201 Created

```json
{
  "id": "discount-table-001",
  "name": "Customer Discount Rules",
  "version": 1,
  "createdAt": "2026-03-20T10:30:00Z"
}
```

**Response Codes:**

| Code | Description |
|------|-------------|
| `201` | Table created successfully |
| `400` | Invalid input (validation error) |
| `401` | Unauthorized |
| `409` | Table with this name already exists |

**Example (curl):**

```bash
curl -X POST "https://cp.truyentm.xyz/api/v1/decision-tables" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Discount Rules",
    "inputColumns": [{"name": "customerType", "type": "string"}],
    "outputColumns": [{"name": "discountRate", "type": "number"}],
    "hitPolicy": "First",
    "rows": []
  }'
```

---

### Update Decision Table

Update an existing decision table (creates new version).

**Endpoint:** `PUT /api/v1/decision-tables/{id}`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique decision table identifier |

**Request Body:**

```json
{
  "name": "Customer Discount Rules - v2",
  "description": "Updated discount rates",
  "inputColumns": [
    {
      "name": "customerType",
      "type": "string",
      "required": true
    }
  ],
  "outputColumns": [
    {
      "name": "discountRate",
      "type": "number"
    }
  ],
  "hitPolicy": "Unique",
  "rows": [
    {
      "priority": 1,
      "inputConditions": {
        "customerType": "\"premium\""
      },
      "outputs": {
        "discountRate": 0.25
      }
    }
  ]
}
```

**Response:** 200 OK

```json
{
  "id": "discount-table-001",
  "version": 6,
  "modifiedAt": "2026-03-20T11:15:00Z"
}
```

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Table updated successfully |
| `400` | Invalid input |
| `401` | Unauthorized |
| `404` | Table not found |

**Example (curl):**

```bash
curl -X PUT "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Updated Name", "rows": []}'
```

---

### Delete Decision Table

Permanently delete a decision table and all its versions.

**Endpoint:** `DELETE /api/v1/decision-tables/{id}`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique decision table identifier |

**Response:** 204 No Content

**Response Codes:**

| Code | Description |
|------|-------------|
| `204` | Table deleted successfully |
| `401` | Unauthorized |
| `404` | Table not found |

**Example (curl):**

```bash
curl -X DELETE "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Evaluation

### Evaluate Decision Table

Execute a decision table against input facts and return matched rows and outputs.

**Endpoint:** `POST /api/v1/decision-tables/{id}/evaluate`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique decision table identifier |

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `version` | integer | Optional: specific version to evaluate. Defaults to latest. |

**Request Body:**

```json
{
  "input": {
    "customerType": "premium",
    "amount": 7500,
    "region": "VN"
  }
}
```

**Response:** 200 OK

```json
{
  "matchedRows": ["row-1"],
  "outputRows": [
    {
      "rowId": "row-1",
      "outputs": {
        "discountRate": 0.20,
        "freeShipping": true
      }
    }
  ],
  "outputValues": {
    "discountRate": 0.20,
    "freeShipping": true
  },
  "evaluationTimeMs": 2.5
}
```

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Evaluation successful |
| `400` | Invalid input (missing required fields, type mismatch) |
| `401` | Unauthorized |
| `404` | Table not found |

**Example (curl):**

```bash
curl -X POST "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001/evaluate" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "input": {
      "customerType": "premium",
      "amount": 7500
    }
  }'
```

---

## Versioning

### List Versions

Retrieve all versions of a decision table with metadata.

**Endpoint:** `GET /api/v1/decision-tables/{id}/versions`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique decision table identifier |

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number. Default: `1` |
| `pageSize` | integer | Items per page. Default: `50`. Max: `200` |

**Response:** 200 OK

```json
[
  {
    "version": 5,
    "createdAt": "2026-03-20T10:30:00Z",
    "createdBy": "john.doe@example.com",
    "comment": "Increased premium discount from 15% to 20%"
  },
  {
    "version": 4,
    "createdAt": "2026-03-15T14:22:00Z",
    "createdBy": "system",
    "comment": "Auto-migration from v1"
  }
]
```

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Versions returned |
| `404` | Table not found |
| `401` | Unauthorized |

**Example (curl):**

```bash
curl -X GET "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001/versions?page=1&pageSize=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Get Specific Version

Retrieve the full definition of a specific version.

**Endpoint:** `GET /api/v1/decision-tables/{id}/versions/{version}`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique decision table identifier |
| `version` | integer | Version number (positive integer) |

**Response:** 200 OK

```json
{
  "id": "discount-table-001",
  "name": "Customer Discount Rules",
  "version": 4,
  "inputColumns": [...],
  "outputColumns": [...],
  "rows": [...]
}
```

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Version found and returned |
| `400` | Invalid version number |
| `404` | Table or version not found |
| `401` | Unauthorized |

**Example (curl):**

```bash
curl -X GET "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001/versions/4" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Compare Versions

Get a diff between two versions of a decision table.

**Endpoint:** `GET /api/v1/decision-tables/{id}/versions/{fromVersion}/diff/{toVersion}`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique decision table identifier |
| `fromVersion` | integer | Source version number |
| `toVersion` | integer | Target version number |

**Response:** 200 OK

```json
{
  "fromVersion": 4,
  "toVersion": 5,
  "changes": {
    "name": {
      "from": "Customer Discount Rules",
      "to": "Customer Discount Rules - Updated"
    },
    "hitPolicy": {
      "from": "First",
      "to": "Unique"
    }
  },
  "addedRows": [
    {
      "rowId": "row-5",
      "inputConditions": {"customerType": "\"vip\""},
      "outputs": {"discountRate": 0.30}
    }
  ],
  "removedRows": ["row-3"],
  "modifiedRows": [
    {
      "rowId": "row-1",
      "changes": {
        "outputs": {
          "discountRate": {
            "from": 0.15,
            "to": 0.20
          }
        }
      }
    }
  ]
}
```

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Diff computed and returned |
| `400` | Invalid version numbers |
| `404` | Table or versions not found |
| `401` | Unauthorized |

**Example (curl):**

```bash
curl -X GET "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001/versions/4/diff/5" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Validation

### Validate Table Structure

Validate the structure and syntax of a decision table without saving it.

**Endpoint:** `POST /api/v1/decision-tables/{id}/validate`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique decision table identifier |

**Request Body:**

```json
{
  "name": "Test Table",
  "inputColumns": [
    {"name": "amount", "type": "number"}
  ],
  "outputColumns": [
    {"name": "result", "type": "string"}
  ],
  "rows": [
    {
      "priority": 1,
      "inputConditions": {"amount": "invalid expression >< @#$"},
      "outputs": {"result": "test"}
    }
  ]
}
```

**Response:** 200 OK (if valid)

```json
{
  "valid": true,
  "errors": []
}
```

**Response (if invalid):** 200 OK

```json
{
  "valid": false,
  "errors": [
    {
      "rowId": "row-1",
      "column": "amount",
      "message": "Invalid FEEL expression syntax"
    }
  ]
}
```

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Validation complete |
| `401` | Unauthorized |

**Example (curl):**

```bash
curl -X POST "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001/validate" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Table",
    "inputColumns": [],
    "outputColumns": [],
    "rows": []
  }'
```

---

### Validate FEEL Expression

Validate a single FEEL expression against column context.

**Endpoint:** `POST /api/v1/decision-tables/{id}/feel/validate-expression`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique decision table identifier |

**Request Body:**

```json
{
  "expression": "amount > 5000 and customerType = \"premium\"",
  "rowContext": {
    "amount": "number",
    "customerType": "string"
  }
}
```

**Response:** 200 OK

```json
{
  "valid": true,
  "message": "Expression is valid"
}
```

**Response (if invalid):** 200 OK

```json
{
  "valid": false,
  "message": "Unknown variable 'unknownField'"
}
```

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Validation complete |
| `401` | Unauthorized |

**Example (curl):**

```bash
curl -X POST "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001/feel/validate-expression" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "expression": "amount > 5000",
    "rowContext": {"amount": "number"}
  }'
```

---

## Import & Export

### Import Decision Tables

Bulk import decision tables from JSON, Excel, or DMN format.

**Endpoint:** `POST /api/v1/decision-tables/import`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string | Import format: `json`, `excel`, or `dmn` |

**Request Body (JSON format):**

```json
[
  {
    "name": "Table 1",
    "inputColumns": [...],
    "outputColumns": [...],
    "rows": [...]
  }
]
```

**Response:** 200 OK

```json
{
  "imported": 2,
  "skipped": 0,
  "results": [
    {
      "name": "Table 1",
      "id": "table-1",
      "status": "success"
    },
    {
      "name": "Table 2",
      "id": "table-2",
      "status": "success"
    }
  ]
}
```

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Import completed |
| `400` | Invalid format or data |
| `401` | Unauthorized |

**Example (curl - JSON):**

```bash
curl -X POST "https://cp.truyentm.xyz/api/v1/decision-tables/import?format=json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"name": "My Table", "inputColumns": [], "outputColumns": [], "rows": []}]'
```

---

### Export Decision Table

Export a decision table in multiple formats.

**Endpoint:** `GET /api/v1/decision-tables/{id}/export`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique decision table identifier |

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `format` | string | Export format: `json`, `excel`, `dmn`, `xml`. Default: `json` |
| `version` | integer | Optional: specific version to export. Defaults to latest. |

**Response:** 200 OK

Response body varies by format:
- `json` — JSON object (Content-Type: `application/json`)
- `excel` — Binary Excel file (Content-Type: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`)
- `dmn` — XML/DMN file (Content-Type: `application/xml`)
- `xml` — XML file (Content-Type: `application/xml`)

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Export successful |
| `400` | Invalid format |
| `404` | Table not found |
| `401` | Unauthorized |

**Example (curl - JSON export):**

```bash
curl -X GET "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001/export?format=json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o table.json
```

**Example (curl - Excel export):**

```bash
curl -X GET "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001/export?format=excel" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o table.xlsx
```

---

## Audit & History

### Get Table Audit Trail

Retrieve the audit log for a specific decision table (who changed it, when, and what).

**Endpoint:** `GET /api/v1/decision-tables/{id}/audit`

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Unique decision table identifier |

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `page` | integer | Page number. Default: `1` |
| `pageSize` | integer | Items per page. Default: `20`. Max: `100` |

**Response:** 200 OK

```json
[
  {
    "timestamp": "2026-03-20T10:30:00Z",
    "action": "Update",
    "actor": "john.doe@example.com",
    "version": 5,
    "comment": "Increased premium discount from 15% to 20%",
    "changesSummary": "Modified 1 row, added 0 rows, removed 0 rows"
  },
  {
    "timestamp": "2026-03-15T14:22:00Z",
    "action": "Create",
    "actor": "system",
    "version": 1,
    "comment": null,
    "changesSummary": "Initial version"
  }
]
```

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Audit log returned |
| `404` | Table not found |
| `401` | Unauthorized |

**Example (curl):**

```bash
curl -X GET "https://cp.truyentm.xyz/api/v1/decision-tables/discount-table-001/audit?page=1&pageSize=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### Get Global Audit Trail

Retrieve the audit log for all decision tables across all tenants (admin only).

**Endpoint:** `GET /api/v1/decision-tables/audit`

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `tenantId` | string | Optional: filter by tenant ID |
| `page` | integer | Page number. Default: `1` |
| `pageSize` | integer | Items per page. Default: `20`. Max: `100` |

**Response:** 200 OK (same format as table-specific audit)

**Response Codes:**

| Code | Description |
|------|-------------|
| `200` | Audit log returned |
| `401` | Unauthorized (non-admin) |

**Example (curl):**

```bash
curl -X GET "https://cp.truyentm.xyz/api/v1/decision-tables/audit?tenantId=tenant-123&page=1" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## MCP Tools

In addition to REST endpoints, the following MCP tools are available for programmatic access:

| Tool | Description |
|------|-------------|
| `muonroi_decision_table_list` | List all accessible decision tables |
| `muonroi_decision_table_get` | Get a specific table by ID |
| `muonroi_decision_table_get_version` | Get a specific table version |
| `muonroi_decision_table_get_versions` | List all versions with pagination |
| `muonroi_decision_table_diff_versions` | Compare two versions |
| `muonroi_decision_table_evaluate` | Evaluate a table against inputs |

Refer to [MCP Tools Reference](./mcp-tools.md) for detailed documentation on each tool.

---

## Error Responses

All error responses follow a standard format:

```json
{
  "error": "Description of what went wrong",
  "code": "ERROR_CODE",
  "traceId": "correlation-id-for-logging"
}
```

**Common Status Codes:**

| Code | Meaning | Example |
|------|---------|---------|
| `400` | Bad Request | Missing required field, invalid input type |
| `401` | Unauthorized | Missing or invalid authentication token |
| `403` | Forbidden | Authenticated but lacks permission for this resource |
| `404` | Not Found | Resource does not exist |
| `409` | Conflict | Table name already exists, concurrent modification |
| `422` | Unprocessable Entity | Input validation failed (invalid FEEL expression, etc.) |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected error on the server |

---

## Best Practices

### Input Validation

Always validate decision table inputs before making API calls:
- Ensure all required input columns are present
- Check that input types match column definitions
- Use the **Validate Table Structure** endpoint during development

### Versioning Strategy

- Keep meaningful version history via the `comment` field during updates
- Use version-specific evaluation for reproducible results in tests
- Compare versions before deploying to production

### Performance

- Use pagination (limit `pageSize` to avoid large transfers)
- Evaluate tables in bulk using a ruleset workflow instead of individual API calls
- Cache decision table definitions on the client side with appropriate TTL

### Error Handling

- Always check the `traceId` in error responses for server-side debugging
- Implement exponential backoff for 429 (Too Many Requests) responses
- Log error responses for audit and troubleshooting

---

## Related Documentation

- [Decision Table Guide](../03-guides/rule-engine/decision-table-guide.md) — How to design and use decision tables
- [Decision Table Versioning](../03-guides/rule-engine/decision-table-versioning.md) — Version management and deployment strategies
- [FEEL Expression Reference](./feel-reference.md) — Complete FEEL language documentation
- [MCP Tools Reference](./mcp-tools.md) — Machine-readable API tools
- [Rule Engine Architecture](../02-concepts/rule-engine.md) — Decision table execution details
