# Site Assembly Isolation

## Overview

By default, all ISiteProfile implementations live in the same project as the host application.
As the number of sites grows, you may want to split site implementations into separate assemblies
for compile-time isolation, independent versioning, or team ownership boundaries.

This guide explains when and how to use separate assemblies for site profiles, how to configure
SiteAssemblies, and what compile-time and startup safety mechanisms are available.

---

## When to Split a Site into a Separate Assembly

Consider splitting when:

- The site has unique domain models not shared with other sites
- The site requires its own NuGet package dependencies
- You want compile-time isolation between site implementations (changes in Site A cannot break Site B at build time)
- Team members work on different sites independently and want clear ownership boundaries
- The site is maintained as a versioned library (e.g., a shared site framework used by multiple hosts)

Staying in one assembly is fine when:

- The number of sites is small (2–5)
- Sites share most of their infrastructure code
- You prefer a simpler deploy model (single DLL)

---

## How to Configure SiteAssemblies

### Step 1: Create a Separate Project for the Site

```
MySolution/
├── MyApp.Sites.Default/     ← default site (in host project)
├── MyApp.Sites.Alpha/       ← alpha site (separate assembly)
└── MyApp/                   ← host application
```

### Step 2: Reference the Site Assembly from the Host

In `MyApp.csproj`:

```xml
<ProjectReference Include="../MyApp.Sites.Alpha/MyApp.Sites.Alpha.csproj" />
```

### Step 3: Implement ISiteProfile in the Separate Assembly

```csharp
// MyApp.Sites.Alpha/AlphaProfile.cs
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Muonroi.Tenancy.SiteProfile;

namespace MyApp.Sites.Alpha;

[GenerateSiteProfile]
public class AlphaProfile : ISiteProfile
{
    public string SiteId => "alpha";

    public void RegisterServices(IServiceCollection services, IConfiguration configuration)
    {
        services.AddKeyedScoped<IAlphaService, AlphaServiceImpl>("alpha");
    }
}
```

### Step 4: Register with SiteAssemblies

Pass the assemblies containing the external ISiteProfile implementations to `AddMultiSiteProfiles`:

```csharp
// Program.cs
services.AddMultiSiteProfiles(
    configuration,
    sp => sp.GetRequiredService<IHttpContextAccessor>().HttpContext?.Request.Headers["x-site-code"],
    assemblies: [
        typeof(DefaultProfile).Assembly,
        typeof(AlphaProfile).Assembly   // external assembly — required for discovery
    ]);
```

Or configure via `SiteProfileOptions`:

```csharp
services.ConfigureSiteProfile(options =>
{
    options.SiteAssemblies = [
        typeof(DefaultProfile).Assembly,
        typeof(AlphaProfile).Assembly
    ];
});
```

---

## Compile-Time Safety: MSP041

The **MSP041 analyzer** (Info severity) fires when a concrete `ISiteProfile` implementation is
detected in a referenced assembly that is not the current compilation's own assembly.

This is a reminder hint — not an error or warning — that you should verify the assembly is
listed in `SiteAssemblies`. It fires during IDE analysis and CI builds.

```
[MSP041] ISiteProfile 'AlphaProfile' is in referenced assembly 'MyApp.Sites.Alpha'
         but may not be included in SiteAssemblies. Add the assembly to
         AddSiteInfrastructure(options => options.SiteAssemblies = [...]) to ensure discovery.
```

To suppress the hint if intentional:

```csharp
#pragma warning disable MSP041
// ... code
#pragma warning restore MSP041
```

---

## Startup Validation

At startup, `SiteProfileStartupValidator` calls `ValidateSiteAssemblyDiscovery()` which:

1. Reads `SiteProfileOptions.SiteAssemblies`
2. Scans each assembly for non-abstract `ISiteProfile` implementations
3. Instantiates each to read its `SiteId`
4. Checks whether the `SiteId` was registered in the tracker (i.e., `AddMultiSiteProfiles` found it)
5. Logs a `[SITE-ASSEMBLY]` warning for any profile that was NOT discovered

Example warning:

```
[SITE-ASSEMBLY] ISiteProfile 'AlphaProfile' in assembly 'MyApp.Sites.Alpha'
                with SiteId 'alpha' was not discovered during registration.
                Ensure AddMultiSiteProfiles includes this assembly.
```

This is non-blocking — startup continues. Operators see the warning in application logs and
can fix the configuration without a hard failure.

---

## Trade-offs

| Aspect             | Same Assembly                    | Separate Assembly                        |
|--------------------|----------------------------------|------------------------------------------|
| Compile time       | Single compilation unit          | Parallel compilation possible            |
| Isolation          | Shared types visible             | Clean boundaries between sites           |
| Deploy complexity  | Single DLL to deploy             | Multiple DLLs must be deployed together  |
| Refactoring        | Easy cross-site refactoring      | Must update interfaces explicitly        |
| Testing            | Shared test infrastructure       | Independent test projects per site       |
| MSP041 hint        | Not triggered                    | Triggered (reminder to check SiteAssemblies) |
| Startup validation | N/A                              | Warns if assembly not in SiteAssemblies  |

---

## Limitations

- **No dynamic plugin loading** — all site assemblies must be referenced at compile time.
  The `SiteAssemblies` configuration is an explicit allowlist, not a directory scanner.
  This is by design — explicit is safer than dynamic discovery (per D-18).

- **ISiteProfile implementations must have parameterless constructors** — startup validation
  instantiates each profile to read its `SiteId`. If a constructor requires arguments,
  the validation step skips that profile (no warning, no error — just silently skipped).

- **All site assemblies must be referenced as `<ProjectReference>` or assembly references** —
  assemblies not on the load path cannot be scanned by `SiteProfileOptions.SiteAssemblies`.

---

## Related

- [Adding a New Site](./adding-a-new-site.md)
- [Site Profile Overview](./site-profile-overview.md)
- [MSP040: ISiteColumnMap drift detection](./site-column-map-guide.md)
