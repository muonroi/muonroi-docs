---
title: Protocol Schema Reference
sidebar_label: Protocol Schema
sidebar_position: 5
---

# Protocol Schema Reference

Wire-level reference for the agent-harness protocol used by `muonroi-cli` to expose its TUI to external agents (Claude CLI, Codex, Gemini, MCP clients). All shapes below are defined in TypeScript at `packages/agent-harness-core/src/protocol.ts` in the `muonroi-cli` repository and are mirrored in `docs/agent-harness/schema.json` (JSON Schema, normative for binding generation).

This page documents v0.4.0 of the protocol. Lines cited as `protocol.ts:NN` refer to that file.

## 1. Overview

The harness exchanges three kinds of payloads:

- **`LiveFrame`** — a snapshot of the current UI tree (semantic nodes, focus, modal stack).
- **`LiveEvent`** — a discrete lifecycle event (route decision, council step, askcard open, toast, etc.).
- **`DesignSpec`** — a static description of layouts, states, and transitions used in design mode.

The constant `PROTOCOL_VERSION = "0.4.0"` is exported (`protocol.ts:1`) and embedded in every `LiveFrame` and `DesignSpec` so consumers can detect mismatches.

### Transports

Messages are JSON Lines (one UTF-8 JSON object per `\n`-terminated line, 1 MiB cap).

| Transport | Direction | Used by |
|-----------|-----------|---------|
| POSIX file descriptors 3 (child → driver) and 4 (driver → child) | Two simplex streams | Linux/macOS spawn-based E2E specs |
| Windows named pipes `\\.\pipe\muonroi-harness-{pid}-{uuid}-{in\|out}` | Two simplex streams | Windows spawn-based E2E specs |
| WebSocket — single bi-directional socket with explicit `dir` envelope | Duplex | React / Angular browser adapters |

The fd 3/4 and named-pipe transports emit raw `LiveFrame` / `LiveEvent` objects. The WebSocket transport wraps every message in an envelope with a `dir: "frame" | "event" | "cmd"` discriminator (see `docs/agent-harness/TRANSPORTS.md` in the `muonroi-cli` repo). Consumers MUST silently ignore unrecognised `dir` values for forward compatibility.

The harness driver selects the transport automatically (`src/agent-harness/test-spawn.ts`). Spec files have no platform guards.

## 2. LiveFrame

A `LiveFrame` is the top-level snapshot pushed on every UI change (`protocol.ts:44-52`).

```typescript
type LiveFrame = {
  mode: "live";
  version: typeof PROTOCOL_VERSION;  // "0.4.0"
  seq: number;                       // monotonic, strictly increasing
  ts: number;                        // UNIX timestamp in milliseconds
  focus?: string;                    // id of the currently focused node
  modals?: string[];                 // modal stack, top of stack is last
  nodes: UINode[];                   // root nodes of the tree
};
```

Rules:

- `seq` strictly increases. Gaps signal dropped frames.
- `focus`, if present, must reference an `id` reachable through `nodes`.
- `modals` is ordered bottom-up. The active modal is `modals[modals.length - 1]`.
- The TUI deduplicates identical successive frames before emitting, so consumers can use `seq` to gate state machines.

## 3. UINode

A `UINode` is a single element in the semantic UI tree (`protocol.ts:29-42`).

```typescript
type UINode = {
  id: string;                       // stable within session
  role: Role;                       // see role enum below
  name?: string;                    // human-readable label
  value?: string;                   // textbox content, or id of selected child for container roles
  focus?: true;
  selected?: true;
  disabled?: true;
  hidden?: true;
  isModal?: true;
  state?: string;                   // "loading" | "error" | custom
  props?: Record<string, unknown>;  // opaque to selector matching by default
  children?: UINode[];
};
```

Boolean flags use the `?: true` pattern — they are present (`true`) when set and omitted otherwise. Consumers MUST treat absence as `false`.

For container roles (`listbox`, `radiogroup`, `tablist`), `value` carries the `id` of the selected child so selectors can avoid walking the tree.

### 3.1 Role enum

The role vocabulary is closed at this protocol version (`protocol.ts:3-27`). Additions require a minor version bump.

| Group | Roles |
|-------|-------|
| Containers / dialogs | `dialog`, `region` |
| Inputs | `textbox`, `checkbox`, `radio`, `radiogroup` |
| Lists & menus | `listbox`, `listitem`, `menu`, `menuitem` |
| Tabs & trees | `tab`, `tablist`, `tree`, `treeitem` |
| Tables | `table`, `row`, `cell` |
| Buttons | `button` |
| Status / feedback | `progressbar`, `spinner`, `log`, `statusbar`, `toast`, `tooltip` |

## 4. LiveEvent

A `LiveEvent` is a discrete signal emitted outside the frame cadence (`protocol.ts:54-221`). Every event is a tagged union with either `t: "event"` and a `kind` discriminator, or the sentinel `{ t: "idle" }`.

### 4.1 Event kinds

| `kind` | When emitted | Key payload fields |
|--------|--------------|--------------------|
| `route-decision` | `/ideal` dispatched and routing decision made | `path: "hot-path" \| "council"`, `complexity`, `forceCouncil`, `runId` |
| `council-step` | Council phase changes state | `phaseId`, `phaseKind`, `state` (`"active"`\|`"done"`\|`"error"`), `label`, `elapsedMs?` |
| `council-speaker` | Per-role speaker turn boundary | `role`, `status: "start" \| "done"`, `round?`, `correlationId` |
| `askcard-open` | Council question card displayed | `questionId`, `question`, `phase`, `optionCount`, `defaultIndex?` |
| `askcard-answered` | User answers a question card | `questionId`, `answerKind: "choice" \| "freetext" \| "chat"`, `answerText` (redacted if it matches an API-key pattern) |
| `askcard-cancel` | User pressed Escape on a question card | `questionId` |
| `sprint-stage` | Sprint enters a new stage | `sprintIndex` (1-based), `stage: "planning" \| "implementation" \| "verification" \| "judgment"`, `runId` |
| `sprint-halt` | CB-gate fired, sprint halted | `sprintN`, `reason`, `runId` |
| `sprint-plan-committed` | Leader or council committed the final sprint plan before the first sprint fires | `runId`, `projectDir` (nullable), `sprintCount`, `sprintIds` (`readonly string[]`), `source: "leader" \| "council" \| "auto"`, `ts` |
| `llm-token` | Streaming text delta from a model (opt-in) | `correlationId`, `delta`, `tokenIndex` |
| `llm-done` | LLM call completed | `correlationId`, `totalChars`, `finishReason` |
| `usage` | Normalised usage event (Phase D) | `source`, `model`, `inputTokens?`, `outputTokens?`, `cacheReadTokens?`, `cacheCreationTokens?`, `messageSeq?` |
| `toast` | Toast notification displayed | `level: "info" \| "warn" \| "error"`, `text`, `ttlMs?` |
| `stream.delta` | Streaming text chunk into a node | `target`, `text` |
| `ee-timeout` | Experience-Engine call exceeded its budget | `source`, `elapsedMs?`, `budgetMs?`, `ts` |
| `ee-error` | Experience-Engine call failed (non-timeout) | `source`, `name?`, `message?`, `ts` |
| `disconnect` | Transport stream ended or closed | `reason: "end" \| "close"`, `ts` |
| `stream-retry` | Orchestrator retry loop fired before backoff sleep | `attempt` (1-based), `maxAttempts`, `errorName`, `errorMessage`, `nextDelayMs` |

The idle sentinel `{ t: "idle" }` indicates the TUI has settled — no pending renders, timers, or in-flight tool calls. Consumers use it to gate the next interaction. It is the only `LiveEvent` variant without `kind`.

### 4.2 Filtering with `MUONROI_HARNESS_EVENTS`

The producer side honours an environment variable to limit which event kinds reach the sidechannel:

| Value | Effect |
|-------|--------|
| _(unset)_ | Lifecycle preset — every kind except `llm-token` |
| `lifecycle` | Same as unset |
| `*` or `all` | All kinds including the high-volume `llm-token` stream |
| Comma-separated allowlist, e.g. `llm-token,council-step` | Exact match — only listed kinds are emitted |

`llm-token` is off by default because token-level streaming can exceed 80–120 events per second per model. Enable it only when token correlation is needed.

## 5. Selector grammar

Selectors identify nodes inside a `LiveFrame`. The driver exposes them through `query`, `queryAll`, `count`, `expect`, `focus`, and `wait_for({ selector })`.

```
selector  := term (combinator term)*
combinator:= ' '      (descendant)
           | ' >> '   (direct child)
term      := key op value | flag | '[' positional ']'
key       := role | name | id | state | value | text | props.<dotpath>
op        := '='   (exact match)
           | '~='  (contains, case-insensitive)
           | '*='  (regex match)
flag      := focus | selected | disabled
positional:= 'index=' N
value     := bareword | "quoted string"
```

Examples:

```
role=textbox focus
role=button name="Send"
role=button name~="send"
role=listbox name="Council picker" >> role=listitem [index=2]
role=statusbar props.level*=^(warn|error)$
role=listitem selected
id=composer
```

Multiple terms in the same step combine via AND. `props.<key>` uses dotted access into the opaque `props` map, so consumers must opt in to match against it.

## 6. DesignSpec

`DesignSpec` (`protocol.ts:225-237`) describes static layouts, states, and transitions for design-mode tooling and QA agents.

```typescript
type StatePatch = { id: string } & Partial<Omit<UINode, "children" | "id">>;

type DesignSpec = {
  mode: "design";
  version: typeof PROTOCOL_VERSION;
  target?: "tui" | "react" | "angular" | "any";
  scenes: Array<{
    id: string;
    name: string;
    layout: UINode;
    states?: Array<{ name: string; patches: StatePatch[] }>;
    transitions?: Array<{ from: string; on: string; to: string }>;
    notes?: string;
  }>;
};
```

State resolution algorithm:

1. **Locate** — for each `StatePatch`, find the node in `scene.layout` by `id`. A missing id is a validation error.
2. **Merge** — shallow-merge all non-`children` fields from the patch onto the located node.
3. **Constraint** — `children` are never patched. If a state needs different children, declare it as a separate scene.

## 7. HarnessMessage

`HarnessMessage = LiveFrame | LiveEvent` (`protocol.ts:239`) is the union written to every transport. Consumers discriminate on `mode === "live"` first (for frames) and otherwise on `t` / `kind` (for events).

## 8. Sample payloads

### 8.1 LiveFrame

```json
{
  "mode": "live",
  "version": "0.4.0",
  "seq": 142,
  "ts": 1747267200000,
  "focus": "composer",
  "modals": ["slash-menu"],
  "nodes": [
    {
      "id": "root",
      "role": "region",
      "name": "muonroi-cli",
      "children": [
        { "id": "status", "role": "statusbar", "name": "Ready", "props": { "level": "info" } },
        {
          "id": "log",
          "role": "log",
          "children": [
            { "id": "msg-0", "role": "listitem", "name": "user", "value": "/ideal build a counter" }
          ]
        },
        { "id": "composer", "role": "textbox", "value": "", "focus": true },
        {
          "id": "slash-menu",
          "role": "menu",
          "isModal": true,
          "name": "Slash commands",
          "children": [
            { "id": "slash-item-0", "role": "menuitem", "name": "/ideal", "selected": true },
            { "id": "slash-item-1", "role": "menuitem", "name": "/council" }
          ]
        }
      ]
    }
  ]
}
```

### 8.2 LiveEvent — route decision

```json
{
  "t": "event",
  "kind": "route-decision",
  "path": "council",
  "complexity": "medium",
  "forceCouncil": true,
  "runId": "ideal-7c1f"
}
```

### 8.3 LiveEvent — council step

```json
{
  "t": "event",
  "kind": "council-step",
  "phaseId": "synthesis",
  "phaseKind": "synthesis",
  "state": "done",
  "label": "Synthesis",
  "elapsedMs": 4821
}
```

### 8.4 LiveEvent — askcard open

```json
{
  "t": "event",
  "kind": "askcard-open",
  "questionId": "q-clarify-3",
  "question": "Which database backend should the counter use?",
  "phase": "clarify",
  "optionCount": 3,
  "defaultIndex": 0
}
```

### 8.5 LiveEvent — toast

```json
{
  "t": "event",
  "kind": "toast",
  "level": "error",
  "text": "LLM call failed: 429 rate limited",
  "ttlMs": 6000
}
```

### 8.6 LiveEvent — idle sentinel

```json
{ "t": "idle" }
```

### 8.7 WebSocket envelopes

```json
{ "dir": "frame", "mode": "live", "version": "0.4.0", "seq": 1, "ts": 1747267200000, "nodes": [] }
{ "dir": "event", "t": "event", "kind": "toast", "level": "info", "text": "Ready", "ttlMs": 3000 }
{ "dir": "event", "t": "idle" }
{ "dir": "cmd", "op": "press", "key": "Enter" }
{ "dir": "cmd", "op": "type", "text": "hello world" }
{ "dir": "cmd", "op": "focus", "id": "composer" }
```

## 9. JSON Schema artifact

A machine-readable JSON Schema describing the protocol ships with the `muonroi-cli` repo at `docs/agent-harness/schema.json`. It is the normative source for code generators and validators. Regenerate bindings from this file rather than hand-translating the TypeScript types.

Full transport-level spec (security boundary, Zod schema for the WebSocket envelope, wire examples) lives in `docs/agent-harness/TRANSPORTS.md` next to it.

## 10. Version policy

- Every frame and design spec carries the `version` constant (`"0.4.0"` at this revision).
- **Major mismatch** (e.g. `1.x` vs `0.x`) — consumer must reject the message and surface a version-incompatibility error.
- **Minor additions** — consumers MUST ignore unknown fields and unknown `LiveEvent` kinds. The harness driver buffers events into a ring (cap 1000) and replays them to late subscribers, so a forward-compatible consumer can simply skip kinds it does not recognise.
- **Deprecations** — producers may emit `deprecated_fields?: string[]` and must keep supporting deprecated fields for two minor versions.

No fields are deprecated at v0.4.0.
