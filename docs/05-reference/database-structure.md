---
title: Database Structure
sidebar_label: Database Schema
sidebar_position: 1
---

# Database Structure

This guide documents the complete database schema used by Muonroi across the control plane, rule engine, and supporting systems. All tables are created via Entity Framework Core migrations and are organized by functional area.

## Overview

The Muonroi ecosystem uses PostgreSQL as the primary database (supporting multiple schemas for tenant isolation). Tables fall into these categories:

1. **Identity & Permission** — User authentication, roles, permissions
2. **Rule Engine** — Ruleset definitions, versions, approval workflows
3. **Decision Tables** — Decision table models, versions, cell data
4. **Workflows** — BPMN process definitions, execution tracking
5. **Multi-Tenancy** — Tenant configuration, quotas, isolation modes
6. **Canary Deployments** — Version rollout tracking
7. **Authorization** — Rule-driven auth rules
8. **Audit Trail** — System audit logs
9. **License Server** — (separate database) License keys, activations, heartbeats

---

## Identity and Permission Tables

| Table | Schema | Purpose | Optional |
|-------|--------|---------|----------|
| **MUsers** | dbo | User account information, email, status | |
| **MRoles** | dbo | Role definitions (Admin, Approver, Viewer) | |
| **MPermissions** | dbo | Permission definitions mapped to enum values | |
| **MRolePermissions** | dbo | N:N mapping between roles and permissions | |
| **MUserRoles** | dbo | N:N mapping between users and roles | |
| **MRefreshTokens** | dbo | Refresh token storage with validity keys | |
| **MUserTokens** | dbo | External login tokens (OAuth, SAML, etc.) | ✔️ |
| **MUserLoginAttempts** | dbo | Failed login attempt tracking for rate limiting | ✔️ |
| **MLanguages** | dbo | Supported locale codes for localization | |
| **MPermissionGroups** | dbo | Logical groups of related permissions | |
| **MPermissionAuditLogs** | dbo | Audit trail of permission changes | ✔️ |

---

## Rule Engine Tables

### RuleSets

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **RuleSetId** | GUID | PK | Unique ruleset identifier |
| **TenantId** | VARCHAR(256) | FK | Multi-tenant owner (ITenantScoped) |
| **WorkflowName** | VARCHAR(256) | | Unique workflow name (e.g., "loan-approval") |
| **SourceType** | VARCHAR(50) | | Kind: CodeBased, FlowGraph, DecisionTable, JsonWorkflow |
| **SourceCode** | TEXT | | Rule source (C# class name, DMN XML, JSON flow) |
| **Description** | TEXT | | Human-readable description |
| **CreatedAt** | DATETIME | | UTC timestamp of creation |
| **UpdatedAt** | DATETIME | | UTC timestamp of last modification |
| **CreatorUserId** | GUID | FK | User who created (audit trail) |
| **Version** | INT | | Current active version number |

**Relationships:**
- 1:N to RuleSetVersions (all versions of this ruleset)
- 1:N to RuleSetApprovals (approval workflow records)
- 1:N to RuleSetAudit (change audit trail)
- FK to MUsers (CreatorUserId)
- FK to Tenants (TenantId, if multi-tenant enabled)

**Indexes:** (TenantId, WorkflowName), (CreatedAt DESC), (UpdatedAt DESC)

### RuleSetVersions

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **VersionId** | GUID | PK | Unique version identifier |
| **RuleSetId** | GUID | FK | Parent ruleset |
| **VersionNumber** | INT | | Incremental version (1, 2, 3...) |
| **RuleSetJson** | TEXT | | Complete ruleset JSON (source code snapshot) |
| **Description** | VARCHAR(500) | | Version notes / change summary |
| **Status** | VARCHAR(50) | | Draft, PendingApproval, Active, Superseded |
| **CreatedAt** | DATETIME | | Timestamp of creation |
| **CreatedBy** | GUID | FK | User who created this version |
| **ActivatedAt** | DATETIME | | NULL until activated, then UTC timestamp |
| **ActivatedBy** | GUID | FK | User who activated this version |
| **SignedHash** | VARCHAR(256) | | SHA256 of RuleSetJson for integrity verification |
| **Signature** | TEXT | | HMAC-SHA256 signature for approval chain |

**Relationships:**
- FK to RuleSets (RuleSetId)
- FK to MUsers (CreatedBy, ActivatedBy)
- 1:N to RuleSetApprovals (approval records for this version)

**Indexes:** (RuleSetId, VersionNumber), (Status, CreatedAt), (ActivatedAt DESC)

### RuleSetApprovals

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **ApprovalId** | GUID | PK | Unique approval record ID |
| **VersionId** | GUID | FK | Version being approved |
| **TenantId** | VARCHAR(256) | FK | Multi-tenant owner |
| **ApprovalStatus** | VARCHAR(50) | | Pending, Approved, Rejected |
| **SubmittedAt** | DATETIME | | Submission timestamp |
| **SubmittedBy** | GUID | FK | User who submitted |
| **ApprovedAt** | DATETIME | | NULL until approved |
| **ApprovedBy** | GUID | FK | Approver user (maker ≠ checker rule) |
| **RejectionReason** | TEXT | | Reason if rejected |
| **ApprovalComment** | TEXT | | Comments from approver |

**Relationships:**
- FK to RuleSetVersions (VersionId)
- FK to MUsers (SubmittedBy, ApprovedBy)
- FK to Tenants (TenantId)

**Indexes:** (VersionId, ApprovalStatus), (SubmittedAt DESC), (ApprovedBy, ApprovedAt)

### RuleSetAudit

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **AuditId** | GUID | PK | Unique audit log entry |
| **RuleSetId** | GUID | FK | Ruleset being audited |
| **TenantId** | VARCHAR(256) | FK | Multi-tenant owner |
| **ActionType** | VARCHAR(50) | | Created, Modified, Activated, Approved, Rejected, Executed |
| **ActionDetail** | TEXT | | JSON context (version, previous values) |
| **PerformedBy** | GUID | FK | User who performed action |
| **PerformedAt** | DATETIME | | Timestamp of action |
| **CorrelationId** | VARCHAR(256) | | Trace correlation ID |
| **IpAddress** | VARCHAR(50) | | IP of requesting client |

**Relationships:**
- FK to RuleSets (RuleSetId)
- FK to MUsers (PerformedBy)
- FK to Tenants (TenantId)

**Indexes:** (RuleSetId, PerformedAt DESC), (PerformedBy, PerformedAt), (CorrelationId)

---

## Decision Table Tables

### DecisionTables

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **TableId** | GUID | PK | Unique decision table identifier |
| **TenantId** | VARCHAR(256) | FK | Multi-tenant owner (ITenantScoped) |
| **Name** | VARCHAR(256) | | Readable table name (e.g., "Loan Approval Rules") |
| **Description** | TEXT | | Purpose and business rules |
| **HitPolicy** | VARCHAR(50) | | First, Unique, Collect, Priority |
| **CreatedAt** | DATETIME | | UTC creation timestamp |
| **UpdatedAt** | DATETIME | | UTC last modification timestamp |
| **CreatorUserId** | GUID | FK | User who created |
| **Version** | INT | | Current active version |

**Relationships:**
- 1:N to DecisionTableVersions
- FK to MUsers (CreatorUserId)
- FK to Tenants (TenantId)

**Indexes:** (TenantId, Name), (CreatedAt DESC)

### DecisionTableVersions

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **VersionId** | GUID | PK | Unique version ID |
| **TableId** | GUID | FK | Parent decision table |
| **VersionNumber** | INT | | Incremental version (1, 2, 3...) |
| **HitPolicy** | VARCHAR(50) | | First, Unique, Collect, or Priority |
| **InputColumns** | TEXT | | JSON array of input column definitions |
| **OutputColumns** | TEXT | | JSON array of output column definitions |
| **CreatedAt** | DATETIME | | Timestamp |
| **CreatedBy** | GUID | FK | User who created |
| **ActivatedAt** | DATETIME | | NULL until activated |
| **ActivatedBy** | GUID | FK | User who activated |
| **Description** | VARCHAR(500) | | Version notes |
| **SignedHash** | VARCHAR(256) | | SHA256 of table structure |

**Relationships:**
- FK to DecisionTables (TableId)
- FK to MUsers (CreatedBy, ActivatedBy)
- 1:N to DecisionTableCells

**Indexes:** (TableId, VersionNumber), (ActivatedAt DESC)

### DecisionTableCells

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **CellId** | GUID | PK | Unique cell identifier |
| **VersionId** | GUID | FK | Decision table version |
| **RowIndex** | INT | | Row number (0-based) |
| **ColumnName** | VARCHAR(256) | | Column identifier (input or output) |
| **CellValue** | TEXT | | FEEL expression or literal value |
| **CellType** | VARCHAR(50) | | Input, Output |
| **IsDisabled** | BIT | | Row disabled (skipped during evaluation) |
| **DisplayOrder** | INT | | Visual row ordering |

**Relationships:**
- FK to DecisionTableVersions (VersionId)

**Indexes:** (VersionId, RowIndex), (VersionId, ColumnName)

---

## Workflow Execution Tables

### MJsonWorkflows

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **WorkflowId** | GUID | PK | Unique workflow identifier |
| **TenantId** | VARCHAR(256) | FK | Multi-tenant owner |
| **Name** | VARCHAR(256) | | Workflow name |
| **Definition** | TEXT | | BPMN 2.0 XML definition |
| **Version** | INT | | Current version |
| **CreatedAt** | DATETIME | | Creation timestamp |
| **CreatorUserId** | GUID | FK | Creator user |

**Relationships:**
- FK to Tenants (TenantId)
- FK to MUsers (CreatorUserId)
- 1:N to MJsonWorkflowExecutions

### MJsonWorkflowExecutions

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **ExecutionId** | GUID | PK | Unique execution record |
| **WorkflowId** | GUID | FK | Parent workflow |
| **TenantId** | VARCHAR(256) | FK | Multi-tenant context |
| **Status** | VARCHAR(50) | | Running, Completed, Failed, Compensated |
| **StartedAt** | DATETIME | | Execution start timestamp |
| **CompletedAt** | DATETIME | | Completion timestamp (if finished) |
| **ContextData** | TEXT | | JSON FactBag state at execution end |
| **ErrorMessage** | TEXT | | Error details if failed |
| **ExecutionMode** | VARCHAR(50) | | AllOrNothing, BestEffort, CompensateOnFailure |

**Relationships:**
- FK to MJsonWorkflows (WorkflowId)
- FK to Tenants (TenantId)

**Indexes:** (WorkflowId, StartedAt DESC), (Status, CompletedAt)

---

## Multi-Tenancy Tables

### Tenants

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **TenantId** | VARCHAR(256) | PK | Unique tenant identifier (e.g., "acme-corp") |
| **DisplayName** | VARCHAR(256) | | Human-readable tenant name |
| **Status** | VARCHAR(50) | | Active, Suspended, Deleted |
| **IsolationMode** | VARCHAR(50) | | SharedSchema, SeparateSchema, SeparateDatabase |
| **SchemaName** | VARCHAR(256) | | For SeparateSchema: PostgreSQL schema name (e.g., "acme_corp") |
| **DatabaseConnectionString** | TEXT | | For SeparateDatabase: full connection string |
| **CreatedAt** | DATETIME | | Registration timestamp |
| **CreatedBy** | GUID | FK | Admin user who created |
| **Tier** | VARCHAR(50) | | Free, Starter, Professional, Enterprise |

**Relationships:**
- 1:N to TenantQuotas
- 1:N to TenantIsolationModes (audit trail of mode changes)
- FK to MUsers (CreatedBy)

**Indexes:** (Status, CreatedAt), (Tier, CreatedAt)

### TenantQuotas

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **QuotaId** | GUID | PK | Unique quota record |
| **TenantId** | VARCHAR(256) | FK | Tenant owner |
| **QuotaType** | VARCHAR(50) | | RuleExecutionsPerDay, ConcurrentExecutions, ApiRequestsPerMinute, etc. |
| **Limit** | INT | | Maximum allowed (-1 = unlimited) |
| **CurrentUsage** | INT | | Current usage in period (cache value) |
| **PeriodKey** | VARCHAR(50) | | Time period (yyyyMMddHHmmss, yyyyMMddHHmm, etc.) |
| **ResetAt** | DATETIME | | Next reset timestamp |
| **UpdatedAt** | DATETIME | | Last update timestamp |

**Quota Types (13 total):**
- MaxRulesPerTenant
- MaxRuleExecutionsPerDay
- MaxConcurrentExecutions
- MaxDecisionTables
- MaxJsonWorkflows
- MaxStorageMB
- MaxApiRequestsPerMinute
- MaxRuleEvaluationsPerSecond
- MaxWorkflowExecutionsPerHour
- MaxRuleComplexity
- MaxWorkflowSizeKB
- MaxExecutionTimeMs
- MaxMessagesPerDay

**Relationships:**
- FK to Tenants (TenantId)

**Indexes:** (TenantId, QuotaType), (PeriodKey, ResetAt)

### TenantIsolationModes

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **RecordId** | GUID | PK | Unique record |
| **TenantId** | VARCHAR(256) | FK | Tenant being changed |
| **OldMode** | VARCHAR(50) | | Previous isolation mode |
| **NewMode** | VARCHAR(50) | | New isolation mode |
| **Reason** | TEXT | | Change reason |
| **RequestedAt** | DATETIME | | Timestamp of request |
| **RequestedBy** | GUID | FK | Admin user |
| **ApprovedAt** | DATETIME | | Approval timestamp (if approved) |
| **ApprovedBy** | GUID | FK | Approver user |
| **Status** | VARCHAR(50) | | Requested, Approved, Applied, Failed |

**Relationships:**
- FK to Tenants (TenantId)
- FK to MUsers (RequestedBy, ApprovedBy)

**Indexes:** (TenantId, RequestedAt DESC), (Status, ApprovedAt)

---

## Canary Deployment Tables

### CanaryRollouts

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **RolloutId** | GUID | PK | Unique canary rollout ID |
| **RuleSetId** | GUID | FK | Ruleset being rolled out |
| **TenantId** | VARCHAR(256) | FK | Tenant context |
| **VersionNumber** | INT | | Version being canary'd |
| **Status** | VARCHAR(50) | | Active, Promoted, RolledBack |
| **TargetPercentage** | INT | | Percentage of traffic (1-100) |
| **TargetTenantIds** | TEXT | | JSON array of specific tenants (null = all tenants) |
| **StartedAt** | DATETIME | | Rollout start timestamp |
| **StartedBy** | GUID | FK | User who initiated |
| **PromotedAt** | DATETIME | | Promotion timestamp (if promoted) |
| **PromotedBy** | GUID | FK | User who promoted |
| **RolledBackAt** | DATETIME | | Rollback timestamp (if rolled back) |
| **RolledBackBy** | GUID | FK | User who rolled back |
| **RollbackReason** | TEXT | | Reason for rollback |
| **MetricsJson** | TEXT | | Evaluation metrics (error rate, latency) |
| **CreatedAt** | DATETIME | | Record creation timestamp |

**Relationships:**
- FK to RuleSets (RuleSetId)
- FK to Tenants (TenantId)
- FK to MUsers (StartedBy, PromotedBy, RolledBackBy)

**Indexes:** (RuleSetId, Status, StartedAt DESC), (TargetPercentage), (PromotedAt DESC)

---

## Authorization Tables

### AuthRules

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **RuleSetId** | GUID | PK | Unique auth rule ID |
| **TenantId** | VARCHAR(256) | FK | Multi-tenant owner |
| **Name** | VARCHAR(256) | | Auth rule name (normalized to `auth/{name}`) |
| **SourceCode** | TEXT | | Rule source (C# or FEEL expression) |
| **Version** | INT | | Current version number |
| **ActiveVersionId** | GUID | FK | Currently active version |
| **CreatedAt** | DATETIME | | Creation timestamp |
| **CreatedBy** | GUID | FK | Creator user |
| **UpdatedAt** | DATETIME | | Last modification timestamp |
| **UpdatedBy** | GUID | FK | User who last modified |

**Relationships:**
- 1:N to RuleSetVersions (reuses same version table)
- FK to Tenants (TenantId)
- FK to MUsers (CreatedBy, UpdatedBy)

**Indexes:** (TenantId, Name), (ActiveVersionId), (CreatedAt DESC)

---

## Audit Trail Tables

### GlobalAuditLog

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **AuditId** | GUID | PK | Unique audit entry |
| **TenantId** | VARCHAR(256) | FK | Multi-tenant owner |
| **EntityType** | VARCHAR(256) | | Entity being audited (RuleSet, DecisionTable, Tenant, etc.) |
| **EntityId** | GUID | FK | ID of entity |
| **ActionType** | VARCHAR(50) | | Create, Read, Update, Delete, Activate, Execute |
| **ActionDetail** | TEXT | | JSON with old/new values (for Update) |
| **PerformedBy** | GUID | FK | User who performed action |
| **PerformedAt** | DATETIME | | Action timestamp |
| **CorrelationId** | VARCHAR(256) | | Request correlation ID |
| **IpAddress** | VARCHAR(50) | | Client IP address |
| **UserAgent** | TEXT | | HTTP User-Agent header |

**Relationships:**
- FK to Tenants (TenantId)
- FK to MUsers (PerformedBy)

**Indexes:** (TenantId, PerformedAt DESC), (EntityType, EntityId, PerformedAt), (CorrelationId), (PerformedBy, PerformedAt)

---

## License Server Database (Separate Instance)

The license-server maintains its own PostgreSQL database (`muonroi_licenses`) for license key and activation management.

### LicenseKeys

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **LicenseKeyId** | GUID | PK | License key record ID |
| **LicenseKey** | VARCHAR(256) | | Key format: `MRR-{24-byte base64url}` (unique, indexed) |
| **LicenseId** | VARCHAR(256) | | Internal ID: `lic_{GUID}` |
| **OrganizationId** | VARCHAR(256) | | Customer organization identifier |
| **OrganizationName** | VARCHAR(256) | | Human-readable org name |
| **Tier** | VARCHAR(50) | | Free, Licensed, Enterprise |
| **Features** | TEXT | | JSON array of enabled features |
| **ValidFrom** | DATETIME | | Validity start date |
| **ValidUntil** | DATETIME | | Expiration date |
| **MaxActivations** | INT | | Maximum allowed activations (-1 = unlimited) |
| **CurrentActivations** | INT | | Current active count |
| **Status** | VARCHAR(50) | | Active, Suspended, Revoked, Expired |
| **CreatedAt** | DATETIME | | Issue timestamp |
| **CreatedBy** | VARCHAR(256) | | Admin who issued |
| **RevokedAt** | DATETIME | | Revocation timestamp (if revoked) |
| **RevokedBy** | VARCHAR(256) | | Admin who revoked |
| **RevocationReason** | TEXT | | Reason for revocation |
| **SignedHash** | VARCHAR(256) | | SHA256 signature for integrity |

**Feature Values (by Tier):**
- Free: [api.validate]
- Licensed: [vsix.publish, vsix.watch, vsix.explorer, api.validate, cp.publish]
- Enterprise: [*] (all features enabled)

**Indexes:** (LicenseKey), (Status, ValidUntil), (CreatedAt DESC), (RevokedAt DESC)

### Activations

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **ActivationId** | GUID | PK | Unique activation record |
| **LicenseKeyId** | GUID | FK | Parent license key |
| **ProofId** | GUID | | Activation proof identifier (sent in heartbeats) |
| **MachineFingerprint** | VARCHAR(256) | | SHA256(machine name + OS + app name) |
| **HardwareId** | VARCHAR(256) | | Hardware identifier for offline mode |
| **ActivatedAt** | DATETIME | | Activation timestamp |
| **LastHeartbeatAt** | DATETIME | | Most recent heartbeat |
| **ExpiresAt** | DATETIME | | Proof expiration (if not renewed) |
| **CurrentNonce** | VARCHAR(256) | | Server-side nonce for heartbeat chain |
| **Status** | VARCHAR(50) | | Active, Revoked, Expired |

**Relationships:**
- FK to LicenseKeys (LicenseKeyId)

**Indexes:** (LicenseKeyId, Status), (MachineFingerprint), (LastHeartbeatAt DESC)

### HeartbeatRecords

| Column | Type | Key | Description |
|--------|------|-----|-------------|
| **HeartbeatId** | GUID | PK | Unique heartbeat record |
| **ActivationId** | GUID | FK | Activation being heartbeat'd |
| **LicenseId** | VARCHAR(256) | FK | License identifier |
| **ProofId** | GUID | | Proof being renewed |
| **Timestamp** | DATETIME | | Heartbeat timestamp |
| **NonceUsed** | VARCHAR(256) | | Nonce from request |
| **NonceNew** | VARCHAR(256) | | New nonce issued |
| **IsRevoked** | BIT | | Whether revocation detected |
| **GraceUntilUtc** | DATETIME | | Revocation grace period end |
| **ClientVersion** | VARCHAR(50) | | Client app version |
| **Status** | VARCHAR(50) | | Success, RejectedRevoked, RejectedExpired |

**Relationships:**
- FK to Activations (ActivationId)

**Indexes:** (ActivationId, Timestamp DESC), (Timestamp DESC), (IsRevoked, GraceUntilUtc)

---

## Key Design Patterns

### Multi-Tenancy Pattern
- All user-defined tables implement `ITenantScoped` (TenantId column)
- EF Core query filters automatically add: `e => e.TenantId == TenantContext.CurrentTenantId || TenantContext.CurrentTenantId == null`
- Tenant isolation via:
  - **SharedSchema**: row-level filtering (dbo schema)
  - **SeparateSchema**: PostgreSQL SearchPath per tenant (tenant-specific schema)
  - **SeparateDatabase**: separate connection string and database

### Versioning Pattern
- RuleSetVersions, DecisionTableVersions store all historical versions
- Active version tracked via parent table's Version column and ActivatedAt timestamp
- Immutable version records enable audit trail and rollback

### Approval Workflow Pattern
- RuleSetApprovals tracks submission → approval → activation chain
- Maker-Checker rule: SubmittedBy ≠ ApprovedBy enforced at application layer
- Signatures (SignedHash, Signature) prevent tampering during approval

### Audit Trail Pattern
- RuleSetAudit and GlobalAuditLog track all changes by action type and user
- CorrelationId links related operations across distributed requests
- Immutable design: audit records are never deleted or modified

---

## Related Resources

- [Multi-Tenancy Guide](../03-guides/multi-tenancy/tenant-isolation.md) — tenant isolation strategies
- [Approval Workflow Guide](../03-guides/control-plane/ruleset-approval-workflow.md) — approval process details
- [Decision Table Guide](../03-guides/rule-engine/decision-table-guide.md) — decision table structure
