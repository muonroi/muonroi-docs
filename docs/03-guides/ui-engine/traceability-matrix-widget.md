---
title: Traceability Matrix Widget
sidebar_position: 8
---

# Traceability Matrix Widget

`mu-traceability-matrix` is a Lit custom element that renders the full requirement-to-rule traceability matrix for a workflow version. Each row maps one rule node to its linked requirements and test coverage state. The matrix is virtualized via `@lit-labs/virtualizer` for efficient rendering of large rule sets.

The component is the primary trace-jump target: `mu-living-docs` and `mu-impact-list` both dispatch `living-docs-node-trace-requested`, which you wire to this widget's `filter-rule` attribute to scroll directly to a specific rule.

## Package

```
@muonroi/ui-engine-rule-components
```

Register all custom elements before using the component:

```ts
import { MRegisterRuleComponents } from "@muonroi/ui-engine-rule-components";
MRegisterRuleComponents();
```

## Attributes

| Attribute | Type | Default | Required | Description |
|-----------|------|---------|----------|-------------|
| `api-base-url` | `string` | `""` | Yes | Base URL for the Living Docs read API (no trailing slash). |
| `tenant-id` | `string` | `""` | No | Active tenant ID for API scoping. |
| `workflow` | `string` | `""` | Yes | Workflow identifier. |
| `version` | `number` | `0` | Yes | Rule version number. |
| `filter-rule` | `string` | `""` | No | Pre-filter to a single rule node by `nodeId`. This is the trace-jump target (D-11). Set programmatically from the `living-docs-node-trace-requested` event. |
| `filter-coverage` | `"all" \| "none" \| "dry-run-example-only" \| "unit-test-linked"` | `"all"` | No | Quick-filter by coverage state. `"all"` shows every row. |

The component auto-loads on `connectedCallback` when `api-base-url`, `workflow`, and `version` are all set. It re-fetches whenever `api-base-url`, `workflow`, or `version` changes. `filter-rule` and `filter-coverage` apply client-side without a new fetch.

## API Endpoints

### Full matrix

```
GET {api-base-url}/traceability/{workflow}/{version}
```

Returns the complete traceability matrix for the given workflow and version.

Response type: `TraceabilityMatrixResponse`

```ts
interface TraceabilityMatrixResponse {
  rows: TraceabilityMatrixRow[];
  workflow: string;
  version: number;
}
```

### Single-node trace

```
GET {api-base-url}/traceability/trace/{workflow}/{nodeId}
```

Returns traceability rows filtered to the given rule node. Entry point for the trace-jump from doc viewer or impact list (D-11).

Response type: `TraceRuleResponse`

```ts
interface TraceRuleResponse {
  nodeId: string;
  workflow: string;
  rows: TraceabilityMatrixRow[];
}
```

### Row shape

```ts
interface TraceabilityMatrixRow {
  nodeId: string;
  title: string;
  nodeType: string;                         // "feel" | "decision-table" | "nrules" | etc.
  requirements: RequirementRef[];
  testCoverage: TestCoverageInfo;           // { state, exampleId?, unitTestCode? }
  decisionTable?: DecisionTableCellInfo;   // Present only for decision-table nodes
}
```

## React Wrapper

`MuTraceabilityMatrixReact` is the `@lit/react`-wrapped version, exported from `@muonroi/ui-engine-react`.

Event mapping:

| React prop | DOM event |
|-----------|-----------|
| `onFilterChange` | `matrix-filter-change` |

## Usage

### Web Component

```html
<script type="module">
  import { MRegisterRuleComponents } from "@muonroi/ui-engine-rule-components";
  MRegisterRuleComponents();
</script>

<mu-traceability-matrix
  api-base-url="https://api.example.com/api/v1"
  tenant-id="tenant-abc"
  workflow="loan-approval"
  version="5"
></mu-traceability-matrix>
```

### React

```tsx
import { MuTraceabilityMatrixReact } from "@muonroi/ui-engine-react";

export function MatrixPanel() {
  return (
    <MuTraceabilityMatrixReact
      api-base-url="https://api.example.com/api/v1"
      tenant-id="tenant-abc"
      workflow="loan-approval"
      version={5}
      filter-coverage="unit-test-linked"
    />
  );
}
```

## Wiring Trace-Jump {#wiring-trace-jump}

`mu-living-docs` and `mu-impact-list` both dispatch `living-docs-node-trace-requested` with `{ nodeId: string }` when the user clicks a trace (↗) button. Pass that `nodeId` into this component's `filter-rule` attribute to jump to the rule.

### Vanilla JS

```html
<mu-living-docs
  api-base-url="https://api.example.com/api/v1"
  workflow="loan-approval"
  version="5"
></mu-living-docs>

<mu-traceability-matrix
  id="matrix"
  api-base-url="https://api.example.com/api/v1"
  workflow="loan-approval"
  version="5"
></mu-traceability-matrix>

<script>
  document.querySelector("mu-living-docs").addEventListener(
    "living-docs-node-trace-requested",
    (e) => {
      document.getElementById("matrix").setAttribute("filter-rule", e.detail.nodeId);
    }
  );
</script>
```

### React (shared state)

```tsx
import { useState } from "react";
import { MuLivingDocsReact, MuTraceabilityMatrixReact } from "@muonroi/ui-engine-react";

export function TraceableDocsPage() {
  const [filterRule, setFilterRule] = useState("");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <MuLivingDocsReact
        api-base-url="https://api.example.com/api/v1"
        workflow="loan-approval"
        version={5}
        onNodeTraceRequested={(e) => setFilterRule(e.detail.nodeId)}
      />
      <MuTraceabilityMatrixReact
        api-base-url="https://api.example.com/api/v1"
        workflow="loan-approval"
        version={5}
        filter-rule={filterRule}
      />
    </div>
  );
}
```

The same pattern applies when `mu-impact-list` is the event source.

## Coverage Filter Values

| `filter-coverage` value | Rows shown |
|------------------------|------------|
| `"all"` (default) | All rows |
| `"unit-test-linked"` | Rows where `testCoverage.state === "UnitTestLinked"` |
| `"dry-run-example-only"` | Rows where `testCoverage.state === "DryRunExampleOnly"` |
| `"none"` | Rows where `testCoverage.state === "None"` |

## See Also

- [Living Docs Widget](./living-docs-widget.md) — prose view that fires the trace-jump event consumed here
- [Impact List Widget](./impact-list-widget.md) — between-version impact analysis that fires the same trace-jump event
- [UI Engine Architecture](./ui-engine-architecture.md) — package and component inventory
