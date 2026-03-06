# FEEL Autocomplete Widget

`mu-feel-autocomplete` renders suggestion lists for FEEL authoring.

## Data contract

The widget consumes `suggestions: string[]`.

Suggestions usually come from `MFeelService.MAutocomplete(...)`, which calls:

- `POST /api/v1/feel/autocomplete`
