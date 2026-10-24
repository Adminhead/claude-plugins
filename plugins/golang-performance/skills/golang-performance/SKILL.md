---
name: golang-performance
description: 'Measurement-first Go performance work: benchstat comparisons, pprof and execution traces, escape analysis, GC and GOMEMLIMIT tuning, CI regression checks. Use when Go code is slow or allocates or uses too much memory, when writing or comparing benchmarks, reading a profile, or claiming a speedup.'
---

# Go performance

Not for idiomatic Go or correctness (`golang`), general test strategy (`unit-testing`), production metrics and dashboards (`observability-instrumentation`), or CI workflow authoring (`gh-actions`).

Measure first, change one thing, measure again with the same method. A speedup counts only when a like-for-like comparison shows it. Check Go and tool versions with `go version`, and compare benchmarks only on the same toolchain, since a new Go release changes allocator and compiler behavior independent of your code.

## Workflow

1. **Pick the metric and the workload.** Name one target (latency, throughput, bytes allocated, RSS, CPU) and a representative input. Without both, results can't be compared.
2. **Rule out outside time.** If the profile shows low CPU but high latency, the bottleneck may be a database, an upstream call, or lock waits, so reducing allocations won't help. A goroutine profile full of `net.(*conn).Read` or `database/sql` stacks, or a wall-clock profiler such as `fgprof`, confirms it. See [references/pprof.md](references/pprof.md).
3. **Record a baseline.** Write a benchmark and capture at least 10 runs. Read [references/benchstat.md](references/benchstat.md) for the commands, pre-compiled interleaved runs, and how to read the output.
4. **Locate the cost.** Profile the benchmark (`-cpuprofile`, `-memprofile`), then read it with `go tool pprof`. Pick the tool from the table below.
5. **Change one factor.** Apply one fix from the table, with a comment saying why it is faster when the code looks odd.
6. **Remeasure and decide.** Run the same command on the same machine, compare with `benchstat`, and keep the change only if the difference is significant and the code stays readable. Put the benchstat output in the commit body.

## Bottleneck to fix

| Signal | Likely cause | Go to |
| --- | --- | --- |
| `alloc_objects` high, `runtime.mallocgc` or `scanobject` near the top of the CPU profile | Allocation churn | [references/patterns.md](references/patterns.md), then confirm with [references/compiler-analysis.md](references/compiler-analysis.md) |
| One function dominates flat CPU | Hot loop, algorithm, or reflection | [references/patterns.md](references/patterns.md) |
| GC share high, or the container is OOM-killed | GC pacing or memory limit | [references/runtime-tuning.md](references/runtime-tuning.md) |
| Low CPU, high latency, goroutines blocked | I/O wait, contention, scheduling | Trace and block/mutex profiles in [references/pprof.md](references/pprof.md) |
| Same work done repeatedly | Missing cache or hoisting | [references/patterns.md](references/patterns.md) |
| Benchmark passes locally, regresses in production | Different input, GC, or CPU limit | Profile production with `net/http/pprof`, then [references/runtime-tuning.md](references/runtime-tuning.md) |

## Common mistakes

- Optimizing before profiling. Intuition about the hot spot is often wrong, and an unmeasured change adds code for nothing.
- Treating one benchmark run, or a result marked `~`, as evidence. benchstat needs several runs to say anything.
- Rerunning until a result turns significant. That selection bias produces false wins, so raise `-count` once and accept the answer.
- Comparing runs from different machines, power states, or Go versions.
- Reaching for `unsafe`, `sync.Pool`, or manual pooling without a profile that shows the allocation matters. Each trades safety or clarity for speed.
- Benchmarking a toy input. Allocation and cache behavior change with size, so use sub-benchmarks over realistic sizes.

## CI regression checks

Compare base and head in the same job on the same runner, with `-count` of 10 or more and `benchstat`, and set the threshold well above shared-runner noise. Read [references/ci-regression.md](references/ci-regression.md) when adding or tuning such a check. Follow the repo's action-pinning convention (the `gh-actions` skill, if installed) when you write the workflow.

Adapted in part from [samber/cc-skills-golang](https://github.com/samber/cc-skills-golang) (MIT; see LICENSE at the plugin root).
