# muonroi-docs — Deep Map

> Complete documentation index. Agents should read this to find the right doc without exploring.

---

## Directory Structure

```
docs/
├── 01-getting-started/    ← Quickstarts, first project
├── 02-concepts/           ← Architecture, tenancy, open-core
├── 03-guides/             ← Feature guides (largest section)
│   ├── control-plane/     ← Approval, canary, hot-reload
│   ├── identity-access/   ← Auth, OIDC, BFF, permissions
│   ├── integration/       ← Backend, data, messaging, gRPC
│   ├── license-governance/ ← License activation, tier enforcement
│   ├── multi-tenancy/     ← Tenant context, quotas, isolation
│   ├── rule-engine/       ← Core rules, RuleGen, FEEL, CEP, DT (16 files)
│   └── ui-engine/         ← Rule Studio, flow designer, DT widget
├── 04-operations/         ← Runbooks, dry-run, deployment
├── 05-reference/          ← API reference, analyzers, config
└── 06-resources/          ← Changelog, samples, test matrix
```

---

## 01-getting-started/ (5 files)

| File | Title | Summary |
|------|-------|---------|
| introduction.md | Introduction | Overview of 4-repo ecosystem |
| first-rule.md | Your First Rule | Code-first rule with `[MExtractAsRule]` |
| quickstart.md | Quickstart | Rule engine + basic orchestrator |
| quickstart-decision-table.md | Decision Table Quickstart | Minimal DT host with Postgres |
| template-quickstart.md | Template Quickstart | dotnet new template usage |

---

## 02-concepts/ (4 files)

| File | Title | Summary |
|------|-------|---------|
| architecture-overview.md | Architecture Overview | 4-layer platform diagram |
| tenancy-models.md | Tenancy Models | Shared-DB vs DB-per-tenant |
| open-core-model.md | Open Core Model | OSS/commercial boundary |
| ef-filters.md | EF Filters | EF filtering for multi-tenancy |

---

## 03-guides/ — Feature Guides

### Root (2 files)
| File | Title |
|------|-------|
| ecosystem-coding-rules.md | MBB001-MBB007 analyzers + conventions |
| rule-driven-authorization.md | Auth rules as data |

### control-plane/ (4 files)
| File | Title | Key Content |
|------|-------|-------------|
| control-plane-overview.md | Overview | CRUD, approval, canary, hot-reload, tenant APIs |
| ruleset-approval-workflow.md | Approval Workflow | Draft → PendingApproval → Approved → Active (maker≠checker) |
| canary-rollout-guide.md | Canary Rollout | Safe deployment to tenant subset |
| signalr-hot-reload.md | SignalR Hot Reload | Real-time updates without redeploy |

### identity-access/ (8 files)
| File | Title |
|------|-------|
| auth-module-guide.md | Auth Module Guide |
| oidc-guide.md | OIDC Guide |
| bff-guide.md | BFF Guide |
| token-guide.md | Token Guide |
| permission-guide.md | Permission System |
| permission-tree-guide.md | Permission Tree and UI Metadata |
| policy-decision-guide.md | Policy Decision Guide |
| webauthn-mfa-guide.md | WebAuthn MFA |

### integration/ (8 files)
| File | Title |
|------|-------|
| backend-guide.md | Backend Architecture |
| data-layer.md | Data Layer (EF Core) |
| gateway-guide.md | Gateway Integration |
| cache-guide.md | Caching (memory, Redis, multi-level) |
| dapper-guide.md | Dapper micro-ORM |
| messaging-guide.md | Messaging (pub/sub, events) |
| signalr-guide.md | SignalR real-time |
| grpc-guide.md | gRPC service-to-service |

### license-governance/ (3 files)
| File | Title | Key Content |
|------|-------|-------------|
| license-activation.md | License Activation | Offline/online activation flows |
| license-capability-model.md | License Capability Model | Tier-based feature unlocking |
| tier-enforcement.md | Tier Enforcement | Runtime license checks |

### multi-tenancy/ (4 files)
| File | Title | Key Content |
|------|-------|-------------|
| multi-tenant-guide.md | Multi Tenant Guide | TenantContext, AsyncLocal, isolation |
| multi-tenant-quota-guide.md | Quota Guide | Per-tenant resource limits |
| quota-api-reference.md | Quota API Reference | Programmatic quota management |
| tenant-isolation.md | Tenant Isolation | Shared vs per-tenant data |

### rule-engine/ (16 files) — **LARGEST SECTION**
| File | Title | Key Content |
|------|-------|-------------|
| rule-engine-guide.md | Rule Engine Guide | Orchestrator, FactBag, execution modes |
| rule-engine-hooks-guide.md | Hooks Guide | BeforeRule, AfterRule extension points |
| rule-engine-advanced-patterns.md | Advanced Patterns | Compensation, dependencies |
| rule-engine-testing-guide.md | Testing Guide | Unit, runtime API, DT test layers |
| rulegen-guide.md | RuleGen Guide | CLI v2.0.0 (extract, verify, register, merge, split, watch) |
| rulegen-vscode-extension.md | VS Code Extension | CodeLens, diagnostics, snippets |
| rule-source-generator.md | Source Generator | IIncrementalGenerator, MRG001-MRG005 |
| auto-crud-rules.md | Auto CRUD Rules | Automatic CRUD rule generation |
| decision-table-guide.md | Decision Table Guide | DMN model, hit policies, persistence, execution |
| decision-table-api-reference.md | DT API Reference | REST endpoints |
| decision-table-versioning.md | DT Versioning | Version history and snapshots |
| feel-reference.md | FEEL Reference | Syntax and functions |
| cep-engine.md | CEP Engine | Complex Event Processing |
| nrules-guide.md | NRules Guide | External NRules library |
| rule-rollout-guide.md | Rule Rollout | Approval → activation → canary → notify |
| mcp-developer-server.md | MCP Developer Server | MCP server for IDE/tool integration |

### ui-engine/ (5 files)
| File | Title | Key Content |
|------|-------|-------------|
| rule-studio-authoring.md | **Rule Studio Authoring** | **BA/QC primary** — palette, node contracts, publish, approval |
| rule-flow-designer.md | Rule Flow Designer | Visual flow graph authoring |
| decision-table-widget.md | Decision Table Widget | `mu-decision-table` web component |
| feel-autocomplete-widget.md | FEEL Autocomplete | Intelligent expression editor |
| ui-engine-architecture.md | UI Engine Architecture | Component model, manifest-driven |

---

## 04-operations/ (13 files)

| File | Title | Key Content |
|------|-------|-------------|
| dry-run.md | **Dry Run** | **QC primary** — POST dry-run, 10s timeout, full trace, no persistence |
| control-plane-operator.md | CP Operator Guide | |
| ruleset-governance-ops.md | Ruleset Governance Ops | Runtime API, merge-back loop |
| canary-shadow.md | Canary Shadow | |
| license-server-admin.md | License Server Admin | |
| license-reactivation.md | License Reactivation | |
| background-jobs-guide.md | Background Jobs | |
| observability-guide.md | Observability | IMLog, OTel, flight recorder, Red metrics |
| ci-cd-docker-k8s.md | CI/CD Docker K8s | |
| kubernetes-deployment-guide.md | K8s Deployment | |
| secret-management.md | Secret Management | |
| migration-scripts.md | Migration Scripts | |
| troubleshooting-guide.md | Troubleshooting | |

---

## 05-reference/ (7 files)

| File | Title |
|------|-------|
| package-reference.md | NuGet packages list |
| interface-guide.md | Key public interfaces |
| appsettings-guide.md | Configuration schema |
| database-structure.md | Schema design |
| decision-table-api.md | DT REST endpoints |
| rule-flow-contract-api.md | Flow input/output contracts |
| roslyn-analyzers.md | MBB001-MBB007 |

---

## 06-resources/ (10 files)

| File | Title | Key Content |
|------|-------|-------------|
| CHANGELOG.md | Version History | |
| COMMERCIAL-EDITIONS.md | Commercial Editions | Tier descriptions |
| OSS-BOUNDARY.md | OSS Boundary | Public vs gated packages |
| CONTRIBUTING.md | Contributing | |
| SECURITY.md | Security Policy | |
| feature-flags.md | Feature Flags | Optional subsystems |
| release-checklist.md | Release Checklist | |
| rule-engine-samples.md | Rule Engine Samples | Quickstart projects |
| test-matrix-guide.md | **Test Matrix** | **QA baseline** — auth, multi-tenancy, rules, rollout |
| ui-engine-registry-migration.md | UI Registry Migration | |

---

## Samples/ (11 projects)

| Project | Purpose |
|---------|---------|
| AuthAuthzBff/ | Auth + BFF pattern |
| HelloRules/ | Minimal rule example |
| ImportExportRules/ | Rule/DT import-export |
| Kafka/ | Kafka messaging |
| MemoryCache/ | In-memory caching |
| MultiLevelCache/ | Tiered caching |
| MultipleCache/ | Multiple providers |
| MultiTenant/ | Multi-tenancy |
| PaymentApproval/ | Complex approval workflow |
| RedisCache/ | Redis caching |
| RuleEngineMediator/ | Mediator + rules |

---

## BA/QC Quick Reference

| Workflow | Primary Doc | Location |
|----------|------------|----------|
| Rule authoring (visual) | Rule Studio Authoring | 03-guides/rule-studio-authoring.md |
| Rule flow design | Rule Flow Designer | 03-guides/ui-engine/rule-flow-designer.md |
| Decision table authoring | DT Widget Guide | 03-guides/ui-engine/decision-table-widget.md |
| Testing before activation | Dry Run Operations | 04-operations/dry-run.md |
| Approval workflow | Approval Workflow | 03-guides/control-plane/ruleset-approval-workflow.md |
| Rule rollout strategy | Rule Rollout Guide | 03-guides/rule-engine/rule-rollout-guide.md |
| Test coverage checklist | Test Matrix Guide | 06-resources/test-matrix-guide.md |
| Rule unit testing | Testing Guide | 03-guides/rule-engine/rule-engine-testing-guide.md |
| Governance ops | Governance Ops | 04-operations/ruleset-governance-ops.md |
