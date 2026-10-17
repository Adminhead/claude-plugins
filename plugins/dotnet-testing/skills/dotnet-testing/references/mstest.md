# MSTest

Contents: version gate, project setup, conventions, assertions, data-driven tests, lifecycle, timeouts, retry and conditions, parallelism, analyzers, v4 differences.

## Version gate first

Resolve the exact version: `MSTest.Sdk` (project SDK attribute or `global.json` `msbuild-sdks`), the `MSTest` metapackage, or `MSTest.TestFramework` + `MSTest.TestAdapter` (classic projects: `packages.config` and `HintPath`). Don't copy an example whose minimum version the project doesn't meet, and don't upgrade MSTest unless asked.

| API or pattern | Minimum | Fallback |
|---|---|---|
| Generic `Assert.IsInstanceOfType<T>(value, out var t)` | 3.4, removed in 4.0 | 3.0-3.3: non-generic assert, then cast; 4.x: `var t = Assert.IsInstanceOfType<T>(value)` |
| Constructor-injected `TestContext` | 3.6 | `public TestContext TestContext { get; set; }` |
| ValueTuple `DynamicData` | 3.7 | `IEnumerable<object[]>` |
| `Assert.Throws`/`ThrowsExactly`, `Assert.Contains`/`DoesNotContain`/`ContainsSingle`/`HasCount`/`IsEmpty`/`IsNotEmpty`, `TestDataRow<T>`, `[Retry]`, `[OSCondition]`, `MSTestAnalysisMode` | 3.8 | `Assert.ThrowsException`, `CollectionAssert`, count asserts |
| `Assert.IsGreaterThan`/`IsLessThan`/`IsInRange`, string `StartsWith`/`EndsWith`/`MatchesRegex`, `[CICondition]` | 3.10 | `StringAssert`, `Assert.IsTrue` with a message |
| `TestContext.CancellationToken` with cooperative `[Timeout]` | 3.11 | 3.6.4-3.10: `TestContext.CancellationTokenSource.Token` |

## New project setup

Only for genuinely new projects; existing ones keep their style.

```xml
<Project Sdk="MSTest.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
</Project>
```

Pin the SDK version once in `global.json` so every test project moves together: `{ "msbuild-sdks": { "MSTest.Sdk": "<version>" } }`. Check the current version on nuget.org. `MSTest.Sdk` runs on MTP by default; `<UseVSTest>true</UseVSTest>` switches back.

## Conventions

Unless the suite already does otherwise: `sealed` test classes, `[TestClass]` + `[TestMethod]`, Arrange-Act-Assert, `Method_Scenario_Expected` names, a `<Project>.Tests` project. Keep existing base fixtures, helpers and mocking syntax.

## Assertions

Use the most specific assertion the version allows; it produces a better failure message.

| Instead of | Use (3.8+ unless noted) |
|---|---|
| `Assert.IsTrue(list.Count > 0)` | `Assert.IsNotEmpty(list)` |
| `Assert.IsTrue(list.Count == 3)` | `Assert.HasCount(3, list)` |
| `Assert.IsTrue(list.Contains(x))` | `Assert.Contains(x, list)` |
| `list.Single(p)` then `IsNotNull` | `var item = Assert.ContainsSingle(list)` |
| `Assert.IsTrue(x != null)` | `Assert.IsNotNull(x)` |
| `Assert.AreEqual(a, b)` meaning same instance | `Assert.AreSame(a, b)` |
| `Assert.IsTrue(score > 0)` | `Assert.IsGreaterThan(0, score)` (3.10) |
| `Assert.IsTrue(s >= 60 && s <= 90)` | `Assert.IsInRange(60, 90, s)` (3.10) |
| `(Handler)result` hard cast | `Assert.IsInstanceOfType<Handler>(...)` per the gate above |

- `Assert.AreEqual(expected, actual)`: expected first, so the failure labels read correctly (MSTEST0017).
- Bounds go first and the observed value last: `IsGreaterThan(lowerBound, actual)`, even when the original expression read the other way.
- `Assert.Throws<T>` accepts T or a derived type; `Assert.ThrowsExactly<T>` only T. Both return the exception, so assert `ParamName` and similar on it. Async: `await Assert.ThrowsExactlyAsync<T>(() => sut.RunAsync())`.

## Data-driven tests

```csharp
[TestMethod]
[DataRow(1, 2, 3)]
[DataRow(0, 0, 0, DisplayName = "Zeros")]
public void Add_ReturnsSum(int a, int b, int expected) => Assert.AreEqual(expected, Calc.Add(a, b));

[TestMethod]
[DynamicData(nameof(Discounts))]
public void ApplyDiscount_ReturnsPrice(decimal price, int percent, decimal expected) =>
    Assert.AreEqual(expected, Pricing.Apply(price, percent));

public static IEnumerable<(decimal price, int percent, decimal expected)> Discounts =>
[
    (100m, 10, 90m),
    (50m, 0, 50m),
];
```

Tuple element names document positions; they don't make binding position-independent. Use `TestDataRow<T>` (3.8+) for per-row `DisplayName` or metadata. Don't pass `DynamicDataSourceType` (inferred; MSTEST0052). `[DataTestMethod]` is unnecessary (MSTEST0044).

## Lifecycle

Order: `[AssemblyInitialize]`, `[ClassInitialize]`, then per test: constructor, `TestContext` property set (if property-injected), `[TestInitialize]`, test, `[TestCleanup]`, `DisposeAsync`, `Dispose`; then `[ClassCleanup]`, `[AssemblyCleanup]`.

Put synchronous setup in the constructor (fields can be `readonly`), use `[TestInitialize]` only for async setup, and `[TestCleanup]` for cleanup that must run on failure. Don't rewrite an established fixture base class in passing.

## Timeouts and cancellation

```csharp
[TestMethod]
[Timeout(5000, CooperativeCancellation = true)]
public async Task Fetch_CompletesInTime()
{
    var result = await _client.GetAsync(TestContext.CancellationToken); // 3.11+
    Assert.IsNotNull(result);
}
```

A plain `[Timeout]` doesn't stop in-flight work. Flow the token into every awaited call (MSTEST0045/0049/0054).

## Retry, conditions, parallelism

```csharp
[TestMethod]
[Retry(3, MillisecondsDelayBetweenRetries = 1000, BackoffType = DelayBackoffType.Exponential)]
public async Task ExternalService_Responds() { /* real call and assertion */ }

[TestMethod]
[OSCondition(OperatingSystems.Windows)]      // instead of an if (OperatingSystem.IsWindows()) branch (MSTEST0061)
public void Registry_ReadsKey() { /* ... */ }

[assembly: Parallelize(Workers = 4, Scope = ExecutionScope.MethodLevel)]
[TestClass, DoNotParallelize] public sealed class DatabaseTests { }
```

Retry only genuinely external flakiness, never races or shared state. Conditions replace environment branches but not the operation under test or its cleanup.

## Analyzers (MSTEST*)

Shipped with the `MSTest` metapackage, `MSTest.Sdk`, and `MSTest.TestFramework` 3.7+. Fix rather than suppress; rebuild to confirm. Set `<MSTestAnalysisMode>Recommended</MSTestAnalysisMode>` (None, Default, Recommended, All) on 3.8+.

| Rule | Fix |
|---|---|
| MSTEST0006 `[ExpectedException]` | `Assert.Throws`/`ThrowsExactly` (removed in v4) |
| MSTEST0017 swapped AreEqual arguments | expected first |
| MSTEST0023 negated bool assert | `Assert.IsFalse` |
| MSTEST0024 static `TestContext` | instance member |
| MSTEST0025 / 0032 always-false / always-true assert | `Assert.Fail("reason")` / remove |
| MSTEST0037 generic assert where a specific one exists | table above |
| MSTEST0038 `AreSame` on value types | `AreEqual` |
| MSTEST0039 `Assert.ThrowsException` | `Throws`/`ThrowsExactly` |
| MSTEST0046 `StringAssert` | `Assert` equivalent (3.10+) |
| MSTEST0036 member shadows base test member | rename or `override` |
| MSTEST0002/0003/0005/0007-0014 invalid signatures | correct the signature the rule names |

Other rules: https://learn.microsoft.com/dotnet/core/testing/mstest-analyzers/overview

## MSTest 4 differences that bite when editing

- Removed: `Assert.ThrowsException*`, `[ExpectedException]`, `ClassCleanupBehavior` (class cleanup now always runs at end of class), `TestTimeout.Infinite` (use `int.MaxValue`), `TestContext.ManagedType`.
- `Assert` overloads taking `message` plus `object[]` args now take only `message`: use interpolation.
- `Assert.IsInstanceOfType<T>(x)` returns the typed value; the `out` overload is gone.
- `TestContext.Properties` is `IDictionary<string, object>` (`ContainsKey`, not `Contains`).
- Accessing `TestContext.TestName` in assembly or class initialize throws.
- Custom `TestMethodAttribute` overrides `ExecuteAsync`; `[TestMethod("name")]` becomes `[TestMethod(DisplayName = "name")]`.
- Minimum .NET is 8 (.NET Framework 4.6.2 still supported).

Upgrading an MSTest major is `dotnet-upgrade-guide` work, not an incidental edit.
