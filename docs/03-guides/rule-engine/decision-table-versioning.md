# Decision Table Versioning

Decision table versions are snapshot-based. Each save stores a full table payload.

## Endpoints

- `GET /api/v1/decision-tables/{id}/versions`
- `GET /api/v1/decision-tables/{id}/versions/{version}`
- `GET /api/v1/decision-tables/{id}/versions/{v1}/diff/{v2}`

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
