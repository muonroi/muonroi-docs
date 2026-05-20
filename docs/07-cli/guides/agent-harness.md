---
title: Agent Harness
sidebar_label: Agent Harness
sidebar_position: 5
---

# Agent Harness

The Agent Harness is a multi-framework protocol that enables external agents (Claude, Codex, Gemini) to drive muonroi-cli TUI applications by querying a semantic tree instead of taking screenshots. Token cost is approximately 1/10 of vision-based tools like Playwright, making it ideal for long-running agentic workflows.

## Why Semantic Trees?

Traditional vision-based agents take screenshots and parse them with image models. This approach is:
- **Expensive**: screenshot → OCR/vision model → decision
- **Fragile**: rendering changes break parsing
- **Slow**: serializing/deserializing images adds latency

The Agent Harness instead exposes the live UI as a semantic tree — a structured JSON representation of roles, names, states, and properties. Agents query this tree using simple selectors (`role=dialog name~='Recovery'`), receive compact JSON responses, and issue commands (`press`, `type`, `focus`). No images, no vision models, no re-rendering inference loops.

## Architecture

```
External agent (Claude, Codex, Gemini)
  │  driver.query("role=dialog name~='Recovery'")
  │  driver.press("Enter")
  ▼
WebSocket / fd 3-4 / Named pipe transport
  ▼
Semantic registry  ── 30-60 Hz snapshot, hash-dedup
  ▼
TUI / React web app / Angular web app
```

The flow is unidirectional from the UI perspective: the UI component (OpenTUI, React, Angular) registers its nodes with a semantic registry. The registry snapshots at 30-60 Hz and deduplicates unchanged trees. When an agent sends a command, it flows back through the transport to the TUI component, which executes the corresponding action (focus, type, press key).

## Transport Layer

Three transport mechanisms are supported so harnesses work across environments:

| Transport | Used by | Channel | Format |
|---|---|---|---|
| **fd 3 / fd 4** | POSIX OpenTUI subprocess spawn | Two separate unidirectional file descriptors | Line-delimited JSON (no envelope) |
| **Named pipes** | Windows OpenTUI subprocess spawn | Two separate named pipes (`\\.\pipe\muonroi-harness-{pid}-{uuid}-{in\|out}`) | Line-delimited JSON (no envelope) |
| **WebSocket** | React / Angular web app integration | Single bidirectional socket | Line-delimited JSON with `dir` envelope |

The WebSocket transport requires a `dir` discriminator (`"frame"`, `"event"`, `"cmd"`) because a single socket carries traffic in both directions. The fd 3/4 and named-pipe transports use separate channels, so direction is implicit.

## Packages

Four npm packages implement the harness for different frameworks:

| Package | Runtime | Size | Use case |
|---|---|---|---|
| `@muonroi/agent-harness-core` | Node + browser | Framework-agnostic | Protocol types, selectors, driver, WebSocket transport, MCP server |
| `@muonroi/agent-harness-opentui` | OpenTUI (terminal React) | Plugin | TUI integration (Terminal.app, Hyper, iTerm2) |
| `@muonroi/agent-harness-react` | React DOM 18+ | 346 B (harness off) / 914 B (on) | React web app integration |
| `@muonroi/agent-harness-angular` | Angular 16+ | ≤ 8 KB | Angular web app integration |

Install via bun:
```bash
bun add @muonroi/agent-harness-core
bun add @muonroi/agent-harness-react   # if using React
```

## Quick Integration

### React

Import the harness adapter and wrap your app root:

```tsx
import { AgentHarnessProvider } from '@muonroi/agent-harness-react';

export function App() {
  return (
    <AgentHarnessProvider debug={false}>
      <YourApp />
    </AgentHarnessProvider>
  );
}
```

The provider automatically:
- Creates a WebSocket connection to the agent harness server (default `ws://127.0.0.1:7777`)
- Wraps React components in semantic nodes (role, name, value, state)
- Sends 30-60 Hz snapshots to the registry
- Receives and executes commands (`focus`, `type`, `press`)

Components register themselves by adding semantic attributes:

```tsx
<button 
  data-harness-role="button"
  data-harness-name="Submit"
  data-harness-id="submit-btn"
>
  Submit
</button>
```

### Angular

The Angular adapter follows the same pattern. Add the harness service to your root module:

```ts
import { AgentHarnessModule } from '@muonroi/agent-harness-angular';

@NgModule({
  imports: [AgentHarnessModule],
})
export class AppModule {}
```

Then mark components with directives:

```html
<button 
  appHarnessRole="button"
  appHarnessName="Submit"
  appHarnessId="submit-btn"
>
  Submit
</button>
```

See the framework-specific package README for complete API and configuration options.

## Semantic Selectors

Agents query the UI tree using a CSS-like selector grammar. The driver parses and evaluates selectors against the live semantic tree.

### Grammar

```
selector := term (space term)*
term     := role-match | name-match | value-match | state-match | id-match
role-match   := "role=" ("dialog" | "button" | "listbox" | "textbox" | ...)
name-match   := "name" ("=" | "~=" | "^=" | "$=" | "*=") string
value-match  := "value" ("=" | "~=") string
state-match  := "state=" ("loading" | "error" | custom)
id-match     := "id=" string
```

### Examples

```ts
// Exact name match
driver.query("role=dialog name='Recovery'")

// Regex-like substring match
driver.query("role=dialog name~='Recovery'")

// Case-insensitive prefix match
driver.query("role=button name^='OK'")

// Find focused element
driver.query("focus=true")

// Multiple conditions (AND)
driver.query("role=textbox name='Password' value=''")

// Props query (opaque object matching)
driver.query("role=cell props.row=5 props.col=2")
```

## Querying and Commanding

The agent driver provides methods to interact with the UI:

```ts
import { createDriver } from '@muonroi/agent-harness-core';

const driver = createDriver({ url: 'ws://127.0.0.1:7777', token: 'dev' });

// Query the tree
const nodes = await driver.query("role=dialog name~='Recovery'");
// => UINode[]

// Send commands
await driver.press("Enter");
await driver.type("hello");
await driver.focus("my-input-id");

// Wait for a condition
await driver.wait_for({ 
  role: "toast", 
  match: (node) => node.name?.includes("Success"),
  timeoutMs: 5000 
});
```

See `@muonroi/agent-harness-core` README for full driver API.

## Recovery Card

When the `/ideal` flow halts (no verify recipe found), a recovery card is displayed to the agent. This card presents three options for resuming work:

### Option 1: Init New
Scaffold a new project from `muonroi-building-block` with the appropriate frontend adapter (React, Angular, OpenTUI). This creates a fresh project with the harness pre-configured and ready for the agent to drive.

### Option 2: Point to Existing
Point the harness to an existing muonroi project. The harness will re-detect the project type, re-analyze the frontend adapter, and re-compute the verify recipe. Useful when switching between projects or re-running a workflow on updated code.

### Option 3: Continue as Council
Skip the code-driven verification gates (CB-3/verify) and proceed directly to council mode. The output is a structured `spec.md` document describing the final design and decisions made during the workflow, without running automated tests or verification recipes.

The recovery card is driven like any other dialog — agents query its elements, read descriptions, and press buttons to select an option.

## Protocol Reference

### UINode

Every element in the semantic tree is a `UINode`:

```ts
type UINode = {
  id: string;           // stable within session
  role: Role;           // "button" | "dialog" | "listbox" | ...
  name?: string;        // human-readable label
  value?: string;       // textbox content or selected child id
  focus?: true;         // present if focused
  selected?: true;      // present if selected
  disabled?: true;      // present if disabled
  hidden?: true;        // present if hidden
  state?: string;       // "loading" | "error" | custom
  props?: Record<string, unknown>;  // opaque extra data
  children?: UINode[];  // child nodes in tree order
};
```

### LiveFrame

A snapshot of the entire UI tree at a given moment:

```ts
type LiveFrame = {
  mode: "live";
  version: "0.1.0";
  seq: number;          // monotonic frame counter (detect drops)
  ts: number;           // UNIX timestamp (ms)
  focus?: string;       // id of currently focused node
  modals?: string[];    // modal stack: [bottom, ..., top]
  nodes: UINode[];      // root nodes of UI tree
};
```

### LiveEvent

Ephemeral events during a session (separate from frames):

```ts
type LiveEvent =
  | { kind: "toast"; level: "info" | "warn" | "error"; text: string }
  | { kind: "stream.delta"; target: string; text: string }
  | { kind: "llm-done"; correlationId: string; totalChars: number }
  // ... 8+ other event kinds (route-decision, council-step, sprint-halt, etc.)
```

Events are emitted at variable rates (toasts are rare, `llm-token` is high-volume) and can be filtered by kind. See `@muonroi/agent-harness-core` for the complete event enumeration.

## Role Vocabulary

The following roles are fixed in protocol v0.1.0:

```
dialog | textbox | listbox | listitem | button | checkbox | radio | radiogroup
tab | tablist | tree | treeitem | table | row | cell
progressbar | spinner | log | statusbar | menu | menuitem | toast | tooltip
```

Adding new roles requires a protocol version bump to 0.2.0. If your component doesn't fit these roles, use the closest match and store semantic details in `props`.

## Best Practices

1. **Deterministic IDs**: Never use render indices for `id`. Use stable keys (UUID, database ID, or deterministic path) so the same node gets the same ID across renders.

2. **Semantic Accuracy**: Choose roles carefully. A dialog is `role=dialog`, a modal button is `role=button` (not `dialog`).

3. **Name Labels**: Set `name` to human-readable text — button labels, dialog titles, placeholder text. Agents use `name` to find elements.

4. **State vs. Props**: Use `state` for semantic flags ("loading", "error", custom). Use `props` for opaque data (row index, pixel offset, async metadata).

5. **Modal Stack**: Always set the `modals` array in `LiveFrame` to the ordered stack of open modals. This helps agents understand nesting and precedence.

6. **Hash Dedup**: The registry deduplicates trees by hash (30-60 Hz becomes 1-10 Hz on average). Don't send frames that haven't changed.

## Related

- [Ideal Product Loop](./ideal-product-loop) — agent workflow that uses the harness to drive design exploration
- [@muonroi/agent-harness-core](https://github.com/muonroi/muonroi-cli/tree/main/packages/agent-harness-core) — full API docs and examples
- [PROTOCOL.md](https://github.com/muonroi/muonroi-cli/blob/main/docs/agent-harness/PROTOCOL.md) — protocol specification and role enumeration
- [TRANSPORTS.md](https://github.com/muonroi/muonroi-cli/blob/main/docs/agent-harness/TRANSPORTS.md) — transport layer reference (fd 3/4, named pipes, WebSocket)
