# Setup recipe — muonroi-cli

> Agent-executable playbook. **Collect the values below first**, then run the steps. muonroi-cli is
> an AI coding agent (TUI) where models debate before answering; it also hosts the `tools-mcp` and
> `mcp-driver` MCP servers. The binary is invoked as `muonroi-cli` or the short alias `mu`.

## Prerequisites

- A supported OS shell (Linux/macOS bash or Windows PowerShell).
- For the prebuilt-binary path: **nothing** (single executable, all native deps bundled).
- For the Bun path: **Bun ≥ 1.3** on PATH.
- **Do NOT use `npm install -g`** — the TUI engine uses Bun-only `import ... with { type: "file" }`
  that the Node ESM loader cannot parse (`ERR_UNKNOWN_FILE_EXTENSION`).

## Values to collect from the user

| Value | When needed | Notes |
|-------|-------------|-------|
| **OS / shell** | always | picks `install.sh` (Linux/macOS) vs `install.ps1` (Windows). |
| **Install method** | always | `prebuilt-binary` (recommended, zero deps) \| `bun-global` (needs Bun). |
| **Provider** | always | `deepseek` \| `siliconflow` (currently supported). |
| **Provider API key** | always | the user's own key for the chosen provider (BYOK; ~$5/mo typical). |

> Do not print the API key back. The first-run wizard stores it in the OS keychain; settings land in
> `~/.muonroi-cli/user-settings.json`.

## Steps

1. **Install the binary.**
   - Linux / macOS (recommended):
     ```bash
     curl -fsSL https://raw.githubusercontent.com/muonroi/muonroi-cli/master/install.sh | bash
     ```
   - Windows PowerShell (recommended):
     ```powershell
     irm https://raw.githubusercontent.com/muonroi/muonroi-cli/master/install.ps1 | iex
     ```
   - Or via Bun runtime:
     ```bash
     bun add -g muonroi-cli
     ```
   The installers download a `bun --compile` standalone binary from GitHub Releases and add it to PATH;
   metadata is saved to `~/.muonroi-cli/install.json`. The binary exposes both `muonroi-cli` and `mu`.
2. **First run + credentials.** Launch `muonroi-cli` (or `mu`). The wizard lists providers and offers
   four ways to add credentials: paste an API key, import an encrypted bundle (`keys export`/`keys
   import`), sync from Bitwarden, or skip and add later via `/providers` inside the TUI. Provide the
   collected provider + key.
3. (Optional, multi-device) move keys without re-entering: `muonroi-cli keys export ~/muonroi-keys.json`
   on the source device, then `muonroi-cli keys import ~/muonroi-keys.json` on the target (same passphrase).

## Verify

- Boot-only smoke (no provider call, no keychain write):
  ```bash
  muonroi-cli --smoke-boot-only
  ```
- Headless one-shot against the real provider (proves the key works):
  ```bash
  muonroi-cli -p "Reply: PONG" -m "deepseek-ai/DeepSeek-V4-Flash" --format text
  ```
- `muonroi-cli update` reports the installed version and whether a newer one exists.

## Troubleshooting

- **`ERR_UNKNOWN_FILE_EXTENSION` / TUI won't boot** → you ran it under bare Node. Use the prebuilt
  binary or `bun add -g` (never `npm install -g`).
- **`muonroi-cli: command not found` after install** → the installer updated PATH for new shells;
  open a new terminal, or add `~/.muonroi-cli/bin` to PATH manually.
- **Wizard shows no providers / can't save key** → re-run `/providers` inside the TUI; on headless
  machines without a keychain set `MUONROI_TEST_NO_KEYCHAIN=1` only for tests, not normal use.

## Deep references

- docs.muonroi.com → CLI → *Quickstart*, *Providers Reference*, *Settings Reference*.
- This CLI is the host for `tools-mcp` and `mcp-driver` — see the **muonroi-tools** and **harness**
  setup recipes (via this MCP's `setup.guide`) to wire them into your agent.
