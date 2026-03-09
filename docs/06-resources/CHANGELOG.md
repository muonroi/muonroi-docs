# Changelog

All notable changes to this project will be documented in this file.

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
