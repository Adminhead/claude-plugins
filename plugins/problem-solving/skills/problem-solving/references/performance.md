# Performance problems

Read this when the discrepancy is latency, throughput, or another measured cost.

- Report percentiles (p50, p95, p99) and throughput rather than a mean, because tail latency is what users feel and a mean hides it. Add queue depth, freshness, or hit rate when they apply.
- Time each segment of the hot path. The slowest segment is rarely the one you suspect.
- Don't skip validation or serve stale data to win a number.
- Measure like workloads and record the baseline, the measurement, and the variance. One noisy run proves nothing.
- With several optimization variants, keep a table (variant, hypothesis, command, result, correct?) and compare each against the last accepted version, not only the previous run. A variant counts only if the correctness checks still pass.
- An unattended multi-variant search belongs in `experiment-loop`, if installed.
