# Decision Table API Reference

Base route: `/api/v1/decision-tables`

## CRUD

- `GET /api/v1/decision-tables`
- `GET /api/v1/decision-tables/{id}`
- `POST /api/v1/decision-tables`
- `PUT /api/v1/decision-tables/{id}`
- `DELETE /api/v1/decision-tables/{id}`

## Bulk operations

- `POST /api/v1/decision-tables/bulk/upsert`
- `POST /api/v1/decision-tables/bulk/delete`

## Validation and row ordering

- `POST /api/v1/decision-tables/{id}/validate`
- `POST /api/v1/decision-tables/{id}/feel/validate-expression`
- `POST /api/v1/decision-tables/{id}/rows/reorder`

## Execution

- `POST /api/v1/decision-tables/{id}/execute`

Request:

```json
{
  "inputs": {
    "amount": 15000,
    "customerType": "premium",
    "region": "VN"
  }
}
```

Response:

```json
{
  "matched": true,
  "hitPolicy": "First",
  "evaluationTimeMs": 2.3,
  "matchedRowIds": ["row-1"],
  "outputs": [
    {
      "rowId": "row-1",
      "outputs": {
        "discountRate": 0.15
      }
    }
  ]
}
```

## Import

- `POST /api/v1/decision-tables/import`

Supported formats:

- `excel`
- `json`
- `dmn`

## Versions and audit

- `GET /api/v1/decision-tables/{id}/versions`
- `GET /api/v1/decision-tables/{id}/versions/{version}`
- `GET /api/v1/decision-tables/{id}/versions/{v1}/diff/{v2}` (control-plane endpoint)
- `GET /api/v1/decision-tables/{id}/audit`
- `GET /api/v1/decision-tables/audit`

## Export

Base route: `/api/v1/decision-tables/{id}/export`

- `GET /json`
- `GET /xml`
- `GET /dmn`
- `GET /excel`
- `POST /json`
- `POST /dmn`
