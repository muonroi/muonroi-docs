# Troubleshooting Guide

## Decision tables do not persist

Cause:

- `AddDecisionTableWeb(...)` was registered without a database connection string

Fix:

- provide `PostgresConnectionString` or `SqlServerConnectionString`

## Ruleset change events do not reach other nodes

Cause:

- Redis hot reload was not registered

Fix:

- add `AddMRuleEngineWithRedisHotReload(...)`
- confirm the Redis connection string is valid

## Approval workflow blocks activation

Cause:

- target version is still `Draft` or `Rejected`

Fix:

- submit and approve the version first

## SignalR subscriptions are rejected

Cause:

- caller lacks tenant membership, admin role, or approver role

Fix:

- verify JWT claims and requested tenant group
