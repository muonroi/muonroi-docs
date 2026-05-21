---
title: Session Resume & Scaffold Recovery
sidebar_position: 8
---

# Session Resume & Scaffold Recovery

How to recover an `/ideal` run after a CLI exit, a crash, or a scaffold
failure — without re-paying for council debate.

If this guide and the code disagree, the code wins. Source links throughout.

## TL;DR

```powershell
# 1. Open TUI with the previous DB session (chat history + agent context)
cd D:\Personal\Core\<your-project-root>
bun <muonroi-cli>\src\index.ts -s <sessionId|latest>

# 2. Inside the TUI, resume the /ideal run (skips research/scoping/debate)
/ideal resume <runId>
```

- `<sessionId>` — DB session id, shown in the TUI top-right corner
  (e.g. `37bd4ebceb31`). Or pass `latest`.
- `<runId>` — `/ideal` loop-driver run id (e.g. `mpe9xpmxddf1`). Appears in
  `route_decision` log rows and as the directory name under
  `.muonroi-flow/runs/`.

## Two layers of persistence

`-s` and `/ideal resume` recover **different things**. You typically need
both, in this order.

### Layer 1 — DB session (`-s`)

Source: `src/storage/sessions.ts`, invoked at `src/index.ts:1106`
(`startInteractive`).

Restores the **conversation thread** the orchestrator and TUI see:

- All user/assistant messages → re-rendered as chat bubbles.
- Council messages (`council.council_message`, `council.council_summary`).
- All UI interaction log rows (askcards answered, halt cards, init-new
  attempts).
- Last cwd, last model, last cost counters.

It does **not** restore:

- The active `/ideal` FSM state (current phase, sprint number, queued plan).
- In-memory React state (open modals, form steps, the halt card itself).

### Layer 2 — Product-loop FSM (`/ideal resume`)

Source: `runResume` at `src/product-loop/index.ts:1097-1175`.

Restores the **machine state** of an `/ideal` run from the per-run directory
under `.muonroi-flow/runs/<runId>/`:

| File | Purpose |
|---|---|
| `manifest.md` | Original idea, `capUsd`, `maxSprints`, `doneThreshold`, `stack` |
| `state.md` | FSM phase state + last activity timestamp |
| `phases.md` | Council-decided phase plan |
| `roadmap.md` | Phase ordering + dependencies |
| `tasks.json` | Per-phase task breakdown |
| `project-context.md` | Aggregated askcard answers (target / scope / audience / stack) |
| `assumptions.json` | Inferred assumptions surfaced for user gate |
| `gray-areas.md` | Items the council flagged as undecided |
| `delegations.md` | Phase → speaker role assignments |
| `iterations.md` | One block per executed sprint; `lastVerifyResult` field is the in-flight marker |
| `scaffold-checkpoint.json` | Last init-new attempt: `submitted` / `done` / `error` + inputs |

`runResume`:

1. Loads `manifest.md`; bails if missing or `aborted=true`.
2. Reads `iterations.md`; if the last block has no `lastVerifyResult` (or
   `UNKNOWN`), marks that sprint **crashed** and replays it.
3. Fires EE `phase-outcome=resumed` for cross-run memory.
4. Hands off to either the phase-orchestrated path (default,
   `MUONROI_PHASE_MODE != "0"`) or legacy `drainSprints`.

The original council debate **does not re-run** — phases/roadmap/tasks are
authoritative on disk.

## Why both layers

| You want | Tool | Why |
|---|---|---|
| See chat history of previous TUI run | `-s` | DB messages |
| Restore agent's understanding of the conversation | `-s` | Orchestrator history |
| Continue `/ideal` where it halted (init-new, askcard, sprint mid-flight) | `/ideal resume <runId>` | FSM state from `.muonroi-flow/` |
| Replay a failed scaffold without re-debating | `/ideal resume <runId>`, then press `R` on init-new error card | Scaffold checkpoint + inline retry |

`/ideal resume` works **without** `-s` (FSM state is on disk, not in the
DB), but the TUI bubble pane will be empty — no chat history to scroll
through. Combine them when you want both.

## What lives where — quick map

```
~/.muonroi-cli/
  muonroi.db                            ← DB sessions, message rows,
                                          UI interaction log
  crash.log                             ← uncaughtException / rejection log

<projectRoot>/                          ← cwd when /ideal was started
  .muonroi-flow/
    roadmap.md  state.md  backlog.md  decisions.md
    history/                            ← compacted older runs
    runs/
      <runId>/                          ← one dir per /ideal start
        manifest.md
        state.md
        phases.md  roadmap.md  tasks.json
        project-context.md  assumptions.json
        gray-areas.md  delegations.md
        iterations.md
        scaffold-checkpoint.json        ← init-new attempt snapshot
```

In-memory only, lost on TUI exit:

- React `useState` (init-new form step, halt card index, toggles).
- `useRef` (`originalIdealPromptRef`, `queuedMessagesRef`,
  `processMessageRef`).
- Active LLM stream, in-flight tool calls.
- OpenTUI focus / scroll position.

## Scaffold-checkpoint integration

Source: `src/flow/scaffold-checkpoint.ts`, wired into the init-new flow at
`src/ui/app.tsx` via `runScaffoldAttempt`.

Triggered every time the user submits the init-new form (from either
design-preview or bb-template step). Lifecycle:

```
submitted  →  done      (success — form clears, /ideal continuation prompt fires)
           →  error     (catch — UI flips to step="error", errorRetryable=true,
                         replayInputs persisted in form state + on disk)
```

### Press `R` to retry without re-debate

When the error card is visible, pressing **R** re-invokes
`runScaffoldAttempt` with the same `replayInputs`. No form steps walked,
no council re-run, no DB write — just a fresh attempt at
`initNewProject`. Useful when the failure was transient (locked file,
NuGet feed flake, missing template that you just installed manually).

The error-card hint line shows `↻ Press R to retry — inputs preserved,
không debate lại` when retry is available. Any other key dismisses the
card as before.

### Cross-session resume (file is written, UI not yet wired)

The checkpoint file is written even when the user exits the CLI without
pressing R. A future TUI startup hook can scan
`.muonroi-flow/runs/*/scaffold-checkpoint.json` (via
`listResumableScaffoldCheckpoints`, already exported) and offer "Resume
scaffold from `<date>`?" as a halt-card variant. The persistence layer is
in place; the boot-time UI is the open follow-up.

## End-to-end recovery recipe

Concrete scenario: `/ideal` debate finished, halt card surfaced
"Init new project", user picked it, scaffold threw `ENOENT … client/src/api/client.ts`
and the form is now stuck in `step="error"`.

```powershell
# 1. Identify the runId. Easiest source — chat-export of the session:
muonroi-cli export <sessionId>           # writes chat-export-<sid>.txt
# Search for: route_decision … runId=<x>

# Or list runs directly under the project cwd:
Get-ChildItem D:\Personal\Core\<projectRoot>\.muonroi-flow\runs

# 2. Remove the partial scaffold (initNewProject refuses to overwrite).
Remove-Item -Recurse -Force D:\Personal\Core\<projectRoot>\<projectName>

# 3. Re-open the TUI on the old DB session.
cd D:\Personal\Core\<projectRoot>
bun <muonroi-cli>\src\index.ts -s <sessionId>

# 4. Inside the TUI: resume the FSM.
/ideal resume <runId>

# 5. Halt card resurfaces → "Init new project" → name → fe-stack → bb-template.
#    Scaffold should now succeed (or fail loudly enough to press R).
```

## When resume **won't** help

- `manifest.aborted=true` (`/ideal abort` was used) → resume errors with
  `aborted`.
- `.muonroi-flow/runs/<runId>/` was deleted or moved.
- The cwd no longer matches — `/ideal resume` reads from the current
  working directory's `.muonroi-flow/`. Start the TUI from the same
  directory you started the original run.
- The previous run's manifest is corrupt / wrong schema version. There is
  no schema-migration path; treat as unrecoverable and `/ideal` start fresh.

## Source map

| File | Role |
|---|---|
| `src/storage/sessions.ts` | DB session restore (`-s`) |
| `src/index.ts:1097-1110` | Argv → `startInteractive(session)` |
| `src/product-loop/index.ts:96-130` | `runProductLoop` switch (start/status/resume/abort/ship) |
| `src/product-loop/index.ts:1097-1175` | `runResume` implementation |
| `src/ui/slash/ideal.ts:117-133` | `/ideal resume <runId>` parser |
| `src/flow/scaffold-checkpoint.ts` | `writeScaffoldCheckpoint`, `readScaffoldCheckpoint`, `listResumableScaffoldCheckpoints` |
| `src/ui/app.tsx` (`runScaffoldAttempt`) | Wires checkpoint writes into both init-new submit branches + R-key retry |
| `src/ui/components/init-new-form-card.tsx` | `errorRetryable` / `replayInputs` / `checkpointRunId` fields |
| `src/scaffold/init-new.ts` (`write` helper) | Recursive `mkdir(dirname)` before `writeFile` — eliminates ENOENT on nested FE paths |

## Related docs

- [`/ideal` Product Loop](./ideal-product-loop.md) — full subcommand surface
  and lifecycle FSM.
- [Council Debate](./council-debate.md) — what gets persisted as
  `council.council_*` rows that `-s` restores.
- [Scaffold (`/ideal` BB path)](./scaffold-ideal-bb.md) — the init-new
  pipeline this guide recovers.
