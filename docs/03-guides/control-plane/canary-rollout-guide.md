# Canary Rollout Guide

Canary rollout is managed through the control-plane service.

## Endpoints

- `POST /api/v1/control-plane/rulesets/{workflow}/canary`
- `GET /api/v1/control-plane/canary`
- `POST /api/v1/control-plane/canary/{rolloutId}/promote`
- `POST /api/v1/control-plane/canary/{rolloutId}/rollback`

## Operational pattern

1. approve a candidate version
2. start a canary for selected tenants or percentages
3. promote to active or roll back with a reason
