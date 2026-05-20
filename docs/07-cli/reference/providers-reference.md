---
title: Providers & Models
sidebar_label: Providers & Models
sidebar_position: 2
---

# Providers & Models Reference

`muonroi-cli` supports multiple AI providers and routes different task types to different models, optimizing for cost and output quality. This guide covers provider setup, role-based routing, and cost management.

## Supported Providers

Seven providers are natively supported. Set the corresponding environment variable to enable each:

| Provider | Models | Environment Variable |
|---|---|---|
| **Anthropic** | Claude Opus 4.7, Sonnet 4.6, Haiku 4.5 | `MUONROI_API_KEY` |
| **OpenAI** | GPT-4o, GPT-4o-mini, o3, o4-mini | `OPENAI_API_KEY` |
| **Google** | Gemini 2.5 Pro, Gemini 2.5 Flash | `GOOGLE_API_KEY` |
| **DeepSeek** | DeepSeek V4 Flash, DeepSeek V4 Pro | `DEEPSEEK_API_KEY` |
| **xAI** | Grok 3, Grok 3 Mini | `XAI_API_KEY` |
| **SiliconFlow** | Qwen, GLM, InternLM (with vision proxy support) | `SILICONFLOW_API_KEY` |
| **Ollama** | Any local model | Keyless — defaults to `http://localhost:11434` |

### Model ID Matching

Model IDs are matched by prefix. This means:
- Models outside the built-in catalog work automatically (e.g., `deepseek-*`, `gpt-*`, `grok-*`)
- You can use newer model releases without code changes
- Prefix matching is case-insensitive

## Role-Based Routing

Route different task types to different models based on their computational needs and cost-benefit profile.

### Task Roles

Four roles handle different task types:

| Role | Task Types | Typical Model | Use Case |
|---|---|---|---|
| **leader** | plan, analyze, architecture | Claude Sonnet 4.6 | Complex reasoning, design decisions |
| **implement** | generate, refactor, coding | DeepSeek V4 Flash | Fast iteration, cost-efficient output generation |
| **verify** | debug, review, validation | Claude Sonnet 4.6 | Correctness-critical, requires deep reasoning |
| **research** | docs, knowledge synthesis | DeepSeek V4 Flash | Lower-risk content, cost savings |

### Configuration

Set `roleModels` in your CLI settings (JSON):

```json
{
  "roleModels": {
    "leader":    "claude-sonnet-4-6",
    "implement": "deepseek-v4-flash",
    "verify":    "claude-sonnet-4-6",
    "research":  "deepseek-v4-flash"
  }
}
```

### Resolution Priority

When selecting a model for a task, muonroi-cli checks in this order:

1. **Explicit override** — `MUONROI_MODEL` env var (suppresses all routing)
2. **Role model** — from `roleModels` config
3. **PIL tier** — from tier-based fallback (hot/warm/cold)
4. **Session default** — from `settings.json` or CLI argument

## Cost Optimization

Role-based routing can reduce monthly API costs by 80–90% while maintaining output quality where it matters.

### Cost Comparison

**Single-model setup (Claude for everything):**
```
100 tasks/day × $0.02/task average = ~$60/month
```

**muonroi-cli with role-based routing:**
```
70% cheap tasks (implement, research)    → deepseek-v4-flash @ $0.001/task
30% quality tasks (leader, verify)       → claude-sonnet-4-6 @ $0.015/task

Result: ~$5–8/month with equivalent output quality where it matters
```

**Key insight:** Use premium models only for tasks requiring deep reasoning (plan, analyze, debug). Route commodity tasks to fast, cheap models.

## Tier-Based Fallback

When `roleModels` is not configured, muonroi-cli falls back to a 3-tier budget-aware routing system:

- **hot** — Premium models (plan, analyze)
- **warm** — Mid-tier models
- **cold** — Cheapest models (docs, simple tasks)

### Budget-Aware Downgrade

If your monthly API spend approaches a configured limit, muonroi-cli automatically downgrades to cheaper tiers to stay within budget. Configure your monthly limit in settings:

```json
{
  "monthlyBudgetUSD": 50,
  "tierModels": {
    "hot":   "claude-sonnet-4-6",
    "warm":  "gpt-4o-mini",
    "cold":  "deepseek-v4-flash"
  }
}
```

When the ledger approaches `monthlyBudgetUSD`, subsequent tasks route to `warm` or `cold` until the billing period resets.

## Mode Models

Override the model for specific agent modes:

```json
{
  "modeModels": {
    "agent": "claude-sonnet-4-6",
    "plan":  "claude-opus-4-7",
    "ask":   "deepseek-v4-flash"
  }
}
```

| Mode | When Used |
|---|---|
| `agent` | Standard agent execution (GSD skills, explore, code review) |
| `plan` | Writing detailed plans (`/gsd:plan-phase`) |
| `ask` | Quick questions and interactive mode |

Mode overrides take precedence over role-based routing.

## Environment Variables

| Variable | Purpose | Default |
|---|---|---|
| `MUONROI_API_KEY` | Anthropic API key (primary) | — |
| `MUONROI_MODEL` | Absolute model override (suppresses all routing) | — |
| `MUONROI_BASE_URL` | Custom base URL for Anthropic | `https://api.anthropic.com` |
| `OPENAI_API_KEY` | OpenAI API key | — |
| `GOOGLE_API_KEY` | Google API key | — |
| `DEEPSEEK_API_KEY` | DeepSeek API key | — |
| `XAI_API_KEY` | xAI (Grok) API key | — |
| `SILICONFLOW_API_KEY` | SiliconFlow API key | — |
| `OLLAMA_URL` | Local Ollama endpoint | `http://localhost:11434` |

### Setting Keys

Example `.env` file:

```bash
# Primary provider
MUONROI_API_KEY=sk-ant-...

# Multi-provider routing
OPENAI_API_KEY=sk-proj-...
DEEPSEEK_API_KEY=sk-...
GOOGLE_API_KEY=AIza...

# Override (use sparingly)
MUONROI_MODEL=claude-opus-4-7
```

## Cost Forensics

Track API usage and cost per session or date range:

```bash
# Plain table output
muonroi-cli usage forensics <session-id-prefix>

# Machine-readable JSON
muonroi-cli usage forensics <session-id-prefix> --json
```

Example:
```bash
muonroi-cli usage forensics abc123
muonroi-cli usage forensics "session-2025-05" --json
```

Output includes:
- Task count per provider/model
- Token usage (input/output)
- Cost per task and total
- Timestamp range

Use this to audit routing decisions and validate cost savings from role-based setup.

## Related

- [CLI Settings Reference](./cli-settings-reference) — Full settings.json schema
- [CLI Commands](./commands-reference) — Command reference
