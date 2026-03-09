# Dry Run Operations

Dry-run validates behavior before activation and does not persist side effects.

## API

Endpoint:

- `POST /api/v1/control-plane/rulesets/{workflow}/dry-run`

Request:

```json
{
  "version": 3,
  "inputs": {
    "customerId": "C001",
    "amount": 25000,
    "region": "VN"
  },
  "contextType": "MyApp.Rules.OrderContext, MyApp"
}
```

Response:

```json
{
  "rulesMatched": true,
  "evaluationTimeMs": 4.7,
  "traces": [
    {
      "ruleName": "HighAmount",
      "matched": true,
      "failReason": null
    }
  ],
  "outputFacts": {
    "discountRate": 0.2
  },
  "errors": []
}
```

## Guarantees

- Timeout is capped at 10 seconds.
- Ruleset content is validated before execution.
- No activate/save/audit mutation is performed by dry-run endpoint itself.

## Troubleshooting

- `404`: workflow/version not found.
- `400`: invalid ruleset payload in store or invalid dry-run request.
- `errors[]` populated with engine/runtime failures.
