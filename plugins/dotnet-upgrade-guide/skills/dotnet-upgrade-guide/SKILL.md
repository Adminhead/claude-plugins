---
name: dotnet-upgrade-guide
description: Upgrades .NET projects - TFM hops from .NET 8 to 11 with breaking changes by area, legacy csproj to SDK-style, packages.config to PackageReference, AOT and trim warnings, Thread.Abort removal, test framework moves. Use for "upgrade to .NET 10", SDK-style conversion, IL2026/IL3050 warnings, or moving to xUnit v3, MSTest v4 or MTP.
---

# .NET upgrades

Not for planning a whole-system modernization (`modernize`), ordinary C# refactors and nullable enablement (`csharp`), build failures unrelated to the upgrade (`msbuild`), package version work and Central Package Management (`nuget`), writing or running tests (`dotnet-testing`), or framework feature work (`aspnet-core`, `ef-core`, `blazor`).

Upgrade one hop at a time, commit at each boundary, and treat a clean build as half the job: behavioral changes compile fine and break at run time. Answer breaking-change questions from the hop references rather than the web, except to check security advisories published after them.

## 1. Assess

1. Find the entry point (`*.sln`, `*.slnx`, or the `.csproj` files) and how the repo builds and tests (scripts, CI files, `global.json`).
2. Installed SDKs: `dotnet --list-sdks`. If the target SDK is missing, stop and tell the user; don't install one silently (the `csharp` skill's SDK setup guidance covers a local, repo-scoped install).
3. Per project: `TargetFramework(s)`, the `Sdk` attribute (`Microsoft.NET.Sdk.Web` -> ASP.NET Core; `UseWPF`/`UseWindowsForms` -> desktop), whether it's SDK-style at all, `packages.config`, and the package set (`Microsoft.EntityFrameworkCore.*`, `Microsoft.Extensions.Hosting`, `Microsoft.Data.Sqlite`, `System.Linq.Async`, test frameworks). Note Dockerfiles, P/Invoke, `BinaryFormatter`, System.Text.Json polymorphism, and crypto or X.509 use: each selects a reference.
4. Use codebase-memory (`search_graph`, `search_code`) or the C# language server (csharp-ls) to find usages of affected APIs; fall back to `grep`.
5. Build clean on the current TFM (`dotnet build --no-incremental`), run the tests, and record pre-existing warnings and test counts as the baseline.

## 2. Pick the path

- Legacy (non-SDK-style) project or `packages.config`: convert first, keeping the old TFM, per [references/sdk-style.md](references/sdk-style.md). Moving off .NET Framework then also needs [references/thread-abort.md](references/thread-abort.md) wherever `Thread.Abort` or `Response.End` appear; ASP.NET (System.Web) to ASP.NET Core is a rewrite to plan with the user, not a hop.
- Modern .NET: chain the hops from the current TFM to the target, 8 -> 9 -> 10 -> 11, and work through every hop's checklist even when jumping several versions; each lists changes the others don't. From .NET 7 or earlier, apply that version's breaking changes from Microsoft Learn before starting at 8.
- .NET 11 is prerelease until its November 2026 GA. Say so, confirm the user wants it, and read the prerelease notes at the top of its overview.
- Test framework or runner moves are separate changes: do them before or after the TFM hops, never in the same commit.

## 3. Per hop

1. **Read the hop's `overview.md`** and the area files its table selects for this project.
2. **Bump the TFM** in each project or in `Directory.Build.props`; for multi-targeting add the new TFM or replace the old one. Raise `Microsoft.Extensions.*`, `Microsoft.AspNetCore.*`, `Microsoft.EntityFrameworkCore.*` and other Microsoft packages to the matching major (in `Directory.Packages.props` under Central Package Management). `dotnet restore`, then a clean build. Commit.
3. **Fix build errors and new warnings** in batches using the overview's source-incompatible checklist, rebuilding after each batch until clean. Don't silence new obsoletion warnings (`SYSLIB*`) with `NoWarn`; fix them or ask. If `BinaryFormatter` is in use, stop and ask the user how to replace it. Commit.
4. **Review behavioral changes** in the overview against the code: for each, decide whether the old behavior was relied on, then fix, opt out with the documented switch, or note it. Commit.
5. **Infrastructure**: Docker base images (`mcr.microsoft.com/dotnet/sdk:<ver>`, `aspnet:<ver>`, `runtime:<ver>`) and any distro change; `global.json` `sdk.version` (keep `rollForward`, `test` and `msbuild-sdks`); CI setup steps and images; scripts that parse CLI output. Commit.
6. **Verify**: `dotnet build --no-incremental`, the full test suite against the baseline counts, the container image if there is one, and the overview's smoke-test focus.

Report per hop: TFM change, packages raised, breaking changes hit and how each was handled, behavioral changes reviewed and the decision, infrastructure files changed, test counts before and after.

## References

| Read when | File |
|---|---|
| net8.0 -> net9.0 | [references/net8-to-net9/overview.md](references/net8-to-net9/overview.md) |
| net9.0 -> net10.0 | [references/net9-to-net10/overview.md](references/net9-to-net10/overview.md) |
| net10.0 -> net11.0 (prerelease) | [references/net10-to-net11/overview.md](references/net10-to-net11/overview.md) |
| Legacy csproj, `packages.config`, AssemblyInfo | [references/sdk-style.md](references/sdk-style.md) |
| IL2026/IL3050/IL2070 warnings, `IsAotCompatible`, `PublishAot` readiness | [references/aot-trimming.md](references/aot-trimming.md) |
| `Thread.Abort`, `ThreadAbortException`, `Response.End`, SYSLIB0006 | [references/thread-abort.md](references/thread-abort.md) |
| xUnit v2 -> xunit.v3 | [references/test-frameworks/xunit-v3.md](references/test-frameworks/xunit-v3.md) |
| MSTest v1/v2 -> v3 | [references/test-frameworks/mstest-v3.md](references/test-frameworks/mstest-v3.md) |
| MSTest v3 -> v4 | [references/test-frameworks/mstest-v4.md](references/test-frameworks/mstest-v4.md) |
| VSTest -> Microsoft.Testing.Platform | [references/test-frameworks/vstest-to-mtp.md](references/test-frameworks/vstest-to-mtp.md) |
| xUnit -> MSTest | [references/test-frameworks/xunit-to-mstest.md](references/test-frameworks/xunit-to-mstest.md) |
| NUnit -> MSTest | [references/test-frameworks/nunit-to-mstest.md](references/test-frameworks/nunit-to-mstest.md) |

Area files per hop (each overview links the same ones with its load conditions):

| Area | 8 -> 9 | 9 -> 10 | 10 -> 11 |
|---|---|---|---|
| C# compiler (always) | [csharp-compiler](references/net8-to-net9/csharp-compiler.md) | [csharp-compiler](references/net9-to-net10/csharp-compiler.md) | [csharp-compiler](references/net10-to-net11/csharp-compiler.md) |
| Core libraries (always) | [core-libraries](references/net8-to-net9/core-libraries.md) | [core-libraries](references/net9-to-net10/core-libraries.md) | [core-libraries](references/net10-to-net11/core-libraries.md) |
| SDK and MSBuild (always) | [sdk-msbuild](references/net8-to-net9/sdk-msbuild.md) | [sdk-msbuild](references/net9-to-net10/sdk-msbuild.md) | [sdk-msbuild](references/net10-to-net11/sdk-msbuild.md) |
| ASP.NET Core | [aspnet-core](references/net8-to-net9/aspnet-core.md) | [aspnet-core](references/net9-to-net10/aspnet-core.md) | [aspnet-core](references/net10-to-net11/aspnet-core.md) |
| EF Core, Sqlite | [efcore](references/net8-to-net9/efcore.md) | [efcore](references/net9-to-net10/efcore.md) | [efcore](references/net10-to-net11/efcore.md) |
| Cryptography | [cryptography](references/net8-to-net9/cryptography.md) | [cryptography](references/net9-to-net10/cryptography.md) | [cryptography](references/net10-to-net11/cryptography.md) |
| Serialization, networking | [serialization-networking](references/net8-to-net9/serialization-networking.md) | [serialization-networking](references/net9-to-net10/serialization-networking.md) | - |
| Hosting, configuration | - | [extensions-hosting](references/net9-to-net10/extensions-hosting.md) | - |
| WinForms, WPF | [winforms-wpf](references/net8-to-net9/winforms-wpf.md) | [winforms-wpf](references/net9-to-net10/winforms-wpf.md) | - |
| Containers, interop | [containers-interop](references/net8-to-net9/containers-interop.md) | [containers-interop](references/net9-to-net10/containers-interop.md) | [runtime-jit](references/net10-to-net11/runtime-jit.md) |
| Runtime, deployment | [deployment-runtime](references/net8-to-net9/deployment-runtime.md) | - | [runtime-jit](references/net10-to-net11/runtime-jit.md) |

## Gotchas

- Upgrading changes the default C# language version with the TFM. Don't add `<LangVersion>latest</LangVersion>` to unblock something; it ties the build to whichever SDK is installed.
- `global.json` with `rollForward: disable` or an exact old version makes the new SDK invisible; update it in the TFM commit.
- A package that the new shared framework now provides shows up as NU1510 on .NET 10+; remove the reference rather than suppressing the warning.
- Test frameworks have TFM floors: MSTest v4 needs .NET 8+ or .NET Framework 4.6.2+, xunit.v3 needs .NET 8+ or .NET Framework 4.7.2+. Retarget test projects before moving their framework.

Adapted from [dotnet/skills](https://github.com/dotnet/skills) (MIT, .NET Foundation and Contributors; see LICENSE and NOTICE at the plugin root).
