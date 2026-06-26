---
title: Session Analyzer & Upgrades
sidebar_label: Session Analyzer & Upgrades
sidebar_position: 10
---

# Session Analyzer & Upgrades (v1.8.3)

Version 1.8.3 introduces several core upgrades to improve agentic performance, transparency, diagnostic speed, and distribution security. This guide covers these upgrades, including the new **Interactive Session Analyzer** tool.

---

## 📊 Interactive Session Analyzer

To avoid manually querying raw SQLite tables or tracing database logs when debugging issues or analyzing agent behavior, you can use the dedicated **Session Analyzer** script.

The script resides at: `scripts/analyze-session.ts` inside the `muonroi-cli` codebase.

### How to Run

Run the script from the root of your `muonroi-cli` checkout using Bun:

```bash
# 1. View the list of recent sessions (useful to copy session IDs)
bun run scripts/analyze-session.ts

# 2. Analyze a specific session (supports partial prefix matching)
bun run scripts/analyze-session.ts <session-id-prefix>

# 3. View full message contents and reasoning traces (no truncation)
bun run scripts/analyze-session.ts <session-id-prefix> --full-text (or -f)

# 4. Dump the complete analyzed data structure as raw JSON
bun run scripts/analyze-session.ts <session-id-prefix> --json (or -j)
```

### What It Displays

The tool parses the SQLite database at `~/.muonroi-cli/muonroi.db` and renders a clean, colorized terminal dashboard showing:

1. **🌲 Session Lineage Tree:** Displays parent-child relationships recursively (using Breadth-First Search) to trace rotated sessions and delegated sub-sessions.
2. **ℹ️ Metadata Overview:** Main session model, mode (agent/chat), status (active/completed), start/updated timestamps, active directory, and execution duration.
3. **💰 Cost & Token Dashboard:** Aggregates input tokens, output tokens, cache read tokens (with hit ratio), cache creation tokens, peak input tokens, and estimated USD cost across the entire session family tree.
4. **🧠 Experience Engine & Anti-Mù Stats:** Counts EE queries, rules injected, feedback sent, and compilation failures. It also displays anti-mù counters (compactions run, tool outputs elided, rehydrations from cache/disk/EE, and unavailable states).
5. **🎬 Chronological Timeline Flow:** Shows a step-by-step trace of the session:
   - **User Turns:** Prompt previews, PIL classification decisions (TaskType, layers run, confidence), and injected EE rules.
   - **Reasoning Thoughts:** Thought processes (chain-of-thought) of the assistant.
   - **Tool Execution Blocks:** Tool name, arguments preview, success/error status, execution duration, and output size (identifying concurrent runs).
   - **Compaction Events:** Token size before, kept sequence, and text summary.
   - **Council Debates:** Rounds run, speakers list, convergence status, and debate summary.
   - **Assistant Responses:** Text reply previews.

---

## ⚡ Parallel Tool Execution (Phase 1)

To minimize latency during multi-tool execution rounds, `muonroi-cli` supports **parallel execution of read-only tools** while serializing state-changing write tools.

- **SimpleMutex Serialization:** A FIFO mutex wraps execution blocks of non-read-only tools (like `edit_file`, `write_to_file`, `run_command` / `bash`, etc.) to prevent file corruption, race conditions, and system state pollution.
- **Concurrent Read-Only Execution:** Safe read-only operations (like `read_file`, `grep_search`, `lsp_query`, `ee_query`, `setup_guide`, etc.) bypass the mutex and are executed concurrently via `Promise.all` when returned in a single assistant turn.

---

## 🔄 TUI Update Checking & Encoding Cleanups

The TUI update flow has been modernized for better stability, formatting, and unicode rendering:

1. **Semver Comparison Logic:** The version comparator now detects if the local version is ahead of the remote release tag (e.g. running local builds or unpushed tags like `v1.8.3` when remote tag is `v1.8.1`). It displays `🚀 Ahead of Latest Release` instead of stating it is "already up to date".
2. **Markdown Panel Formatting:** Rather than printing raw, unformatted console text dumps, the `/update` results and command guidelines are styled as clean Markdown blocks (bold fields, lists, and code blocks) in the chat log.
3. **Unicode Encoding Cleanup:** All legacy encoding-corrupted stubs (e.g. CP1252 corrupted characters like `Γƒ│`, `ΓÇª`, `ΓÅ│`) inside the TUI status updates and heartbeat timers are replaced with standard, portable UTF-8 emojis (`🔄` checking, `⏳` elapsed, `...` ellipsis).

---

## 📦 Secured Public NPM Distribution

Due to the main repository transitioning to a private repository:

- **NPM Package Primacy:** Global installation via the public NPM registry (`npm install -g muonroi-cli`) or Bun (`bun add -g muonroi-cli`) is now the recommended primary installation method for external users, as it does not require private repository authorization.
- **Standalone Installers Fallback:** The standalone curl/irm scripts (`install.sh` / `install.ps1`) remain as an alternative but require users to have active GitHub credentials authorized to access the private repository.
