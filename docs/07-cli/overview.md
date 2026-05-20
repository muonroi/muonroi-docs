---
title: Overview
sidebar_label: Overview
sidebar_position: 1
---

# muonroi-cli Overview

`muonroi-cli` is a TypeScript/Bun CLI that replaces single-model AI assistants with a multi-provider orchestration layer. It routes each prompt through a six-stage intelligence pipeline, runs adversarial multi-model debates for high-stakes decisions, and persists behavioral memory across sessions.

## Prerequisites

- Bun 1.3 or later
- API key for at least one supported provider (see [Multi-Provider Setup](#multi-provider-setup))

## Installation

### Via Bun (recommended)

```bash
bun add -g muonroi-cli
```

### Via curl

```bash
curl -fsSL https://raw.githubusercontent.com/muonroi/muonroi-cli/main/install.sh | bash
```

## Quick Start

```bash
muonroi-cli                                      # interactive TUI
muonroi-cli "fix the flaky test in auth.test.ts" # with starting prompt
muonroi-cli --prompt "run tests" --format json   # headless / CI mode
muonroi-cli models                               # list models with pricing
muonroi-cli doctor                               # health check
```

## First Run

On first launch, `muonroi-cli` checks for `~/.muonroi-cli/user-settings.json`. If the file is missing or no API key is configured, the CLI prompts for a key and writes the config. Once credentials are set, the interactive TUI starts automatically.

Run `muonroi-cli doctor` at any time to verify provider connectivity and configuration.

## Supported Providers

| Provider | Models | Key |
|---|---|---|
| Anthropic | Claude Opus 4.7 / Sonnet 4.6 / Haiku 4.5 | `MUONROI_API_KEY` |
| OpenAI | GPT-4o, GPT-4o-mini, o3, o4-mini | `OPENAI_API_KEY` |
| Google | Gemini 2.5 Pro / Flash | `GOOGLE_API_KEY` |
| DeepSeek | DeepSeek V4 Flash / Pro | `DEEPSEEK_API_KEY` |
| xAI | Grok 3, Grok 3 Mini | `XAI_API_KEY` |
| SiliconFlow | Qwen, GLM, InternLM | `SILICONFLOW_API_KEY` |
| Ollama | Any local model | Keyless — `http://localhost:11434` |

## Multi-Provider Setup

Role-based routing and council debates require at least two providers. Place the following in `~/.muonroi-cli/user-settings.json`:

```json
{
  "apiKey": "sk-ant-your-key",
  "providers": {
    "anthropic": { "apiKey": "sk-ant-..." },
    "deepseek":  { "apiKey": "sk-..." }
  },
  "roleModels": {
    "leader":    "claude-sonnet-4-6",
    "implement": "deepseek-v4-flash",
    "verify":    "claude-sonnet-4-6",
    "research":  "deepseek-v4-flash"
  }
}
```

`roleModels` maps each agent role to a specific model. The router uses these assignments when running the Prompt Intelligence Layer pipeline. See [CLI Settings Reference](./reference/cli-settings-reference) for the full schema.

## Architecture

### Request Pipeline

Every prompt passes through the following stages:

```
User prompt
  → Redactor
  → PIL (Prompt Intelligence Layer)
  → Router
  → Provider
  → Vision Proxy
  → Tool Loop
  → Sub-agent cap
  → Vision Bridge
  → Output guardrails
  → Auto-compact
  → Session storage
```

### Core Subsystems

| Subsystem | Description |
|---|---|
| Multi-Model Council | Adversarial multi-model debate for high-stakes decisions |
| Prompt Intelligence Layer (PIL) | Six-layer pipeline routing each prompt to the optimal model |
| Experience Engine (EE) | Persistent behavioral memory across sessions |

### Source Layout

| Path | Purpose |
|---|---|
| `src/orchestrator/` | Agent loop, auto-compact, council runner |
| `src/council/` | Multi-model debate engine |
| `src/pil/` | Prompt Intelligence Layer |
| `src/router/` | Role-based and tier-based routing |
| `src/providers/` | Multi-provider factory |
| `src/ee/` | Experience Engine client and hooks |
| `src/tools/` | Built-in tools (bash, file, grep, LSP, schedule) |

## Related Docs

- [Council Debate](./guides/council-debate) — how multi-model debates are structured and when they trigger
- [PIL Pipeline](./guides/pil-pipeline) — the six layers of prompt intelligence and routing logic
- [Ideal Product Loop](./guides/ideal-product-loop) — end-to-end workflow for product development tasks
- [CLI Settings Reference](./reference/cli-settings-reference) — full `user-settings.json` schema and all configuration options
