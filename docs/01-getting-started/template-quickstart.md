# Template Quickstart

Use local templates and local package feeds when verifying Muonroi changes.

## 1. Pack to the local feed

```powershell
cd D:\sources\Core\Muonroi.BaseTemplate
dotnet pack .\Muonroi.BaseTemplate.csproj -c Release -o D:\sources\Core\LocalNuget
```

Repeat for:

- `Muonroi.Modular.Template`
- `Muonroi.Microservices.Template`

## 2. Install the local packages

```powershell
dotnet new install D:\sources\Core\LocalNuget\Muonroi.BaseTemplate.<version>.nupkg --force
```

## 3. Generate a solution

```powershell
dotnet new muonroibase -n DemoService
```

## 4. Verify the generated project

```powershell
cd .\DemoService
.\scripts\ef.cmd init
.\scripts\ef.cmd update
dotnet restore
dotnet run
```

## 5. Validation expectation

- `dotnet test` stays green.
- Generated app can run EF setup scripts.
- Authentication flow returns `result.accessToken`.
- If license mode is enabled, logs contain `[License] Verified tier: ...`.
