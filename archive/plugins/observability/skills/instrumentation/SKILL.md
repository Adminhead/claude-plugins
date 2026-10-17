---
name: instrumentation
description: Add and review production observability in application code, covering structured logs, metrics, OpenTelemetry traces, profiles, and alerts, plus SLIs, SLOs, and burn-rate alerts. Language-agnostic with short Go, Python, and TypeScript snippets. Use when instrumenting a service, adding spans or metrics, correlating logs with traces, choosing metric labels, defining alerts or SLOs, or checking that a feature is observable. Not for writing PromQL or Prometheus config (`observability:promql`), Grafana dashboards (`observability:dashboards`), incident write-ups (`observability:postmortem`), or Sentry SDK setup (`sentry-core:sentry`, if installed).
---

# Instrumentation

Observability is the ability to explain what a running system is doing from its outputs. Instrument a feature while writing it, because adding signals after an incident means the data you need is already gone. Checked against OpenTelemetry docs, Prometheus docs, and the Google SRE workbook (see the reference files for specifics).

## The five signals

| Signal | Answers | Typical tool |
| --- | --- | --- |
| Logs | What happened in this one event? | Structured JSON logs |
| Metrics | How much, how fast, how often? | Prometheus client or OTel metrics |
| Traces | Where did this request spend its time? | OpenTelemetry spans |
| Profiles | Why is this CPU or memory hot? | pprof, py-spy, continuous profilers |
| Alerts | Who must act now? | Alert rules on metrics or SLO burn |

Pick the cheapest signal that answers the question. Metrics detect, traces localize, logs explain, and profiles find the code line.

## Workflow

1. Find what exists. Check for an OTel SDK, a Prometheus client, the logging library, and any exporter or collector config. Extend the existing setup instead of adding a second one.
2. For each new code path, add the signals below. Use the language's own instrumentation libraries for HTTP, gRPC, and database clients before writing manual spans.
3. Correlate the signals. Put `trace_id` and `span_id` on log lines so a log leads to its trace.
4. Run through the Definition of Done below.

## Rules that prevent the common failures

- Emit structured logs (JSON) with fixed keys and the request context. Log an error once, where it is handled; wrap and return it elsewhere. Logging and returning the same error produces duplicates up the stack. Never log secrets or personal data.
- Keep metric labels bounded. Every distinct label combination is a separate time series, so user IDs, full URLs, and error messages exhaust memory. Use the route pattern, not the raw path.
- Measure latency with histograms. Summary quantiles cannot be aggregated across instances; histograms can, through `histogram_quantile()`.
- Pass the request context through every call. Spans, deadlines, and trace propagation all ride on it, and a call that drops it breaks the trace.
- Record an error on a span only when the operation fails and the error reaches the caller. Handled or retried errors do not belong on the span.
- Alert on symptoms users feel (errors, latency, saturation, burn rate), not on causes such as CPU. Every alert needs a `for:` duration and a runbook link.
- Sample traces deliberately. Tracing everything is expensive at scale; see `references/tracing.md`.

## Definition of Done

- [ ] Metrics: a counter for operations and errors, a histogram for latency, a gauge for saturation (queues, pool use). Names use base units and a `_total` suffix on counters.
- [ ] Logs: structured, level-appropriate, context attached, no secrets or personal data, each error handled once.
- [ ] Traces: spans on service methods, database queries, and outbound calls, with errors recorded as above.
- [ ] Correlation: `trace_id` appears in logs; context propagates to downstream calls.
- [ ] Alerts and dashboard queries exist for the new metrics, or a ticket tracks them.

## References

- `references/logging.md`. Read when adding or reviewing structured logging and log/trace correlation.
- `references/metrics.md`. Read when declaring metrics, choosing instrument types, or fixing cardinality.
- `references/tracing.md`. Read when adding spans, propagation, sampling, or error recording.
- `references/alerting.md`. Read when writing alert rules or choosing what to page on.
- `references/slo.md`. Read when defining SLIs, SLOs, error budgets, or burn-rate alerts.
- `references/profiling.md`. Read when enabling pprof or continuous profiling.

For Sentry error tracking setup, use `sentry-core:sentry` if it is installed. This skill covers the OpenTelemetry and Prometheus path.
