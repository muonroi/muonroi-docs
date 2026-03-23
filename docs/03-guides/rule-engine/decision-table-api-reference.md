---
title: Decision Table API Quick Reference
sidebar_label: Decision Table API (Quick Ref)
sidebar_position: 4
---

# Decision Table API Quick Reference

Quick lookup for decision table endpoints. For complete documentation, see **[Decision Table API Reference](../../05-reference/decision-table-api.md)**.

---

## Base URL

```
/api/v1/decision-tables
```

---

## CRUD Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | List all decision tables (paginated) |
| `GET` | `/{id}` | Get a specific table (latest version) |
| `POST` | `/` | Create a new decision table |
| `PUT` | `/{id}` | Update an existing table (creates new version) |
| `DELETE` | `/{id}` | Delete a table and all its versions |

---

## Execution

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/{id}/evaluate` | Execute table against input facts |

**Request:**
```json
{
  "input": {
    "customerType": "premium",
    "amount": 7500
  }
}
```

**Response:**
```json
{
  "matchedRows": ["row-1"],
  "outputRows": [
    {
      "rowId": "row-1",
      "outputs": {
        "discountRate": 0.20
      }
    }
  ],
  "evaluationTimeMs": 2.5
}
```

---

## Versioning

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/{id}/versions` | List all versions (paginated) |
| `GET` | `/{id}/versions/{v}` | Get specific version definition |
| `GET` | `/{id}/versions/{v1}/diff/{v2}` | Compare two versions |

---

## Validation

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/{id}/validate` | Validate table structure |
| `POST` | `/{id}/feel/validate-expression` | Validate FEEL expression |

---

## Audit & History

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/{id}/audit` | Get table-specific audit log |
| `GET` | `/audit` | Get global audit log (admin) |

---

## Import & Export

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/import?format=json\|excel\|dmn` | Bulk import tables |
| `GET` | `/{id}/export?format=json\|excel\|dmn\|xml` | Export table in format |

---

## Status Codes

| Code | Meaning |
|------|---------|
| `200` | OK |
| `201` | Created |
| `204` | No Content |
| `400` | Bad Request |
| `401` | Unauthorized |
| `404` | Not Found |
| `409` | Conflict |
| `422` | Unprocessable Entity |
| `429` | Too Many Requests |
| `500` | Internal Server Error |

---

## Authentication

All endpoints require `Authorization: Bearer <token>` header.

```bash
curl -X GET "https://cp.truyentm.xyz/api/v1/decision-tables" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## Full Documentation

Refer to the **[Complete Decision Table API Reference](../../05-reference/decision-table-api.md)** for:
- Detailed request/response schemas
- Full curl examples
- Error response formats
- Best practices
- MCP tools

Related guides:
- [Decision Table Guide](./decision-table-guide.md) — Design and usage patterns
- [Decision Table Versioning](./decision-table-versioning.md) — Version management
- [FEEL Expression Reference](../../05-reference/feel-reference.md) — FEEL language
