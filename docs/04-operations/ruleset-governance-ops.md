# Ruleset Governance Ops

Runtime ruleset governance keeps code-first and operator-managed flows connected.

## Runtime API surface

Base route: `/api/v1/rule-engine/rulesets`

- list workflows
- list versions
- export active or selected versions
- save a new version
- activate a version
- validate a payload
- dry-run a payload
- inspect audit history

## Merge-back loop

1. export the active runtime ruleset
2. run `muonroi-rule merge --compile-check`
3. compare runtime and code behavior
4. open a source-control review before merging back into handlers
