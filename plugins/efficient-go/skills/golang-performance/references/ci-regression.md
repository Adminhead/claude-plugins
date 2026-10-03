# Benchmark regression checks in CI

Read this when you add a CI job that compares benchmarks between a base and a head commit.

## Principles

- Benchmarks on shared runners are noisy because neighbors share CPU, hardware differs between jobs, and clocks throttle. Expect several percent variance even on a quiet runner.
- Compare base and head in the same job on the same machine. Don't compare against stored absolute numbers from another run.
- Use `-count=10` or more and `benchstat`, and fail only on changes it calls significant and larger than a threshold. Choose the threshold from observed A/A noise on that runner, and start wide (10 to 20%) on shared runners.
- Gate on stable metrics first. `allocs/op` and `B/op` barely vary between runs, while `ns/op` does.
- Don't retry a job until it passes. Fix the noise (more samples, a dedicated runner, a wider threshold) instead.
- Treat a failure as a prompt to look, not proof. Rerun the comparison locally with interleaved runs (see [benchstat.md](benchstat.md)).

## Tooling

`benchdiff` (`go install filippo.io/mostly-harmless/benchdiff@latest`, or pin a version) runs the benchmarks on two Git refs and prints a benchstat table. Flags after `--` go to `go test`.

```sh
benchdiff -base-ref origin/main -- -bench=. -benchmem -count=10 ./...
```

`-head-ref` defaults to the working tree, and `-clear-cache` resets its cache. It prints a comparison table. Don't assume it fails the job on a regression. Check its exit code on a deliberate slowdown, and if it doesn't fail, add a step that compares the `vs base` column against your threshold.

For a self-managed approach, build both refs with `go test -c`, alternate the runs as shown in [benchstat.md](benchstat.md), and run `benchstat` on the two files.

## Workflow shape

A job that checks out the base ref and head ref (full history, `fetch-depth: 0`), runs the comparison, uploads the benchstat text as an artifact, and fails when a metric on a named hot-path benchmark exceeds the threshold. Pin or reference the actions per the repo's convention (`github:actions` if installed). Run it on pull requests that touch the packages with benchmarks rather than on every change.

## Dedicated runners

On a self-hosted runner reserved for benchmarks, reducing system noise helps: a fixed CPU frequency governor, turbo boost off, SMT off, and pinning with `taskset`. These change kernel settings, so apply them only on machines that exist for benchmarking, never on a developer machine or shared host.
