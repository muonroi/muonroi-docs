# Rule Engine Testing Guide

Cover three layers when testing the current stack.

## 1. Unit tests

- validate each rule in isolation
- assert `FactBag` outputs
- assert dependency ordering and failure behavior

## 2. Runtime API tests

- save a ruleset version
- submit and approve it when approval is required
- activate it
- verify audit entries and SignalR notifications

## 3. Decision table tests

- validate a table
- import from JSON or DMN
- export and compare expected shape
- assert version-history snapshots

## Recommended checks

- maker-checker rejection for self-approval
- canary routing for targeted tenants
- FEEL expression evaluation through `/api/v1/feel/evaluate`
- Redis-backed change propagation when hot reload is enabled
