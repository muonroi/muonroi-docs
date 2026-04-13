# FEEL Autocomplete Widget

`mu-feel-autocomplete` renders suggestion lists for FEEL authoring.

## Data contract

The widget consumes `suggestions: string[]`.

Suggestions usually come from `MFeelService.MAutocomplete(...)`, which calls:

- `POST /api/v1/feel/autocomplete`

## Compatibility endpoints

The control plane now supports both FEEL contracts:

- `POST /api/v1/feel/autocomplete` (frontend compatibility contract)
  request: `{ partialExpression, dataType }`
  response: `{ suggestions: string[] }`
- `POST /api/v1/decision-tables/feel-autocomplete` (detailed internal contract)
  request: `{ expression, cursor, rowContext }`
  response: `{ completions: [{ label, kind, detail }] }`

Use `/api/v1/feel/autocomplete` for UI widgets that only need string suggestions.
