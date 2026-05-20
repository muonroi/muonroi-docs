---
title: CLI Settings Reference
sidebar_position: 10
---

# CLI Settings Reference

Auto-generated from `muonroi-cli/src/utils/settings.ts` (`UserSettings` interface).
Run `node scripts/check-cli-docs-drift.mjs` to detect drift between source and docs.

## Where to set

User settings live at `~/.muonroi-cli/user-settings.json` (resolved as `path.join(os.homedir(), ".muonroi-cli", "user-settings.json")`; mode `0o600`).
Project overrides live at `<cwd>/.muonroi-cli/settings.json` (subset: `model`, `sandboxMode`, `sandbox`, `shell`, `lsp`).

Edit via:
- `/config` slash command in the TUI
- direct JSON edit
- environment variables (selected fields — see notes per row)

Env-var precedence: `MUONROI_MODEL`, `MUONROI_API_KEY`, `MUONROI_BASE_URL`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `DEEPSEEK_API_KEY`, `SILICONFLOW_API_KEY`, `XAI_API_KEY`, `OLLAMA_URL`, `TELEGRAM_BOT_TOKEN`, and the cost-cap overrides listed below.

## Core

| Key | Type | Default | Description |
|---|---|---|---|
| `apiKey` | `string` | — | Primary Anthropic API key. Env override: `MUONROI_API_KEY`. |
| `defaultModel` | `string` | `claude-sonnet-4-6` | Default model id; normalized via `normalizeModelId`. Env override: `MUONROI_MODEL`. |
| `ecosystem` | `{ name: string; patterns: string[] }` | — | Optional ecosystem profile used by discovery. |
| `modeModels` | `Partial<Record<AgentMode, string>>` | — | Per-mode model override applied on mode switch. |
| `reasoningEffortByModel` | `Record<string, ReasoningEffort>` | — | Per-model reasoning-effort overrides. |

## Council

| Key | Type | Default | Description |
|---|---|---|---|
| `autoCouncil` | `boolean` | `true` | Auto-trigger council debate for qualifying plan/analyze prompts. |
| `autoCouncilConfidence` | `number` | `0.85` | Minimum PIL confidence to auto-trigger council. Range 0.5-1.0. |
| `autoCouncilMinRoles` | `number` | `2` | Minimum configured roleModels required before auto-council fires. Range 1-4. |
| `councilCostAware` | `boolean` | `true` | Drop trivial leader sub-tasks to a cheaper tier on the same provider. Synthesis and debate-plan always use the leader model. |
| `councilExperienceMode` | `"off" \| "advisory" \| "enforcing"` | `"advisory"` | Experience Engine involvement level in council debates (CQ-19). |
| `councilPreferMultiProvider` | `boolean` | `false` | Prefer cross-provider role assignment when picking debate participants. |
| `councilRounds` | `number` | `3` | Number of council debate rounds. Clamped to 1-5. |

## Discovery

| Key | Type | Default | Description |
|---|---|---|---|
| `discoveryEcosystemBias` | `boolean` | `true` | When true, leader recommendations, debate stances, and research lenses bias toward Muonroi ecosystem packages (BB, templates, agent-harness-*). Set to false for non-Muonroi projects. |
| `eeBBContext` | `boolean` | `true` | BB-aware Experience Engine context injection in `/ideal` CB-1 council prompts. When false, `fetchBBContext` returns empty immediately. |

## Routing

| Key | Type | Default | Description |
|---|---|---|---|
| `roleModels` | `Partial<Record<"leader" \| "implement" \| "verify" \| "research", string>>` | — | Per-role model overrides for council debates. |
| `stepRouter.enabled` | `boolean` | `true` | Enable step-aware routing (downgrade tool-execution steps). |
| `stepRouter.premiumSynthesis` | `boolean` | `false` | Switch back to premium model for final synthesis. |
| `stepRouter.toolExecutionTier` | `"fast" \| "balanced"` | `"fast"` | Tier used for tool-execution steps. |

## Cost (caps)

| Key | Type | Default | Description |
|---|---|---|---|
| `autoCompactAfterTurn` | `boolean` | `true` | Run post-turn auto-compact when context exceeds threshold. |
| `autoCompactThresholdPct` | `number` | `0.25` | Minimum % of context window to trigger auto-compact. Range 0.05-0.50. |
| `subAgentBudgetChars` | `number` | `120000` | Max cumulative chars of tool output a `task` sub-agent may receive before progressive trimming. Range 20000-600000. Env override: `MUONROI_SUB_AGENT_BUDGET_CHARS`. |
| `topLevelToolBudgetChars` | `number` | `400000` | Per-turn cap on cumulative tool-output chars in the top-level orchestrator loop. Range 50000-1500000. Env override: `MUONROI_TOP_LEVEL_TOOL_BUDGET_CHARS`. |

Env-only cost knobs (no `UserSettings` field):

| Env | Default | Range | Description |
|---|---|---|---|
| `MUONROI_SUBAGENT_COMPACT_KEEP_LAST` | `3` | 1-20 | Trailing tool turns kept verbatim during sub-agent compaction. |
| `MUONROI_SUBAGENT_COMPACT_THRESHOLD_CHARS` | `40000` | 20000-500000 | Threshold (chars) above which the sub-agent `prepareStep` compactor rewrites older tool_result parts to stubs. |
| `MUONROI_TOP_LEVEL_COMPACT_KEEP_LAST` | `5` | 1-30 | Trailing tool turns kept verbatim during top-level compaction. |
| `MUONROI_TOP_LEVEL_COMPACT_THRESHOLD_CHARS` | `100000` | 50000-1500000 | Top-level compactor threshold (chars). |

## Sandbox

`UserSettings.sandboxMode: "off" | "shuru"` (default `"off"`) selects the sandbox engine. The `sandbox` block configures it:

| Key | Type | Default | Description |
|---|---|---|---|
| `sandbox.allowEphemeralInstall` | `boolean` | — | Allow ad-hoc package installs inside the sandbox. |
| `sandbox.allowNet` | `boolean` | — | Allow outbound network from inside the sandbox. |
| `sandbox.allowedHosts` | `string[]` | — | Hostname allowlist when `allowNet` is true. |
| `sandbox.cpus` | `number` | — | CPU count cap for the sandbox VM/container. |
| `sandbox.diskSize` | `number` | — | Disk size (engine-specific units). |
| `sandbox.from` | `string` | — | Base image / checkpoint reference. |
| `sandbox.guestWorkdir` | `string` | — | Working directory inside the guest. |
| `sandbox.hostBrowserCommandsOnHost` | `boolean` | — | Run host-browser commands on the host instead of in-guest. |
| `sandbox.memory` | `number` | — | Memory cap (engine-specific units). |
| `sandbox.ports` | `string[]` | — | Port mappings as `host:guest` strings (e.g. `"3000:3000"`). |
| `sandbox.secrets` | `{ name: string; fromEnv: string; hosts: string[] }[]` | — | Injected secret descriptors (env var pulled per host allowlist). |
| `sandbox.shellInit` | `string[]` | — | Shell init lines prepended before commands run inside the sandbox. |
| `sandbox.syncHostWorkspace` | `boolean` | — | Sync the host workspace into the guest. |
| `sandbox.verifyBaseFrom` | `string` | — | Base image used specifically by the verify flow. |

## MCP

| Key | Type | Default | Description |
|---|---|---|---|
| `mcp.servers` | `McpServerConfig[]` | `[]` | Configured MCP servers. Each: `id`, `label`, `enabled`, `transport` (`"http" \| "sse" \| "stdio"`), `url?`, `headers?`, `command?`, `args?`, `env?`, `cwd?`. |

## LSP

| Key | Type | Default | Description |
|---|---|---|---|
| `lsp.autoInstall` | `boolean` | `false` | Auto-install missing language servers. |
| `lsp.builtins` | `Record<LspBuiltInServerId, LspBuiltInServerSettings>` | `{}` | Overrides for built-in language servers (`enabled`, `command`, `args`, `env`, `initialization`, `rootMarkers`, `extensions`). |
| `lsp.diagnosticsDebounceMs` | `number` | `200` | Debounce window (ms) for LSP diagnostics. |
| `lsp.enabled` | `boolean` | `true` | Master switch for the LSP subsystem. |
| `lsp.servers` | `LspCustomServerConfig[]` | `[]` | User-defined LSP servers. |
| `lsp.startupTimeoutMs` | `number` | `30000` | Max time (ms) to wait for an LSP server to come up. |
| `lsp.tool` | `boolean` | `true` | Expose the LSP tool to the agent. |

## Telegram

| Key | Type | Default | Description |
|---|---|---|---|
| `telegram.approvedUserIds` | `number[]` | — | Telegram user IDs allowed to drive the agent. |
| `telegram.audioInput.enabled` | `boolean` | `true` | Transcribe Telegram voice/audio before sending text to the agent. |
| `telegram.audioInput.language` | `string` | `"en"` | Language code forwarded to the STT endpoint. |
| `telegram.botToken` | `string` | — | Telegram bot token. Env override: `TELEGRAM_BOT_TOKEN`. |
| `telegram.nativeDrafts` | `boolean` | `false` | Reserved: Bot API `sendMessageDraft` (not implemented). |
| `telegram.sessionsByUserId` | `Record<string, string>` | — | Per-user session bindings. |
| `telegram.streaming` | `"off" \| "partial"` | `"partial"` | Live preview while generating. `off` = buffer-then-send only. |
| `telegram.typingIndicator` | `boolean` | `true` | Send `typing` chat action while the agent runs. |

## Providers

`providers.<id>` blocks hold per-provider API keys and base URLs. Each non-Ollama provider takes `{ apiKey: string; baseURL?: string }`; Ollama takes `{ baseURL?: string }` only.

| Key | Type | Default | Description |
|---|---|---|---|
| `disabledModels` | `string[]` | `[]` | Models hidden from the picker. |
| `disabledProviders` | `ProviderId[]` | `[]` | Providers hidden from the picker (still loaded if keys present). |
| `providers.anthropic` | `{ apiKey: string; baseURL?: string }` | — | Anthropic credentials. Also accepts top-level `apiKey`. |
| `providers.deepseek` | `{ apiKey: string; baseURL?: string }` | — | DeepSeek credentials. Env: `DEEPSEEK_API_KEY`. |
| `providers.google` | `{ apiKey: string; baseURL?: string }` | — | Google Gemini credentials. Env: `GOOGLE_API_KEY`. |
| `providers.ollama` | `{ baseURL?: string }` | `{ baseURL: "http://localhost:11434" }` | Ollama endpoint. Env: `OLLAMA_URL`. |
| `providers.openai` | `{ apiKey: string; baseURL?: string }` | — | OpenAI credentials. Env: `OPENAI_API_KEY`. |
| `providers.siliconflow` | `{ apiKey: string; baseURL?: string }` | — | SiliconFlow credentials. Env: `SILICONFLOW_API_KEY`. |
| `providers.xai` | `{ apiKey: string; baseURL?: string }` | — | xAI / Grok credentials. Env: `XAI_API_KEY`. |

## Other

| Key | Type | Default | Description |
|---|---|---|---|
| `hooks` | `HooksConfig` | — | PreToolUse/PostToolUse hook configuration. |
| `payments` | `PaymentSettings` | `{ enabled: false, chain: "base-sepolia", approval: { autoApprove: false } }` | DEPRECATED — Phase 4 will replace with LemonSqueezy billing. Wallet UI only. |
| `shell` | `ShellSettings` | — | Shell used by the bash tool. On Windows, defaults to Git Bash when present. |
| `subAgents` | `CustomSubagentConfig[]` | — | User-defined sub-agents (`name`, `model`, `instruction`). Names matching `general/explore/vision/verify/verify-detect/verify-manifest/computer` are rejected. |
| `webResearchPrompted` | `boolean` | — | True after the user has been prompted (or skipped) the web-research onboarding. |
