---
title: Developer Portal & Self-Service Onboarding
sidebar_label: Developer Portal
sidebar_position: 6
---

# Developer Portal & Self-Service Onboarding

The Developer Portal is the self-service surface of the control plane. It lets a developer
register a project, obtain a Free license, mint MCP API keys, and connect an MCP client to the
Muonroi ecosystem — without an administrator in the loop for the common path.

All API routes below are relative to the control-plane base URL and the prefix
`/api/v1/control-plane`.

---

## Tiers at a glance

| Tier | Activation | MCP key limit | Key features |
|------|-----------|---------------|--------------|
| **Free** | Instant (auto-approved) | 5 active | Rule engine (all rule types), dry-run, 10 k quota/day |
| **Starter** | Admin approval required | 20 active | + Decision tables, canary rollout |
| **Professional** | Admin approval required | Unlimited | + Auth rules hot-reload, tenant isolation modes |
| **Enterprise** | Admin approval required | Unlimited | + Full control plane: connectors, advanced quotas, PDP |

Free tier is the default and requires no approval. Paid tiers are requested via the upgrade flow
(see [Step 5](#5-request-a-paid-tier-upgrade)) and must be approved by an administrator.

---

## 1. Register a project

Registration is anonymous — no API key or login is required.

```http
POST /api/v1/control-plane/proliferation/projects/register
Content-Type: application/json

{
  "projectName": "my-awesome-project"
}
```

Response (`200 OK`):

```json
{
  "projectId": "…",
  "tenantId": "proj-1a2b3c4d5e6f",
  "apiKey": "mpp-0123456789abcdef0123456789abcdef",
  "registeredAt": "2026-06-11T07:00:00Z",
  "message": "…"
}
```

> **Store `apiKey` securely now.** It is the plaintext MCP key and is shown only in this response.
> The server keeps only its SHA256 hash. A duplicate `projectName` returns `409 Conflict`.

Registration creates one active MCP key (the one returned above). You can mint additional keys at
any time (see [Step 3](#3-manage-mcp-api-keys)).

Key facts:
- MCP keys have the format `mpp-` followed by 32 hex characters.
- Keys are stored as a **SHA256 hash only** — the plaintext is shown exactly once at creation and
  is never retrievable afterward.
- A project's tenant id has the format `proj-` followed by 12 hex characters.

---

## 2. Issue a Free license

The license endpoints are an administrative BFF — the control plane talks to the license-server on
your behalf. Issue a Free license for the project:

```http
POST /api/v1/control-plane/licenses/projects/{projectId}/issue-free
```

Response (`200 OK`):

```json
{
  "projectId": "…",
  "tier": "Free",
  "status": 1,
  "maskedLicenseKey": "MRR-…",
  "expiresAt": "…",
  "requestedTier": null,
  "createdAt": "…",
  "updatedAt": "…"
}
```

`status` is the numeric `LicenseStatus` enum — `1 = Active`, `2 = PendingApproval`, and so on.
Inspect the current license at any time with `GET /licenses/projects/{projectId}`, and revoke with
`POST /licenses/projects/{projectId}/revoke`.

The license BFF is **graceful**: if the license-server is temporarily unavailable, the project is
still recorded as Active/Free with a stub key so it remains usable.

---

## 3. Manage MCP API keys

### Generate a key (shown once)

```http
POST /api/v1/control-plane/portal/projects/{projectId}/mcp-keys
```

Response (`200 OK`):

```json
{
  "id": "…",
  "plaintextKey": "mpp-…",
  "maskedHint": "mpp-…XXXX",
  "createdAt": "…"
}
```

`plaintextKey` is returned **once**. If the project does not exist, the endpoint returns
`404 Not Found`.

### List keys (masked)

```http
GET /api/v1/control-plane/portal/projects/{projectId}/mcp-keys
```

Returns only **active** (non-revoked) keys. Each entry exposes a short `maskedHint` — never the
plaintext.

### Revoke a key

```http
DELETE /api/v1/control-plane/portal/projects/{projectId}/mcp-keys/{keyId}
```

Returns `204 No Content` on success. Revoking an unknown or already-revoked key returns
`404 Not Found`. A revoked key immediately stops authenticating MCP requests.

---

## 4. Connect an MCP client

MCP requests authenticate with the project key sent in the `X-Muonroi-Api-Key` header. The
`McpTenantContextMiddleware` validates the key on every `/mcp` request:

- Unknown or revoked keys are rejected with **`401 Unauthorized`**.
- A valid key resolves the request to its project's tenant automatically (the API-key tenant takes
  precedence over any JWT/header tenant).

### Claude Code

Place this in `~/.claude/mcp.json` (global) or `.claude/mcp.json` in your project root.
Replace `YOUR_API_KEY` with the `apiKey` value from registration and `YOUR_TENANT_ID` with the
`tenantId` value (e.g. `proj-1a2b3c4d5e6f`).

```json
{
  "mcpServers": {
    "muonroi-control-plane": {
      "url": "https://cp.truyentm.xyz/mcp",
      "transport": "http",
      "headers": {
        "X-Muonroi-Api-Key": "YOUR_API_KEY",
        "X-TenantId": "YOUR_TENANT_ID"
      }
    },
    "muonroi-docs": {
      "type": "sse",
      "url": "https://docs.muonroi.com/mcp"
    }
  }
}
```

#### Per-repo configs committed in each repo

Each Muonroi repo ships a `.claude/mcp.json` you can copy into your checkout:

| Repo | Config path | Notes |
|------|-------------|-------|
| `muonroi-control-plane` | `.claude/mcp.json` | Preconfigured for `http://localhost:5035/mcp`; swap host and key for production |
| `muonroi-building-block` | `.claude/mcp.json` | Adds the local `muonroi-dev` stdio server for RuleGen |
| `muonroi-ui-engine` | `.claude/mcp.json` | Adds the local `muonroi-dev` stdio server for UI rule components |
| `muonroi-docs` | n/a — docs only | Add the global config above to your client |
| `experience-engine` | n/a — standalone JS | Add the global config above to your client |
| `muonroi-cli` | n/a — standalone CLI | No MCP server dependency |

### Cursor

Place this in `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (global).

```json
{
  "mcpServers": {
    "muonroi-control-plane": {
      "url": "https://cp.truyentm.xyz/mcp",
      "transport": "http",
      "headers": {
        "X-Muonroi-Api-Key": "YOUR_API_KEY",
        "X-TenantId": "YOUR_TENANT_ID"
      }
    },
    "muonroi-docs": {
      "url": "https://docs.muonroi.com/mcp",
      "transport": "sse"
    }
  }
}
```

### Available MCP servers

| Server | Transport | Purpose |
|--------|-----------|---------|
| `muonroi-control-plane` | HTTP | Rule authoring, dry-run, approval, canary, proliferation, portal operations |
| `muonroi-docs` | SSE | Documentation search and reference |
| `muonroi-dev` (building-block) | stdio | Local rule code generation (requires repo checkout) |

---

## 5. Request a paid-tier upgrade

Upgrades require administrator approval. Submit a request:

```http
POST /api/v1/control-plane/licenses/projects/{projectId}/request-upgrade
Content-Type: application/json

{ "requestedTier": "Professional" }
```

The license record moves to `PendingApproval` (`status: 2`). An administrator then reviews pending
requests and approves or rejects them via the account endpoints:

- `GET  /accounts/upgrade-requests/pending` — list pending requests (admin).
- `POST /accounts/upgrade-requests/{requestId}/approve` — approve and re-issue at the approved tier.
- `POST /accounts/upgrade-requests/{requestId}/reject` — reject; the Free license stays intact.

---

## Dashboard

The same flows are available in the control-plane dashboard under **Developer Portal**
(`/developer-portal/*`):

| Page | Purpose |
|------|---------|
| Projects & License | Registered projects, license tier/status, issue-free / revoke / request-upgrade |
| MCP API Keys | Generate (plaintext shown once), list (masked), revoke keys per project |
| MCP Install Guide | Copy-paste MCP client configurations for Claude Code and Cursor |
| Ecosystem Catalog | Browse Muonroi repos and NuGet/npm packages |

---

## Security notes

- **Never log or persist the plaintext MCP key.** The server stores only its SHA256 hash; treat the
  one-time response as the sole copy.
- **Revoke promptly.** A revoked key is rejected at the MCP middleware on the next request.
- **The browser must not call the license-server directly** — always go through the control-plane
  license BFF endpoints described above.
- **One key per deployment context.** Mint separate keys for local dev, staging, and production so
  you can revoke a single environment without affecting others.

---

## See also

- [Control Plane Overview](./control-plane-overview.md)
- [MCP Developer Server](../../08-mcp/mcp-developer-server.md)
