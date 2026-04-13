# Rule Studio Authoring Guide

Rule Studio is the operator-facing authoring surface on top of the Rule Flow Designer. It is meant to attach to an existing host page with minimal host code while keeping rule authoring semantics inside the Muonroi UI engine and runtime libraries.

Use this guide when operators ask:

- when should I use `Condition` instead of `Action` or `Sub Flow`
- what does an edge label such as `always` mean
- what happens when I click `Publish`
- which outputs become real runtime facts

## Palette semantics

Rule Studio now supports two palette sources at the same time:

- structural node blocks bundled in the designer: `Trigger`, `Condition`, `Action`, `Decision Table`, `Sub Flow`, `Liquid`, `End`
- remote rule catalog entries pulled from `GET /api/v1/rule-catalog`

Remote catalog entries are generated from `MRuleAuthoringManifest` data and surface the BA-facing metadata defined on rules:

- `DisplayName`
- `Category`
- `Icon`
- `Tags`
- `Description`
- `IsPaletteVisible`

The embedded catalog palette now supports:

- client-side search by `DisplayName`, `Code`, `Tags`, and `Description`
- grouped rendering by category
- loading and empty placeholders while the remote catalog is fetched
- drag or click insertion into the canvas
- dependency overlay cards on the canvas so authors can inspect upstream and downstream rule relationships without leaving the flow
- auto-layout from the `Actions` panel to normalize a messy graph into a predictable topological layout after add/connect operations

When a BA clicks a remote catalog entry, the designer creates a `Condition` node pre-wired with:

- `ruleCode`
- `contractRef = { sourceType: "rule", sourceCode: ruleCode }`
- input/output contract previews from the catalog payload

### Trigger

Use `Trigger` as the single entry point of the workflow.

- One flow should contain exactly one trigger.
- Its contract represents the input scope of the whole workflow.
- It does not perform rule execution itself.

### Condition

Use `Condition` for boolean gate logic.

- Typical language: `FEEL`
- Reads from the current input scope
- Returns pass or fail
- Can optionally write `Output Facts (on pass)` when each field has a `Value Expression`

Use `Condition` when:

- you want to stop or continue the flow based on a boolean result
- you want a lightweight guard between two compiled rules

Do not use `Condition` when:

- you need to transform data heavily
- you need reusable child logic

### Action

Use `Action` to create or transform facts for downstream nodes.

- Typical usage: write new fields that later nodes consume
- Runtime-effective outputs must come from an adapter or compiled rule that really writes to the `FactBag`

Use `Action` when:

- you need a fact such as `hello`, `normalizedAmount`, `resolvedPort`, or `payloadJson`
- downstream nodes must consume data produced at this step

### Decision Table

Use `Decision Table` when the logic is table-driven rather than expression-driven.

- Best for many condition combinations with predictable outputs
- Typical use cases: mapping, classification, pricing, routing
- The inspector now loads the selected table schema and shows:
  - input columns
  - output columns
  - hit policy
  - description
  - FEEL authoring hints derived from the table columns

This is meant to keep a BA in the flow editor instead of forcing a context switch into the full decision table screen for basic schema lookup.

### Sub Flow

Use `Sub Flow` when a block of logic should be reusable as a child workflow.

- Parent scope is mapped into the child trigger input
- Child outputs can be exposed back to the parent scope
- Only fields marked `ExposeToParent = true` travel back to downstream nodes in the parent flow

Use `Sub Flow` when:

- the logic should be reused in several flows
- the child needs its own authoring boundary and input/output mappings

### Liquid

Use `Liquid` when you need templated output generation.

- Typical outputs: text, JSON, object
- Useful for payload shaping, notification content, or downstream adapter input

### End

Use `End` to terminate the flow.

- It is the terminal node of the graph
- It does not create additional execution logic by itself

## Edge routing

Edges decide when a downstream node is allowed to execute.

### `always`

Run the downstream node whenever the upstream node executed, including recovery-style continuations after a failed or errored upstream node.

Use this for simple sequential pipelines.

### `on-true`

Run the downstream node only when the upstream node passed.

Use this for happy-path branching after a `Condition`.

### `on-false`

Run the downstream node only when the upstream node failed without throwing.

Use this for fallback or recovery paths.

### `on-error`

Run the downstream node only when the upstream node threw an exception.

Use this for exception-handling paths.

## Input scope, effective input, and output facts

### Input Scope

`Input Scope` is the total set of fields available before the selected node executes.

It comes from:

- trigger input contract
- outputs of upstream nodes
- exposed child outputs from upstream sub-flows

### Effective Input

`Effective Input` is the subset of input scope that this node really consumes.

- `Sub Flow` uses mapping rows
- `Action` can declare manual mappings
- `Condition` and `Liquid` infer it mainly from expressions

### Output Facts

Only some node outputs are runtime-effective.

- `Condition`: only fields with a FEEL `Value Expression` in `Output Facts (on pass)` are written to `FactBag`
- `Action`: runtime writes depend on the actual adapter or compiled rule
- `Sub Flow`: only mapped child outputs with `ExposeToParent = true` become parent facts
- compiled C# rules: whatever the implementation writes to `FactBag` is runtime-effective

Display-only metadata is useful for authoring, but it does not become runtime data unless an adapter or compiled rule actually writes it.

## Dependency navigation and layout

Large flows are easier to maintain when authors can see dependency intent directly from the canvas.

- The dependency overlay lists executable nodes with their `DependsOn` and reverse dependents.
- Clicking a dependency badge in the inspector focuses the referenced node.
- Clicking a card in the overlay also focuses that node.
- `Auto Layout` repositions the graph into a stable left-to-right dependency order so screenshots, reviews, and BA sign-off are easier to compare.

## Publish semantics

Rule Studio publish is approval-aware.

When approval workflow is enabled:

1. Save draft
2. Submit for approval
3. Wait for approver
4. Approver activates the approved version

When approval workflow is disabled:

1. Save draft
2. Activate immediately

This means a publish action from the embedded studio does not bypass maker-checker rules.

Before publish actually runs, the editor now opens a confirmation dialog.

- If the flow has warnings but no blocking errors, the dialog shows them and lets the author decide whether to continue.
- If the flow has blocking validation errors, publish remains disabled until the graph is fixed.
- This confirmation happens before the host page save/submit/activate sequence starts, so authors do not accidentally push a graph live with unresolved warnings.

## Host integration

The host page should stay thin.

Typical host responsibilities:

- mount the `mu-rule-flow-designer` component
- pass `apiBaseUrl`, `catalogApiBase`, `workflowCode`, tenant/runtime headers, and license bootstrap
- react to emitted events if the product wants custom banners or analytics

The host should not re-implement:

- publish workflow semantics
- contract composition semantics
- edge routing semantics
- rule authoring logic

Example:

```tsx
<mu-rule-flow-designer
  api-base-url="/api/v1/control-plane"
  catalog-api-base="/api/v1/rule-catalog"
  workflow-code="FCD-CreateV2-Rules"
  tenant-id="tenant-a">
</mu-rule-flow-designer>
```
