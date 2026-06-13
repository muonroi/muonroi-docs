# License Server Admin Guide

The Muonroi license server is the private service that issues keys, generates activation proofs, validates runtime access, manages revocation, rotates signing keys, and tracks usage metrics for commercial features.

This guide is for administrators operating the service on behalf of internal teams, customers, or managed environments.

## What the service does

The current service exposes these main capabilities:

- create license keys
- activate a license for a machine fingerprint
- validate whether an action is allowed
- revoke a license
- approve assembly manifests for official builds or scoped custom forks
- process online heartbeats
- rotate signing keys in the background
- persist activation and usage history in PostgreSQL

At startup, the service:

- requires `ConnectionStrings:LicenseDb`
- runs EF Core migrations
- ensures an active signing key exists
- refreshes the revocation snapshot cache
- starts background jobs for key rotation and revocation refresh

## Deployment model

The service is an ASP.NET application backed by PostgreSQL.

Minimum topology:

```text
client activation -> license server -> PostgreSQL
```

There is no Redis dependency in the current license server.

## Runtime configuration

The service currently reads the following keys.

### Connection strings

| Key | Required | Notes |
| --- | --- | --- |
| `ConnectionStrings:LicenseDb` | Yes | PostgreSQL database for licenses, activations, keys, and usage metrics |

### `LicenseServer`

| Key | Required | Notes |
| --- | --- | --- |
| `AdminApiKey` | Yes for admin operations | Required by admin endpoints under `/api/v1/keys` |
| `KeyRotationDays` | No | Background job interval, minimum effectively `1` day |
| `RevocationRefreshMinutes` | No | Refresh interval for revocation snapshot cache |
| `LicenseServerUrl` | Recommended | Base URL returned or used in operational tooling |
| `RevocationGraceHours` | Optional | Used by heartbeat service when a license was revoked |

### Platform variables

Normally set via environment or host config:

- `ASPNETCORE_ENVIRONMENT`
- `ASPNETCORE_URLS`

## Example `appsettings.json`

The current default file looks like this:

```json
{
  "ConnectionStrings": {
    "LicenseDb": "Host=localhost;Port=5433;Database=muonroi_licenses;Username=admin;Password=admin"
  },
  "LicenseServer": {
    "AdminApiKey": "dev-admin-key-change-in-production",
    "KeyRotationDays": 30,
    "RevocationRefreshMinutes": 15,
    "LicenseServerUrl": "http://localhost:5010"
  }
}
```

## Docker and PostgreSQL deployment

The service can be run behind a reverse proxy or directly as an internal admin API. A common deployment shape is one PostgreSQL instance and one or more license server instances.

Example compose topology:

```yaml
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: muonroi_licenses
      POSTGRES_USER: admin
      POSTGRES_PASSWORD: admin
    ports:
      - "5433:5432"
    volumes:
      - license-db:/var/lib/postgresql/data

  license-server:
    image: ghcr.io/muonroi/muonroi-license-server:develop
    depends_on:
      - postgres
    environment:
      ASPNETCORE_ENVIRONMENT: Production
      ASPNETCORE_URLS: http://+:8080
      ConnectionStrings__LicenseDb: Host=postgres;Port=5432;Database=muonroi_licenses;Username=admin;Password=admin
      LicenseServer__AdminApiKey: replace-me
      LicenseServer__KeyRotationDays: "30"
      LicenseServer__RevocationRefreshMinutes: "15"
      LicenseServer__LicenseServerUrl: https://license.muonroi.internal
      LicenseServer__RevocationGraceHours: "24"
    ports:
      - "5010:8080"

volumes:
  license-db:
```

Protect the service with network policy, TLS, and secret injection. The database stores license material and should be treated as a sensitive system.

## Admin authentication

The current middleware protects admin key-management routes with an API key.

Today that applies to:

- `/api/v1/keys/*`

Pass the admin key in the request header expected by your deployment gateway or middleware path. If the configured value is missing or wrong, admin routes return an authorization failure.

Operational advice:

- never keep the development admin key in shared environments
- rotate the admin key alongside other operator credentials
- restrict the admin surface to trusted networks

## Key generation

Create a new license key with:

```http
POST /api/v1/keys/generate
```

Request body:

```json
{
  "organizationId": "acme",
  "organizationName": "Acme Corp",
  "tier": "Licensed",
  "validDays": 365,
  "maxActivations": 5
}
```

Successful response fields:

- `licenseKey`
- `expiresAt`
- `signedPayload`
- `signingKeyId`

The service currently defaults features by tier if `allowedFeatures` is omitted.

## License tiers and default features

The current defaults in `KeyEndpoints` are:

### Free

Default features:

- `api.validate`

### Licensed

Default features:

- `vsix.publish`
- `vsix.watch`
- `vsix.explorer`
- `api.validate`
- `cp.publish`

### Enterprise

Default features:

- `*`

If you want a tighter commercial contract, pass an explicit `allowedFeatures` array during issuance instead of relying on defaults.

Cross-reference the conceptual tier model in [License Capability Model](../03-guides/license-governance/license-capability-model.md).

## Activation flow

Activation binds a commercial license to:

- a license key
- a machine fingerprint
- an environment name
- a product version
- optionally an assembly manifest

Endpoint:

```http
POST /api/v1/activate
```

Current request body:

```json
{
  "licenseKey": "MRR-...",
  "machineFingerprint": "prod-node-01",
  "productVersion": "1.2.0",
  "environment": "production",
  "assemblyManifest": []
}
```

Successful response includes:

- `success`
- `proof`
- `activationProof`
- `message`

`activationProof` is the base64 form convenient for clients that want to save the proof directly. `proof` exposes the richer structured payload.

## CLI activation

The service also supports a CLI flow via the application entry point:

```bash
dotnet run --project src/Muonroi.LicenseServer -- activate \
  --key MRR-... \
  --server http://localhost:5010 \
  --environment production \
  --output licenses/activation_proof.json
```

Optional argument:

- `--fingerprint` to override the default machine name

The CLI saves the decoded proof JSON to the chosen output path.

Cross-reference the re-activation procedure in [License Reactivation](./license-reactivation.md).

## Validation endpoint

Use validation when a host wants to ask, "may this license perform action X on machine Y?"

Endpoint:

```http
POST /api/v1/validate
```

Request body:

```json
{
  "licenseKey": "MRR-...",
  "machineFingerprint": "prod-node-01",
  "actionType": "cp.publish"
}
```

Response fields:

- `isValid`
- `tier`
- `allowedFeatures`
- `expiresAt`
- `error`

Use validation for online checks, admin tooling, and diagnostics. Use activation proof verification for fast local runtime checks inside deployed products.

## Revocation

Revoke a key with:

```http
POST /api/v1/keys/revoke
```

Request body:

```json
{
  "licenseKey": "MRR-...",
  "reason": "contract expired"
}
```

Current behavior:

- the license is marked revoked in the database
- the revocation snapshot cache is refreshed by background polling
- online heartbeat clients learn about revocation on their next heartbeat

List the revocation snapshot with:

```http
GET /api/v1/revocation/list
```

### Immediate revocation vs grace period

There are two operational modes to reason about:

- offline or activation-proof-only clients effectively learn revocation on re-activation or other online contact
- heartbeat-enabled clients can receive revocation status immediately, then degrade after a grace window

The heartbeat service currently uses `LicenseServer:RevocationGraceHours` or falls back to `24`.

## Assembly whitelist management

This is the key operational feature for official packages and customer-specific forks.

Endpoint:

```http
POST /api/v1/assembly-whitelist/approve
```

Request body:

```json
{
  "assemblyName": "Muonroi.Governance.Enterprise",
  "version": "1.2.0",
  "sha256Hash": "abc123...",
  "publicKeyToken": null,
  "approvalScope": "Global",
  "licenseId": null,
  "source": "ci"
}
```

Fields:

- `assemblyName`
- `version`
- `sha256Hash`
- `publicKeyToken`
- `approvalScope`
- `licenseId`
- `source`

Use `approvalScope = "Global"` for official releases that all licenses may trust. Use a license-scoped approval when a customer fork must only activate for a specific `licenseId`.

### Auto-approve from CI pipeline

Recommended pattern for official builds:

1. CI computes the assembly manifest after packaging
2. CI posts the manifest to `/api/v1/assembly-whitelist/approve`
3. approval is marked with `source = "ci"` and a global scope
4. downstream activation succeeds without manual intervention for the approved build

### Approve a custom fork for one customer

Recommended pattern:

1. customer build pipeline computes the assembly manifest
2. admin verifies the fork is legitimate
3. admin approves the manifest with a license-scoped `licenseId`
4. activation succeeds only for that license

Do not globalize customer-specific forks unless you intentionally want every license to trust that exact assembly set.

## Heartbeat configuration

Heartbeat is the online enforcement loop for already-activated clients.

Endpoint:

```http
POST /api/v1/heartbeat
```

The current service checks:

- proof id exists
- request `licenseId` matches the activation record
- request `machineFingerprint` matches the activation record
- request nonce matches the stored heartbeat nonce

On success:

- if the license is active, the server rotates and returns a new nonce
- if the license was revoked, the server returns `isRevoked=true` and a grace deadline

That nonce rotation is what blocks replay of old heartbeat payloads.

Operational guidance:

- enable heartbeat only for online deployments
- keep the client interval shorter than the revocation grace window
- alert when many heartbeat mismatches happen, because they usually indicate stale proof data or replay attempts

## Key rotation

The service runs `KeyRotationBackgroundJob` continuously.

Current behavior:

1. wait `KeyRotationDays`
2. ensure a current active key exists
3. rotate to a new signing key
4. mark the active key state in the database

Operational impact:

- existing proofs remain verifiable only if clients retain the necessary public verification material
- new keys should be distributed to verifiers as part of your normal release and trust update flow

Recommended procedure:

1. announce the rotation window
2. confirm client verification key distribution is ready
3. let the service rotate automatically or trigger rotation operationally
4. verify new license issuance and activation after the rotation
5. retain old verification material for the overlap window you support

## Telemetry and usage metrics

The service currently tracks validation usage through `TelemetryCollector`.

Stored metric fields include:

- `LicenseKey`
- `ActionType`
- `IsValid`
- `RecordedAt`

This data is persisted through the repository, which makes it useful for:

- per-license usage reviews
- contract discussions
- abuse detection
- license support investigations

Current limitation:

- there is no public admin endpoint yet for querying aggregated usage metrics

If you need reporting today, query the underlying database or add an internal read endpoint in your deployment repo.

## Re-activation guide

Re-activation is required whenever the activation proof should no longer be trusted as-is.

Typical triggers:

- package version changes
- deployment moves to a new machine fingerprint
- approved assembly manifest changes
- a proof is revoked

Standard operator flow:

1. verify the target license is still valid
2. approve any new assembly manifest if required
3. activate again
4. distribute the new `activation_proof.json`

Detailed operational scenarios are documented in [License Reactivation](./license-reactivation.md).

## Troubleshooting

### Activation fails with binding mismatch

Cause:

- the machine fingerprint or license id in the request does not match the activation record expectations

Fix:

- confirm the runtime fingerprint sent by the client
- re-activate with the intended fingerprint

### Activation fails for a custom fork

Cause:

- the assembly manifest is not approved, or approved for the wrong scope or license id

Fix:

- review the submitted manifest hash
- add or correct the assembly whitelist approval

### Admin routes reject valid-looking requests

Cause:

- `LicenseServer:AdminApiKey` in configuration does not match the caller secret

Fix:

- confirm secret injection
- confirm the caller is hitting the expected environment

### Heartbeat nonce mismatch

Cause:

- stale nonce
- repeated request replay
- client saved old activation state

Fix:

- refresh the client state
- re-activate if needed
- investigate repeated mismatches as a possible abuse signal

### Revocation does not appear immediate to clients

Cause:

- client is offline or not using heartbeat
- revocation cache refresh interval has not elapsed

Fix:

- verify the deployment mode
- reduce `RevocationRefreshMinutes` if appropriate
- verify the client heartbeat interval

## PDF Entitlements

The license server exposes a dedicated surface for granting and revoking PDF capability keys on an existing license key. This is separate from key generation and does not require re-activation.

### Capability keys

| Key | Component |
|-----|-----------|
| `pdf.designer` | PDF Designer commercial component (`@muonroi/ui-engine-pdf-designer`) |
| `pdf.registry` | PDF template registry — control-plane backend and hot-reload |
| `pdf.canary` | PDF canary quality-gate — SSIM scorer and automatic rollback |

Keys are stored in `LicenseRecord.AllowedFeatures` (PostgreSQL `text[]`) and are embedded verbatim in the RSA-signed `ActivationProof`. No database migration is required to start using them.

### REST API

**Endpoint:** `POST /api/v1/keys/{licenseKey}/features`

**Authorization:** requires the `license-generate` policy (same admin key used for key generation).

**Request body** (both fields are optional; at least one must be present; the operation is atomic):

```json
{
  "add": ["pdf.designer"],
  "remove": ["pdf.canary"]
}
```

**Response:**

```json
{
  "licenseKey": "MRR-...",
  "allowedFeatures": ["pdf.designer", "pdf.registry"]
}
```

- Pass `add` to grant capabilities.
- Pass `remove` to revoke capabilities.
- Pass both to update in one atomic call.
- `404 Not Found` is returned when the license key does not exist.

### CLI

The service entry point supports a `features` sub-command:

```bash
dotnet run --project src/Muonroi.LicenseServer -- features \
  --key MRR-... \
  --add pdf.designer,pdf.registry \
  --remove pdf.canary
```

Options:

| Flag | Default | Notes |
|------|---------|-------|
| `--key` | (required) | License key in `MRR-...` format |
| `--add` | — | Comma-separated capability keys to grant |
| `--remove` | — | Comma-separated capability keys to revoke |
| `--server` | `http://localhost:5010` | License server base URL |
| `--admin-token` | `MUONROI_LICENSE_ADMIN_TOKEN` env var | Admin API key sent as `X-Admin-Api-Key` |

At least one of `--add` or `--remove` must be provided.

### Operational notes

- The proof the runtime holds does **not** update until the license is re-activated. Re-activate after changing features for the change to appear in offline proof checks.
- Enterprise keys default to `["*"]` at issuance and already pass every feature gate. Explicit `pdf.*` keys are relevant for Licensed-tier keys.
- Use `GET /api/v1/validate` with the target `actionType` to confirm a feature is currently allowed before re-activation.

---

## Recommended next reading

- [License Activation](../03-guides/license-governance/license-activation.md)
- [License Capability Model](../03-guides/license-governance/license-capability-model.md)
- [Tier Enforcement](../03-guides/license-governance/tier-enforcement.md)
- [License Reactivation](./license-reactivation.md)
