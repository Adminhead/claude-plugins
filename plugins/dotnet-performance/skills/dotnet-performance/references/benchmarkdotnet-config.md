# BenchmarkDotNet: diagnosers, exporters, jobs and tuning

Contents: diagnosers (memory, disassembly, threading, EventPipe, hardware counters); columns and outliers; exporters; execution pipeline; job presets and run strategies; jobs vs mutators; tuning attributes; environment, GC and memory randomization.

Checked against BenchmarkDotNet 0.15.8 and the 0.16.0 previews.

## Diagnosers

| Diagnoser | Attribute | CLI | Adds |
| --- | --- | --- | --- |
| Memory | `[MemoryDiagnoser]` (`displayGenColumns: false` for bytes only) | `-m`, `--memory` | `Gen0/1/2` (collections per 1,000 ops), `Allocated` (bytes per op) |
| Disassembly | `[DisassemblyDiagnoser(maxDepth: 2)]` | `-d`, `--disasm`, `--disasmDepth N`, `--disasmDiff`, `--disasmFilter "M*"` | JIT-compiled assembly per benchmark (Markdown/HTML) |
| Threading | `[ThreadingDiagnoser]` | `-t`, `--threading` | `Completed Work Items`, `Lock Contentions` |
| EventPipe profiler | `[EventPipeProfiler(EventPipeProfile.CpuSampling)]` | `-p EP`, `--profiler EP` | `.nettrace` and `.speedscope.json` |
| Hardware counters | `[HardwareCounters(HardwareCounter.CacheMisses, ...)]` | `--counters CacheMisses+BranchMispredictions` | Counter columns; Windows only, elevated, via ETW |

- Add `[MemoryDiagnoser]` to almost every benchmark: allocation is often the cause and is deterministic, unlike time.
- `DisassemblyDiagnoserConfig` options: `maxDepth` (default 1), `syntax` (`Masm`, `Intel`, `Att`), `printSource` (needs PDBs: `<DebugType>pdbonly</DebugType><DebugSymbols>true</DebugSymbols>`), `exportDiff`, `exportCombinedDisassemblyReport`. Use it to confirm a bounds check, a devirtualization or a vector instruction actually happened.
- EventPipe profiles: `CpuSampling`, `GcVerbose`, `GcCollect`, `Jit`. The attribute form runs an extra iteration for profiling so timings stay clean; the `--profiler EP` CLI form attaches to the measured runs (timings include profiler overhead, profile fixed to CPU sampling). Open the `.speedscope.json` at speedscope.app or the `.nettrace` in PerfView; for production traces use the `dotnet-diagnostics` skill.
- Other `--profiler` values: `ETW` (Windows), `CV` (Concurrency Visualizer, Windows), `NativeMemory` (Windows).

## Columns and outliers

| Column | Meaning |
| --- | --- |
| `Mean` | Average time per operation |
| `Error` | Half-width of the 99.9% confidence interval |
| `StdDev` | Standard deviation (hidden when negligible) |
| `Median`, `P95` | Shown automatically for skewed or outlier-heavy data |
| `Ratio`, `RatioSD` | Relative to the baseline, only when one is marked |

Add columns with `[MedianColumn]`, `[MinColumn]`, `[MaxColumn]`, `[Q1Column]`, `[Q3Column]`, `[AllStatisticsColumn]`, `[RankColumn]`, `[OperationsPerSecond]`; hide them with `[HideColumns("Error", "StdDev")]` or `-h Error StdDev`.

Outliers: upper outliers are removed by default (`RemoveUpper`). `[Outliers(OutlierMode.DontRemove)]` or `--outliers DontRemove` keeps them, which is right when slow iterations are a real part of the behavior (GC pauses you care about).

## Exporters

Markdown (GitHub flavour) and CSV are on by default under `BenchmarkDotNet.Artifacts/results/`. `--exporters fulljson` (`JsonExporter.Full`) writes individual measurements for programmatic comparison; `--exporters json` writes the compressed form. Other names: `html`, `xml`, `csvmeasurements`, `briefjson`, `asciidoc`, `plain`.

## Execution pipeline

BenchmarkDotNet generates a harness project, builds it once per build partition (runtime, toolchain, platform, JIT, GC, configuration or MSBuild arguments differ), and runs each case in its own process. Per case, with the default job:

1. **JIT pre-call**, not measured.
2. **Pilot:** picks invocations per iteration, targeting about 500 ms per iteration (`IterationTime`). Methods slower than roughly a third of that run once per iteration.
3. **Overhead:** measures the harness loop and subtracts it. On by default in 0.15.x (`--noOverheadEvaluation` turns it off); off by default from 0.16.0, where the switch is obsolete.
4. **Warmup:** adaptive, usually 6-10 iterations; tiered JIT may recompile here.
5. **Actual:** adaptive, usually about 15 iterations, until the confidence interval is within `MaxRelativeError` (default 2%).

`UnrollFactor` (default 16) repeats the call inside the measurement loop to shrink loop overhead. It is an engine detail, unlike `OperationsPerInvoke`, which declares how many logical operations one call performs.

## Job presets and run strategies

| Preset | Per case | Warmup | Iterations | Launches |
| --- | --- | --- | --- | --- |
| `Dry` | <1 s | 0 | 1 | 1 (ColdStart; validation only) |
| `Short` | 5-8 s | 3 | 3 | 1 |
| Default | 15-25 s | adaptive | adaptive | 1 |
| `Medium` | 33-52 s | 10 | 15 | 2 |
| `Long` | 3-12 min | 15 | 100 | 3 |

Run strategies: `Throughput` (default; steady state, for microbenchmarks), `ColdStart` (one invocation per iteration, no pilot or warmup, first call includes JIT; for startup cost), `Monitoring` (one invocation per iteration with optional warmup; for noisy macrobenchmarks that never settle).

## Jobs vs mutators

A job attribute (`[SimpleJob(RuntimeMoniker.Net80)]`, `[ShortRunJob]`, `[MediumRunJob]`, `[LongRunJob]`, `[DryJob]`) adds a job; several stack. A setting attribute such as `[WarmupCount(3)]` is a mutator applied to every job, not a new job. CLI flags like `--warmupCount 3` are mutators too; `--job short` adds a standard job.

## Tuning attributes

| Attribute | Default | Job API | CLI |
| --- | --- | --- | --- |
| `[WarmupCount(N)]` | adaptive | `.WithWarmupCount(N)` | `--warmupCount N` |
| `[IterationCount(N)]` | adaptive | `.WithIterationCount(N)` | `--iterationCount N` |
| `[MinIterationCount(N)]` / `[MaxIterationCount(N)]` | 15 / 100 | `.WithMin/MaxIterationCount(N)` | `--minIterationCount` / `--maxIterationCount` |
| `[MinWarmupCount(N)]` / `[MaxWarmupCount(N)]` | 6 / 50 | `.WithMin/MaxWarmupCount(N)` | `--minWarmupCount` / `--maxWarmupCount` |
| `[InvocationCount(N)]` | pilot | `.WithInvocationCount(N)` | `--invocationCount N` |
| `[IterationTime(ms)]` | 500 ms | `.WithIterationTime(...)` | `--iterationTime ms` |
| `[ProcessCount(N)]` | 1 | `.WithLaunchCount(N)` | `--launchCount N` |
| `[MaxRelativeError(x)]` | 0.02 | `.WithMaxRelativeError(x)` | none |
| `[UnrollFactor(N)]` | 16 | `.WithUnrollFactor(N)` | `--unrollFactor N` |
| `[RunOncePerIteration]` | off | `.RunOncePerIteration()` | `--runOncePerIteration` |

Raise `--launchCount` when results differ between processes (layout or tiering luck); raise iteration counts when `Error` is wide.

## Environment, GC and memory randomization

- Runtimes: `[SimpleJob(RuntimeMoniker.Net80)]`, `Job.Default.WithRuntime(CoreRuntime.Core80)`, `--runtimes net8.0 net10.0`. Each runtime is a separate build and multiplies the case count.
- Environment variables: `job.WithEnvironmentVariable("KEY", "value")`, `--envVars KEY:VALUE`.
- GC: `[GcServer(true)]` / `.WithGcServer(true)`, `[GcConcurrent(false)]` / `.WithGcConcurrent(false)`.
- `[MemoryRandomization]` / `--memoryRandomization` allocates random-sized objects and stack between iterations to shift alignment, reruns `[GlobalCleanup]` and `[GlobalSetup]` after every iteration, and disables outlier removal. Use it when results look bimodal or swing between runs, to check whether a "win" is just memory layout.
