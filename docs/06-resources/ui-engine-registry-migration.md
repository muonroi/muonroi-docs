# UI Engine Registry Migration

This migration replaces local mirrored UI workspace packages in `muonroi-control-plane/packages/*` with registry dependencies.

## What changed

- Dashboard dependencies moved from `workspace:*` to versioned packages (`^0.1.0`).
- `pnpm-workspace.yaml` now includes only `apps/*`.
- Root workspace no longer declares `packages/*`.
- Mirror folder `packages/` was removed from `muonroi-control-plane`.
- `scripts/sync-ui-packages.mjs` was archived as `sync-ui-packages.mjs.deprecated`.

## Registry/auth setup

All `@muonroi/*` packages are published to npmjs.org.
No scope-level GitHub Packages override is required in `muonroi-control-plane/.npmrc`.

## CI note

Control-plane dashboard CI no longer needs cross-repo `NPM_TOKEN`/PAT for package install.
