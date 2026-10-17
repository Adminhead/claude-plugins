# Sources, source mapping, audit and lock files

Written from the NuGet documentation on Microsoft Learn (package source mapping, auditing packages, NU1901-NU1904, lock files), checked through Context7 against `NuGet/docs.microsoft.com-nuget`.

Read this for `nuget.config` changes, NU1507, dependency-confusion hardening, NU1900-NU1904 vulnerability warnings, `dotnet list package --vulnerable`, or reproducible restores with `packages.lock.json`.

## nuget.config and sources

- NuGet merges every `nuget.config` from the solution folder up to the drive root, then the user-level file. Start the repo file with `<clear />` under `<packageSources>` so machine-level feeds don't leak into restores.
- Never commit feed credentials. Put them in the user-level config (`dotnet nuget update source <name> --username ... --password ... --store-password-in-clear-text` only where no credential provider exists), environment-variable references (`%FEED_PAT%` in `packageSourceCredentials`), or a credential provider such as the Azure Artifacts one.
- Inspect what is in effect: `dotnet nuget list source`, and, on SDKs that have it, `dotnet nuget config paths` for the config files that apply.

## Package source mapping

With more than one source, map every package to the sources allowed to serve it. Without mapping, restore takes whichever source answers, which is how dependency confusion works (an attacker publishes your internal package name on nuget.org with a higher version). Restore warns NU1507 when several sources exist without mapping.

```xml
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
    <add key="contoso" value="https://pkgs.contoso.com/nuget/v3/index.json" />
  </packageSources>
  <packageSourceMapping>
    <packageSource key="nuget.org">
      <package pattern="*" />
    </packageSource>
    <packageSource key="contoso">
      <package pattern="Contoso.*" />
    </packageSource>
  </packageSourceMapping>
</configuration>
```

- The most specific pattern wins: `Contoso.*` beats `*`, and an exact ID beats a prefix. A package that matches no pattern fails to restore.
- `key` values must match `packageSources` keys exactly.
- Reserve your prefix on nuget.org (ID prefix reservation) as well, so nobody else can publish `Contoso.*` there.
- Rolling out: restore once, list the resolved IDs (`dotnet package list --include-transitive` or `dotnet list package --include-transitive`), and map every one, transitive packages included. Then prove the mapping is complete with one restore against an empty package folder: `NUGET_PACKAGES=$(mktemp -d) dotnet restore --force`.

## Auditing for vulnerabilities

Restore checks packages against vulnerability data from the audit sources (`<auditSources>` in `nuget.config`, falling back to `packageSources`; nuget.org's data comes from the GitHub Advisory Database). It reports NU1901 (low), NU1902 (moderate), NU1903 (high), NU1904 (critical); NU1900 means the audit data could not be fetched.

| MSBuild property | Values | Notes |
| --- | --- | --- |
| `NuGetAudit` | `true` / `false` | On by default; keep it on |
| `NuGetAuditMode` | `direct` / `all` | `all` includes transitive packages. Default is `all` for projects targeting .NET 10, `direct` before |
| `NuGetAuditLevel` | `low` / `moderate` / `high` / `critical` | Minimum severity reported |

```xml
<PropertyGroup>
  <NuGetAuditMode>all</NuGetAuditMode>
  <NuGetAuditLevel>moderate</NuGetAuditLevel>
  <!-- With TreatWarningsAsErrors, fail only on high and critical: -->
  <WarningsNotAsErrors>$(WarningsNotAsErrors);NU1901;NU1902</WarningsNotAsErrors>
</PropertyGroup>
<ItemGroup>
  <!-- Accepted risk; record why next to it -->
  <NuGetAuditSuppress Include="https://github.com/advisories/GHSA-xxxx-xxxx-xxxx" />
</ItemGroup>
```

On-demand report: `dotnet package list --vulnerable --include-transitive` (SDK 10+) or `dotnet list package --vulnerable --include-transitive`. A private feed that lacks vulnerability data needs nuget.org (or `https://data.nuget.org/v3/index.json`, vulnerability data only) in `<auditSources>`.

Fixing a transitive vulnerability: upgrade the direct package that brings it in, if a fixed release exists. Otherwise reference the patched transitive package directly (or, under CPM, add a `PackageVersion` with `CentralPackageTransitivePinningEnabled=true`) and leave a comment saying which advisory it pins for, so it can be removed later.

## Lock files

`packages.lock.json` records the full resolved graph so CI restores exactly what was tested.

```xml
<PropertyGroup>
  <RestorePackagesWithLockFile>true</RestorePackagesWithLockFile>
  <!-- In CI only: fail if the lock file is out of date -->
  <RestoreLockedMode Condition="'$(CI)' == 'true'">true</RestoreLockedMode>
</PropertyGroup>
```

- Commit every project's lock file. In CI, `dotnet restore --locked-mode` fails instead of silently re-resolving.
- After changing a version, restore locally to rewrite the lock file and commit both together. Floating versions only move with `--force-evaluate`.
- Several projects in one folder get `packages.<project>.lock.json`; `NuGetLockFilePath` sets a custom path.
