# License Reactivation

## When re-activation is required

Re-activate the commercial proof when one of these changes happens:

- you update any `Muonroi.*` package version
- you rebuild or fork OSS packages and the resulting assembly hash changes
- you move the deployment to another machine or runtime fingerprint
- the current activation proof has been revoked and a new proof is issued

Pre-Track 6 binds commercial access to the RSA-signed activation proof and the approved assembly manifest. If the runtime assemblies no longer match the proof, startup integrity checks will block commercial features until a new proof is issued.

## Standard re-activation flow

Use the activation CLI with the current deployment artifacts:

```bash
dotnet muonroi-license activate \
  --key <LICENSE_KEY> \
  --server https://license.muonroi.com \
  --output licenses/activation_proof.json
```

What happens during activation:

1. the client collects hashes for loaded `Muonroi.*` assemblies
2. the manifest is sent to the license server together with machine fingerprint data
3. the server validates the manifest against approved hashes
4. the server returns a signed `activation_proof.json`
5. the application verifies the proof locally at startup

## Official packages vs custom forks

For official builds published by Muonroi:

- the license server can auto-approve the manifest when hashes match the published package version

For customer-specific forks:

- the manifest must be approved before activation succeeds
- approval must be license-scoped for custom forks
- do not reuse a custom fork approval globally across unrelated customer licenses

Operationally, submit these values to the Muonroi admin team:

- assembly name
- version
- SHA-256 hash
- public key token if present
- target license id for license-scoped approval

## Heartbeat and revocation grace

Heartbeat is optional and intended for online deployments. When enabled:

- the client posts `/api/v1/heartbeat`
- the server rotates the nonce on every successful heartbeat
- replayed heartbeat requests are rejected because the previous nonce is no longer valid

If a license is revoked:

- the server reports revocation on heartbeat
- the client enters revocation grace mode
- after the configured grace window, runtime status is downgraded to `Free`
- premium commercial entry points are blocked automatically

Default Pre-Track 6 values:

- `LicenseConfigs:Online:EnableHeartbeat = false`
- `LicenseConfigs:Online:HeartbeatIntervalMinutes = 240`
- `LicenseConfigs:Online:RevocationGraceHours = 24`

## Offline and on-prem deployments

Offline verification remains supported:

- keep `LicenseConfigs:Mode = Offline` when outbound connectivity is not allowed
- distribute a valid `license.json` and `activation_proof.json` with the deployment
- re-activate whenever the assembly manifest changes

If `Mode = Online` and `FallbackToOnlineActivation = false`, the activation proof must already exist on disk at startup.

## Common failures

### Assembly integrity validation failed

Cause:

- runtime assembly hashes do not match the approved manifest embedded in the proof

Fix:

- re-run activation after package update or rebuild
- if this is a custom fork, request admin approval for the new manifest first

### Activation rejected with unapproved versions

Cause:

- the license server received an assembly manifest that is not approved for this license

Fix:

- confirm the deployment is using the expected package version
- approve the custom manifest with license scope, then activate again

### Application starts in downgraded Free mode after revocation

Cause:

- heartbeat reported revocation and the grace window expired

Fix:

- restore a valid commercial license
- activate again to receive a new proof and heartbeat nonce
