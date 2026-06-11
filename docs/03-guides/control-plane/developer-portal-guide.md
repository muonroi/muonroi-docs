---
title: Developer Portal
sidebar_label: Developer Portal
sidebar_position: 6
---

# Developer Portal

The Developer Portal is the self-service surface of the control plane. It lets a developer
register a project, obtain a Free license, mint MCP API keys, and connect an MCP client to the
Muonroi ecosystem — without an administrator in the loop for the common path.

All API routes below are relative to the control-plane base group `/api/v1/control-plane`.

## Overview

The portal covers four areas:

1. **Project registration** — self-service, anonymous. Returns a tenant id and a one-time
   plaintext MCP API key.
2. **License (BFF)** — the control plane issues, inspects, and revokes licenses **server-side**.
   The browser never calls the license-server directly.
3. **MCP API keys** — generate, list (masked), and revoke per-project keys used to authenticate
   MCP requests.
4. **Tier upgrades** — request a paid tier; an administrator approves or rejects.

Key facts:

- MCP keys have the format `mpp-` followed by 32 hex characters.
- Keys are stored as a **SHA256 hash only** — the plaintext is shown exactly once at creation and
  is never retrievable afterward.
- A project's tenant id has the format `proj-` followed by 12 hex characters.

---

## 1. Register a project

Registration is anonymous (no auth required).

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
any time (see below).

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

Add the key to your MCP client configuration, for example:

```json
{
  "mcpServers": {
    "muonroi-control-plane": {
      "url": "https://your-control-plane-host/mcp",
      "headers": {
        "X-Muonroi-Api-Key": "mpp-0123456789abcdef0123456789abcdef"
      }
    }
  }
}
```

The dashboard's **MCP Install Guide** page provides copy-paste configurations for common clients.

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
| MCP Install Guide | Copy-paste MCP client configurations |
| Ecosystem Catalog | Browse Muonroi repos and NuGet/npm packages |

---

## Security notes

- **Never log or persist the plaintext MCP key.** The server stores only its SHA256 hash; treat the
  one-time response as the sole copy.
- **Revoke promptly.** A revoked key is rejected at the MCP middleware on the next request.
- **The browser must not call the license-server directly** — always go through the control-plane
  license BFF endpoints described above.

## See also

- [Control Plane Overview](./control-plane-overview.md)
- [MCP Developer Server](../../08-mcp/mcp-developer-server.md)
