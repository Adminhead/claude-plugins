# Running and filtering .NET tests

Contents: platform precedence, classic projects, command examples, filter grammar (VSTest, MSTest/NUnit on MTP, xUnit v3, TUnit), VSTest-to-xUnit v3 filter translation, hot reload.

## Platform precedence

Resolve properties in MSBuild import order, per target framework. `Directory.Build.props` is imported before the project body, so an unconditional project assignment normally wins over it; a later `Directory.Build.targets` can override the project again. Record the final value and its source for `UseVSTest`, the runner property, `TestingPlatformDotnetTestSupport` and `OutputType`.

Classify in this order:

1. Final `UseVSTest=true` selects VSTest. If `global.json` also selects native MTP mode, the two conflict: report it and offer one alignment (remove the opt-out, or drop the runner setting). Don't edit files unasked.
2. Native MTP mode (SDK 10+ `global.json` `test.runner`) runs a compatible MTP app. A VSTest-only project errors in this mode.
3. VSTest mode: runner selected + `TestingPlatformDotnetTestSupport=true` + executable output = bridge to MTP.
4. Runner selected without the bridge property: MSTest, NUnit and xUnit projects that keep their VSTest adapter run on VSTest. The bridge property without a runner also stays on VSTest.
5. Runner and bridge with library output, or TUnit with no path to MTP, is unusable: report it rather than inventing a platform.

Notes:

- `MSTest.Sdk` selects MTP by default; `<UseVSTest>true</UseVSTest>` opts back into VSTest. MSTest 4's SDK no longer adds `Microsoft.NET.Test.Sdk` under MTP; add it explicitly if `vstest.console` must still work.
- The `MSTest` metapackage plus `EnableMSTestRunner=true` selects the MSTest MTP runner but does not set the bridge property.
- MSTest and NUnit MTP runners use `Microsoft.Testing.Extensions.VSTestBridge`, so the same project can run on either platform depending on the command mode and bridge.
- Starting with .NET 11 Preview 6, `DOTNET_TEST_RUNNER=Microsoft.Testing.Platform` overrides `global.json` for the current process.
- Native MTP mode requires Microsoft.Testing.Platform 1.7 or later.

## Classic (non-SDK) projects

Signals: `ToolsVersion`, imports of `Microsoft.Common.props` / `Microsoft.CSharp.targets`, explicit `<Reference>` with `HintPath`, explicit `<Compile Include>`, `packages.config`. Use the repo's script or CI command. The usual fallback needs a Windows developer prompt:

```powershell
nuget restore MySolution.sln
MSBuild.exe MySolution.sln /t:Build /p:Configuration=Debug
vstest.console.exe path\to\MyTests.dll /TestCaseFilter:"TestCategory=Integration" /Logger:trx
```

Derive `/TestAdapterPath` from the restored adapter package, not a guess. If the toolchain is missing, say so and stop; never claim tests ran, and never migrate the project implicitly.

## Command examples

```bash
# VSTest mode
dotnet test tests/Orders.Tests/Orders.Tests.csproj --filter "FullyQualifiedName~OrderServiceTests"

# VSTest mode bridging to MTP (SDK 8/9, or SDK 10 without the global.json runner)
dotnet test tests/Orders.Tests/Orders.Tests.csproj --framework net9.0 -- --report-trx

# Native MTP mode, SDK 10+
dotnet test --project tests/Orders.Tests/Orders.Tests.csproj --report-trx --hangdump --hangdump-timeout 5min
dotnet test --solution Orders.slnx --no-build
dotnet test --test-modules "artifacts/bin/**/*.Tests.dll"

# TUnit with no bridge configured: run the test app directly
dotnet run --project tests/Orders.Tests -- --treenode-filter "/*/*/SmsNotificationTests/*"
```

In native MTP mode the `--` separator is optional but still allowed; keeping it before test-app arguments avoids a parser quirk when unknown tokens are interleaved with `dotnet test` options.

Show per-test failures in bridge mode with `-p:TestingPlatformShowTestsFailure=true`; show the test app's full console output with `-p:TestingPlatformCaptureOutput=false`. Native MTP mode ignores both properties.

## VSTest filter grammar (MSTest, NUnit, xUnit v2)

`<Property><Operator><Value>` joined with `|` (or) and `&` (and), grouped with parentheses.

| Operator | Meaning |
|---|---|
| `=` / `!=` | Exact match / not |
| `~` / `!~` | Contains / does not contain |

| Framework | Properties |
|---|---|
| MSTest | `FullyQualifiedName`, `Name`, `ClassName`, `Priority`, `TestCategory` |
| NUnit | `FullyQualifiedName`, `Name`, `Priority`, `TestCategory` |
| xUnit v2 | `FullyQualifiedName`, `DisplayName`, trait names (for example `Category`) |

A bare value means `FullyQualifiedName~<value>`. When two classes share a substring (`OrderTests`, `OrderTestsLegacy`), add an explicit negative term rather than relying on the substring: `"FullyQualifiedName~OrderTests&FullyQualifiedName!~OrderTestsLegacy"`.

```bash
dotnet test --filter "ClassName=MyApp.Tests.LoginTests"
dotnet test --filter "TestCategory!=Slow"
dotnet test --filter "(ClassName=MyApp.Tests.A|ClassName=MyApp.Tests.B)&TestCategory=Unit"
```

## MSTest and NUnit on MTP

The same expression grammar, passed as `--filter`: after `--` on the bridge, direct in native MTP mode.

```bash
dotnet test -- --filter "Name~LoginTest"              # bridge
dotnet test --project T.csproj --filter "Name~LoginTest"   # native MTP
```

## xUnit v3 on MTP

xUnit v3 does not accept the VSTest `--filter` expression on MTP.

| Flag | Effect |
|---|---|
| `--filter-class` / `--filter-not-class` | Include / exclude classes (wildcards allowed) |
| `--filter-method` / `--filter-not-method` | Include / exclude methods |
| `--filter-namespace` / `--filter-not-namespace` | Include / exclude namespaces |
| `--filter-trait` / `--filter-not-trait` | `"name=value"` |
| `--filter-query` | One query-language expression: `/<assembly>/<namespace>/<class>/<method>[trait=value]` |

One flag can take several values (`--filter-class Foo Bar`). When the user asks for one combined expression, give one `--filter-query`, not separate flags. Query grammar: https://xunit.net/docs/query-filter-language

| VSTest `--filter` | xUnit v3 MTP |
|---|---|
| `FullyQualifiedName~OrderTests` | `--filter-class "*OrderTests*"` |
| `FullyQualifiedName=Ns.Class.Method` | `--filter-method "Ns.Class.Method"` |
| `Name=Method` | `--filter-method "*Method"` |
| `Category=Smoke` (trait) | `--filter-trait "Category=Smoke"` |

xUnit v2 projects moved to MTP through `YTest.MTP.XUnit2` keep the VSTest grammar.

## TUnit

`--treenode-filter "/<Assembly>/<Namespace>/<Class>/<Test>"` with `*` wildcards in any segment and property conditions in brackets.

```bash
--treenode-filter "/*/*/LoginTests/*"                      # one class
--treenode-filter "/*/*/*/AcceptCookiesTest"               # one test
--treenode-filter "/*/MyProject.Tests.Api*/*/*"            # namespace prefix
--treenode-filter "/*/*/*/*[Category=Smoke]"               # property
--treenode-filter "/*/*/*/*[Category!=Slow]"               # exclude property
--treenode-filter "/*/*/(LoginTests)|(SignupTests)/*"      # either class
```

## Hot reload loop (MTP only)

Use only when the user wants a test host that stays up and reruns on edits.

1. Confirm the project runs on MTP (precedence above). On VSTest, stop: offer `dotnet watch --project <tests> test` (rebuild-and-rerun, not hot reload) and offer migration only as a separate, explicit step.
2. If `Microsoft.Testing.Extensions.HotReload` isn't referenced, add it (`dotnet add <tests> package Microsoft.Testing.Extensions.HotReload`).
3. Enable it with `export TESTINGPLATFORM_HOTRELOAD_ENABLED=1`, or an `environmentVariables` entry in `Properties/launchSettings.json`.
4. Start the host: `dotnet run --project <tests> -- <framework filter>`. It stays running and reruns affected tests on save. Console only: no Test Explorer support.
5. Rude edits (signature changes, new types) can't apply. Stop with Ctrl+C, `dotnet build`, and rerun the exact original command. For repeated rude edits: `DOTNET_WATCH_RESTART_ON_RUDE_EDIT=1 dotnet watch --project <tests> run -- <same args>`.
