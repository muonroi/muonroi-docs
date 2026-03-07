# Package Reference

## .NET packages (selected)

| Package | Tier | Distribution | Notes |
| --- | --- | --- | --- |
| `Muonroi.Core` | OSS | NuGet.org | Core runtime helpers and wrappers |
| `Muonroi.Governance.Abstractions` | OSS | NuGet.org | License contracts (`LicenseState`, tiers, features) |
| `Muonroi.Governance` | OSS | NuGet.org | OSS governance implementation |
| `Muonroi.RuleEngine.Abstractions` | OSS | NuGet.org | Rule contracts (`IRule<TContext>`, `FactBag`) |
| `Muonroi.RuleEngine.Core` | OSS | NuGet.org | Rule orchestrator and DI wiring |
| `Muonroi.RuleEngine.DecisionTable` | OSS | NuGet.org | Decision table model/validation/store abstractions |
| `Muonroi.Governance.Enterprise` | Commercial | GitHub Packages | Enterprise governance, anti-tamper, policy enforcement |
| `Muonroi.RuleEngine.Runtime.Web` | Commercial | GitHub Packages | Runtime/control-plane web integration |
| `Muonroi.RuleEngine.DecisionTable.Web` | Commercial | GitHub Packages | Decision table web API integration |
| `Muonroi.Caching.Redis` | Commercial | GitHub Packages | Redis cache implementation |

See also: `OSS-BOUNDARY.md` in `muonroi-building-block`.

## npm packages

| Package | Tier | Distribution |
| --- | --- | --- |
| `@muonroi/ui-engine-core` | OSS | npmjs.org |
| `@muonroi/ui-engine-react` | OSS | npmjs.org |
| `@muonroi/ui-engine-angular` | OSS | npmjs.org |
| `@muonroi/ui-engine-primeng` | OSS | npmjs.org |
| `@muonroi/ui-engine-rule-components` | Commercial | npmjs.org |
| `@muonroi/ui-engine-rule-components-primeng` | Commercial | npmjs.org |
| `@muonroi/ui-engine-signalr` | Commercial | npmjs.org |
| `@muonroi/ui-engine-sync` | Commercial | npmjs.org |

Commercial UI packages enforce runtime activation proof checks in-browser via `MLicenseVerifier`.
