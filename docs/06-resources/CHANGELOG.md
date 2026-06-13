# Changelog

All notable changes to this project will be documented in this file.

## [1.9.7] - 2026-06-13

### Added
- **building-block** `MBB008` analyzer: cross-capability type reference inside an `AddM*` extension method must be guarded by `IMEcosystemRegistry.Has(MCapability.X)`. Anchors: `Logging`, `RuleEngine`, `MultiTenant`, `Auth`, `Governance`.
- **building-block** `MBB009` analyzer: forbids raw `Exception`/`ArgumentException` throws inside `Muonroi.*` namespaces — use the `MException` hierarchy (test assemblies exempt).
- **building-block** `MBB010` analyzer: requires a null guard on every non-nullable reference-type parameter of a public method (`MGuard.NotNull`, `ArgumentNullException.ThrowIfNull`, `if (x == null)`, `x ?? throw`); value types and `T?` exempt.
- **building-block** `LicenseFingerprintScope` enum + `LicenseConfigs.FingerprintScope` key (`MachineAndProject` default / `ProjectOnly`). `ProjectOnly` omits hardware + OS so one license key validates on any machine (dev / UAT / prod).
- **building-block** `MCapability.Governance = 1 << 4` added to the `MCapability` flags enum, registered by the governance `AddM*` extension so `MBB008` can guard calls into `Muonroi.Governance.*`.
- **building-block** `CopilotDraftProvenanceRecord` entity + `DbSet` on `RuleEngineDbContext` (AI-copilot draft hash/snapshot/`EditedBeforeApproval`/`ApprovedAt`, tenant-scoped RLS); `(Draft, Rejected)` copilot-discard transition (`Rejected` remains terminal).
- **ui-engine** `@muonroi/ui-engine-rule-components` 0.1.23 — `mu-impact-list` Lit component (cross-version impact, three-state coverage badges, UAT checklist, virtualized, trace-jump) + `MuImpactListReact` wrapper + `getImpactList` client. Living Docs suite: `mu-living-docs`, `mu-traceability-matrix`. New commercial package `@muonroi/ui-engine-pdf-designer` 1.0.0 (Monaco-based PDF template designer, PROFILE-V1 lint, `pdf.designer` gated).
- **license-server** PDF entitlements — per-key grant/revoke endpoint `POST /api/v1/keys/{licenseKey}/features` + `features` CLI; capability keys `pdf.designer`, `pdf.registry`, `pdf.canary` (stored in `LicenseRecord.AllowedFeatures` `text[]`, no migration).
- **muonroi-cli** 1.4.1 — `ee_feedback` MCP tool + session pending-recall feedback gate; `csharp-ls` built-in LSP + per-request timeout; `lsp.autoInstall` default on. `muonroi-tools` MCP tool names normalized to underscores (`ee_query`, `selfverify_*`, `usage_forensics`, `lsp_query`).
- **experience-engine** Gemini, Antigravity, and Codex memory adapters (single-file `MEMORY.md` parsing) alongside Claude; curated-memory import wired into `upgrade.sh`; runbook re-confirm flagging on supersede.

### Fixed
- **building-block** `OwnedPdfWriter` emits deterministic LF line endings in content/CMap streams (cross-platform golden parity).
- **building-block** EF Core migration chain consolidated (`CatchUpRlsProvenanceWriteCheck`): RLS `WITH CHECK` applied to all six tenant-scoped tables (`RuleSets`, `CanaryRollouts`, `RuleSetAudits`, `TenantRuleAssignments`, `TenantQuotaOverrides`, `CopilotDraftProvenance`).

## [1.9.6] - 2026-03-12

### Added
- Track 8 messaging and integration runtime coverage:
  - `IMessageRouter<TMessage>` and `IRoutingDecision` for redirect / dead-letter decisions
  - Redis-backed routing table with local cache + pub/sub invalidation
  - `GrpcClientAuthInterceptor` for forwarding bearer token, tenant id, and correlation id from `ISystemExecutionContext`
  - mediator-side `[MEmitOnPass]` and `IRuleNotificationFactory<TContext>` for rule-triggered notifications
  - structured rule execution telemetry with pass/fail result counters and duration histogram tags

### Changed
- `RuleEngineRoutingFilter<T>` now supports three routing sources in order:
  - Redis dynamic routes
  - DI-registered `IMessageRouter<T>`
  - legacy `IMessageRoutingRule<T>` compatibility adapter
- Messaging documentation now covers Redis FEEL routing, reject semantics, and rule-triggered mediator notifications.
- gRPC documentation now covers per-client `ForwardAuthToken` / `ForwardTenantId` configuration and outbound metadata forwarding behavior.

## [1.9.5] - 2026-03-11

### Added
- Developer MCP guide for Muonroi local authoring workflows:
  - `muonroi-mcp-dev` stdio server
  - mandatory AI workflow for `muonroi://ecosystem/rules`, scaffolding, compliance, extract, and register
  - Claude Code `.claude/mcp.json` example for local server registration
- Control-plane MCP decision table version tools:
  - `muonroi_decision_table_get_versions`
  - `muonroi_decision_table_get_version`
  - `muonroi_decision_table_diff_versions`
- Rule Studio deep runtime extensions:
  - `GET /api/v1/rule-catalog` and `GET /api/v1/rule-catalog/{code}` for BA palette metadata
  - `MRuleCatalogEntry` metadata now flows from authoring manifest into the Control Plane palette
  - `mu-rule-flow-designer` accepts `catalogApiBase` and renders remote rule palette groups
  - designer dependency overlay and auto-layout actions for graph readability
  - dependency badge click-to-focus navigation inside the inspector
  - decision-table inspector schema overview with column and hit-policy hints
  - explicit publish confirmation dialog before save/submit/activate begins

### Changed
- Rule engine documentation now treats MCP as a first-class developer entry point alongside `muonroi-rule` and `Muonroi.DecisionTableGen`.
- Control-plane MCP decision table coverage now includes version history, version snapshot lookup, and structural diff for tenant-scoped tables.
- Claude Code MCP registration guidance now includes paired `muonroi-cloud` + `muonroi-dev` setup and repo-local `.claude/mcp.json` files for `muonroi-building-block`, `muonroi-control-plane`, and `muonroi-ui-engine`.
- Rule Studio host integration now uses split endpoints:
  - `apiBaseUrl=/api/v1/control-plane`
  - `catalogApiBase=/api/v1/rule-catalog`
- Rule Studio remote catalog palette now renders as a dedicated searchable section with loading and empty states in `mu-rule-flow-designer`.
- Flow-graph runtime now treats `always` edges as non-halting branch continuations after upstream failures or exceptions, matching `on-false` / `on-error` recovery semantics.

## [1.9.4] - 2026-03-07

### Added
- Track 4/5 execution continuity plan (`Docs/track4-track5-execution-plan.md`) with explicit recovery order after context compaction.
- Pre-publish verification matrix for `mr-base-sln`, `mr-mod-sln`, and `mr-micro-sln` using LocalNuGet feeds (`LocalNuget` / `LocalNuGetFeed`).

### Changed
- `muonroi-control-plane` runtime license exposure and bootstrap flow finalized:
  - `GET /api/v1/info` returns `activationProof`.
  - dashboard bootstrap initializes UI license verifier before rendering.
- `muonroi-ui-engine` OSS boundary hardening:
  - `@muonroi/ui-engine-rule-components` moved to optional peer dependency in OSS React package.
  - lockfile + publish workflow adjusted for stable CI.

### Fixed
- Template repositories updated for current `MRepository` constructor signature by adding `IMDateTimeService` in generated repository constructors.
- Base template auth wiring updated to current API:
  - `AddValidateBearerToken<BaseTemplateDbContext, Permission>(configuration)`.

## [1.9.3] - 2026-03-07

### Added

**Messaging Stack — Phase 1 (Core Automation & Tracing)**
- `MuonroiContextPublishFilter<T>` and `MuonroiContextSendFilter<T>`: automatically stamp all context headers (`TenantId`, `UserId`, `CorrelationId`, `AccessToken`, `SourceType`, `SentAt`) on every publish/send via `ISystemExecutionContextAccessor`. Eliminates the need to call `PublishWithAuthContext` manually for standard flows.
- `MaskAccessTokenInHeaders` option: replaces the raw `AccessToken` header with an `X-Muonroi-Identity-Sig` (SHA-256 of `UserId:TenantId:CorrelationId`) to avoid transmitting bearer tokens over the message broker.
- ECS logging filters (`EcsConsumeLoggingFilter`, `EcsPublishLoggingFilter`, `EcsSendLoggingFilter`) now inject `ISystemExecutionContextAccessor` — no more static `TenantContext` reads.
- `correlation.id` and `tenant.id` tags added to OTel activities in all three logging filters.
- `KafkaBusConfigurator` now wires SASL (`SecurityProtocol`, `SaslMechanism`, `SaslUsername`, `SaslPassword`) and `ClientId` from config.
- `RabbitMqBusConfigurator` now wires `HeartbeatSeconds`, `Port`, and `UseQuorumQueues` from config.

**Messaging Stack — Phase 2 (Security & Reliability)**
- `OutboxRelayBackgroundService`: polls `IEventOutboxStore` for `Pending` events, publishes via `IPublishEndpoint`, marks `Published` or `Failed`. Wired via `services.AddOutboxRelay()`.
- `MDbContextOutboxExtensions.SaveWithOutboxAsync<T>`: atomic save + outbox row creation in a single `SaveChangesAsync` call.
- `MuonroiConsumerBase<T>`: standard base class for MassTransit consumers with `IMLog<T>`, `ILicenseGuard`, and `ISystemExecutionContextAccessor` pre-wired.
- `OutboxRelayConfigs` added to `MessageBusConfigs`: `Enabled`, `PollingIntervalMs`, `BatchSize`.
- `OutboxRelay` registration fixed: `AddSingleton<OutboxRelayBackgroundService>` ensures the concrete type is resolvable as `IOutboxRelayService`.

**Messaging Stack — Phase 3 (Advanced Integration)**
- `TenantQuotaMessagingFilter<T>`: enforces `MessagesPerMinute` and `MessagesPerDay` quotas per tenant via `ITenantQuotaTracker`. Throws `QuotaExceededException` (non-retriable) on violation. Activated via `EnableQuotaEnforcement: true`.
- `MSagaDbContext`: abstract `MDbContext`-based saga persistence base with automatic `TenantId` injection from `ISystemExecutionContextAccessor` and timestamp management via `IMDateTimeService`.
- `IMuonroiSaga` interface: contract for saga state entities with `CorrelationId`, `TenantId`, `CreationTime`, `LastModificationTime`.
- `RuleEngineRoutingFilter<T>`: executes `IEnumerable<IMessageRoutingRule<T>>` against each incoming message before consumer dispatch. Activated via `EnableRuleEngineRouting: true`. OSS-abstraction-only — no dependency on `RuleEngine.Core`.
- `IMessageRoutingRule<T>`: marker interface (extends `IRule<T>`) for routing rules in `Muonroi.Messaging.Abstractions`.
- `IOutboxRelayService` interface added to `Muonroi.Messaging.Abstractions`.
- `QuotaType.MessagesPerMinute` and `QuotaType.MessagesPerDay` added to `Muonroi.RuleEngine.Abstractions`.

### Fixed
- `MuonroiConsumerBase<T>`: replaced `ILoggerFactory`/`ILogger` with `IMLog<T>` (logging standard compliance).
- `OutboxRelayBackgroundService`: replaced `ILogger<T>` with `IMLog<T>` and `DateTime.UtcNow` with `IMDateTimeService` (MBB001 + logging standard compliance).
- `MSagaDbContext`: replaced `DateTime.UtcNow` with `IMDateTimeService` fallback (MBB001) and `TenantContext.CurrentTenantId` static read with `ISystemExecutionContextAccessor` (coding rule #4).
- `TenantQuotaMessagingFilter`: changed thrown exception from `InvalidOperationException` to `QuotaExceededException` to prevent MassTransit retry loops on quota violations.
- `RuleEngineRoutingFilter`: removed undeclared `Muonroi.RuleEngine.Core` transitive dependency; now uses `IMessageRoutingRule<T>` from `Muonroi.Messaging.Abstractions`.

## [1.9.2] - 2026-03-06
### Added
- Dotnet template options `--tier` (`oss|enterprise`) and `--control-plane` (`true|false`) for `mr-base-sln`, `mr-mod-sln`, and `mr-micro-sln`.
- Enterprise template wiring now conditionally adds `Muonroi.Governance.Enterprise` and calls `AddMEnterpriseGovernance(...)`.
- Control plane template wiring now conditionally adds Rule Engine Postgres/Redis integration and appsettings placeholders for `ControlPlaneUrl` and `ConnectionStrings:RuleEngineDb`.

## [1.9.1] - 2026-02-07
### Added
- **Tier 2 Security Enhancement**: Signed Policy System for Enterprise compliance.
- `LicensePolicy`: RSA-signed data structure defining enforcement rules, feature quotas, and rate limits.
- `PolicyVerifier`: Cryptographic verification of policy files using RSA-SHA256.
- `PolicyEnforcer`: Runtime enforcement of policy-defined rate limits and feature usage quotas.
- `PolicySigner` CLI Tool: Utility for generating and signing license policies for distribution.
- Support for `RequireSignedPolicy` in `LicenseConfigs` to mandate valid policies in production.

### Changed
- Integrated `PolicyEnforcer` into `LicenseGuard` to override configuration settings with signed policy rules.
- Enhanced `LicenseSaveChangesInterceptor` to respect policy-defined database enforcement rules.

## [1.9.0] - 2026-02-07
### Added
- **Tier 1 Security Enhancement**: Comprehensive client-side protection.
- `LicenseExecutionContext`: Prevents infinite recursion in database interceptors using `AsyncLocal`.
- `AntiTamperDetector`: Hardware breakpoint detection (DR0-DR7) and debugger sensing.
- `LicenseEnforcementMode`: Explicit control over security strictness (Free, Development, Production).
- Integrated `AntiTamperDetector` into `LicenseGuard` for hardened production checks.

### Fixed
- Fixed infinite recursion bug in `LicenseSaveChangesInterceptor` when recording actions during DB saves.
- Added missing `SavingChangesAsync` override in `LicenseSaveChangesInterceptor`.
- Improved tier-based enforcement: License tier is now the source of truth, reducing reliance on environment variables.

## [1.6.6] - 2025-08-17
### Added
- Rule Engine with DMN decision tables, complex event processing, feature flags, and governance capabilities.
- Multi-tenancy improvements including isolation, tenant-aware observability, and rate limiting.
- Authentication and authorization enhancements such as OIDC PKCE flow, WebAuthn MFA, DPoP token binding, and rule-driven login.
- OpenTelemetry instrumentation and ECS logging for MassTransit.

### Changed
- Refactored project structure and namespaces for clarity and maintainability.

### Fixed
- General bug fixes including improved null handling and error messages.

## [1.5.8] - 2025-02-11
### Added
- Logging enhancements and better token handling across services.
- Task management and file upload functionalities.

### Changed
- Updated repository interfaces and middleware behavior.
- Refactored serialization and repository layers.

### Fixed
- Resolved various issues in permission and authentication flows.
