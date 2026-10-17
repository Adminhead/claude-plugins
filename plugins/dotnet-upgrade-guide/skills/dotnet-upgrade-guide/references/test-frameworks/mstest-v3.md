# MSTest v1/v2 to v3

Read when a test project uses the `Microsoft.VisualStudio.QualityTools.UnitTestFramework` assembly reference (v1) or `MSTest.TestFramework`/`MSTest.TestAdapter` 1.x-2.x, or when CS0411, MSTEST0014 or `.testsettings` problems remain after a v3 bump. Continue with `mstest-v4.md` afterwards if the target is v4. MSTest v3 is not binary compatible with v1/v2: libraries built against them must be recompiled. Keep the project on its current runner (VSTest or Microsoft.Testing.Platform).

## Steps

1. **Assess.** Find `*.csproj`, `Directory.Build.props`, `Directory.Packages.props` and `*.testsettings`. A QualityTools reference means v1; package versions 1.x or 2.x mean v1 or v2. Run the tests and record discovered/passed/failed/skipped counts.
2. **Remove the v1 reference** (`<Reference Include="Microsoft.VisualStudio.QualityTools.UnitTestFramework" />`).
3. **Packages.** Default: replace `MSTest.TestFramework` + `MSTest.TestAdapter` with the `MSTest` metapackage at the latest 3.x on the feed. On VSTest, keep `Microsoft.NET.Test.Sdk` and raise it to the version the chosen MSTest requires (an older explicit one gives NU1605). Under Central Package Management edit `Directory.Packages.props`.
   Use `<Project Sdk="MSTest.Sdk/3.x.y">` only if the user asks or the repo already uses it. It defaults to Microsoft.Testing.Platform; set `<UseVSTest>true</UseVSTest>` to stay on VSTest. Then remove the `MSTest*` and `Microsoft.NET.Test.Sdk` packages and the `EnableMSTestRunner`, `OutputType`, `IsPackable` and `IsTestProject` properties, which the SDK supplies.
4. **TFMs.** v3 supports .NET 6+, .NET Core 3.1, .NET Framework 4.6.2+, .NET Standard 2.0, UWP 16299+ and WinUI 18362+. Change only TFMs that v3 dropped: net5.0 -> a supported modern TFM, net4x below 4.6.2 -> net462, netstandard1.x -> netstandard2.0.
5. **Breaking changes**, fixing only what is present:
   - `Assert.AreEqual(object, object)` became `AreEqual<T>(T?, T?)`. Only call sites where `T` can't be inferred break (CS0411, or CS1503 for unrelated types); fix those with an explicit type argument (`Assert.AreEqual<object>(code, id)`). Don't widen assertions that compile, which throws away the new type checking.
   - `[DataRow]` arguments must match parameter types exactly. This builds (warning MSTEST0014) and fails at run time with "Test data doesn't match method parameters": `1L` for an `int` parameter -> `1`; `1.0` for a `float` -> `1.0f`. Widening (`int` to `long`) still binds. Change the data, not the parameter types.
   - Rows with more than 16 arguments are valid on 3.0.3 and later; leave them unless the compiler emits CS1729.
   - `[Timeout]` now behaves the same on .NET Core and .NET Framework; check that values still fit.
6. **`.testsettings` to `.runsettings`.** v3 dropped `.testsettings` and `<LegacySettings>`. Delete the old file and write one `.runsettings` with a single `<MSTest>` section: `TestTimeout` -> `<MSTest><TestTimeout>30000</TestTimeout></MSTest>` (per test, not `TestSessionTimeout`); deployment -> `<DeploymentEnabled>` or remove; assembly resolution -> remove; data collectors -> `<DataCollectionRunSettings><DataCollectors>`. Point every project, CI command and IDE setting that named the old file at the new one (`RunSettingsFilePath` for VSTest; `--settings` on Microsoft.Testing.Platform).
7. **Verify** with the baseline command: compare counts and investigate every difference; no QualityTools reference, 1.x/2.x package, `.testsettings` or `<LegacySettings>` remains.
