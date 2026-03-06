# Test Matrix Guide

This matrix summarizes a minimum verification baseline for the major areas of the platform.

## Auth and authorization

- Role-to-endpoint allow and deny coverage
- Login, refresh token, and logout flows
- Token revocation and key rollover behavior
- Permission cache invalidation after role changes

## Multi-tenancy

- Tenant isolation for shared-database scenarios
- Connection resolution for database-per-tenant scenarios
- Tenant creation and migration workflows
- Cross-tenant access denial tests

## Rule engine

- Rule ordering and conflict resolution
- Backward compatibility when rule contracts change
- FEEL and decision table validation failures
- Rollout, approval, and rollback scenarios

## Messaging and jobs

- Retry and backoff behavior
- Idempotency guarantees
- Outbox and inbox processing
- Dead-letter handling
- Scheduler misfire recovery

## Infrastructure

- Database failover or reconnection behavior
- Redis outage handling
- SignalR reconnect behavior
- Deployment smoke tests after configuration changes
