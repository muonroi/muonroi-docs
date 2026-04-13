# Rule Flow Designer Guide

The Rule Flow Designer is the visual authoring surface for rule orchestration in the UI engine commercial package. It turns a rule set into a graph made of trigger, condition, action, decision-table, sub-flow, liquid, and end nodes so operators can understand and edit the sequence without staring at raw JSON.

This guide covers the web component, the React wrapper, the graph model, and the current integration path into the control-plane dashboard.

For node semantics, edge routing, and publish behavior in the embedded studio, see [Rule Studio Authoring Guide](./rule-studio-authoring.md).

`[[screenshot: flow canvas overview]]`

## What the designer is for

Use the designer when you want to:

- explain a workflow to operators, QA, or business analysts
- model rule order visually instead of editing raw JSON first
- wire rule blocks to decision tables, sub-flows, and Liquid transforms
- export a normalized graph back to `RuleSet` JSON
- embed a commercial rule-authoring surface inside a React dashboard

Do not use it as a generic BPMN engine. The current surface is intentionally rule-focused and centers on Muonroi rule metadata.

## Packages

The current packages are:

- `@muonroi/ui-engine-rule-components` for the web components and shared model utilities
- `@muonroi/ui-engine-react` for React wrappers such as `MuRuleFlowDesignerReact`
- `@muonroi/ui-engine-core` for runtime helpers and license bootstrap

Install the packages you need:

```bash
npm install @muonroi/ui-engine-core @muonroi/ui-engine-rule-components
npm install @muonroi/ui-engine-react react react-dom
```

The flow designer is a commercial component. License verification must succeed before the designer becomes available in production.

## Where contracts come from

Contract-aware authoring in the flow designer does not depend on hardcoded schema in the host page.

Contract metadata is resolved in this order:

1. Source Generator manifest emitted by the rule library
2. control-plane composition over the selected workflow graph
3. legacy control-plane config fallback when no manifest exists yet

This lets the consumer page stay thin. In the common case, the host only passes `workflowCode`, `apiBaseUrl`, and tenant/runtime headers.

## Data model

The graph model lives in the rule components package and is simple enough to serialize directly.

```ts
export interface MRuleFlowGraph {
  nodes: MRuleFlowNode[];
  edges: MRuleFlowEdge[];
  metadata: MRuleFlowMetadata;
}
```

Current node types:

- `trigger`
- `condition`
- `action`
- `decision-table`
- `sub-flow`
- `liquid`
- `end`

Current edge types:

- `always`
- `on-true`
- `on-false`
- `on-error`

Relevant metadata fields:

- `version`
- `tenantId`
- `ruleSetCode`
- `workflowName`
- `lastModifiedBy`
- `lastModifiedAt`

Minimal graph example:

```json
{
  "nodes": [
    {
      "id": "trigger-1",
      "type": "trigger",
      "label": "Start",
      "position": { "x": 80, "y": 180 },
      "data": {}
    },
    {
      "id": "condition-220",
      "type": "condition",
      "label": "HIGH_VALUE_ORDER",
      "ruleCode": "HIGH_VALUE_ORDER",
      "feelExpression": "orderTotal > 1000",
      "position": { "x": 220, "y": 180 },
      "data": {}
    },
    {
      "id": "end-1",
      "type": "end",
      "label": "End",
      "position": { "x": 760, "y": 180 },
      "data": {}
    }
  ],
  "edges": [
    {
      "id": "edge-trigger-1-condition-220",
      "source": "trigger-1",
      "target": "condition-220",
      "edgeType": "always"
    },
    {
      "id": "edge-condition-220-end-1",
      "source": "condition-220",
      "target": "end-1",
      "edgeType": "on-true",
      "label": "approved"
    }
  ],
  "metadata": {
    "version": 1,
    "workflowName": "wf.orders"
  }
}
```

## Web component usage

Load the custom elements first:

```ts
import { MLoadRuleEngineCustomElements } from "@muonroi/ui-engine-react";

await MLoadRuleEngineCustomElements({
  activationProof: window.__MUONROI_ACTIVATION_PROOF__,
  tenantId: window.__MUONROI_TENANT_ID__
});
```

Then use the custom element. The host can stay minimal and let the component load the flow graph from the control-plane by `workflowCode`:

```html
<mu-rule-flow-designer id="designer"></mu-rule-flow-designer>
```

```ts
const designer = document.getElementById("designer");

designer.apiBaseUrl = "/api/v1";
designer.workflowCode = "FCD-CreateV2-Rules";
designer.theme = "light";
designer.height = 720;
designer.addEventListener("graph-change", (event) => {
  console.log("graph updated", event.detail);
});
designer.addEventListener("publish", (event) => {
  console.log("publish requested", event.detail);
});
```

The wrapper also accepts `graph` or `graphJson` if your integration point naturally works with a preloaded graph. When `workflowCode` is provided and no explicit graph is passed, the component loads `/rulesets/{workflowCode}/export` and builds a normalized graph itself. In multi-tenant deployments, configure the tenant once during `MLoadRuleEngineCustomElements(...)`; the designer then sends `x-tenant-id` automatically for workflow export and contract lookups.

Viewport behavior is intentionally conservative:

- the designer auto-fits only on the first workflow load or when an external graph payload replaces the current graph
- after an operator pans, zooms, or drags a node, the current viewport is preserved
- node position updates must not trigger another implicit `fitView`

## React usage

For React hosts, use the wrapper from `@muonroi/ui-engine-react`:

```tsx
import { MuRuleFlowDesignerReact } from "@muonroi/ui-engine-react";

export function FlowTab() {
  return (
    <MuRuleFlowDesignerReact
      graph={{
        nodes: [],
        edges: [],
        metadata: { version: 1, workflowName: "wf.orders" }
      }}
      apiBaseUrl="/api/v1"
      theme="light"
      height={720}
      onGraphChange={(event) => console.log(event)}
      onPublish={(event) => console.log(event)}
    />
  );
}
```

The React wrapper forwards custom element events:

- `onGraphChange`
- `onPublish`
- plus the common rule component events used by the shared wrapper layer

When `Publish` is triggered from the embedded studio and the control-plane workspace requires approval:

1. the component saves a draft version
2. the component submits that version for approval
3. activation is left to the approver workflow

When approval is disabled, the component saves and then activates the version automatically.

## Component properties

The web component currently exposes these properties:

| Property | Type | Purpose |
| --- | --- | --- |
| `graph` | `MRuleFlowGraph` | Primary in-memory graph model |
| `graphJson` | `string` | JSON alternative to `graph` |
| `readOnly` | `boolean` | Disable editing and palette actions |
| `theme` | `"light" | "dark"` | Rendering theme |
| `apiBaseUrl` | `string` | Base URL for host-side validation/publish flows |
| `height` | `number | string` | Canvas height |
| `workflowCode` | `string` | Optional self-load key for `/rulesets/{workflowCode}/export` |
| `tenantId` | `string` | Optional per-instance tenant override for workflow export and contract fetches |

The underlying React editor also accepts:

- `onGraphChange?: (graph) => void`
- `onPublish?: (graph) => Promise<void> | void`
- `licenseStatus?: "licensed" | "trial" | "unlicensed"`

## Node types

### Trigger

Use `trigger` as the entry point. A flow normally has exactly one visible trigger node.

Good uses:

- "Start"
- "Order submitted"
- "Payment authorized"

### Condition

`condition` nodes are the most common type. They typically carry:

- `ruleCode`
- `expression.language`
- `expression.body`
- a human-friendly `label`

Use them for boolean gates or rule references. The inspector shows:

- request scope table
- response delta table
- FEEL or Liquid expression editor
- field-path insert helpers

Important runtime rule:

- A `Condition` only writes runtime facts when the operator defines `Output Facts (on pass)` with a `Value Expression`
- Display-only contract metadata does not automatically become `FactBag` output

### Action

`action` nodes represent business outcomes or side effects:

- create alert
- assign score
- call downstream workflow
- persist approval marker

### Decision table

Use `decision-table` when you want the flow to hand off branching logic to a table maintained through the decision table authoring surface.

Typical `data` fields:

- decision table id
- version hint
- domain name

### Sub-flow

Use `sub-flow` when one graph should hand off into another named workflow. Keep the label explicit so operators can follow the jump without reverse engineering ids.

The inspector shows:

- target flow code
- request scope table
- response delta table
- input mapping grid
- output mapping grid

This keeps the host layout thin; the schema and mapping surface belong to the component, not the consumer page.

In the current phase, `Sub Flow` resolves the target flow contract by `targetFlowCode` so the operator can inspect the target flow input before wiring it. Full schema-aware type matching for input/output mapping is a later phase.

### Liquid

Use `liquid` when the flow step is primarily a transform/template step rather than a pure boolean guard. Liquid is an authoring mode, not a replacement for FEEL.

The inspector shows:

- request scope table
- response delta table
- Liquid editor
- output format selector

### End

`end` is the terminal node. Keep one end node for simple flows and a small number of labeled terminal nodes for explicit branching.

`[[screenshot: node palette and inspector]]`

## Editing model

The current editor supports:

- adding nodes from the palette
- connecting nodes on the canvas
- editing label, `ruleCode`, contract reference, and expression language in the inspector
- viewing request scope and response delta tables for authorable nodes
- inserting field paths from contract tables into FEEL or Liquid expressions
- editing sub-flow input/output mappings
- deleting selected nodes or edges with `Delete`
- undo and redo
- export to JSON
- publish through the host callback

The graph is normalized before serialization so the host always receives stable ids, labels, positions, and metadata defaults.

## Contract-aware FEEL and Liquid authoring

Condition, sub-flow, and liquid nodes are contract-aware. The inspector resolves request/response metadata from the control-plane and shows it as clickable tables before the operator writes FEEL or Liquid.

This is the key usability rule:

- the component must show available request/response fields
- the host layout should not hardcode business schema
- FEEL and Liquid editors consume resolved contracts, not blind text only

Contract semantics:

- `Request Scope` means everything available before the selected node runs.
  This includes the flow input context plus facts produced by upstream nodes.
- `Response Delta` means only the facts produced by the selected node.
  It intentionally excludes structural execution fields such as `RuleResult` status, message, or error code.

Condition nodes can still store FEEL text, but FEEL is no longer the only authoring mode. Liquid can be used for transform-heavy steps where template-style authoring is a better fit.

Example expressions:

```text
orderTotal > 1000
customerTier in ("gold", "platinum")
fraudScore >= 0.85 and countryCode != "VN"
```

Recommended practice:

- keep expressions short enough to read on the graph card
- move larger logic into a dedicated rule or decision table
- use `ruleCode` to point at the canonical rule implementation

For FEEL syntax guidance, cross-reference [FEEL Reference](../rule-engine/feel-reference.md).

## Connecting nodes and edge types

The graph uses typed edges so the host can preserve meaning during export.

Suggested conventions:

| Edge type | Meaning |
| --- | --- |
| `always` | unconditional next step |
| `on-true` | positive branch from a condition |
| `on-false` | negative branch from a condition |
| `on-error` | exceptional or fallback branch |

Use `label` when the business meaning needs to be obvious in the UI:

- `approved`
- `manual review`
- `fallback`
- `insufficient data`

Keep edge labels short. The graph should read at a glance.

## Exporting back to RuleSet JSON

The package includes a converter utility:

```ts
import { MRuleFlowGraphConverter } from "@muonroi/ui-engine-rule-components";

const graph = MRuleFlowGraphConverter.fromRuleSet(ruleSetJson);
const nextRuleSet = MRuleFlowGraphConverter.toRuleSet(graph, existingRuleSet);
const serialized = MRuleFlowGraphConverter.serialize(graph);
```

The current converter behavior is pragmatic:

- if `flowGraph` already exists in the input rule set, it is normalized and reused
- if no `flowGraph` exists, the converter creates a linear graph from the ordered `rules[]`
- `toRuleSet()` writes both `workflowName` and `flowGraph`

That makes it safe to add a visual tab to an existing JSON-centric workflow editor without breaking the underlying save contract.

## Control-plane integration

The current control-plane dashboard uses the designer as a "Flow View" next to the raw JSON editor, and host applications can mount it with only `workflowCode` plus `apiBaseUrl`.

Typical integration flow:

1. host passes `workflowCode` and `apiBaseUrl`
2. component loads `/api/v1/control-plane/rulesets/{workflow}/export`
3. component normalizes the graph and infers contract references
4. inspector resolves request/response contracts from control-plane
5. on every `graph-change`, the host can save or publish through the normal control-plane endpoints

Useful companion endpoints:

- `GET /api/v1/control-plane/rulesets/{workflow}/export`
- `GET /api/v1/control-plane/rule-contracts/{sourceType}/{sourceCode}`
- `GET /api/v1/control-plane/flow-contracts/{flowCode}`
- `POST /api/v1/control-plane/rulesets/{workflow}`
- `POST /api/v1/control-plane/rulesets/{workflow}/validate`
- `POST /api/v1/control-plane/rulesets/{workflow}/dry-run`

If your flow references decision tables, also use:

- `GET /api/v1/decision-tables/{id}/versions`
- `GET /api/v1/decision-tables/{id}/versions/{v}`
- `GET /api/v1/decision-tables/{id}/versions/{v1}/diff/{v2}`

Cross-reference [Decision Table Widget](./decision-table-widget.md) for the table authoring surface.

`[[screenshot: control-plane flow tab]]`

## Licensing and activation

The designer is guarded by the commercial license gate. In practice that means:

- the host bootstraps a valid activation proof
- `MLicenseVerifier` initializes before loading the custom elements
- unlicensed hosts see the upgrade gate instead of the editor

In local development, decide explicitly whether you want:

- a licensed environment with a real activation proof
- a free environment where the component is intentionally gated off

Do not hide or bypass the license gate in deployed environments.

## Read-only mode

Use `readOnly` when the user may inspect but not change a flow:

- audit review
- approval step
- support diagnostics
- embedded public documentation

When `readOnly` is true:

- palette actions are disabled
- edit affordances are reduced
- event output becomes observation-first instead of edit-first

## Suggested modeling conventions

These conventions keep graphs readable across teams:

- start left-to-right
- one obvious trigger
- short labels, detailed metadata in `data`
- prefer decision tables for dense branching
- use sub-flows for reusable business segments
- keep edge semantics explicit when the branch meaning matters

When a graph becomes too dense:

- split it into multiple flows
- collapse policy detail into rules or decision tables
- keep the flow as orchestration, not as a storage dump for all business logic

## Troubleshooting

### The custom element renders an upgrade prompt

The activation proof is missing or invalid. Bootstrap license verification before importing the web components.

### The graph looks empty after loading JSON

Check whether the payload actually contains `flowGraph`. If not, convert from a rule set through `MRuleFlowGraphConverter.fromRuleSet(...)`.

### Publish fires but nothing is persisted

The component only emits the `publish` event. The host application is responsible for calling the control-plane save endpoint.

### The inspector shows no request or response fields

Check that the control-plane contract endpoints return metadata for the selected `ruleCode`, `targetFlowCode`, or workflow node. In manifest-backed flows, this data is composed from flow input plus upstream produced facts, not hardcoded in the host page.

### FEEL or Liquid text is stored but not validated

The designer captures authoring input. Validation still belongs to the backend or a dedicated expression-validation endpoint in the host/control-plane.

## Recommended next reading

- [UI Engine Architecture](./ui-engine-architecture.md)
- [Decision Table Widget](./decision-table-widget.md)
- [FEEL Reference](../rule-engine/feel-reference.md)
- [Control Plane Operator Guide](../../04-operations/control-plane-operator.md)
