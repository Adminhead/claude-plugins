# xUnit.net (v2 or v3) to MSTest v4

Read when converting xUnit tests to MSTest. Keep the target framework and the runner (VSTest or Microsoft.Testing.Platform) unchanged; do a runner move or TFM upgrade as a separate, verified step. If nothing xUnit remains, report that and change nothing.

Contents: workflow, packages, attribute and data mapping, assertions, lifecycle and fixtures, output and cancellation, parallelization, companions, verify.

## Workflow

1. **Baseline.** In one pass read the test projects, `Directory.Build.props`, `Directory.Packages.props`, `global.json` and runner config. Note the xUnit version (`xunit` 2.x or `xunit.v3`), the runner, and the TFMs. MSTest v4 test apps need .NET 8+ or .NET Framework 4.6.2+; on anything older, stop and offer a separate TFM upgrade or MSTest v3. Record test counts (existing CI results are fine).
2. **Inventory the high-risk constructs** before editing: `IClassFixture`, `ICollectionFixture`, `CollectionDefinition`, custom `Fact`/`Theory`/`Data` attributes, `Assert.Throws`/`ThrowsAny`/`IsType`, `Record.Exception`, event assertions, `ITestOutputHelper`, `TestContext.Current`, `IAsyncLifetime`, `CollectionBehavior`, `xunit.runner.json`, shared static or external state.
3. **Packages** (below), then the mechanical and semantic rewrites in one edit pass, then one `dotnet test`. Let compiler errors drive any leftover conversions.
4. **Report**: files changed, each high-risk mapping and the API it now uses (`[ClassInitialize]`, `TestContext.WriteLine`, `Assert.IsExactInstanceOfType<T>` and so on), the unchanged TFM and runner, the fixture and parallelization decisions, counts, and any manual follow-up.

## Packages

Remove `xunit`, `xunit.abstractions`, `xunit.assert`, `xunit.core`, `xunit.extensibility.*`, `xunit.runner.visualstudio`, `xunit.v3*` (including the `mtp-v1`/`mtp-v2` variants) and `YTest.MTP.XUnit2` from project and central files.

- **Metapackage** (default for an incremental conversion): `MSTest` at the latest stable 4.x on the feed. It brings `Microsoft.NET.Test.Sdk`, the adapter, framework and analyzers. On VSTest, keep an existing explicit `Microsoft.NET.Test.Sdk` pin and raise it to what that MSTest needs (MSTest 4.x requires 18.x; an older pin gives NU1605). Each file needs `using Microsoft.VisualStudio.TestTools.UnitTesting;`.
- **On Microsoft.Testing.Platform**: prefer `MSTest.Sdk` (pin it in `global.json` `msbuild-sdks` for several projects); with the metapackage set `EnableMSTestRunner` and `OutputType` `Exe`. Drop xUnit's `UseMicrosoftTestingPlatformRunner`. Keep `TestingPlatformDotnetTestSupport` only where the repo still uses the .NET 9 `dotnet test` mode.
- **MSTest.Sdk on VSTest**: `<UseVSTest>true</UseVSTest>`. The SDK adds the global using; don't add it again.

## Attributes and data

| xUnit | MSTest |
|---|---|
| (no class attribute) | `[TestClass]`; keep the class hierarchy, don't seal mechanically |
| `[Fact]`, `[Theory]` | `[TestMethod]` |
| `DisplayName = "x"` | `[TestMethod(DisplayName = "x")]` |
| `[Fact(Skip = "r")]` | `[TestMethod]` + `[Ignore("r")]` (`[Ignore]` alone doesn't discover the test) |
| `[Fact(Timeout = 5000)]` | `[TestMethod]` + `[Timeout(5000)]`; `Timeout = -1` -> omit |
| `[Trait("Category", v)]` | `[TestCategory(v)]` (assembly, class or method) |
| `[Trait("Owner", v)]` | `[Owner(v)]` on each test method (method-only; `Owner` is reserved, so never `TestProperty("Owner", ...)`); flag conflicting owners for manual review |
| other `[Trait(k, v)]` | `[TestProperty(k, v)]` (class or method only; an assembly-level one moves down to classes or becomes a category if that filters the same) |
| `[InlineData(...)]` | `[DataRow(...)]` |
| `[MemberData(nameof(X))]` / `MemberType = typeof(T)` | `[DynamicData(nameof(X))]` / `[DynamicData(nameof(X), typeof(T))]` |
| `TheoryData<int, string>` source | `IEnumerable<object[]>`, `IEnumerable<(int, string)>`, or `IEnumerable<TestDataRow<(int, string)>>` |
| `[MemberData]` with arguments | Manual: make the member parameterless or move the logic into the test |
| `[ClassData(typeof(D))]` | `public static IEnumerable<object[]> Cases => new D();` + `[DynamicData(nameof(Cases))]` |
| Custom `DataAttribute` | Manual: implement `ITestDataSource` |
| Custom `FactAttribute` | `TestMethodAttribute` subclass with `ExecuteAsync` and caller info (see `mstest-v4.md`) |

`[DataRow]` literals must match parameter types exactly (`long` -> `1L`, `float` -> `1.0f`, `decimal` -> `1.0m`, `uint` -> `1U`); a mismatch builds and fails at run time.

## Assertions

| xUnit | MSTest |
|---|---|
| `Equal` / `NotEqual` / `Same` / `NotSame` / `Null` / `NotNull` / `True` / `False` | `AreEqual` / `AreNotEqual` / `AreSame` / `AreNotSame` / `IsNull` / `IsNotNull` / `IsTrue` / `IsFalse` |
| `Equal(0.1, x, 3)` (precision) | `AreEqual(0.1, x, delta: 0.001)` |
| `Equal(expected, actual)` on sequences | `Assert.AreSequenceEqual` (4.3+), else `CollectionAssert.AreEqual(e.ToList(), a.ToList())`; plain `AreEqual` compares references (MSTEST0065) |
| **`Throws<T>`** (exact) | **`Assert.ThrowsExactly<T>`** |
| **`ThrowsAny<T>`** (derived ok) | **`Assert.Throws<T>`** |
| `ThrowsAsync<T>` / `ThrowsAnyAsync<T>` | `ThrowsExactlyAsync<T>` / `ThrowsAsync<T>` |
| `Throws<T>(paramName, ...)` | `var ex = Assert.ThrowsExactly<T>(...); Assert.AreEqual(paramName, ex.ParamName);` |
| `IsType<T>` (exact, returns T) | `var t = Assert.IsExactInstanceOfType<T>(x);` (4.1+) |
| `IsAssignableFrom<T>` | `var t = Assert.IsInstanceOfType<T>(x);` |
| `InRange` / `NotInRange` | `IsInRange` / `IsNotInRange` |
| `Contains`/`DoesNotContain`/`StartsWith`/`EndsWith` (strings) | Same names on `Assert` (3.8+) |
| `Matches` / `DoesNotMatch` | `MatchesRegex` / `DoesNotMatchRegex` |
| `Contains(item, coll)` / `Empty` / `NotEmpty` | `Contains` / `IsEmpty` / `IsNotEmpty` |
| `Contains(coll, predicate)` | `Assert.IsTrue(coll.Any(predicate))` |
| `Single(coll)` / `Single(coll, pred)` | `var item = Assert.ContainsSingle(coll)` / `(coll.Where(pred))` |
| `Skip` / `SkipWhen` / `SkipUnless` (v3, runtime) | `[OSCondition(...)]` or `[CICondition(...)]` (3.10+) for environment checks; otherwise `if (cond) Assert.Inconclusive("r");`. Never `[Ignore]`, which skips everywhere |

No equivalent, rewrite by hand and never drop the check: `Collection` (`Assert.HasCount(n, items)` then per-element), `All` (`foreach`), `Equivalent` (member-by-member, or the repo's assertion library), `Raises`/`RaisesAny`/`PropertyChanged` (subscribe, flag, assert), `Record.Exception` (try/catch returning the exception), `Distinct`, `Superset`.

## Lifecycle and fixtures

- Constructor setup and `IDisposable`/`IAsyncDisposable` work as-is (one instance per test). `IAsyncLifetime` -> `[TestInitialize] async Task` / `[TestCleanup] async Task`.
- `IClassFixture<T>` (one instance per class): a static field set in static `[ClassInitialize] ClassInit(TestContext context)` and disposed in static `[ClassCleanup]`. Not `[TestInitialize]`, which makes one per test.

  ```csharp
  [TestClass]
  public class OrderTests
  {
      private static DbFixture? s_fixture;
      [ClassInitialize] public static void ClassInit(TestContext context) => s_fixture = new DbFixture();
      [ClassCleanup] public static void ClassCleanup() => s_fixture?.Dispose();
  }
  ```

- `ICollectionFixture<T>` shares and serializes. Sharing: a static `Lazy<T>` helper used from each member class's `[ClassInitialize]`. Serialization: `[DoNotParallelize]` on each member class only when the collection disabled parallelization. Use `[AssemblyInitialize]`/`[AssemblyCleanup]` only for a truly assembly-wide fixture, and say the scope widened. Custom collection orderers: flag for manual review.

## Output and cancellation

| xUnit | MSTest |
|---|---|
| `ITestOutputHelper` ctor parameter, `_output.WriteLine(...)` | `TestContext` ctor parameter (3.6+) or `public TestContext TestContext { get; set; } = null!;`, `TestContext.WriteLine(...)` |
| `WriteLine("fmt {0}", arg)` | `WriteLine($"fmt {arg}")` |
| v3 `TestContext.Current.TestOutputHelper` / `AddAttachment` / `TestMethod.MethodInfo.Name` / `TestClass.Class.Name` | `WriteLine` / `AddResultFile(path)` / `TestName` / `FullyQualifiedTestClassName` |
| v3 `TestContext.Current.CancellationToken` | Injected `TestContext.CancellationToken`, never `CancellationToken.None` or a new source |

## Parallelization

xUnit runs classes in parallel by default; MSTest runs serially. With two or more independent test classes, add `[assembly: Parallelize(Workers = 0, Scope = ExecutionScope.ClassLevel)]` to a compiled `.cs` file (skip it for a single class with no explicit setting). Never `ExecutionScope.MethodLevel`, which xUnit never does.

| xUnit | MSTest |
|---|---|
| `CollectionBehavior(DisableTestParallelization = true)`, `parallelizeAssembly`/`parallelizeTestCollections: false` | No `[assembly: Parallelize]` |
| `MaxParallelThreads = N`, `maxParallelThreads: N` | `Workers = N`, `ClassLevel` |
| `[Collection("X")]` serial | `[DoNotParallelize]` on members |
| `longRunningTestSeconds: N` | `[Timeout(N * 1000)]` where needed |

Remove `[assembly: CollectionBehavior/TestFramework/CaptureConsole]` and `xunit.runner.json` after porting what matters; flag `TestCaseOrderer`/`TestCollectionOrderer` for manual review.

## Companions

`Xunit.SkippableFact` -> conditions or `Assert.Inconclusive`, remove the package. `Xunit.Combinatorial` -> the community `Combinatorial.MSTest`, or explicit `[DataRow]`s. `Xunit.StaFact` and `AutoFixture.Xunit2` -> manual. `Verify.Xunit` -> `Verify.MSTest`. FluentAssertions, Shouldly, AwesomeAssertions, Moq, NSubstitute, FakeItEasy stay as they are.

## Verify

Same command, filter and configuration as the baseline. Investigate each count difference: missing cases (discovery attribute, `DynamicData`, `DataRow` literal types), changed exception results (exact vs derived mapping), shared-state failures or big duration changes (fixture scope, parallelization), silent skips (missing `[TestMethod]`, skip conversion). No xUnit package, namespace, attribute, runner config or fixture interface remains unless listed as manual follow-up.
