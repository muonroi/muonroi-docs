---
title: Impact List Widget
sidebar_position: 6
---

# Impact List Widget

`mu-impact-list` is a Lit custom element that renders the between-version impact analysis for a workflow. It lists every rule whose behavior changed between two versions, shows linked requirements and approvers, displays a three-state test-coverage badge, surfaces a UAT checklist, and fires a trace-jump event for cross-linking into the traceability matrix.

The component is virtualized via `@lit-labs/virtualizer` so it stays efficient even when hundreds of rules are affected.

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
| `tenant-id` | `string` | `""` | No | Active tenant ID. Forwarded to the API client for tenant scoping. |
| `workflow` | `string` | `""` | Yes | Workflow identifier to analyse. |
| `from-version` | `number` | `0` | Yes | Older version number for the diff baseline. |
| `to-version` | `number` | `0` | Yes | Newer version number for the diff target. |

The component auto-loads when all four required attributes (`api-base-url`, `workflow`, `from-version`, `to-version`) are set. It re-fetches whenever any of those four attributes change.

## Event

### `living-docs-node-trace-requested`

Dispatched when the user clicks the trace-jump button (↗) on an impact row.

| Property | Value |
|----------|-------|
| `bubbles` | `true` |
| `composed` | `true` |
| `detail` | `{ nodeId: string }` |

Wire this event to `mu-traceability-matrix`'s `filter-rule` attribute to jump directly to the relevant row in the matrix. See [Traceability Matrix Widget](./traceability-matrix-widget.md#wiring-trace-jump) for a wiring example.

## Coverage Badges

The component renders a three-state coverage badge for each impact row and each UAT checklist case. The mapping is fixed by the PROFILE-V1 constraint `C-01` — `DryRunExampleOnly` is never treated as `success`:

| `TestCoverageState` | Badge class | Label | Icon | Tooltip |
|---------------------|------------|-------|------|---------|
| `UnitTestLinked` | `badge--success` | Unit tested | ✓ | Covered by automated unit test linked via `[MExtractAsRule]` |
| `DryRunExampleOnly` | `badge--info` | Example only | ◻ | Covered by a dry-run example input only — not an automated unit test |
| `None` | `badge--warning` | No coverage | ⚠ | No test case or example linked to this rule |

`DryRunExampleOnly` always maps to `badge--info`, never `badge--success`. This constraint is enforced in the component source at `mu-impact-list.ts:72-78`.

## API Endpoint

```
GET {api-base-url}/traceability/{workflow}/impact?from={fromVersion}&to={toVersion}
```

Response type: `ImpactListResponse`

```ts
interface ImpactListResponse {
  workflow: string;
  fromVersion: number;
  toVersion: number;
  rows: ImpactRow[];           // Affected rules (D-05 columns)
  uatChecklist: {              // UAT checklist (D-02)
    nodeId: string;
    title: string;
    cases: UatCase[];
  }[];
}

interface ImpactRow {
  nodeId: string;
  title: string;
  requirements: RequirementRef[];   // Includes approver field
  testCoverage: TestCoverageInfo;   // { state, exampleId?, unitTestCode? }
  impactType: string;               // "allow→block" | "block→allow" | "none"
}

interface UatCase {
  exampleId: string;
  expectedOutcome: "allow" | "block";
  coverageBadge: TestCoverageState;
}
```

Tenant scope is enforced server-side. The client does not forward a tenant override — it cannot widen scope (T-05-09).

## React Wrapper

`MuImpactListReact` is the `@lit/react`-wrapped version, exported from `@muonroi/ui-engine-react`.

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

<mu-impact-list
  api-base-url="https://api.example.com/api/v1"
  tenant-id="tenant-abc"
  workflow="loan-approval"
  from-version="4"
  to-version="5"
></mu-impact-list>

<script>
  document.querySelector("mu-impact-list").addEventListener(
    "living-docs-node-trace-requested",
    (e) => {
      console.log("Trace node:", e.detail.nodeId);
    }
  );
</script>
```

### React

```tsx
import { useEffect, useState } from "react";
import { MLoadRuleEngineCustomElements, MuImpactListReact } from "@muonroi/ui-engine-react";

await MLoadRuleEngineCustomElements({ activationProof: proof });

export function ImpactPanel() {
  const [tracedNodeId, setTracedNodeId] = useState<string | null>(null);

  return (
    <>
      <MuImpactListReact
        api-base-url="https://api.example.com/api/v1"
        tenant-id="tenant-abc"
        workflow="loan-approval"
        from-version={4}
        to-version={5}
        onNodeTraceRequested={(e) => setTracedNodeId(e.detail.nodeId)}
      />
      {tracedNodeId && (
        <p>Tracing node: {tracedNodeId}</p>
      )}
    </>
  );
}
```

## States

| State | Display |
|-------|---------|
| Loading | "Loading impact analysis…" centered in the panel |
| Empty (no changes) | "No impact detected — No rules changed behavior between the two selected versions." |
| Error | Error message bar in error background color |
| Populated | 5-column impact list (Rule / Requirement+Approver / Tests to re-run / Impact type / Actions) followed by UAT Checklist grouped by node |

## See Also

- [Traceability Matrix Widget](./traceability-matrix-widget.md) — full matrix view; accepts `filter-rule` from this widget's trace-jump event
- [Living Docs Widget](./living-docs-widget.md) — prose view that fires the same `living-docs-node-trace-requested` event
- [UI Engine Architecture](./ui-engine-architecture.md) — package and component inventory
