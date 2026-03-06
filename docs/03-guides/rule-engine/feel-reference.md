# FEEL Reference

The FEEL web surface is exposed at:

- `POST /api/v1/feel/evaluate`
- `POST /api/v1/feel/autocomplete`
- `GET /api/v1/feel/examples`

## Keywords returned by autocomplete

- `if`
- `then`
- `else`
- `for`
- `in`
- `some`
- `every`
- `satisfies`
- `instance of`
- `between`
- `and`
- `or`
- `not`

## Standard library functions

Temporal:

- `today`
- `now`
- `days`
- `years`
- `date`
- `time`
- `date and time`
- `duration`
- `years and months duration`
- `days and time duration`

Lists:

- `list contains`
- `count`
- `min`
- `max`
- `sum`
- `mean`
- `all`
- `any`
- `sublist`
- `append`
- `concatenate`
- `insert before`
- `remove`
- `reverse`
- `index of`
- `union`
- `distinct values`
- `flatten`
- `sort`

Strings:

- `string`
- `string length`
- `substring`
- `upper`
- `upper case`
- `lower`
- `lower case`
- `substring before`
- `substring after`
- `replace`
- `contains`
- `starts with`
- `ends with`
- `matches`
- `split`

Numbers and dates:

- `decimal`
- `floor`
- `ceiling`
- `abs`
- `modulo`
- `sqrt`
- `log`
- `exp`
- `odd`
- `even`
- `day of week`
- `day of year`
- `week of year`
- `month of year`
- `year`

Contexts:

- `is`
- `not`
- `get entries`
- `get value`

## Example payload

```json
{
  "expression": "if score >= 80 then \"pass\" else \"fail\"",
  "context": {
    "score": 92
  }
}
```
