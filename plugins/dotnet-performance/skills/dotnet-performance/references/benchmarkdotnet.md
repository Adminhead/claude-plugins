# BenchmarkDotNet: writing, running and comparing

Contents: project setup; entry points and configs; running; filters; writing correct benchmarks; parameterization; comparison strategies; reading ratios; apples-to-apples runs.

Facts here were checked against BenchmarkDotNet 0.15.8 (latest stable) and the 0.16.0 previews. Check the installed version (`dotnet list package | grep -i benchmarkdotnet`) when an exact default matters.

## Project setup

For a temporary benchmark (investigation, change validation, development feedback), create a standalone console project outside the product's solution unless the repo already has a benchmark project; for a permanent coverage suite, add to the existing benchmark project and follow its conventions.

```bash
dotnet new console -o bench/MyBench
dotnet add bench/MyBench package BenchmarkDotNet   # no version: NuGet picks the latest compatible one
dotnet add bench/MyBench reference src/MyLib/MyLib.csproj
```

Respect the repo's package policy: with Central Package Management, add the version to `Directory.Packages.props` instead (the `nuget` skill covers CPM). Don't hand-write an old version number from memory; older BenchmarkDotNet releases lack support for current runtimes.

To compare runtimes, the benchmark project needs the plural property listing every target, or the multi-runtime build fails:

```xml
<TargetFrameworks>net8.0;net10.0</TargetFrameworks>
```

## Entry points and configs

```csharp
using BenchmarkDotNet.Running;
BenchmarkSwitcher.FromAssembly(typeof(Program).Assembly).Run(args);
```

- `BenchmarkSwitcher` parses CLI flags but prompts interactively for which benchmarks to run unless `--filter` is given. Always pass `--filter` (`--filter "*"` runs everything) so the run doesn't hang.
- `BenchmarkRunner.Run<T>()` ignores CLI flags unless `args` is passed: `BenchmarkRunner.Run<T>(args: args)` or `BenchmarkRunner.Run<T>(config, args)`. Check which form the program uses before relying on flags.

Configs: start from `DefaultConfig.Instance.AddJob(...).AddDiagnoser(MemoryDiagnoser.Default)`, or subclass `ManualConfig` and apply it with `[Config(typeof(MyConfig))]` on the class or assembly. `ManualConfig.CreateEmpty()` drops every logger, exporter and column; `ManualConfig.CreateMinimumViable()` keeps the default columns and console logger.

## Running

Output is hundreds of lines per case. Build once, redirect to a file, and run a subset per invocation so each call stays short:

```bash
dotnet build -c Release bench/MyBench
dotnet run -c Release --no-build --project bench/MyBench -- --filter "*Parse*" --job Dry --noOverwrite > bench.log 2>&1
dotnet run -c Release --no-build --project bench/MyBench -- --filter "*Parse*" --noOverwrite > bench.log 2>&1
```

- Run `--job Dry` first (about a second per case, no real measurement) to catch setup exceptions and validation errors.
- Use `--job Short` while iterating on design; use the default job or `--job Medium` for numbers you will report.
- `--noOverwrite` writes each run's results to a timestamped folder instead of overwriting `BenchmarkDotNet.Artifacts/results/`; `--artifacts <dir>` moves the output root.
- Read `*-report-github.md` under the artifacts folder for the summary table. Open `bench.log` only to investigate errors.

Cost: each case (method x parameter combination x job) takes roughly 15-25 s with the default job, about 5-8 s with `Short`. `[Params]` multiply: 3 values x 4 values x 5 methods = 60 cases, about 20 minutes. Estimate the case count before starting a run.

## Filters

`--filter` takes globs (`*`, `?`), case-insensitive, anchored to the whole name. Each pattern is matched against `Namespace.Class.Method` and the parameterized form `Namespace.Class.Method(N: 100)`. Several `--filter` values are OR'd.

| Goal | Pattern |
| --- | --- |
| Everything | `--filter "*"` |
| One method | `--filter "*.Parse"` or `--filter "*Parse"` |
| One class | `--filter "*ParserBenchmarks*"` |
| Two methods | `--filter "*MethodA" --filter "*MethodB"` |

`--filter "Parse"` does not match `My.Ns.Bench.Parse` because of anchoring; use a leading `*`. `--list flat` (or `tree`) prints the names BenchmarkDotNet filters on. `[BenchmarkCategory("x")]` plus `--anyCategories` / `--allCategories` filters by category; with `--filter` too, both must match. `--join` prints one combined table for all selected classes.

## Writing correct benchmarks

- **Return the result.** A `void` method whose result is unused can be partly removed by the JIT. Methods with an observable side effect (`Array.Sort` on a field) can stay `void`.
- **Keep inputs out of constants.** Literal or `const` inputs let the JIT fold the computation. Read inputs from fields, `[Params]` or `[Arguments]`.
- **Set up in `[GlobalSetup]`.** Work inside the benchmark method is measured. `[GlobalSetup(Target = nameof(A))]` or `Targets = new[] {...}` scopes setup to specific methods; `[GlobalSetup]`/`[GlobalCleanup]` may return `Task`.
- **Use `[IterationSetup]` only to reset mutated state.** It forces `InvocationCount=1` and `UnrollFactor=1`, so the operation must take hundreds of milliseconds for one invocation to measure reliably. It must be synchronous.
- **No manual loops.** The pilot stage picks the invocation count. When per-invocation setup can't move out (a `Span<T>` local), repeat the operation unrolled N times and declare `[Benchmark(OperationsPerInvoke = N)]`.
- **Keep it idempotent.** A benchmark that grows a list every call gets slower as it runs.
- **Materialize deferred work.** Returning `IEnumerable<T>` or `IQueryable<T>` measures only query construction; BenchmarkDotNet's deferred-execution validator rejects it. Call `.ToList()` or `.Consume(consumer)` with a `Consumer` field.
- **Async only for async code.** `Task`/`ValueTask` benchmarks are awaited automatically; wrapping a synchronous call in `async` adds state-machine cost to the measurement.
- **Seed randomness** (`new Random(42)`) and generate enough values that the distribution is representative.
- **Class constraints:** public, non-sealed, non-static, non-abstract class; public instance benchmark methods.
- **Mark a baseline** when comparing: `[Benchmark(Baseline = true)]` for methods in one job, `.AsBaseline()` for one job among several.

## Parameterization

| Feature | Target | Use when |
| --- | --- | --- |
| `[Params(...)]` | field/property | Values needed in setup; applies to every method in the class |
| `[ParamsSource(nameof(M))]` | field/property | Computed values; `M` returns `IEnumerable<T>` |
| `[ParamsAllValues]` | bool/enum field | Every value |
| `[Arguments(...)]` | method | Inline values for one method; setup time excluded |
| `[ArgumentsSource(nameof(M))]` | method | `IEnumerable<T>` for one parameter, `IEnumerable<object[]>` for several |
| `[GenericTypeArguments(typeof(int))]` | generic class | Vary type parameters, one attribute per closed type |

If methods need different parameter ranges, split them into separate classes. Use geometric sizes (100, 1,000, 10,000) to expose scaling.

## Comparison strategies

A single number says little; decide the comparison axis first.

1. **Approaches side by side (preferred):** two methods in one class, one marked `Baseline = true`.
2. **Runtimes:** `dotnet run -c Release --framework net10.0 -- --filter "*" --runtimes net8.0 net10.0` (the first runtime listed is the baseline), or jobs with `Job.Default.WithRuntime(CoreRuntime.Core80).AsBaseline()`.
3. **Package versions:** make the version an MSBuild property and give each job `WithMsBuildArguments("/p:MyLibVersion=1.0.0").WithId("v1")`, one `.AsBaseline()`:

   ```xml
   <PropertyGroup><MyLibVersion Condition="'$(MyLibVersion)' == ''">2.0.0</MyLibVersion></PropertyGroup>
   <ItemGroup><PackageReference Include="MyLibrary" Version="$(MyLibVersion)" /></ItemGroup>
   ```

4. **Before/after a code change:** `dotnet build src/MyLib -c Release -o saved-baseline` before editing, then reference it conditionally and add two jobs (`/p:BaselineDll=...` baseline vs current):

   ```xml
   <ProjectReference Condition="'$(BaselineDll)' == ''" Include="..\MyLib\MyLib.csproj" />
   <Reference Condition="'$(BaselineDll)' != ''" Include="MyLib"><HintPath>$(BaselineDll)</HintPath></Reference>
   ```

5. **Runtime settings:** jobs that differ by `WithGcServer(true)`, `WithEnvironmentVariable("DOTNET_TieredPGO", "0")` and so on.
6. **Input scale:** `[Params]` on a size.

Hardware, OS and historical comparisons need separate runs; record machine, OS, runtime and BenchmarkDotNet version beside the numbers.

## Reading results

- `Ratio` is the mean of per-operation current/baseline ratios: `0.85` is about 15% faster. `RatioSD` is its spread. No baseline, no ratio column. Method baselines and job baselines are separate mechanisms; using the wrong one gives no ratio.
- `Error` is half the 99.9% confidence interval. If it is large next to `Mean`, the result is noise; rerun with more iterations or a quieter machine rather than reading the difference.
- `--statisticalTest 5%` (or `StatisticalTestColumn.Create(threshold: "5%")` in config) adds a Mann-Whitney `Faster`/`Same`/`Slower` verdict with that equivalence margin.

## Apples-to-apples runs

When comparing jobs (strategies 2-5), each job's pilot may choose a different invocation count. `--apples` pilots the baseline job once per case, then runs every job with that fixed count, and disables outlier removal. It needs at least two jobs with exactly one baseline and a fixed iteration count:

```bash
dotnet run -c Release --framework net10.0 -- --filter "*" --runtimes net8.0 net10.0 --apples --job short
```

It does not apply to strategies 1 and 6, which use a single job.
