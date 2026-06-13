---
title: Ecosystem Overview
sidebar_label: Ecosystem Overview
sidebar_position: 7
---

# Ecosystem Overview

The Muonroi platform is built as an **open-core stack**: a free, open-source foundation that any
team can use without a commercial agreement, and a managed control plane you pay for when you need
production governance. This page maps each layer — what it is, how it is licensed, and how the
pieces connect.

The interactive version lives at [control-plane.muonroi.com/ecosystem](https://control-plane.muonroi.com/ecosystem).

For the underlying business rationale, see [Open-Core Model](../../02-concepts/open-core-model.md).

---

## Five-layer stack

### Layer 1 — Building Block

| | |
|---|---|
| **License** | Apache-2.0 |
| **Cost** | Free |

The `.NET` foundation. Annotate plain C# with `[MExtractAsRule]` and a Roslyn source generator
wires the rule engine, DI, and dispatchers at compile time. Decision tables, multi-tenancy,
governance, and observability come as composable NuGet packages — no runtime framework lock-in.

Key capabilities:
- Compile-time rule engine via `[MExtractAsRule]`
- DMN-style decision tables (hit policies, FEEL)
- First-class multi-tenancy and quotas
- Logging (`IMLog`), EF base (`MDbContext`), OpenTelemetry

Package groups: Rule Engine (engine, decision tables, CEP, source-gen), Tenancy (context,
schema-per-tenant, site profiles), Governance (licensing, feature gates, RSA proof), Infra (data,
caching, messaging, observability).

---

### Layer 2 — UI Engine

| | |
|---|---|
| **License** | Open source |
| **Cost** | Free |

A manifest-driven runtime and 23+ Lit web components (with React and Angular adapters) that render
rule-authoring surfaces — visual rule-flow designer, decision-table editor with version diff, FEEL
playground, rule trace viewer, and a PDF template designer.

---

### Layer 3 — muonroi-cli

| | |
|---|---|
| **License** | Open source · BYOK |
| **Cost** | ~$5/month (your own API keys) |

A council-of-models CLI for the terminal. Multiple models debate and converge before answering,
with role-based routing and cross-session memory. Bring your own API keys.

Key capabilities:
- Multi-model council debate and synthesis
- Project scaffolding with a build quality gate
- Agent harness — 16 `tui.*` MCP tools
- Self-verify QA, cost forensics, key portability

---

### Layer 4 — Experience Engine

| | |
|---|---|
| **License** | Open source · MIT |
| **Cost** | Free |

A memory layer that turns past sessions into active recall, pre-mistake warnings, and generalized
principles. Runs locally with no external keys required. The live effectiveness dashboard is at
[experience.muonroi.com/dashboard](https://experience.muonroi.com/dashboard).

Key capabilities:
- Active recall (dense-vector + lexical fusion)
- Feedback loop: followed / ignored / noise
- Pre-tool warnings via editor hooks
- Effectiveness dashboard and quality gates

---

### Layer 5 — Control Plane

| | |
|---|---|
| **License** | Managed SaaS |
| **Cost** | Paid — see [pricing](https://control-plane.muonroi.com/pricing) |

The layer you pay for when rules go to production. Governance features — maker-checker approvals,
percentage-based canary rollouts, multi-tenant management, and HMAC-chained audit — are hosted and
fully AI-native with 31 MCP tools.

Key capabilities:
- Author, dry-run, approve, canary, audit
- Multi-tenant management and quotas
- 31 MCP tools — drive any of the above from an AI assistant
- HMAC-chained audit trail

---

## Open-core summary

| Tier | What is included | Cost |
|------|-----------------|------|
| Open source | Building Block, UI Engine, muonroi-cli, Experience Engine | $0 — forever free |
| Control Plane | Managed governance, canary, HMAC audit, tenants | Paid |
| Enterprise | SSO, on-prem option, SLA, dedicated support | Paid |

---

## Connecting the layers with MCP

The two hosted MCP servers bridge the ecosystem for AI assistants:

| Server | URL | Notes |
|--------|-----|-------|
| `muonroi-docs` | `https://docs-mcp.muonroi.com/mcp` | Streamable HTTP, no key. Ships `setup.guide` — bootstraps experience-engine, muonroi-cli, and agent tools on demand. **Add this one first.** |
| `muonroi-control-plane` | `https://control-plane.muonroi.com/mcp` | Streamable HTTP, requires `X-Muonroi-Api-Key`. Drives approvals, canary, audit, tenant management. |

See [Developer Portal Guide](./developer-portal-guide.md) for full install instructions.

---

## See also

- [Open-Core Model](../../02-concepts/open-core-model.md)
- [Control Plane Overview](./control-plane-overview.md)
- [Developer Portal Guide](./developer-portal-guide.md)
- [Ruleset Approval Workflow](./ruleset-approval-workflow.md)
- [Canary Rollout Guide](./canary-rollout-guide.md)
