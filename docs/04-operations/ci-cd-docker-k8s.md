# CI CD Docker and K8s

The building-block repo currently carries workflow definitions for:

- `ci.yml`
- `docs.yml`
- `publish-oss.yml`
- `publish-commercial.yml`
- `publish-vsix.yml`

## Expected pipeline responsibilities

- build and test OSS packages
- enforce modular package boundaries
- publish OSS packages
- publish commercial packages to the private feed
- package and publish the VS Code extension
- publish documentation site updates

## Release discipline

- use `develop` for day-to-day integration
- reserve `main` for stable releases
- keep docs changes committed per repo scope
