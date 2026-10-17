# MSTest v3 to v4

Read when upgrading `MSTest`, `MSTest.TestFramework`/`MSTest.TestAdapter` or `MSTest.Sdk` from 3.x to 4.x, fixing build errors after that bump, or diagnosing runtime differences afterwards (lost discovery, `TestContext` exceptions, test history reset). From v1 or v2, do `mstest-v3.md` first. v4 is not binary compatible with v3: libraries built against v3 must be recompiled.

Contents: assess, packages, source break table with code, behavioral changes, MSTest.Sdk and vstest.console, verify.

Match the request: a focused build-error question gets the fixes for those errors (with the user's actual types); a "what to expect" question gets the whole break table plus the behavioral table; a full migration follows every step. State the detected v3 version first.

## Assess and update

1. Find the MSTest packages in project files, `Directory.Build.props` and `Directory.Packages.props` (or the `MSTest.Sdk/x.y.z` version on `<Project Sdk>` or in `global.json` `msbuild-sdks`). Confirm 3.x.
2. TFMs: v4 supports .NET 8+, .NET Framework 4.6.2+, `uap10.0.16299`, and the Windows-specific TFMs for modern UWP and WinUI. .NET Core 3.1 to .NET 7 are dropped; retarget those first.
3. Scan for every pattern in the table below before fixing; several usually coexist.
4. Resolve the latest stable 4.x on the configured feed and use that one version for every MSTest package or the SDK. `dotnet restore`, `dotnet build`, collect errors.

## Source breaks

| Pattern | Fix |
|---|---|
| Custom `TestMethodAttribute` overriding `Execute` | Override `ExecuteAsync` returning `Task<TestResult[]>` (`Task.FromResult(result)` for synchronous logic, `await base.ExecuteAsync(testMethod)` otherwise) |
| `[TestMethod("name")]` | `[TestMethod(DisplayName = "name")]` |
| `TestMethodAttribute` subclass constructor | Forward caller info (below); assign `DisplayName` rather than passing it to the base |
| `[ClassCleanup(ClassCleanupBehavior.EndOfClass)]` | `[ClassCleanup]` (always end of class); `EndOfAssembly` logic moves to `[AssemblyCleanup]` |
| `TestContext.Properties.Contains("k")` | `ContainsKey("k")` (now `IDictionary<string, object>`) |
| `[Timeout(TestTimeout.Infinite)]` | `[Timeout(int.MaxValue)]` |
| `TestContext.ManagedType` | `TestContext.FullyQualifiedTestClassName` |
| `Assert.AreEqual(a, b, "msg {0}", arg)` | Interpolate: `$"msg {arg}"` (message + params overloads removed) |
| `Assert.ThrowsException<T>(...)` | `Assert.ThrowsExactly<T>(...)` (same semantics) or `Assert.Throws<T>(...)` (accepts derived types); async: `ThrowsExactlyAsync` / `ThrowsAsync` |
| `Assert.IsInstanceOfType<T>(obj, out var t)` | `var t = Assert.IsInstanceOfType<T>(obj);` |
| `Assert.AreEqual` type inference errors with `IEquatable<T>` | Give the type argument explicitly |
| `[ExpectedException(typeof(T))]` | `Assert.ThrowsExactly<T>(() => call)` around only the throwing statement, keeping setup outside the lambda; `AllowDerivedTypes = true` -> `Assert.Throws<T>` |
| `UnfoldingStrategy` on `DataRow`/`DynamicData` | Move it to `TestMethodAttribute` |
| `ConditionBaseAttribute.ShouldRun` | `IsConditionMet` |
| References to `MSTestDiscoverer`, `MSTestExecutor`, `AssemblyResolver`, `LogMessageListener`, `TestExecutionManager`, `TestMethodInfo`, `TestResultExtensions`, `UnitTestOutcomeExtensions`, `GenericParameterHelper`, PlatformServices `ITestMethod` | Now internal or removed; drop the dependency |

Caller info on a custom attribute:

```csharp
public sealed class NamedTestMethodAttribute : TestMethodAttribute
{
    public NamedTestMethodAttribute(
        string displayName,
        [CallerFilePath] string callerFilePath = "",
        [CallerLineNumber] int callerLineNumber = -1)
        : base(callerFilePath, callerLineNumber)
    {
        DisplayName = displayName;
    }
}
```

`[ExpectedException]` with setup:

```csharp
[TestMethod]
public async Task FetchData_BadUrl_Throws()
{
    var client = CreateClient();
    await Assert.ThrowsExactlyAsync<HttpRequestException>(() => client.GetAsync("https://localhost:0"));
}
```

Treat a custom `TestMethodAttribute` as one change: `ExecuteAsync`, caller info, display name and any retry or result logic it carries.

## Behavioral changes

| Symptom | Cause | Fix |
|---|---|---|
| Tests appear as new in Azure DevOps; history lost | `TestCase.Id` generation changed | None; history re-baselines |
| `TestContext.TestName` throws in `[ClassInitialize]` | v4 enforces lifecycle scope (`TestName` not in assembly/class init; `FullyQualifiedTestClassName` not in assembly init) | Move the access to `[TestInitialize]` or the test; don't substitute `FullyQualifiedTestClassName` |
| Tests no longer discovered | `TreatDiscoveryWarningsAsErrors` defaults to true | Fix the discovery warnings; temporarily `<MSTest><TreatDiscoveryWarningsAsErrors>false</TreatDiscoveryWarningsAsErrors></MSTest>` in `.runsettings` |
| Tests hang that didn't before | `DisableAppDomain` defaults to true (on .NET Framework under testhost MSTest re-enables AppDomains) | `<RunConfiguration><DisableAppDomain>false</DisableAppDomain></RunConfiguration>` |
| `vstest.console` finds zero tests in an MSTest.Sdk project | v4's MSTest.Sdk no longer adds `Microsoft.NET.Test.Sdk` in its default Microsoft.Testing.Platform mode | See below |
| New warnings | MSTEST0001, 0007, 0017, 0023, 0024, 0025, 0030, 0031, 0032, 0035, 0037, 0045 raised from Info to Warning | Fix, or set severity in `.editorconfig` deliberately |

### MSTest.Sdk and vstest.console

Pick one and say which runner it keeps:

- Keep Microsoft.Testing.Platform and the transitional VSTest job: add `Microsoft.NET.Test.Sdk` explicitly at a version resolved from the feed (`PackageVersion` under Central Package Management). Prove it with the real `vstest.console` command.
- Move the project to VSTest: `<UseVSTest>true</UseVSTest>`; the SDK then adds the package.
- Move CI to `dotnet test`, which runs Microsoft.Testing.Platform natively (the long-term option).

## Verify

`dotnet build` with zero errors, then the tests; compare discovered/passed/failed/skipped with the pre-migration baseline and explain any drop (stricter discovery can hide tests silently). Report the old and new versions, the runner, files changed and the counts. Writing new MSTest tests is the `dotnet-testing` skill's job.
