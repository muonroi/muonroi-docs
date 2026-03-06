# NRules Guide

Muonroi still ships an NRules integration surface alongside the typed rule engine and decision-table stack.

## Available endpoints

`NRulesController` currently exposes these routes under `/api/v1/rule-engine`:

- `GET /nrules`
- `GET /nrules/{id}`
- `PUT /nrules/{id}`
- `POST /test`

The API stores rule definitions in an in-memory concurrent dictionary and can execute tests through `NRulesEngine` when that service is available.

## Definition model

Each definition includes:

- `Id`
- `Name`
- `Description`
- `RuleExpression`
- `ActionExpression`
- `UpdatedAtUtc`

This surface is useful for prototyping or editor-driven scenarios, but it is not a substitute for the decision-table persistence model used by the control plane.

## UI component

The UI engine still registers a `mu-nrules-editor` custom element. It emits:

- `save`
- `validate`

The component defaults to these endpoints:

- `api-base="/api/v1/rule-engine/nrules"`
- `test-endpoint="/api/v1/rule-engine/test"`

## Position in the ecosystem

Use NRules when you explicitly need a Rete-style rule authoring and testing path. For most current Muonroi platform workflows, the primary guidance remains:

- typed rule execution
- FEEL expressions
- decision tables
- control-plane rollout and approval
