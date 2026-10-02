# Benchmarks and benchstat

Read this when writing a Go benchmark, running a before/after comparison, or reviewing a performance claim.

Install the comparison tool with `go install golang.org/x/perf/cmd/benchstat@latest`, or pin a version in CI.

## Write the benchmark

- Prefer `b.Loop()` (Go 1.24+). It resets the timer on its first call and stops it when the loop ends, so setup before the loop is not measured, and it keeps call arguments and results alive so the compiler can't delete the body. Keep an older `for i := 0; i < b.N; i++` loop only when the module supports older Go or the benchmark already exists. In that style, call `b.ResetTimer()` after setup and assign results to a package-level sink.
- Benchmark one operation per function, and use `b.Run` sub-benchmarks for input sizes. Allocation and cache behavior change with size.
- Call `b.ReportAllocs()` or pass `-benchmem` to see `B/op` and `allocs/op`. Allocation count is the most stable signal on a noisy machine.
- Keep fixtures sized for measurement out of the unit-test files if they would slow `go test`. A `_bench_test.go` file next to the code is a common convention.

## Measure

```sh
go test -run='^$' -bench=BenchmarkParse -benchmem -count=10 ./pkg/parser | tee old.txt
# change the code
go test -run='^$' -bench=BenchmarkParse -benchmem -count=10 ./pkg/parser | tee new.txt
benchstat old.txt new.txt
```

`-run='^$'` skips unit tests. `-count` repeats the whole benchmark, which gives benchstat the samples it needs. Use the same flags for both runs.

## Read the output

- Each cell is the median with a 95% confidence interval (`± 2%`). A wide interval means a noisy measurement, so fix the noise before comparing.
- `vs base` is the change from the first file. The p-value comes from a Mann-Whitney U-test, and `n` is the sample count.
- A `~` means no statistically significant difference. Don't claim a win, and don't rerun until the `~` goes away.
- At a 0.05 threshold about 1 in 20 unchanged benchmarks will still look significant, so ignore an isolated hit.
- benchstat normalizes `ns/op` to `sec/op`.

## Why runs must be interleaved

Back-to-back runs (all old, then all new) pick up drift from thermal throttling, frequency scaling, and background load. Even identical code can show a "significant" difference. In a test of the same function compared against itself on a quiet desktop, benchstat reported `+4.80% (p=0.002 n=6)` with identical code. This does not happen every time, but it shows why a single sequential comparison is weak. To reduce the bias, compile both versions once and alternate:

```sh
go test -c -o old.test ./pkg/parser     # on the baseline commit
go test -c -o new.test ./pkg/parser     # on the changed code
for i in $(seq 10); do
  ./old.test -test.run='^$' -test.bench=BenchmarkParse -test.benchmem >> old.txt
  ./new.test -test.run='^$' -test.bench=BenchmarkParse -test.benchmem >> new.txt
done
benchstat old.txt new.txt
```

Compiling first also keeps build time out of the measurement.

## How many runs

| Goal | `-count` |
| --- | --- |
| Quick local look | 6 (the fewest samples benchstat will give a 95% interval for) |
| Pre-merge comparison | 10 |
| Change under 5%, or a noisy runner | 20 or more |

Raise the count once if the result is `~` and you still need an answer. Don't loop until it flips.

## Useful benchstat forms

- `benchstat bench.txt` with one file summarizes variance. Run it before editing to check that the benchmark is stable.
- `benchstat -col /size bench.txt` compares sub-benchmark values inside one file.
- `benchstat -filter '.name:Parse' old.txt new.txt` restricts the comparison. Flags `-table`, `-row`, `-col`, and `-ignore` control grouping.
- `benchstat base=old.txt new=new.txt` labels the columns.

## Reporting a result

When a change is a performance change, put the relevant benchstat rows in the commit message with the `goos/goarch/cpu` header. Include only affected benchmarks. Leave out rows marked `~`, since they show no effect.
