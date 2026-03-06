# License Activation

The license server issues keys in the `MRR-...` format and converts them into signed activation proofs.

## Server endpoints

- `POST /generate`
- `POST /revoke`
- `POST /activate`

## Offline verification flow

1. issue a license from the license server
2. activate it for a named environment
3. store the activation proof and public key with the runtime host
4. set `LicenseConfigs:Mode=Offline`

The runtime host then verifies the signed proof without calling the license server on every startup.
