# Muonroi Docs — Agent Working Guide

> This is the system-wide documentation hub for the Muonroi open-core ecosystem.
> All feature guides, API references, and changelogs live here.
> For the full ecosystem architecture and coding standards, read `<workspace-root>/AGENTS.md`.

---

## 0. Workspace

The workspace root is the **common parent directory** of all repos. The exact absolute path differs per machine — **never hardcode it**.

**Detect workspace root at runtime:**
```shell
# Bash / Git Bash (from inside any repo):
workspace=$(dirname "$(git rev-parse --show-toplevel)")

# PowerShell (from inside any repo):
$workspace = Split-Path (git rev-parse --show-toplevel) -Parent
```

**Structure** — identical on all machines; only the drive letter or parent path differs:
```
<workspace-root>/
├── muonroi-building-block/          ← .NET library packages (OSS + Commercial)
├── muonroi-ui-engine/               ← TypeScript UI libraries (OSS + Commercial)
├── muonroi-control-plane/           ← SaaS Control Plane (private)
├── muonroi-license-server/          ← License Server (private)
├── Muonroi.BaseTemplate/            ← Dotnet base project template
├── Muonroi.Modular.Template/        ← Modular monolith template
├── Muonroi.Microservices.Template/  ← Microservices template
├── Docs/
│   └── muonroi-docs/                ← System-wide documentation  ← THIS REPO
├── GodProject/                      ← Legacy monolith (read-only reference)
├── LocalNuget/                      ← Local NuGet feed output
├── LocalNuGetFeed/                  ← Local NuGet feed (alternate)
└── _tmp/                            ← Temp/debug artifacts (never commit)
```

**Default branches:**
- `muonroi-building-block`, `muonroi-ui-engine`, `muonroi-control-plane`, `muonroi-license-server` → **`develop`**
- `Muonroi.BaseTemplate`, `Muonroi.Modular.Template`, `Muonroi.Microservices.Template`, `muonroi-docs` → **`main`**

> ⚠️ Never hardcode absolute paths in plans, scripts, or agent instructions. Always derive `<workspace-root>` at runtime.

---

## 1. Documentation Structure

```
docs/
├── 01-getting-started/   ← Quickstarts, installation guides
├── 02-concepts/          ← Architecture overview, tenancy models, open-core model
├── 03-guides/            ← Feature guides, integration how-to, control plane guides
│   ├── control-plane/    ← Approval workflow, canary rollout, SignalR hot-reload
│   ├── identity-access/  ← Auth, permissions, token, WebAuthn/MFA
│   └── integration/      ← Cache, data layer, gRPC, SignalR, gateway
├── 04-operations/        ← Deployment, runbooks, troubleshooting
├── 05-reference/         ← API reference, interface docs, package reference
└── 06-resources/         ← CHANGELOG, CONTRIBUTING, SECURITY, samples
```

---

## 2. When to Update Docs

You **MUST** add or update documentation here whenever:
- A new feature is added to any ecosystem repo
- An existing API, behavior, or configuration option changes
- A new template option or package is released
- A breaking change is introduced (add migration guide to `06-resources/`)

**Placement guide:**

| Change type | Target folder |
|-------------|--------------|
| New feature guide or how-to | `03-guides/` |
| New API or interface | `05-reference/` |
| Breaking change / migration | `06-resources/` |
| New quickstart | `01-getting-started/` |
| Architecture change | `02-concepts/` |

---

## 3. Writing Rules

- Write all content in **English**.
- Each doc must have a clear H1 title and a brief intro paragraph.
- Code samples must use Muonroi wrappers (`IMDateTimeService`, `IMJsonSerializeService`, etc.) — never raw framework primitives.
- Cross-link related guides and API references using relative Markdown links.
- Branch: **`main`** — commit doc-only changes directly to `main`.
