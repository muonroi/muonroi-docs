# Control Plane Overview

`muonroi-control-plane` is the private operator service for managed rule delivery.

## What it hosts

- ruleset save, validate, export, dry-run, and activate endpoints
- maker-checker approval endpoints
- canary rollout endpoints
- decision table and FEEL web surfaces
- tenant assignment, tenant quota, and audit APIs
- SignalR hot reload hub

## Base route

Control-plane endpoints live under `/api/v1/control-plane`.

Public runtime bootstrap endpoint:

- `GET /api/v1/info` returns control-plane runtime metadata including `version` and `activationProof` for UI license bootstrap.
