# VSTest to Microsoft.Testing.Platform (MTP)

Read when moving a solution's test projects from VSTest to MTP, replacing `vstest.console`, translating `dotnet test` arguments to MTP form, or handling MTP's exit code 8. Stay on VSTest for UWP or packaged WinUI test projects, or a solution that also uses non-.NET adapters (JavaScript, C++). Day-to-day running and filtering of tests is the `dotnet-testing` skill's job.

Contents: rules, assess, central properties, runner opt-in per framework, `dotnet test` mode, argument translation, xUnit v3 filters, extension packages, CI, exit code 8, cleanup, verify.

## Rules

- Migrate every test project in the solution together; mixing VSTest and MTP projects in one solution or run is unsupported.
- The SDK mode decides the command shape. Read it from `global.json` or the CI config, not the host's `dotnet --version`:
  - .NET 10 SDK and later, native mode: `global.json` `"test": { "runner": "Microsoft.Testing.Platform" }`, no `TestingPlatformDotnetTestSupport`, MTP options passed directly (`dotnet test --report-trx`).
  - .NET 9 SDK and earlier: `<TestingPlatformDotnetTestSupport>true</TestingPlatformDotnetTestSupport>` and a `--` before MTP options (`dotnet test --no-build -- --report-trx`).
- Keep existing build arguments. Don't add `--no-build`, settings files that don't exist, or unrelated package upgrades.

## Steps

1. **Assess.** Per test project, the framework: `MSTest`/`MSTest.TestAdapter` or `MSTest.Sdk` (`MSTest.TestFramework` alone is a library), `NUnit3TestAdapter`, `xunit` + `xunit.runner.visualstudio` (v2), `xunit.v3`. Find `vstest.console` calls and VSTest-only arguments (`--filter`, `--logger`, `--collect`, `--settings`, `--blame*`) in CI. Run the tests and record counts.
2. **Central properties.** Put MTP properties in the root `Directory.Build.props`, inside a condition that selects only test projects by name. `IsTestProject` isn't defined yet when `Directory.Build.props` is evaluated, so don't condition on it:

   ```xml
   <PropertyGroup Condition="$(MSBuildProjectName.EndsWith('.Tests'))">
     <OutputType>Exe</OutputType>
     <EnableMSTestRunner>true</EnableMSTestRunner>
     <!-- .NET 9 SDK and earlier only: -->
     <TestingPlatformDotnetTestSupport>true</TestingPlatformDotnetTestSupport>
   </PropertyGroup>
   ```

   Every setup except `MSTest.Sdk` needs `OutputType` `Exe`. If no name pattern isolates the test projects, set the properties per project.
3. **Runner opt-in**:

   | Framework | Opt-in |
   |---|---|
   | MSTest packages (3.2.0+) | `<EnableMSTestRunner>true</EnableMSTestRunner>` + `OutputType` `Exe` |
   | MSTest.Sdk | On by default; remove any `<UseVSTest>true</UseVSTest>` |
   | NUnit | `NUnit3TestAdapter` 5.0.0+, `<EnableNUnitRunner>true</EnableNUnitRunner>` + `OutputType` `Exe` |
   | xUnit v2 | Add `YTest.MTP.XUnit2` + `OutputType` `Exe` (keeps VSTest `--filter` syntax, `xunit.runner.json`, `--report-trx`, `--treenode-filter`) |
   | xunit.v3 | `<UseMicrosoftTestingPlatformRunner>true</UseMicrosoftTestingPlatformRunner>`; translate filters (below) |

4. **`dotnet test` mode** per the rules above. `global.json` must be strict JSON (no trailing commas).
5. **Translate arguments.** Build arguments (`-c`, `-f`, `--no-build`, `-v`) don't change.

   | VSTest | MTP | Package needed |
   |---|---|---|
   | `--filter <expr>` | `--filter <expr>` (MSTest, NUnit, xUnit v2 via YTest) | |
   | `-l trx` / `--logger trx` | `--report-trx` | `Microsoft.Testing.Extensions.TrxReport` |
   | `--collect "Code Coverage;Format=cobertura"` | `--coverage --coverage-output-format cobertura` | `Microsoft.Testing.Extensions.CodeCoverage` |
   | `--blame-crash` / `--blame-crash-dump-type T` | `--crashdump` / `--crashdump-type T` | `Microsoft.Testing.Extensions.CrashDump` |
   | `--blame-hang` / `-dump-type T` / `-timeout X` | `--hangdump` / `--hangdump-type T` / `--hangdump-timeout X` | `Microsoft.Testing.Extensions.HangDump` |
   | `-d`/`--diag <file>` | `--diagnostic` | |
   | `-s`/`--settings <file>` | `--settings <file>` (MSTest, NUnit) | |
   | `-- <RunSettings args>` | `--test-parameter` (MSTest, NUnit) | |
   | `--results-directory`, `-t`/`--list-tests` | same | |
   | `--test-adapter-path`, `--blame` | not applicable | |

   Name the owning package whenever you translate a reporter, coverage or dump option; the option fails without it. Under Central Package Management add `PackageVersion` entries at versions resolved from the feed.

6. **xunit.v3 filters.** The VSTest `--filter` syntax doesn't work on xunit.v3 under MTP. Use `--filter-class`, `--filter-method`, `--filter-namespace`, `--filter-trait "name=value"` and their `--filter-not-*` forms; several flags AND together, and one flag takes several values (`--filter-class Foo Bar`).

   | VSTest | xunit.v3 |
   |---|---|
   | `FullyQualifiedName~ClassName` | `--filter-class *ClassName*` |
   | `FullyQualifiedName=Ns.Class.Method` | `--filter-method Ns.Class.Method` |
   | `Name=MethodName` | `--filter-method *MethodName*` |
   | `Category=Value` | `--filter-trait "Category=Value"` |
   | complex expressions | `--filter-query "/<assembly>/<namespace>/<class>/<method>[trait=value]"` ([query filter language](https://xunit.net/docs/query-filter-language)) |

   ```bash
   # VSTest
   dotnet test --filter "FullyQualifiedName~IntegrationTests&Category=Smoke"
   # xunit.v3, .NET 10 native mode
   dotnet test --filter-class '*IntegrationTests*' --filter-trait "Category=Smoke"
   # xunit.v3, .NET 9 SDK mode
   dotnet test -- --filter-class '*IntegrationTests*' --filter-trait "Category=Smoke"
   ```

   Check any `--filter-query` with `--list-tests`; a query that selects zero tests isn't a translation.
7. **CI.** Azure DevOps: replace `VSTest@3` with `DotNetCoreCLI@2` (`command: test`, translated `arguments`). GitHub Actions: translate the `dotnet test` arguments. Replace `vstest.console` calls with `dotnet test`; test projects are now executables and also run directly.
8. **Exit code 8.** MTP fails a run that discovers zero tests (VSTest passed it). For a project or configuration known to have none: `--ignore-exit-code 8`, or `<TestingPlatformCommandLineArguments>$(TestingPlatformCommandLineArguments) --ignore-exit-code 8</TestingPlatformCommandLineArguments>`, or `TESTINGPLATFORM_EXITCODE_IGNORE=8`. Scope it narrowly: a broad suppression hides a bad filter that ran nothing.
9. **Cleanup (optional, after verification).** Remove `Microsoft.NET.Test.Sdk` and `xunit.runner.visualstudio` unless a transition period still needs VSTest. `NUnit3TestAdapter` stays; it hosts the MTP runner.
10. **Verify.** `dotnet build`, then `dotnet test`; counts match the baseline; the test executable runs directly (`./bin/Debug/net10.0/MyTests`); CI produces the expected TRX, coverage and dump artifacts; the IDE test explorer still discovers tests. Report the opt-in, SDK mode, translated commands, extension packages and the evidence.

Sources: [Migrate from VSTest to Microsoft.Testing.Platform](https://learn.microsoft.com/dotnet/core/testing/migrating-vstest-microsoft-testing-platform), [Testing with dotnet test](https://learn.microsoft.com/dotnet/core/testing/unit-testing-with-dotnet-test), [MTP CLI options](https://learn.microsoft.com/dotnet/core/testing/microsoft-testing-platform-cli-options).
