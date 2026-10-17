# xUnit.net v2 to xunit.v3

Read when moving test projects from the `xunit` v2 packages to `xunit.v3`, or fixing compile errors after that bump. Not for changing frameworks (see the to-MSTest references) or for a runner-only move (see `vstest-to-mtp.md`).

Contents: preflight, required steps 1-5, conditional steps 6-12, verify.

## Preflight

- Run the existing test command and record discovered, passed, failed and skipped counts as the baseline.
- Already done if the project references `xunit.v3`, has the executable and runner settings below, no v2 packages, no v2-only APIs, and its tests pass. Report that and change nothing.
- Runner: xUnit v2 runs on VSTest unless the project references `YTest.MTP.XUnit2`. Keep whichever platform it was on.
- TFMs: xunit.v3 needs .NET 8+ or .NET Framework 4.7.2+ (test libraries may target netstandard2.0), and an SDK-style project. If a TFM is older, stop and upgrade it first.
- Pick versions from the configured feed (`dotnet package search xunit.v3 --exact-match` or the restore graph), not from the "v3" in the name. Keep `xunit.v3`, `Xunit.Combinatorial` and `Xunit.StaFact` as one compatible set.

## Required steps

1. **Find v2 packages** in project files and `Directory.Build.props/targets` / `Directory.Packages.props`: `xunit`, `xunit.abstractions`, `xunit.assert`, `xunit.core`, `xunit.extensibility.core`, `xunit.extensibility.execution`, `xunit.runner.visualstudio`.
2. **Rename packages**: `xunit` -> `xunit.v3`; `xunit.assert` -> `xunit.v3.assert`; `xunit.core` -> `xunit.v3.core`; `xunit.extensibility.core` and `.execution` -> one `xunit.v3.extensibility.core`; remove `xunit.abstractions`. Under Central Package Management the version lives in `PackageVersion` and the `PackageReference` stays versionless; read both files back after editing.
3. **`<OutputType>Exe</OutputType>`** in each test project (not test libraries). Put it in `Directory.Build.props`, conditioned on a name pattern if needed (`Condition="$(MSBuildProjectName.EndsWith('.Tests'))"`), never in `Directory.Build.targets`. A `net*-windows` test project built on Linux or macOS then needs `<EnableWindowsTargeting>true</EnableWindowsTargeting>`.
4. **Runner**:
   - Was VSTest (the usual case): keep or update `xunit.runner.visualstudio` and `Microsoft.NET.Test.Sdk`, and set `<IsTestingPlatformApplication>false</IsTestingPlatformApplication>` (in an existing shared props file, else the project).
   - Was `YTest.MTP.XUnit2`: remove it, set `<UseMicrosoftTestingPlatformRunner>true</UseMicrosoftTestingPlatformRunner>`, and don't add `xunit.runner.visualstudio`.
5. **Remove `using Xunit.Abstractions;`**. `ITestOutputHelper` now lives in the `Xunit` namespace.

## Conditional steps

6. **`async void` tests** no longer compile; return `async Task`.
7. **Type-based attributes**: `CollectionBehavior`, `TestCaseOrderer`, `TestCollectionOrderer` and `TestFramework` take a `Type` instead of two strings: `[assembly: CollectionBehavior(typeof(MyNamespace.MyCollectionFactory))]`. Migrate the referenced custom type to its v3 contract too (a collection factory implements `IXunitTestCollectionFactory`); a compiling attribute with an empty factory isn't done.
8. **Custom `FactAttribute`/`TheoryAttribute` subclasses** must forward source information:

   ```csharp
   internal sealed class MyFactAttribute : FactAttribute
   {
       public MyFactAttribute(
           [CallerFilePath] string? sourceFilePath = null,
           [CallerLineNumber] int sourceLineNumber = -1)
           : base(sourceFilePath, sourceLineNumber) { }
   }
   ```

9. **`BeforeAfterTestAttribute` subclasses**: keep the base class and the ordering of base calls; add the `IXunitTest` parameter and pass it on:

   ```csharp
   public override void Before(MethodInfo methodUnderTest, IXunitTest test) { /* ... */ base.Before(methodUnderTest, test); }
   public override void After(MethodInfo methodUnderTest, IXunitTest test) { base.After(methodUnderTest, test); /* ... */ }
   ```

10. **New analyzer warnings**, notably xUnit1051: pass `TestContext.Current.CancellationToken` to methods that accept a token.
11. **`Xunit.SkippableFact`**: remove the package; `[SkippableFact]` -> `[Fact]`, `[SkippableTheory]` -> `[Theory]`, `Skip.If(...)` -> `Assert.SkipWhen(...)`, `Skip.IfNot(...)` -> `Assert.SkipUnless(...)`. Check both branches: the skip reason appears when the condition holds, and the test runs and passes when it doesn't.
12. **Companions**: `Xunit.Combinatorial` 1.x moves to 2.x or later; `Xunit.StaFact` moves to the line that supports the chosen xunit.v3 major. Use package dependency constraints, not matching version numbers. If no stable companion supports the newest xunit.v3 major, pin the newest major that has one and say why. STA tests skip on Linux; report those separately from failures.

## Verify

Run the same test command as the baseline. Report the runner, the exact package set and how the versions were confirmed (feed query or successful restore), files changed, and discovered/passed/failed/skipped counts against the baseline. A build without test discovery isn't success; investigate every count difference.
