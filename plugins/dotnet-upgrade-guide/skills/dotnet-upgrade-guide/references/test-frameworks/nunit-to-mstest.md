# NUnit (3 or 4) to MSTest v4

Read when converting NUnit tests to MSTest. Keep the target framework and runner (VSTest or Microsoft.Testing.Platform) unchanged; a runner move or TFM upgrade is a separate, verified step. If nothing NUnit remains, report that and change nothing. Several mappings below need a recent MSTest 4.x (marked); check the resolved version before using them.

Contents: workflow, packages, mechanical mapping, semantic traps, data, assertions, lifecycle, TestContext, execution control, threading and culture, parallelization, verify.

## Workflow

1. **Baseline.** Batch-read test projects, central package files, `global.json`, `.runsettings`, `testconfig.json` and NUnit config. State NUnit 3 or 4 from the package version, the runner, and the TFMs (MSTest v4 test apps need .NET 8+ or .NET Framework 4.6.2+; otherwise stop and offer a TFM upgrade or MSTest v3). Record counts; run a fresh baseline when the project has parameterized tests, fixture state, namespace setup, retries, custom attributes or explicit parallelism.
2. **Inventory** before editing: parameterized `[TestFixture(...)]`/`[TestFixtureSource]`/`[FixtureLifeCycle]`; `[TestCase]`, `[TestCaseSource]`, `TestCaseData`, `[Values]`, `[Range]`, `[Random]`, `[Sequential]`, `[Pairwise]`; `[Theory]`/`[Datapoint]`/`Assume.That`; `[OneTimeSetUp]`, `[SetUpFixture]`, inherited setup; `Assert.That`, `Assert.Multiple`, `Assert.Throws`/`Catch`; `[Parallelizable]`, `[LevelOfParallelism]`, `[Order]`, `[SingleThreaded]`; `[Apartment]`, `[RequiresThread]`, `[CancelAfter]`, `[Timeout]`; `[Culture]`, `[Platform]`, `[SetCulture]`; `[Explicit]`, `[Repeat]`, `[Retry]`, `[MaxTime]`; `[DefaultFloatingPointTolerance]`.
3. **Packages, one edit pass, one `dotnet test`.** Don't delete NUnit runner settings until their behavior is translated.
4. **Report** files changed, each high-risk mapping and its target API, the preserved TFM, runner, fixture scope and concurrency choice, counts, and manual follow-up.

## Packages

Remove `NUnit`, `NUnit3TestAdapter`, `NUnit.Analyzers`, `NUnit.Console`/`NUnit.ConsoleRunner` and NUnit MTP adapters. Add `MSTest` at the latest stable 4.x on the feed; on VSTest keep an explicit `Microsoft.NET.Test.Sdk` pin the project owns, at a compatible version. On Microsoft.Testing.Platform prefer `MSTest.Sdk`, else `EnableMSTestRunner` + `OutputType` `Exe`. Swap NUnit integrations (`Verify.NUnit` -> `Verify.MSTest`); keep assertion and mocking libraries.

## Mechanical mapping

| NUnit | MSTest |
|---|---|
| `[TestFixture]` | `[TestClass]` (keep inheritance; don't seal) |
| `[Test]` / `[Test(Description = "x")]` | `[TestMethod]` / `[TestMethod(DisplayName = "x")]` if the description served as a name |
| `[TestCase(...)]` / `[TestCaseSource(nameof(X))]` | `[TestMethod]` + `[DataRow(...)]` / `[DynamicData(nameof(X))]` |
| `[SetUp]` / `[TearDown]` | `[TestInitialize]` / `[TestCleanup]` |
| `[OneTimeSetUp]` / `[OneTimeTearDown]` (and old `TestFixtureSetUp`/`TearDown`) | static `[ClassInitialize] (TestContext)` / static `[ClassCleanup]` |
| `[Category(v)]` / `[Property(k, v)]` / `[Description(t)]` | `[TestCategory(v)]` / `[TestProperty(k, v)]` / `[Description(t)]` |
| `[Author(n)]` | `[Owner(n)]` when it means ownership, else `[TestProperty("Author", n)]` |
| `[TestOf(typeof(T))]` | `[TestProperty("TestOf", "Namespace.T")]` (class or method) |
| `[Ignore("r")]` / `[Timeout(ms)]` | Same attribute plus `[TestMethod]` |
| `[NonTestAssembly]` | Remove NUnit; don't turn the assembly into a test project |

Replace `using NUnit.Framework;` / `NUnit.Framework.Legacy;` with `using Microsoft.VisualStudio.TestTools.UnitTesting;` (not needed with `MSTest.Sdk`).

## Semantic traps

- **Fixture instances.** NUnit's default `LifeCycle.SingleInstance` shares one fixture object across all tests; MSTest creates one per test. Audit every mutable instance field, lazy cache and counter; state tests share moves to static fields set in `[ClassInitialize]` and released in `[ClassCleanup]`. Instance state used by `[OneTimeSetUp]` moves to a static holder, not just a `static` keyword. `[FixtureLifeCycle(LifeCycle.InstancePerTestCase)]` already matches MSTest: remove it.
- **Exceptions and types.** `Assert.Throws<T>` and `Throws.TypeOf<T>` are exact -> `Assert.ThrowsExactly<T>`. `Assert.Catch<T>` and `Throws.InstanceOf<T>` accept derived -> `Assert.Throws<T>`. `Is.TypeOf<T>` -> `Assert.IsExactInstanceOfType<T>`; `Is.InstanceOf<T>` -> `Assert.IsInstanceOfType<T>`.
- **Sequences.** `Is.EqualTo` compares enumerables element by element: `Assert.AreSequenceEqual` (4.3+) or `CollectionAssert.AreEqual` on lists, never reference `Assert.AreEqual`.
- **Retry counts differ.** NUnit `[Retry(n)]` counts the first run; MSTest `[Retry(n)]` counts retries after it. `[Retry(3)]` -> `[Retry(2)]`; `[Retry(1)]` -> remove. `RetryExceptions` filters need a custom attribute or manual note.
- **No identical mapping**, so rewrite deliberately or report: `[Explicit]` (MSTest `Ignore` never runs; agree a filtering convention), `[Repeat]`, parameterized fixtures and `[TestFixtureSource]` (split into concrete classes or move parameters into data-driven methods; never drop fixture arguments), `Assert.Multiple` (sequential asserts change failure aggregation), `[RequiresThread]`, `[SingleThreaded]`.

## Data

| NUnit | MSTest |
|---|---|
| `TestCaseData` with name, category, ignore | `TestDataRow<T>` (`DisplayName`, `TestCategories`, `IgnoreMessage`) |
| `TestCaseData` custom properties | Custom data source, or move stable metadata to the method or class |
| `[TestCase(..., ExpectedResult = v)]` / `.Returns(v)` | Add an `expected` parameter and assert it (below) |
| `[Combinatorial]` / `[Values(...)]` (4.4+) | `[CombinatorialData]` / `[CombinatorialValues(...)]`, `using Microsoft.VisualStudio.TestTools.UnitTesting.Combinatorial;` |
| `[Range(from, to)]` / `[Range(from, to, step)]` (4.4+) | `[CombinatorialRange(from, to, 1)]` / `(from, to, step)`; the two-argument MSTest form means `from, count` |
| `[Random(min, max, count)]` (4.4+) | `[CombinatorialRandomData(Minimum = min, Maximum = max, Count = count)]` |
| `[Sequential]`, `[ValueSource]` | Explicit `[DataRow]` pairs or one `[DynamicData]` source |
| `[Pairwise]` | The exact generated rows in `[DynamicData]`; Cartesian data changes counts and cost |

```csharp
// NUnit: [TestCase(2, 3, ExpectedResult = 5)] public int Add(int l, int r) => l + r;
[TestMethod]
[DataRow(2, 3, 5)]
public void Add(int left, int right, int expected) => Assert.AreEqual(expected, left + right);
```

`[DataRow]` literals must match parameter types exactly (suffixes, enums, arrays, nullables).

**Theories.** Gather `[Datapoint]`/`[DatapointSource]` values (inherited members too, and enclosing types when `searchInDeclaringTypes` is set), materialize them as `DynamicData` or combinatorial rows, enumerate the `false/true` and enum values NUnit supplied automatically, and turn `Assume.That` into a row-level `Assert.Inconclusive`. Record what the current runner reports when every row fails its assumptions and keep that outcome.

## Assertions

| NUnit | MSTest |
|---|---|
| `Is.EqualTo` (scalar) / `Is.Not.EqualTo` / `Is.SameAs` | `AreEqual(expected, actual)` / `AreNotEqual` / `AreSame` |
| `Is.Null` / `Is.Not.Null` / `Is.Empty` / `Is.True` / `Is.False` | `IsNull` / `IsNotNull` / `IsEmpty` / `IsTrue` / `IsFalse` |
| `Does.Contain(item)` / `Is.EquivalentTo(e)` | `Contains(item, actual)` / `CollectionAssert.AreEquivalent(eList, aList)` |
| `Is.GreaterThan(x)` / `Is.LessThan(x)` / `Is.InRange(a, b)` | `IsGreaterThan(x, actual)` / `IsLessThan(x, actual)` / `IsInRange(actual, a, b)` |
| `Does.StartWith`/`EndWith`/`Match(re)` | `StartsWith` / `EndsWith` / `MatchesRegex(re, actual)` |
| `Has.Count.EqualTo(n)` | `Assert.HasCount(n, collection)` |
| `Assert.DoesNotThrow(...)` | Call directly |
| property, `Some`, `All`, `Exactly`, `And`, `Or`, custom constraints | Explicit assertions keeping every predicate |
| `[DefaultFloatingPointTolerance(d)]` | Explicit `delta:` on each affected `float`/`double` equality, honoring `.Within` > method > fixture > assembly precedence |

## Lifecycle and TestContext

- `[SetUpFixture]` covering the whole assembly -> `[AssemblyInitialize]`/`[AssemblyCleanup]`; namespace-scoped -> per-class lifecycle or a shared helper, without widening scope.
- NUnit runs base setup before derived and derived teardown before base; keep the inheritance rather than flattening.
- `TestContext.WriteLine`/`Out`/`Progress` -> injected or property `TestContext.WriteLine`; `CurrentContext.Test.Name` -> `TestName`; `Test.FullName` -> `FullyQualifiedTestClassName` + `TestName`; `WorkDirectory` -> `TestRunDirectory` (check intent); `AddTestAttachment` -> `AddResultFile`; `CurrentContext.CancellationToken` -> `TestContext.CancellationToken`. Never store MSTest's `TestContext` in a static field.

## Execution control

- `[CancelAfter(ms)]` -> `[Timeout(ms, CooperativeCancellation = true)]`. On VSTest remove NUnit's injected `CancellationToken` parameter (VSTest treats it as missing data) and use `TestContext.CancellationToken`. A fixture-level `CancelAfter` applies to each affected test and lifecycle method.
- `[MaxTime(ms)]` -> time the code and assert the elapsed bound (not a timeout).
- `Assert.Pass()` -> return (review code after it); `Assert.Ignore(r)` -> `Assert.Inconclusive(r)` (reported differently).
- `[Order(n)]` has no general equivalent; use `[DependsOn]` (4.4+) only for a real prerequisite, else make tests independent.

## Threading, platform and culture

- `[Apartment(ApartmentState.STA)]`: method -> `[STATestMethod]`, fixture -> `[STATestClass]`, assembly -> `[STATestClass]` on every class. Set `UseSTASynchronizationContext = true` when async continuations must stay on the STA thread. MTA is the default.
- `[RequiresThread]`/`[SingleThreaded]`: find out whether tests depend on thread identity, thread-local state or COM ownership; if so use a custom executor or a managed thread, else report.
- `[Platform]` -> `[OSCondition(...)]` for OS values and `[ArchitectureCondition(...)]` for process architecture (recent 4.x, .NET only); runtime or version expressions and `[Culture]` -> `[MemberCondition]` over a static bool, or `Assert.Inconclusive` at the start of the test. Never `[Ignore]`, which skips everywhere.
- `[SetCulture]`/`[SetUICulture]` -> save `CurrentCulture`/`CurrentUICulture`, set it in setup at the matching scope, restore it in cleanup, and keep it from leaking under parallel runs.

## Parallelization

Both frameworks run serially by default; add nothing for an unconfigured project.

| NUnit | MSTest |
|---|---|
| `[assembly: Parallelizable(ParallelScope.Fixtures)]` | `[assembly: Parallelize(Workers = 0, Scope = ExecutionScope.ClassLevel)]` |
| `[assembly: LevelOfParallelism(N)]` | `Workers = N` |
| `[NonParallelizable]` | `[DoNotParallelize]` |
| `[Parallelizable(ParallelScope.Children)]` | Method-level parallelism only after checking shared instance state |
| Named shared resource | `[ResourceLock("name")]` (4.4+) for a narrower lock than `[DoNotParallelize]` |

## Verify

Same command, filter and configuration as the baseline. Explain every count difference: missing rows (data conversion), changed exception results (exact vs derived), state failures (single-instance fixtures, setup order), concurrency failures (workers, locks), changed skips (`Ignore`, `Explicit`, retry). No NUnit package, namespace, attribute, constraint or adapter setting remains unless listed as follow-up.
