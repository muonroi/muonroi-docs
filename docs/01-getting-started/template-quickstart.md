# Template Quickstart

Use local templates and local package feeds when verifying Muonroi changes.

## 1. Detect workspace root

```powershell
$workspace = Split-Path (git rev-parse --show-toplevel) -Parent
```

## 2. Pack templates to local feed

```powershell
dotnet pack "$workspace\Muonroi.BaseTemplate\Muonroi.BaseTemplate.csproj" -c Release -o "$workspace\LocalNuget"
dotnet pack "$workspace\Muonroi.Modular.Template\Muonroi.Modular.csproj" -c Release -o "$workspace\LocalNuget"
dotnet pack "$workspace\Muonroi.Microservices.Template\Muonroi.Microservices.csproj" -c Release -o "$workspace\LocalNuget"
```

## 3. Install local template package

```powershell
dotnet new install "$workspace\LocalNuget\Muonroi.BaseTemplate.<version>.nupkg" --force
```

## 4. Generate a solution by tier

```powershell
# OSS
dotnet new mr-base-sln -n DemoOss --tier oss

# Licensed (generates NuGet.config with commercial feed template)
dotnet new mr-base-sln -n DemoLicensed --tier licensed

# Enterprise + control plane URL override
dotnet new mr-base-sln -n DemoEnterprise --tier enterprise --cpu https://cp.myorg.com
```

## 5. Verify generated output

```powershell
cd .\DemoEnterprise
dotnet restore
dotnet run
```

## 6. Validation expectation

- `--tier oss` output has no generated `NuGet.config`.
- `--tier licensed` output includes `Muonroi.Governance.Enterprise` and `Muonroi.Caching.Redis`.
- `--tier enterprise --cpu <url>` outputs `ControlPlane.Url = <url>` in appsettings.
