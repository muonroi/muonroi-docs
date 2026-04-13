# Rule Flow Contract API

Canonical guide and integration details live in:

- [Rule Flow Designer Guide](../03-guides/ui-engine/rule-flow-designer.md)

Control Plane now exposes contract metadata endpoints used by the rule flow designer inspector:

- `GET /api/v1/control-plane/rule-contracts/{sourceType}/{sourceCode}`
- `GET /api/v1/control-plane/flow-contracts/{flowCode}`
- `GET /api/v1/control-plane/rule-flow/{flowCode}/nodes/{nodeId}/authoring-contract`
- `GET /api/v1/rule-catalog`
- `GET /api/v1/rule-catalog/{code}`

These endpoints return request/response contract metadata so `Condition`, `Sub Flow`, and `Liquid` nodes can show field tables and authoring hints without hardcoding schema in the host layout.

## Contract source precedence

The control-plane resolves contract metadata in this order:

1. manifest emitted by the rule library Source Generator
2. control-plane composition across the selected workflow
3. static configuration fallback for backward compatibility

## Node authoring contract semantics

`GET /api/v1/control-plane/rule-flow/{flowCode}/nodes/{nodeId}/authoring-contract` returns a node-aware view of the flow:

- `requestScope`: the flow input plus facts produced by upstream nodes
- `responseDelta`: only the facts produced by the selected node

`responseDelta` intentionally excludes structural `RuleResult` fields such as success flags, messages, and error codes. Those belong to execution flow, not authoring schema.

## Rule catalog endpoint semantics

`GET /api/v1/rule-catalog` is the BA palette feed.

It groups authorable rules by category and returns:

- palette metadata from `MRuleAuthoringEntry`
- `inputSchema` derived from the rule context/consumed facts
- `outputSchema` derived from produced facts
- `sourceKey` showing which manifest source produced the entry

Supported query parameters:

- `category`
- `search`
- `includeHidden`

Example:

```json
[
  {
    "category": "Shipping",
    "items": [
      {
        "code": "FCD_V2_LINER_VALID",
        "displayName": "Validate Liner Code",
        "tags": ["liner", "validation"],
        "sourceKey": "eport",
        "inputSchema": {
          "contractName": "FCD_V2_LINER_VALID_request",
          "fields": [
            { "path": "request.linerCode", "dataType": "string" }
          ]
        }
      }
    ]
  }
]
```

Example response shape:

```json
{
  "flowCode": "FCD-CreateV2-Rules",
  "nodeId": "condition-2",
  "ruleCode": "FCD_V2_TAX_VALID",
  "requestScope": {
    "contractName": "FCD_V2_TAX_VALID_request_scope",
    "fields": [
      { "path": "request.orderId", "dataType": "string" },
      { "path": "liners.code", "dataType": "string" }
    ]
  },
  "responseDelta": {
    "contractName": "FCD_V2_TAX_VALID_response_delta",
    "fields": [
      { "path": "bookingContainers", "dataType": "array" }
    ]
  }
}
```
