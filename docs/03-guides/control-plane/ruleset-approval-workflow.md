# Ruleset Approval Workflow

The control plane implements maker-checker approval.

## Endpoints

- `POST /api/v1/control-plane/rulesets/{workflow}/{version}/submit`
- `POST /api/v1/control-plane/rulesets/{workflow}/{version}/approve`
- `POST /api/v1/control-plane/rulesets/{workflow}/{version}/reject`
- `GET /api/v1/control-plane/rulesets/pending-approvals`

## State flow

1. `Draft`
2. `PendingApproval`
3. `Approved`
4. `Active` after activation

Rejecting moves the version back to `Draft`.
