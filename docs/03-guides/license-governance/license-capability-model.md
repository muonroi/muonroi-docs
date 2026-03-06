# License Capability Model

Muonroi uses three runtime tiers:

- `Free`
- `Licensed`
- `Enterprise`

## Runtime model

`LicenseState` carries:

- `IsValid`
- `Tier`
- `Payload`
- optional activation-proof metadata such as `LicenseId`, `OrganizationName`, and `ExpiresAt`

Feature access resolves through `LicenseState.HasFeature(...)`.
