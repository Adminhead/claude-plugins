---
name: dotnet-performance
description: "Measurement-first .NET performance work: hot-path anti-pattern scans (async, allocations, strings, LINQ, regex, JSON, I/O), BenchmarkDotNet setup and result reading, and SIMD with TensorPrimitives or Vector128. Use when C# code is slow or allocates too much, to review a hot path, write or compare benchmarks, or vectorize a loop."
---

# .NET performance

Not for collecting traces or dumps from a running process (`dotnet-diagnostics`), slow builds (`msbuild`), EF Core query tuning (`ef-core`), general C# correctness (`csharp`), test strategy (`unit-testing`), or production metrics (`observability-instrumentation`).

Measure first, change one thing, measure again the same way. A speedup counts only when a like-for-like BenchmarkDotNet comparison or a before/after profile shows it. Check the TFM and SDK (`dotnet --version`, `<TargetFramework>`) before suggesting an API: many fixes below need .NET 7, 8 or 9.

## Gate: is this a hot path?

Before scanning or rewriting, establish one of:

- a profile or trace that names the method (from the `dotnet-diagnostics` skill, or BenchmarkDotNet's `EventPipeProfiler`),
- a benchmark that reproduces the slowness,
- the user naming the code as performance-critical (request path, tight loop, parser, serializer).

Without any of these, report only Critical findings and say the rest matter only if profiling shows the code is hot. Never trade readability for a micro-optimization in code that runs rarely. If the profile shows low CPU but high latency, the time is outside the code (database, network, locks, thread-pool starvation); go to `dotnet-diagnostics` for counters and traces instead of tuning allocations.

## Workflow: scan a hot path

1. **Load the critical patterns.** Read [references/critical-patterns.md](references/critical-patterns.md) every time: sync-over-async, double-awaited `ValueTask`, `stackalloc` in loops, culture-sensitive comparisons, uncached `JsonSerializerOptions` and `HttpClient`, catastrophic regex backtracking.
2. **Detect signals and load only matching references.** Use codebase-memory (`search_graph`, `search_code`) or the C# language server (csharp-ls) to find the callers and hot entry points, then grep the files:

   | Signal in code | Read |
   | --- | --- |
   | `async`, `await`, `Task`, `ValueTask`, `Channel`, `Parallel`, shared counters | [references/async-patterns.md](references/async-patterns.md) |
   | `Span<`, `Memory<`, `stackalloc`, `ArrayPool`, `Substring`, `Replace(`, `ToLower()`, `+=` on strings in loops, `params` | [references/memory-and-strings.md](references/memory-and-strings.md) |
   | `Regex`, `[GeneratedRegex]`, `RegexOptions.Compiled` | [references/regex-patterns.md](references/regex-patterns.md) |
   | `Dictionary<`, `List<`, `.ToList()`, `.Where(`, `.Select(`, `static readonly Dictionary<` | [references/collections-and-linq.md](references/collections-and-linq.md) |
   | `JsonSerializer`, `HttpClient`, `Stream`, `FileStream`, static constructors | [references/io-and-serialization.md](references/io-and-serialization.md) |
   | Any class declarations (always check) | [references/structural-patterns.md](references/structural-patterns.md) |
   | A numeric loop over arrays or spans | [references/simd.md](references/simd.md) |

   For a full audit, read all of them.
3. **Scan with counts.** Read files under ~500 lines whole; then run each loaded reference's `## Detection` recipes and list every recipe with its hit count before classifying. Zero hits is a valid result. For absence patterns, count both sides ("12 of 140 classes are sealed"): the ratio sets severity.
4. **Check compound costs.** Look for `Replace` chains split across branches, a public method whose callees each allocate, `result += $"...{x.ToLower()}"` (several allocations on one line), and literal `string.Format` calls that interpolation could replace. Report the total per call, not per line. If one file uses an optimized form, check its siblings (same interface or base class) for the slow form.
5. **Classify.**

   | Severity | Criteria | Action |
   | --- | --- | --- |
   | Critical | Deadlock, crash, unbounded regex, >10x regression | Fix |
   | Moderate | 2-10x on a hot path, or a hot-path best practice | Fix on hot paths |
   | Info | Applies, but the code may not be hot | Only if profiling shows impact |

   Raise everything in user-named hot code to its maximum severity. Escalate an Info pattern to Moderate at 11+ instances, and flag 50+ as a codebase-wide issue.
6. **Report compactly.** Group by severity. One block per finding: `ID. Title (N instances)`, Impact (one line), Files (`File.cs:L42, ...`), Fix (one line), Caveat only when there is a version or correctness risk. Code only for non-obvious rewrites. Merge findings that share a fix. List good practices found as one-line bullets. End with a severity/count/top-issue table and a note that findings need benchmark confirmation before shipping.
7. **Prove the fixes you make.** For each change you apply, run a BenchmarkDotNet before/after (below) and the project's tests. Keep a change only if the improvement is outside the error bars and the code stays readable; put the result table in the commit body.

## BenchmarkDotNet

Read [references/benchmarkdotnet.md](references/benchmarkdotnet.md) before writing or running a benchmark, and [references/benchmarkdotnet-config.md](references/benchmarkdotnet-config.md) for diagnosers, exporters, job presets, or unstable results. Core rules:

- Name the comparison first: two approaches, two runtimes, two package versions, before/after a change, runtime settings, or input sizes. Mark a baseline (`[Benchmark(Baseline = true)]` or a job's `.AsBaseline()`) so the table shows `Ratio`.
- `dotnet add package BenchmarkDotNet` without a version (or the repo's CPM file). Build in Release.
- Pass `--filter` every time (`BenchmarkSwitcher` otherwise waits for interactive input), and check the entry point forwards `args`.
- Run `--job Dry` first, iterate with `--job Short`, report with the default job. Redirect output to a file and read `*-report-github.md`.
- Return results, read inputs from fields or `[Params]`, set up in `[GlobalSetup]`, no manual loops, materialize LINQ. Add `[MemoryDiagnoser]`.
- Estimate case count before running: methods x parameter values x jobs, about 20 s each with the default job.

## Common mistakes

| Mistake | Instead |
| --- | --- |
| Flagging every `Dictionary` for `FrozenDictionary` | Only when built once and never mutated, and read often |
| `Span<T>` in async methods | `Memory<T>` across awaits; `Span<T>` in synchronous code only |
| Blanket LINQ bans | LINQ is fine off the hot path; `Min`/`Max`/`Sum`/`Average` over arrays and lists of primitives are vectorized in .NET 8+ |
| `ConfigureAwait(false)` sold as a speedup | It belongs in library code for context reasons, not performance |
| `ValueTask` everywhere | Only on hot paths that usually complete synchronously |
| Flagging `new HttpClient()` in a DI service | Check for `IHttpClientFactory` or a typed client first |
| `[GeneratedRegex]` for runtime-built patterns | Only for compile-time literal patterns |
| `unsafe`, `CollectionsMarshal.AsSpan`, manual pooling | Only with a benchmark showing the gain; `Span<T>`, `stackalloc` and `ArrayPool` cover most cases safely |
| Sealing public types in a library | Breaking change for subclassers; limit to internal types or ask the maintainers |
| Comparing numbers from different machines, runtimes or Debug builds | Same machine, Release, same BenchmarkDotNet run where possible |
| One benchmark run, or rerunning until it looks good | Wider iteration counts once, then accept the answer |

## Gotchas

- Debug builds and attached debuggers disable JIT optimizations; BenchmarkDotNet refuses to run non-optimized assemblies unless forced.
- Tiered compilation and Dynamic PGO change code during warmup, so a hand-timed `Stopwatch` loop over a few iterations measures tier-0 code.
- `DOTNET_` environment variables such as `DOTNET_TieredPGO=0` or `DOTNET_EnableAVX2=0` don't affect code precompiled with ReadyToRun or Native AOT.

Adapted from [dotnet/skills](https://github.com/dotnet/skills) (MIT, .NET Foundation and Contributors; see LICENSE and NOTICE at the plugin root).
