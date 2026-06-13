---
title: Memory Adapters
sidebar_label: Memory Adapters
sidebar_position: 8
---

# Memory Adapters

The Experience Engine imports curated agent memory markdown directly into the knowledge brain without any LLM step. Four runtime adapters handle the different directory layouts and file formats used by each supported agent.

## Supported Runtimes

| Runtime | Memory path | File format |
|---------|-------------|-------------|
| **claude** | `~/.claude/projects/<slug>/memory/*.md` | Individual `.md` files with YAML frontmatter per entry |
| **gemini** | `~/.gemini/projects/<slug>/memory/MEMORY.md` | Single-file bullet list |
| **antigravity** | `~/.gemini/antigravity/projects/<slug>/memory/MEMORY.md` | Single-file bullet list |
| **codex** | `~/.codex/projects/<slug>/memory/MEMORY.md` | Single-file bullet list |

> **Antigravity** is a separate Gemini CLI runtime with its own project namespace. Its memory lives under `~/.gemini/antigravity/` — not `~/.gemini/projects/`.

> **Codex note:** Codex also auto-generates a raw global memory under `~/.codex/memories/`. The adapter intentionally ignores that directory; it only reads the per-project curated `MEMORY.md` files that the agent-instruction injector teaches Codex to maintain.

> **Claude note:** The claude adapter skips `MEMORY.md` within each project's memory directory (`excludeMemoryMd: true`) — each lesson is a separate frontmatter file. The single-file format is only used by the three remaining runtimes.

## MEMORY.md Single-File Format

For Gemini, Antigravity, and Codex, all lessons live in one `MEMORY.md` per project. Lessons are top-level bullets; markdown headings become part of the description prefix.

```markdown
## Architecture

- **Library-first**: Always use the established library pattern before writing custom code.
- **[feedback] No silent catch**: Never write empty catch blocks — always log err.message.

## Deployment

- **VPS path**: Deployments go through /opt/muonroi/update.sh on the Apache host.
1. **Numbered bullets work too**: dash, asterisk, and `1.` / `1)` are all parsed.
```

### Bullet label format

Each bullet label can optionally be bold (`**Label**: description`) or plain text. The bold form (`**Label**: rest of line`) splits neatly into `name` and `description`. Plain-text bullets use the first 40 characters as the name.

### Inline `[type]` override

A bullet defaults to the `project` type. To route a bullet to the behavioral tier (T1) instead, prefix the bold label with `[feedback]`:

```markdown
- **[feedback] No silent catch**: Never write empty catch blocks — always log err.message.
```

Only the four type keys below are honored as overrides. Anything else is kept as literal label text.

### Duplicate label deduplication

If two bullets in the same file share the same label, the importer appends a counter to keep stable IDs unique: `Foo`, `Foo #2`, `Foo #3`. This prevents silent upsert collisions.

## Type Routing

The importer maps each entry's `type` to a Qdrant collection and tier:

| Type | Collection | Tier | Confidence | Evidence class |
|------|-----------|------|-----------|----------------|
| `feedback` | `experience-behavioral` | T1 | 0.78 | `user-correction` |
| `project` (default) | `experience-selfqa` | T2 | 0.70 | `other` |
| `user` | — | skipped | — | — |
| `reference` | — | skipped by default | — | — |

`user` entries (agent profile notes) and `reference` entries (URL pointers) are not surfaced during hint injection — they add no actionable warning value. Reference entries can be included with the `--include-reference` flag.

### Large project dump guard

A `project`-typed entry with more than 6,000 characters that lacks a `**Why:**` / `**How to apply:**` rationale section is treated as a status/findings dump and skipped. Pass `--include-reference` to override.

## Claude per-file YAML Frontmatter

For the claude runtime, each `.md` file in `~/.claude/projects/<slug>/memory/` is a single entry with a YAML frontmatter header:

```markdown
---
name: Library-first
type: feedback
description: Always use the established library before writing custom code.
node_type: runbook          # optional — marks this as a runbook entry
derivedFromId: [a1b2c3d4]  # optional — links to source experience IDs
---

Full lesson body goes here.

**Why:** Consistent patterns reduce cognitive load and bugs.
**How to apply:** Check existing adapters before writing a new one.
```

Supported frontmatter fields:

| Field | Purpose |
|-------|---------|
| `name` | Entry name (falls back to filename without `.md`) |
| `type` | `feedback`, `project`, `user`, or `reference` |
| `description` | Short summary shown in hint output |
| `node_type` | Set to `runbook` to mark this as a runbook entry |
| `derivedFromId` | Space- or comma-separated list of 8-char experience ID prefixes this runbook was derived from |

## CLI Reference

### `import-memory.js`

Scans all runtime adapters and upserts new or changed entries into the brain. Incremental — an mtime marker at `~/.experience/.memory-import-marker.json` tracks which files have already been processed.

```bash
# Preview without writing anything
node .experience/tools/import-memory.js --dry-run -v

# Import all runtimes (default)
node .experience/tools/import-memory.js

# Import a single runtime
node .experience/tools/import-memory.js --runtime claude
node .experience/tools/import-memory.js --runtime gemini,antigravity

# Import a single project only
node .experience/tools/import-memory.js --project muonroi-cli

# Force re-import all files (ignore the mtime marker)
node .experience/tools/import-memory.js --reset-marker

# Also import `reference`-typed entries (skipped by default)
node .experience/tools/import-memory.js --include-reference
```

| Flag | Description |
|------|-------------|
| `--runtime <list>` | Comma-separated runtime filter: `claude`, `gemini`, `antigravity`, `codex` |
| `--project <slug>` | Only process entries scoped to this project slug |
| `--dry-run` | Print what would be imported; do not write to the brain |
| `--reset-marker` | Clear the mtime marker so all files are re-processed |
| `--include-reference` | Import `reference`-typed entries (normally skipped) |
| `-v` / `--verbose` | Verbose logging |

**Transport auto-detection:** On a thin-client machine (where `config.json` has `serverBaseUrl` set), the tool scans and maps entries locally — because project-slug derivation needs the local filesystem — then POSTs pre-mapped experiences to the server's `/api/import-memory` in batches of 10. On a server-local install (Qdrant reachable directly), it calls `storeImportedExperience` inline.

### `purge-imported-memory.js`

Deletes every entry created by the memory importer (identified by `payload.createdFrom === 'seed-memory-import'`) from the T1 and T2 collections. Runs in dry-run mode by default.

```bash
# Preview deletions (safe)
node .experience/tools/purge-imported-memory.js

# Actually delete
node .experience/tools/purge-imported-memory.js --apply
```

Use this when re-import would orphan old entries (for example, after a scope-mapping fix changes stable IDs). After purging, run `import-memory.js --reset-marker` to repopulate.

---

## Related

- [How It Works](./how-it-works) — Knowledge tier architecture and evolution cycle
- [Getting Started](./getting-started) — Bootstrap and upgrade paths
- [Observability](./observability) — Activity log and unrated recall debt
