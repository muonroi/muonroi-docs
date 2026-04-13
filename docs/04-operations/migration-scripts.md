---
title: Migration Scripts
sidebar_label: Migration Scripts
sidebar_position: 8
---

# Migration Scripts

## Overview

The `tools/migration-scripts/` directory in **muonroi-building-block** contains PowerShell automation utilities for managing large-scale repository transformations. These scripts handle framework upgrades, test/sample project scaffolding, modular package migrations, and naming convention validation—avoiding repetitive manual work during ecosystem refactors.

Scripts are designed to be **idempotent** (safe to run multiple times) and **report-driven** (show exactly what changed).

## Architecture & Design

Each script follows a common pattern:

1. **Path resolution** — validate repo structure before modifications
2. **File discovery** — scan directories recursively with smart filtering (skip bin/, obj/)
3. **Content transformation** — apply replacements to code files (namespace, class names, patterns)
4. **Report generation** — print summary of actions taken

Scripts use strict mode (`Set-StrictMode -Version Latest`) and fail-fast error handling (`$ErrorActionPreference = "Stop"`).

## Scripts Reference

### 1. Downgrade Target Framework

**File:** `downgrade-to-net8.ps1`

**Purpose:** Adjust .NET target frameworks across all .csproj files during framework downgrades (e.g., .NET 9 → .NET 8).

**Invocation:**
```powershell
cd muonroi-building-block
.\tools\migration-scripts\downgrade-to-net8.ps1 -RepoRoot . [-DowngradePackageReferences]
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `RepoRoot` | string | `.` | Repository root path containing src/, tests/, tools/, Samples/ |
| `DowngradePackageReferences` | switch | — | Also downgrade Microsoft.* and test SDK package versions to compatible releases |

**What It Does:**

- Scans `src/`, `tests/`, `tools/`, `Samples/` for *.csproj files
- Replaces `<TargetFramework>net9.0</TargetFramework>` → `net8.0`
- **With `-DowngradePackageReferences`**: also downgrades:
  - `Microsoft.Extensions.*` v9.* → v8.0.*
  - `Microsoft.EntityFrameworkCore*` v9.* → v8.0.*
  - `Microsoft.AspNetCore*` v9.* → v8.0.*
  - `Microsoft.NET.Test.Sdk` v18.* → v17.11.*

**Output:**
```
Updated: D:\sources\Core\muonroi-building-block\src\Muonroi.Core\Muonroi.Core.csproj
Updated: D:\sources\Core\muonroi-building-block\tests\Muonroi.Core.Tests\Muonroi.Core.Tests.csproj

Total .csproj scanned : 42
Total .csproj updated : 5
```

**When to Use:**
- Major .NET framework upgrade → downgrade cycle
- Ensuring consistent TFM across all packages
- Dependency version alignment after framework change

---

### 2. Generate Test Projects

**File:** `generate-test-projects.ps1`

**Purpose:** Scaffold unit test project structure for each package in the ecosystem.

**Invocation:**
```powershell
cd muonroi-building-block
.\tools\migration-scripts\generate-test-projects.ps1 -RepoRoot . [-AddToSolution]
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `RepoRoot` | string | `.` | Repository root |
| `AddToSolution` | switch | — | Automatically add generated test projects to Muonroi.BuildingBlock.sln |

**What It Does:**

For each package in `src/Muonroi.*` (excluding Muonroi.BuildingBlock itself):

- Creates `tests/{PackageName}.Tests/` directory
- Generates `{PackageName}.Tests.csproj` with:
  - TargetFramework: net8.0
  - Dependencies: xunit 2.9.2, FluentAssertions 6.12.2, Microsoft.NET.Test.Sdk 17.11.*
  - ProjectReference to source package
  - `IsPackable=false` (test assembly only)
- Creates `SmokeTests.cs` with single passing test (minimal entry point)
- Optionally adds project to solution using `dotnet sln` command

**Output:**
```
Packages scanned      : 52
Test projects created : 23
Test projects existed : 29
```

**Generated .csproj Example:**
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <ImplicitUsings>enable</ImplicitUsings>
    <Nullable>enable</Nullable>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.11.*" />
    <PackageReference Include="xunit" Version="2.9.2" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.2" />
    <PackageReference Include="FluentAssertions" Version="6.12.2" />
  </ItemGroup>
  <ItemGroup>
    <ProjectReference Include="..\..\src\Muonroi.Core\Muonroi.Core.csproj" />
  </ItemGroup>
</Project>
```

**When to Use:**
- Initializing test coverage for new packages
- Ensuring consistent test project structure ecosystem-wide
- After major package reorganization

---

### 3. Generate Sample Projects

**File:** `generate-sample-projects.ps1`

**Purpose:** Create executable console sample projects demonstrating package usage.

**Invocation:**
```powershell
cd muonroi-building-block
.\tools\migration-scripts\generate-sample-projects.ps1 -RepoRoot . [-AddToSolution]
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `RepoRoot` | string | `.` | Repository root |
| `AddToSolution` | switch | — | Add generated projects to solution |

**What It Does:**

For each package in `src/Muonroi.*`:

- Creates `Samples/{PackageName}.Sample/` directory
- Generates `{PackageName}.Sample.csproj` with:
  - OutputType: Exe (console application)
  - TargetFramework: net8.0
  - ProjectReference to source package
- Creates minimal `Program.cs` that imports and displays the package name

**Generated Project Structure:**
```
Samples/Muonroi.Core.Sample/
  - Muonroi.Core.Sample.csproj
  - Program.cs
```

**Program.cs Example:**
```csharp
using Muonroi.Core;

Console.WriteLine("Muonroi.Core.Sample running...");
Console.WriteLine("Reference loaded: Muonroi.Core");
```

**Output:**
```
Packages scanned        : 52
Sample projects created: 18
Sample projects existed: 34
```

**When to Use:**
- Creating runnable examples for library documentation
- Quick verification that packages build and load correctly
- Providing starting point for integration demos

---

### 4. Generate Migration Progress Tracker

**File:** `generate-progress-tracker.ps1`

**Purpose:** Create a CSV tracking file for modular migration status across all packages.

**Invocation:**
```powershell
cd muonroi-building-block
.\tools\migration-scripts\generate-progress-tracker.ps1 -RepoRoot . [-OutputPath <path>]
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `RepoRoot` | string | `.` | Repository root |
| `OutputPath` | string | `tools/migration-scripts/migration-progress-tracker.csv` | Output CSV path relative to RepoRoot |

**What It Does:**

- Discovers all packages in `src/Muonroi.*`
- Creates CSV file with columns:
  - **Package** — package name
  - **Phase** — migration phase/grouping (you fill this in)
  - **ProjectSetup** — Pending/In Progress/Done
  - **ContentMigration** — status of file/code migration
  - **NamingCleanup** — M* prefix validation status
  - **Tests** — test project completion
  - **Sample** — sample project completion
  - **Build** — final build verification status
  - **Notes** — free-text tracking notes

**Output File (tools/migration-scripts/migration-progress-tracker.csv):**
```csv
Package,Phase,ProjectSetup,ContentMigration,NamingCleanup,Tests,Sample,Build,Notes
Muonroi.Core,,Pending,Pending,Pending,Pending,Pending,Pending,
Muonroi.Core.Abstractions,,Pending,Pending,Pending,Pending,Pending,Pending,
Muonroi.Data.Abstractions,,Pending,Pending,Pending,Pending,Pending,Pending,
...
```

**When to Use:**
- Tracking multi-phase modular migration (extracting monolith into packages)
- Team coordination across package refactoring
- Progress reporting to stakeholders

---

### 5. Migrate Content from BuildingBlock

**File:** `migrate-content-from-buildingblock.ps1`

**Purpose:** Move content from the monolithic `Muonroi.BuildingBlock` package into individual ecosystem packages during modular migration. This is the heaviest script, handling 100+ file/folder mappings with namespace and branding cleanup.

**Invocation:**
```powershell
cd muonroi-building-block
.\tools\migration-scripts\migrate-content-from-buildingblock.ps1 -RepoRoot . [-ApplyBrandingCleanup]
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `RepoRoot` | string | `.` | Repository root |
| `ApplyBrandingCleanup` | switch | — | Rename type aliases to standardized domain-prefixed names (e.g., MAuthInfoContext → MAuthContext) |

**Mapping Strategy:**

The script contains a hardcoded mapping array defining source → target transformations:

```powershell
@{ Package = "Muonroi.Core"
   Source = "External/Common/Constants"
   Target = "Constants"
   NamespaceBase = "Muonroi.Core.Constants" }
```

**Supported Entry Types:**

- **Directory** (Kind = "Dir", default): Copy entire folder tree, transform namespaces recursively
- **File** (Kind = "File"): Copy single file with namespace transformation

**Content Transformations Applied:**

For every .cs file copied:

1. **Namespace rewrite** — update `namespace X;` to target namespace
2. **Root namespace migration** — e.g., `Muonroi.BuildingBlock.External.Common` → `Muonroi.Core.Common`
3. **Global namespace replacements** — table of 50+ old→new namespace mappings
4. **Branding cleanup** (optional, `-ApplyBrandingCleanup`):
   - `MAuthInfoContext` → `MAuthContext`
   - `MGenericController` → `MWebGenericController`
   - `MEFRepository` → `MDataEfRepository`
   - etc. (standardizing domain prefixes per ecosystem coding rules)

**Example Transformation:**

**Before (Muonroi.BuildingBlock):**
```csharp
namespace Muonroi.BuildingBlock.External.Common.Enums;

public enum Status
{
    Active,
    Inactive
}
```

**After (Muonroi.Core):**
```csharp
namespace Muonroi.Core.Enums;

public enum Status
{
    Active,
    Inactive
}
```

**Output Report:**
```
Muonroi.Core              | External/Common/Constants   -> Constants                    | +8
Muonroi.Core              | External/Common/Enums      -> Enums                        | +5
Muonroi.Data.Abstractions | External/Interfaces        -> Interfaces                  | +12
...
Total files copied/transformed: 342
```

**When to Use:**
- Splitting monolithic package into ecosystem micropackages
- Organizing code by domain (Core, Data, Auth, Tenancy, RuleEngine, etc.)
- Applying naming convention cleanup during extraction

**Advanced: Namespace Mapping Table**

The script includes a 50+ entry namespace translation table for handling legacy imports. Example:

```powershell
"Muonroi.BuildingBlock.External.BearerToken" = "Muonroi.Auth.BearerToken"
"Muonroi.BuildingBlock.External.UnitOfWork" = "Muonroi.Data.Abstractions.UnitOfWork"
"Muonroi.BuildingBlock.Shared.License" = "Muonroi.Governance.License"
```

All references in migrated files are updated automatically.

---

### 6. Validate M* Naming Convention

**File:** `validate-m-prefix-standard.ps1`

**Purpose:** Audit all public/internal types in the codebase to ensure they follow the M-prefix + domain pattern.

**Invocation:**
```powershell
cd muonroi-building-block
.\tools\migration-scripts\validate-m-prefix-standard.ps1 -RepoRoot . [-FailOnViolation]
```

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `RepoRoot` | string | `.` | Repository root |
| `FailOnViolation` | switch | — | Exit with error code if violations found (for CI/CD) |

**Naming Rule:**

All public/internal types **with M prefix** must match:

```regex
^M(Core|Auth|AuthZ|Data|Cache|Msg|Web|Infra|Tenant|Rule)[A-Z]\w*$
```

**Valid Examples:**
- `MCoreConfig` — ✓ (MCoreXxx)
- `MAuthContext` — ✓ (MAuthXxx)
- `MWebController` — ✓ (MWebXxx)
- `MDataRepository` — ✓ (MDataXxx)
- `MRuleEngine` — ✓ (MRuleXxx)

**Invalid Examples:**
- `MHelpers` — ✗ (domain "Helpers" not in allowed list)
- `MAuthInfo` — ✗ (domain "AuthInfo" not recognized)
- `MUtility` — ✗ (domain "Utility" not in allowed list)

**Allowed Domains:**
`Core`, `Auth`, `AuthZ`, `Data`, `Cache`, `Msg`, `Web`, `Infra`, `Tenant`, `Rule`

**What It Does:**

- Scans all .cs files in `src/` (excluding bin/, obj/, Muonroi.BuildingBlock)
- Parses class/record/struct/enum declarations using regex
- Checks M-prefixed types against domain pattern
- Reports violations with file path, line number, type name, and rule

**Output (No Violations):**
```
No M-prefix naming violations found.
```

**Output (With Violations):**
```
M-prefix naming violations: 3

File                                          Line Type            Rule
----                                          ---- ----            ----
D:\...\Muonroi.Core\Helpers\DateHelper.cs    42   MDateHelper     M-prefixed type must use domain-qualified pattern...
D:\...\Muonroi.Auth\Utils\TokenUtils.cs      18   MTokenUtils     M-prefixed type must use domain-qualified pattern...
...
```

**Exit Codes:**

- **0** — All types valid or no M-prefix types found
- **Non-zero** — Violations found and `-FailOnViolation` specified

**When to Use:**
- Pre-commit or PR validation hook
- Enforcing ecosystem naming conventions
- Audit during major package reorganization
- CI/CD quality gates

---

## Common Workflows

### Complete Modular Migration (Monolith → Packages)

```powershell
cd muonroi-building-block

# Phase 1: Setup
.\tools\migration-scripts\generate-test-projects.ps1 -RepoRoot . -AddToSolution
.\tools\migration-scripts\generate-sample-projects.ps1 -RepoRoot . -AddToSolution

# Phase 2: Migration tracking
.\tools\migration-scripts\generate-progress-tracker.ps1 -RepoRoot .
# → Edit migration-progress-tracker.csv manually, mark phases

# Phase 3: Content migration
.\tools\migration-scripts\migrate-content-from-buildingblock.ps1 -RepoRoot . -ApplyBrandingCleanup

# Phase 4: Validation
.\tools\migration-scripts\validate-m-prefix-standard.ps1 -RepoRoot . -FailOnViolation
.\tools\migration-scripts\downgrade-to-net8.ps1 -RepoRoot . -DowngradePackageReferences

# Phase 5: Build verification
dotnet build Muonroi.BuildingBlock.sln
```

### Framework Upgrade Rollback

```powershell
cd muonroi-building-block

# Downgrade from .NET 9 to .NET 8
.\tools\migration-scripts\downgrade-to-net8.ps1 -RepoRoot . -DowngradePackageReferences

# Validate naming conventions
.\tools\migration-scripts\validate-m-prefix-standard.ps1 -RepoRoot .

# Build and test
dotnet build
dotnet test
```

### Adding New Ecosystem Package (Scaffold-Only)

```powershell
cd muonroi-building-block

# Create tests and samples
.\tools\migration-scripts\generate-test-projects.ps1 -RepoRoot . -AddToSolution
.\tools\migration-scripts\generate-sample-projects.ps1 -RepoRoot . -AddToSolution

# Verify naming
.\tools\migration-scripts\validate-m-prefix-standard.ps1 -RepoRoot . -FailOnViolation
```

---

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Validation

on: [pull_request]

jobs:
  validate-migration:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - name: Validate Naming Conventions
        run: |
          cd muonroi-building-block
          .\tools\migration-scripts\validate-m-prefix-standard.ps1 -RepoRoot . -FailOnViolation
      - name: Build
        run: |
          cd muonroi-building-block
          dotnet build
```

---

## Related Documentation

- **[Ecosystem Coding Rules](../03-design/ecosystem-coding-rules.md)** — M-prefix naming standard and domain taxonomy
- **[Package Reference](../02-reference/package-reference.md)** — Complete list of 54 NuGet packages
- **[Repository Structure](../01-guides/repository-structure.md)** — src/, tests/, Samples/ layout

---

## Troubleshooting

**Q: Script fails with "source not found"**
- Verify source paths exist (e.g., `src/Muonroi.BuildingBlock/External/Common/Constants`)
- Check RepoRoot parameter points to repository root

**Q: Namespace transformations incomplete**
- Ensure `.cs` files have explicit `namespace X;` declarations
- Some auto-generated code may need manual adjustment after transformation

**Q: `-FailOnViolation` exit code not captured in CI**
- Verify shell is PowerShell 5.0+ (not cmd.exe)
- Use `-ErrorAction Stop` in pipeline to propagate exit codes

**Q: Projects not added to solution**
- Use `-AddToSolution` flag
- Verify `Muonroi.BuildingBlock.sln` exists and is readable
