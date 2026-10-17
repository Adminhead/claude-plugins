---
name: nuget
description: Manages NuGet dependencies and packages in .NET repos. Use for Directory.Packages.props and Central Package Management, bumping or aligning package versions, NU1xxx restore warnings, nuget.config sources and source mapping, vulnerable-package audits, lock files, dotnet pack metadata, or publishing to nuget.org with trusted publishing.
license: MIT
---

# NuGet

Change package versions and package configuration without changing anything else about the build, and prove it with a before/after restore.

Not for: MSBuild failures that aren't about packages (`msbuild`), C# code changes after an API break (`csharp`), vetting whether a new third-party package is trustworthy (`dependency-vetting`), CI workflow hardening beyond the publish job (`gh-actions`), `packages.config` to `PackageReference` migration (`dotnet-upgrade-guide`).

## Pick the mode first

Decide before running builds or editing files.

1. **Guard.** Any in-scope project uses `packages.config`: stop. CPM, source mapping per `PackageReference`, lock files and `NuGetAudit` warnings all need `PackageReference`; recommend migrating first and change nothing.
2. **Package maintenance.** "Update", "bump", "align", "sync", "fix NU1605": edit the versions where they already live (project file, `Directory.Build.props` property, or `Directory.Packages.props` if CPM is on), then restore and build every affected target. Don't introduce CPM as a side effect; recommend it afterwards if versions drift across projects.
3. **CPM conversion.** Only when the user asks to adopt, enable or convert to Central Package Management. Follow [references/cpm.md](references/cpm.md).
4. **Sources, audit and lock files.** `nuget.config`, `packageSourceMapping`, `NuGetAudit*`, NU1900-NU1904, `packages.lock.json`: [references/sources-and-audit.md](references/sources-and-audit.md).
5. **Packing and publishing.** `dotnet pack` metadata, tool/template/MCP-server packages, pushing to nuget.org from GitHub Actions: [references/trusted-publishing.md](references/trusted-publishing.md).

Ask once if the scope (which projects or solution) is unclear. If the user gave a conflict strategy ("use the highest version"), apply it without asking again.

## Orient

- Find where each version is declared: `grep -rn --include='*.csproj' --include='*.props' --include='*.targets' -E 'PackageReference|PackageVersion|GlobalPackageReference|VersionOverride' .` and any `$(XxxVersion)` properties those reference. Check ancestors for `Directory.Packages.props` (only the nearest one applies to a project).
- Read `nuget.config` files from the repo root upward, and `global.json`. Run every `dotnet` command from the directory whose `global.json` applies to that solution.
- See what actually resolved, not just what is declared. SDK 10 and later: `dotnet package list --project <sln|proj> --include-transitive --format json`. SDK 7.0.200 to 9.x: `dotnet list <sln|proj> package --include-transitive --format json`. Add `--outdated`, `--vulnerable` or `--deprecated` only when that question is asked.
- For a package's API change between versions, read its release notes, or query Context7 (`resolve-library-id`, then `query-docs`) for the target version.

## Version rules

- Change only the packages requested. Don't upgrade past the highest version already used in scope during an alignment or conversion; list newer versions and advisories as follow-ups.
- Treat a major-version change as high risk (API breaks): build every consumer and run its tests. Minor and patch changes are moderate; build all consumers.
- Keep every non-version attribute and condition on a `PackageReference` (`PrivateAssets`, `IncludeAssets`, `ExcludeAssets`, `GeneratePathProperty`, `Aliases`, TFM conditions).
- Packages that ship together move together: `Microsoft.Extensions.*`, `Microsoft.AspNetCore.*`, `Microsoft.EntityFrameworkCore.*` of one release train, `xunit.*`, `OpenTelemetry.*`. A mismatch shows up as NU1605 (downgrade) or NU1608 (outside a dependency's range).
- NU1605 means a direct reference pins a lower version than a transitive dependency needs: raise the direct reference; don't suppress the warning.
- Analyzer and build-only packages get `PrivateAssets="all"` so they don't flow to consumers.

## Validate

1. Capture resolved packages before the change (the list command above, redirected to a file).
2. Make the edit.
3. `dotnet restore <target>` then `dotnet build <target> --no-restore` for every affected solution or project. New NU1xxx warnings count as failures to explain.
4. Capture the resolved list again and compare per project: version changes, packages added or removed. Every difference must be one you intended.
5. If resolved versions changed, run the affected projects' tests (`dotnet test <proj> --no-build`), or give the exact command if they need infrastructure.

Don't install or switch SDKs, edit `global.json` roll-forward, clear the global packages folder (`dotnet nuget locals all --clear`) or change machine-level NuGet config as a fix; report the blocker instead.

## Gotchas

| Code | Meaning | Fix |
| --- | --- | --- |
| NU1008 | CPM on, but a `PackageReference` still has `Version` | Remove it, or use `VersionOverride` deliberately |
| NU1010 | CPM on, `PackageReference` has no `PackageVersion` | Add the `PackageVersion` |
| NU1101 / NU1102 | Package or version not found on any source | Check source mapping and feed auth before the ID |
| NU1507 | Several sources, no `packageSourceMapping` | Add mapping ([sources-and-audit](references/sources-and-audit.md)) |
| NU1603 | Requested version absent, a higher one resolved | Pin an existing version |
| NU1901-NU1904 | Known vulnerability (low to critical) | Upgrade the package or the transitive one; suppress only with a recorded reason |

- After `dotnet add package` (or `dotnet package add`) in a CPM repo, check the diff: the `PackageVersion` belongs in `Directory.Packages.props`, not a `Version` on the reference.
- A `Directory.Packages.props` in a subfolder replaces the parent one for projects under it; it does not merge unless it imports the parent.
- Floating versions (`1.*`) make restores non-reproducible; with a lock file they need `--force-evaluate` to move.

Adapted from [dotnet/skills](https://github.com/dotnet/skills) (`convert-to-cpm`, `nuget-trusted-publishing`), MIT, .NET Foundation and Contributors; see LICENSE and NOTICE at the plugin root.
