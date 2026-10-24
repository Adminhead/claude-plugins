---
name: dotnet-testing
description: 'Writes, runs and fixes .NET tests in xUnit, NUnit, MSTest and TUnit: dotnet test syntax for VSTest vs Microsoft.Testing.Platform, filters, TRX and dumps, test-project wiring, TimeProvider and file-system seams, coverage. Use for running tests in a .NET repo, a filter that matches nothing, "VSTest or MTP?", or testing DateTime.Now code.'
---

# .NET testing

Pick the test command from the repository's actual platform and framework, never from habit. A `dotnet test` line that is right for one project is often silently wrong for the next: a VSTest filter passed to an xUnit v3 project on MTP runs zero tests and still exits 0.

Not for: what to test and how to shape a test (`unit-testing`), finding untested behavior (`test-gap-audit`), browser journeys (`e2e-testing`), moving between test frameworks or upgrading MSTest/xUnit majors (`dotnet-upgrade-guide`), build failures before tests run (`msbuild`), package versions (`nuget`).

## 1. Detect before you type a command

Read, in one batch, whatever exists of: `global.json`, the test `.csproj`, `Directory.Build.props`, `Directory.Build.targets`, `Directory.Packages.props`, `packages.config`, and any repo test script or CI workflow. A property missing from the `.csproj` may come from an import, so never infer it from the project file alone. Prefer a checked-in script or CI command over anything below.

| Signal | Meaning |
|---|---|
| `global.json` `"test": {"runner": "Microsoft.Testing.Platform"}` on SDK 10+ | Native MTP command mode |
| SDK 8/9, or SDK 10+ without that setting | VSTest command mode |
| `EnableMSTestRunner`, `EnableNUnitRunner`, `UseMicrosoftTestingPlatformRunner` (xUnit v3) = true, or `<Project Sdk="MSTest.Sdk">` without `UseVSTest` | Project is an MTP test app (runner selected) |
| VSTest mode + runner selected + `TestingPlatformDotnetTestSupport=true` | VSTest-to-MTP bridge: MTP runs the tests, MTP args go after `--` |
| VSTest mode + runner selected, no `TestingPlatformDotnetTestSupport` | VSTest still runs the tests (MSTest/NUnit/xUnit adapters) |
| `TUnit` package | MTP only |
| `ToolsVersion`, explicit `<Compile Include>`, `packages.config` | Classic project: use the repo's MSBuild + `vstest.console.exe` command, not `dotnet test` |

`Microsoft.NET.Test.Sdk` alone decides nothing. `OutputType=Exe` is the executable shape MTP needs, not the switch that selects it. Framework comes from the packages: `xunit.v3*` (xUnit v3), `xunit` (v2), `NUnit` + `NUnit3TestAdapter`, `MSTest`/`MSTest.Sdk`/`MSTest.TestFramework`, `TUnit`. Resolve versions (central `Directory.Packages.props` included) before applying version-specific advice. Per-TFM conditions can give different answers per target framework; report each.

When execution is allowed and nothing pins the SDK, run `dotnet --version` once.

## 2. Command shape

| Mode | Shape | Never |
|---|---|---|
| VSTest | `dotnet test [path] [options]` | MTP flags such as `--report-trx`, `--treenode-filter` |
| VSTest-to-MTP bridge | `dotnet test [path] [dotnet options] -- [MTP options]` | Dropping the `--` (also on SDK 10) |
| Native MTP (SDK 10+) | `dotnet test --project <csproj>` / `--solution <sln>` / `--test-modules <glob>` then MTP options | Positional paths; `--project` in VSTest mode |

`--framework`, `--configuration`, `--no-build`, `--no-restore` and `--verbosity` stay before any `--`. `dotnet test` builds by default; add `--no-build` instead of building first. Don't add or upgrade test packages unless the user asks.

## 3. Filters: run only what was asked

| Platform / framework | Filter |
|---|---|
| VSTest: MSTest, NUnit, xUnit v2 | `--filter "FullyQualifiedName~OrderServiceTests&TestCategory=Unit"` |
| MTP: MSTest, NUnit | Same expression; after `--` on the bridge, direct in native mode |
| MTP: xUnit v3 | `--filter-class`, `--filter-method`, `--filter-namespace`, `--filter-trait "Category=Smoke"`, or one `--filter-query "/*/*/*Orders*/*[Category=Smoke]"` |
| MTP: TUnit | `--treenode-filter "/*/*/OrderServiceTests/*"` |

After a filtered run, confirm the reported test names or count match the request. Zero tests, or the whole suite, means the filter was ignored or wrong: fix the syntax and rerun. Read [references/run-and-filter.md](references/run-and-filter.md) for full filter grammar, precedence rules, classic projects, and hot reload.

## 4. Reports and diagnostics

| Need | VSTest | MTP (needs the matching extension package) |
|---|---|---|
| TRX | `--logger "trx;LogFileName=r.trx"` | `--report-trx` (`Microsoft.Testing.Extensions.TrxReport`) |
| Diagnostic log | `--diag <file>` | `--diagnostic --diagnostic-output-directory <dir>` |
| Crash dump | `--blame-crash` | `--crashdump` (`...CrashDump`) |
| Hang dump | `--blame-hang --blame-hang-timeout 5min` | `--hangdump --hangdump-timeout 5min` (`...HangDump`) |
| Coverage | `--collect "XPlat Code Coverage"` (coverlet) or `--collect "Code Coverage"` | `--coverage` (`...CodeCoverage`) |

An "unrecognized option" from MTP (exit code 5) usually means the extension isn't referenced; check package references before suggesting one. `--verbosity diagnostic` is MSBuild noise, not a test log.

## 5. Writing tests

Match the suite's framework, version, assertion style, mocking library and naming. Never upgrade the framework or add a second one to make a test compile.

| | xUnit v3 | NUnit 4 | MSTest | TUnit |
|---|---|---|---|---|
| Test | `[Fact]` | `[Test]` | `[TestMethod]` in `[TestClass]` | `[Test]` |
| Data | `[Theory]` + `[InlineData]`/`[MemberData]` | `[TestCase]`/`[TestCaseSource]` | `[DataRow]`/`[DynamicData]` | `[Arguments]`/`[MethodDataSource]` |
| Per-test setup | constructor, `IAsyncLifetime` | `[SetUp]`/`[TearDown]` | constructor, `[TestInitialize]` | `[Before(Test)]`/`[After(Test)]` |
| Shared setup | `IClassFixture<T>`, `ICollectionFixture<T>`, assembly fixtures | `[OneTimeSetUp]` | `[ClassInitialize]` | `[Before(Class)]` |
| Category | `[Trait("Category","X")]` | `[Category("X")]` | `[TestCategory("X")]` | `[Property("Category","X")]` |
| Token | `TestContext.Current.CancellationToken` | `TestContext.CurrentContext.CancellationToken` | `TestContext.CancellationToken` (3.11+) | `CancellationToken` parameter |

Version-gated APIs matter most in MSTest (3.x minors differ; v4 removed `Assert.ThrowsException` and `[ExpectedException]`): read [references/mstest.md](references/mstest.md) before editing MSTest code. Read [references/xunit-nunit-tunit.md](references/xunit-nunit-tunit.md) for xUnit v3, NUnit 4 and TUnit specifics and for ASP.NET Core integration tests with `WebApplicationFactory` and Testcontainers.

## 6. Deterministic seams

When code reads the clock, disk, environment, randomness or network directly, add the smallest seam the test needs, and only when no seam exists yet:

- Time: inject `TimeProvider` (built in on .NET 8+, `Microsoft.Bcl.TimeProvider` below that); test with `FakeTimeProvider` from `Microsoft.Extensions.TimeProvider.Testing`. Use `Task.Delay(d, timeProvider, ct)` and `new CancellationTokenSource(d, timeProvider)` rather than a custom delay wrapper. Map `DateTime.UtcNow` to `GetUtcNow().UtcDateTime`, never `.DateTime` (that loses `DateTimeKind.Utc`).
- Files: an existing repo abstraction, else `System.IO.Abstractions` (`IFileSystem`, `MockFileSystem`), or a single injected delegate for one call.
- HTTP: inject `HttpClient` (typed client via `IHttpClientFactory`) and fake the `HttpMessageHandler`.
- Environment, console, process: a one-purpose interface with only the members the code uses.
- A static API whose signature must not change: an `AsyncLocal<T>` override scope that restores the previous value on dispose.

Keep production wired to the real dependency, keep the public API unchanged unless the user agrees, and never wait on wall-clock time in a test. Read [references/seams.md](references/seams.md) for the patterns, the static-dependency audit, and mechanical migrations.

## 7. Other jobs

- Creating a test project, or a project that passes alone but CI discovers zero tests: [references/test-projects.md](references/test-projects.md).
- Collecting or reading coverage, Cobertura, CRAP scores: [references/coverage.md](references/coverage.md).

## Verify and report

Run the narrowest command that proves the change. Report the exact command and a literal `Passed: N, Failed: N, Skipped: N` from the run, plus the first actionable failure. A failed restore or build is not a test failure; say which phase failed. A run that discovered zero tests is not a pass. For an advisory-only request, give one runnable command and one sentence on why that syntax, and run nothing.

## Gotchas

- SDK 10 does not switch modes by itself: without the `global.json` `test` section it is still VSTest mode, so bridge projects still need `--`.
- Running MTP projects through the VSTest-mode bridge is legacy. MTP v2 (default in `xunit.v3` 4.x) drops it under the .NET 10 SDK; the fix is the `global.json` runner setting, then `--project`/`--solution` and no `TestingPlatformDotnetTestSupport`.
- In bridge mode VSTest options such as `--logger` are silently ignored (MTP 1.9+ warns MTP0001).
- A solution mixing frameworks rejects framework-specific flags (xUnit `--filter-trait` vs MSTest `--filter`) with exit code 5. Route them per project through conditional `TestingPlatformCommandLineArguments`, or run projects separately.
- `xunit.v3` 3.x defaults to MTP v1; 4.x removed v1. `dotnet new xunit` may still emit xUnit v2 packages.
- MTP hot reload works only by running the test app directly (`dotnet run --project <tests>` with `TESTINGPLATFORM_HOTRELOAD_ENABLED=1` and `Microsoft.Testing.Extensions.HotReload`), never through `dotnet test` or VSTest.
