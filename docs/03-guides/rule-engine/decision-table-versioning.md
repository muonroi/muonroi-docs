# Decision Table Versioning

Decision table versions are snapshot-based. Each save stores a full table payload.

## Endpoints

- `GET /api/v1/decision-tables/{id}/versions`
- `GET /api/v1/decision-tables/{id}/versions/{version}`
- `GET /api/v1/decision-tables/{id}/versions/{v1}/diff/{v2}`

## MCP tools

The control-plane MCP server exposes the same versioning workflow to AI agents:

- `muonroi_decision_table_get_versions`
- `muonroi_decision_table_get_version`
- `muonroi_decision_table_diff_versions`

Tenant scoping still applies. A tool call only returns versions that belong to the current execution context tenant.

## Diff payload

`DecisionTableDiff` includes:

- `fromVersion`
- `toVersion`
- `hasChanges`
- `columnChanges[]`
- `rowDiffs[]` with `kind` (`Added`, `Removed`, `Modified`) and `cellDiffs[]`

## UI wiring

`mu-decision-table` supports backend diff via `diffEndpoint`.

```tsx
<MuDecisionTableReact
  apiBase="/api/v1/decision-tables"
  diffEndpoint="/api/v1/decision-tables/{id}/versions/{v1}/diff/{v2}"
  enableVersionDiff
/>
```

## Operational notes

- Diff compares snapshot content, not audit metadata.
- Missing versions return `404`.
- Comparing the same version returns `hasChanges: false`.
