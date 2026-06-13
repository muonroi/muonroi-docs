---
title: Living Docs Widget
sidebar_position: 7
---

# Living Docs Widget

`mu-living-docs` is a Lit custom element that renders a generated living document for a workflow version. Each section of the document corresponds to one rule node (`DecisionNarrative`) and presents its BA-readable prose, inputs, outputs, and a trace-jump button that links into the traceability matrix.

The component is read-only by design for the current release (`read-only` defaults to `true`).

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
| `api-base-url` | `string` | `""` | No* | Base URL for the Living Docs read API. Required unless `doc-json` is provided. |
| `tenant-id` | `string` | `""` | No | Active tenant ID for API scoping. |
| `workflow` | `string` | `""` | No* | Workflow identifier. Required unless `doc-json` is provided. |
| `version` | `number` | `0` | No* | Rule version number. Required unless `doc-json` is provided. |
| `doc-json` | `string` | `""` | No | Pre-fetched `LivingDocModel` as a JSON string. When set, bypasses the API call entirely. |
| `read-only` | `boolean` | `true` | No | Always `true` for this release. Authoring mode is not yet available. |

\* Required when `doc-json` is not provided.

The component auto-loads on `connectedCallback` when `api-base-url`, `workflow`, and `version` are all set and `doc-json` is not provided. Setting `doc-json` at any time parses and renders the document immediately without a network call.

## Event

### `living-docs-node-trace-requested`

Dispatched when the user clicks the trace button on a rule section.

| Property | Value |
|----------|-------|
| `bubbles` | `true` |
| `composed` | `true` |
| `detail` | `{ nodeId: string }` |

Wire this event to `mu-traceability-matrix`'s `filter-rule` attribute to jump to the specific node in the matrix. See [Traceability Matrix Widget](./traceability-matrix-widget.md#wiring-trace-jump) for a wiring example.

## Security

`logicProse` content is rendered via Lit's standard text interpolation — it is auto-escaped and never passed to `unsafeHTML`. This prevents XSS even if a rule's prose content contains angle brackets or script tags (source constraint T-04-04). Fetch failures set `_error` without silent catch (T-04-05).

## API Endpoint

```
GET {api-base-url}/living-docs/{workflow}/{version}
```

Pass `"active"` as `version` to resolve the currently active version.

Response type: `LivingDocModel`

```ts
interface LivingDocModel {
  workflow: string;
  version: number;
  tenantId: string;
  generatedAt: string;               // ISO 8601
  generatedFromVersionHash: string;  // SHA-256 provenance hash
  sections: DecisionNarrative[];
  factDictionary: FactRef[];
  coverage: Coverage;
}

interface DecisionNarrative {
  nodeId: string;
  title: string;
  inputs: FactRef[];
  outputs: FactRef[];
  logicProse: string;   // BA-readable prose, no raw FEEL
  sourceKind: string;   // "feel" | "decision-table" | "nrules" | etc.
}

interface Coverage {
  unitTestLinkedCount: number;
  dryRunExampleCount: number;
  noCoverageCount: number;
  totalNodes: number;
}
```

## React Wrapper

`MuLivingDocsReact` is the `@lit/react`-wrapped version, exported from `@muonroi/ui-engine-react`.

Event mapping:

| React prop | DOM event |
|-----------|-----------|
| `onNodeTraceRequested` | `living-docs-node-trace-requested` |

## Usage

### Web Component

```html
<script type="module">
  import { MRegisterRuleComponents } from "@muonroi/ui-engine-rule-components";
  MRegisterRuleComponents();
</script>

<!-- Fetch from API -->
<mu-living-docs
  api-base-url="https://api.example.com/api/v1"
  tenant-id="tenant-abc"
  workflow="loan-approval"
  version="5"
></mu-living-docs>

<!-- Or pass pre-fetched JSON to bypass the API -->
<mu-living-docs
  doc-json='{"workflow":"loan-approval","version":5,...}'
></mu-living-docs>

<script>
  document.querySelector("mu-living-docs").addEventListener(
    "living-docs-node-trace-requested",
    (e) => {
      const matrix = document.querySelector("mu-traceability-matrix");
      matrix.setAttribute("filter-rule", e.detail.nodeId);
    }
  );
</script>
```

### React

```tsx
import { useState } from "react";
import { MuLivingDocsReact, MuTraceabilityMatrixReact } from "@muonroi/ui-engine-react";

export function DocsWithMatrix() {
  const [filterRule, setFilterRule] = useState("");

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
      <MuLivingDocsReact
        api-base-url="https://api.example.com/api/v1"
        tenant-id="tenant-abc"
        workflow="loan-approval"
        version={5}
        onNodeTraceRequested={(e) => setFilterRule(e.detail.nodeId)}
      />
      <MuTraceabilityMatrixReact
        api-base-url="https://api.example.com/api/v1"
        tenant-id="tenant-abc"
        workflow="loan-approval"
        version={5}
        filter-rule={filterRule}
      />
    </div>
  );
}
```

## States

| State | Display |
|-------|---------|
| Loading | Loading indicator while the API call is in flight |
| Error | Error message if the fetch fails or `doc-json` cannot be parsed |
| Empty | No sections rendered if `sections` array is empty |
| Populated | One prose block per `DecisionNarrative` in `sections` order |

## See Also

- [Traceability Matrix Widget](./traceability-matrix-widget.md) — full matrix; accepts `filter-rule` from this widget's trace-jump
- [Impact List Widget](./impact-list-widget.md) — between-version impact analysis with the same trace-jump event
- [UI Engine Architecture](./ui-engine-architecture.md) — package and component inventory
