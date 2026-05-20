---
title: Quickstart
sidebar_label: Quickstart
sidebar_position: 2
---

# Quickstart

Go from `git clone` to your first chat and your first `/ideal` product loop in under 10 minutes.

This is a hands-on, copy-pasteable walkthrough. For concepts and architecture, read the [Overview](./overview) first. For deep dives, head to the [guides](./guides/ideal-product-loop).

---

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Bun | 1.3.13+ | Primary runtime — required |
| Node.js | 20+ | Optional; used by some peer tooling |
| Git | any recent | For cloning |
| OS | Windows 10/11, macOS 13+, Linux | All three are first-class |

Check Bun is installed:

```powershell
# PowerShell (Windows)
bun --version
```

```bash
# bash (macOS / Linux / WSL)
bun --version
```

If Bun is missing, install from [bun.sh](https://bun.sh):

```powershell
# Windows (PowerShell)
powershell -c "irm bun.sh/install.ps1 | iex"
```

```bash
# macOS / Linux
curl -fsSL https://bun.sh/install | bash
```

---

## 2. Install

### Option A — clone from source (recommended for first run)

```powershell
# PowerShell
git clone https://github.com/muonroi/muonroi-cli.git
cd muonroi-cli
bun install
```

```bash
# bash
git clone https://github.com/muonroi/muonroi-cli.git
cd muonroi-cli && bun install
```

This pulls dependencies and runs `scripts/postinstall.ts` to seed defaults.

### Option B — global install (skip if you cloned)

```bash
bun add -g muonroi-cli
```

You can then run `muonroi-cli` directly. The rest of this guide uses the from-source form (`bun run src/index.ts`) so you can see exactly what is happening.

### Option C — standalone binary

If you want a single executable:

```bash
bun run build:binary
# → ./dist/muonroi-cli-standalone
```

---

## 3. First boot — sanity check

Verify the CLI loads config and exits cleanly. This makes **no** network call and does **not** touch the OS keychain:

```powershell
# PowerShell
bun run src/index.ts --smoke-boot-only
```

```bash
# bash
bun run src/index.ts --smoke-boot-only
```

Expected — process exits with code `0` and a short success line. If you see a non-zero exit, something is wrong with your install: re-run `bun install` and try again before going further.

---

## 4. Configure an API key

`muonroi-cli` is BYOK — bring your own keys. You have three options, in order of preference:

### Option A — interactive prompt (easiest)

Just run the CLI and it will ask:

```bash
bun run src/index.ts
```

On first launch, if no key is found, the CLI prompts you for one and writes it to `~/.muonroi-cli/user-settings.json` (or, on supported platforms, the OS keychain via `keytar`).

### Option B — environment variable

Set the variable for whichever provider you want to use:

```powershell
# PowerShell — current session only
$env:DEEPSEEK_API_KEY = "sk-..."

# PowerShell — persistent (user-scoped)
[Environment]::SetEnvironmentVariable("DEEPSEEK_API_KEY", "sk-...", "User")
```

```bash
# bash
export DEEPSEEK_API_KEY="sk-..."
# add to ~/.bashrc or ~/.zshrc to persist
```

Per-provider env var names are listed in the [Overview](./overview#supported-providers).

### Option C — `-k` flag (one-shot)

Useful for CI or quick tests; the key is **not** written to disk:

```bash
bun run src/index.ts -k "sk-..." -m "deepseek-ai/DeepSeek-V4-Flash" -p "say hi"
```

---

## 5. First chat — headless prompt

Run a single prompt and print the reply to stdout. Replace the model with one that matches the key you just configured:

```powershell
# PowerShell
bun run src/index.ts -p "Reply: PONG" -m "deepseek-ai/DeepSeek-V4-Flash" --format text
```

```bash
# bash
bun run src/index.ts -p "Reply: PONG" -m "deepseek-ai/DeepSeek-V4-Flash" --format text
```

You should see `PONG` (or close to it) printed. Try `--format json` instead if you want structured output for piping into other tools.

---

## 6. First TUI session

Launch the interactive terminal UI:

```bash
bun run src/index.ts
```

You'll see:

- A **composer** at the bottom — type your message there
- A **log** in the middle — your conversation history
- A **statusbar** at the top — model, cost, session id

Try it:

1. Type `What is 2 + 2?` and press **Enter**.
2. Wait for the reply.
3. Press **Esc** then `q` (or **Ctrl+C**) to quit.

That's it — you've completed a full round-trip through the [request pipeline](./overview#request-pipeline).

---

## 7. Try `/ideal` — your first product loop

`/ideal` is the headline feature: it runs a **multi-model council debate**, then a planning sprint, then implementation, then verification. Start it from inside the TUI:

```
/ideal build a counter app in React
```

What happens next:

1. **Routing** — the CLI decides whether this needs a council (it does, anything non-trivial does).
2. **Council debate** — multiple models argue about the approach. You'll see roles like `leader`, `implementer`, `verifier` chime in.
3. **Askcard** — the council may surface a question card. Use **arrow keys** to pick an option, **Enter** to confirm. Press **Esc** to skip and accept the default.
4. **Sprint plan** — a commit-and-go plan is shown. Approve it to start the sprint.
5. **Implementation** — the implementer model writes the code.
6. **Verification** — the verifier model checks it.
7. **Halt card** — a summary card appears at the end with what was changed and any follow-ups.

If anything stalls, press **Esc** to cancel — your session is saved and you can resume later with `-s latest`.

For the full mechanics, see [Ideal Product Loop](./guides/ideal-product-loop) and [Council Debate](./guides/council-debate).

---

## 8. Try other slash commands

Inside the TUI, type `/` to see the slash menu. Useful ones to start with:

| Command | What it does |
|---|---|
| `/help` | Lists every slash command and key binding |
| `/config` | Opens the settings editor — model picks, providers, role mappings |
| `/cost` | Shows token usage and dollar cost for this session |
| `/models` | Lists every model in the catalog with pricing |
| `/agents` | Manage sub-agents and their permissions |
| `/mcp` | Browse and toggle attached MCP servers |

All slash commands are also discoverable through fuzzy-search — start typing and the menu filters live.

---

## 9. Where to go next

You now have a working CLI, a configured key, and have driven both a headless prompt and the TUI. Here are the natural next stops:

- **[Overview](./overview)** — the request pipeline, supported providers, source layout
- **[Ideal Product Loop](./guides/ideal-product-loop)** — the end-to-end product workflow you just touched
- **[Council Debate](./guides/council-debate)** — how multi-model debates are structured and when they trigger
- **[PIL Pipeline](./guides/pil-pipeline)** — the six layers of prompt intelligence and routing logic
- **[Experience Engine](./guides/experience-engine)** — persistent behavioral memory across sessions
- **[CLI Settings Reference](./reference/cli-settings-reference)** — full `user-settings.json` schema
- **[Commands Reference](./reference/commands-reference)** — every subcommand and flag

### Troubleshooting

- `muonroi-cli doctor` — runs a connectivity + config health check
- `bun run src/index.ts --smoke-boot-only` — re-run the boot-only smoke
- Logs live under `~/.muonroi-cli/logs/`
- Session state lives under `~/.muonroi-cli/sessions/`

If you hit a wall, open an issue at [github.com/muonroi/muonroi-cli](https://github.com/muonroi/muonroi-cli/issues) with the output of `muonroi-cli doctor`.
