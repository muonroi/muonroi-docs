# Release Checklist

## Versioning
- Follow [SemVer](https://semver.org/) for version numbers.
- Update `CHANGELOG.md` with new release notes.

## Pre-publish Verification (Mandatory)
1. Pack OSS/commercial packages to local feed.
2. Generate template projects from:
- `mr-base-sln` (`oss`, `licensed`, `enterprise`)
- `mr-mod-sln` (`oss`, `enterprise --controlPlane`)
- `mr-micro-sln` (`oss`, `enterprise --controlPlane`)
   - Recommended automation:
     - `powershell -ExecutionPolicy Bypass -File <workspace-root>/Muonroi.BaseTemplate/scripts/verify-template-matrix.ps1`
   - The script exports matrix results to `<workspace-root>/_tmp/verify-runs/<run-id>/template-matrix-results.csv`.
3. For each generated solution:
- `dotnet restore` with local feed + NuGet.org
- `dotnet build`
- `scripts/ef.cmd init`
- Build runnable host/API project explicitly (do not rely only on `.sln` configuration)
4. Run license verification scripts:
- `scripts/flow-license-server.ps1 -NoRunServer`
- `scripts/flow-license-modes.ps1 -Modes Free,Paid,Enterprise`
5. Archive verification logs and matrix CSV under `_tmp/` before tagging.

## Troubleshooting Rule
- Do not mask startup issues by increasing timeouts.
- Capture root cause from logs/stdout first, then patch templates/workflows.

## Environment Matrix
| Environment | Registry | Notes |
|-------------|----------|-------|
| Dev         | GHCR     | Latest features |
| Staging     | ACR      | Pre-release testing |
| Prod        | ECR      | Stable release |

## Compatibility Matrix
| Component | Supported Versions |
|-----------|-------------------|
| Message Broker | RabbitMQ 3.x |
| Database | PostgreSQL 14+, SQL Server 2022 |

Ensure matrices are updated each release.
