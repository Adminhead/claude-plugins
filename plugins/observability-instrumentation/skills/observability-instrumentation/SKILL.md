---
name: observability-instrumentation
description: Adds and reviews production telemetry in application code (structured logs, metrics, OpenTelemetry traces, profiles, alerts) plus SLIs, SLOs and burn-rate alerts. Use when instrumenting a service or feature, adding spans or metrics, correlating logs with traces, choosing metric labels, or defining alerts or SLOs.
---

# Observability instrumentation

Observability is the ability to explain what a running system is doing from its outputs. Instrument a feature while writing it, because adding signals after an incident means the data you need is already gone. Checked against OpenTelemetry docs, Prometheus docs, the Google SRE workbook and the structlog docs (see the reference files for specifics).

Not for writing PromQL or Prometheus config (the `promql` skill), Grafana dashboards (`grafana-dashboards`), incident write-ups (`postmortem`), or Sentry SDK setup (`sentry-sdk`, if installed).

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

1. Write down 2 to 4 questions an on-call engineer will ask about this feature before adding anything ("What share of payments succeed on the first try?", "When one fails for good, why?", "Is the provider slower than usual?"). Every signal you add must help answer one of them. If you cannot name the questions, ask the user; instrumenting without them logs everything and explains nothing.
2. Find what exists. Check for an OTel SDK, a Prometheus client, the logging library, and any exporter or collector config. Extend the existing setup instead of adding a second one.
3. For each question, add the signal that answers it (table above). Use the language's own instrumentation libraries for HTTP, gRPC, and database clients before writing manual spans.
4. Correlate the signals. Put a request or correlation ID and the `trace_id` and `span_id` on every log line, so a log leads to its trace. When several entry points (scheduler, replay endpoint, CLI) write to one log, also stamp the entry point where the run starts and propagate it with the ID.
5. Verify the telemetry itself: trigger the path and look at the real output (structured fields present, series with the expected labels, one unbroken trace).
6. Run through the Definition of Done below.

## Rules that prevent the common failures

- Emit structured logs (JSON) with fixed keys and the request context. Log an error once, where it is handled; wrap and return it elsewhere. Logging and returning the same error produces duplicates up the stack.
- Never log secrets, tokens, or personal data. Allowlist fields rather than logging whole requests, and log an opaque or hashed account key instead of a raw user ID or email when a person identifier is needed at all.
- Keep metric labels bounded. Every distinct label combination is a separate time series, so user IDs, full URLs, and error messages exhaust memory. Use the route pattern, not the raw path.
- Measure latency with histograms. Summary quantiles cannot be aggregated across instances; histograms can, through `histogram_quantile()`.
- Pass the request context through every call. Spans, deadlines, and trace propagation all ride on it, and a call that drops it breaks the trace.
- Record an error on a span only when the operation fails and the error reaches the caller. Handled or retried errors do not belong on the span.
- Alert on symptoms users feel (errors, latency, saturation, burn rate), not on causes such as CPU. Every alert needs a `for:` duration and a runbook link.
- Sample traces deliberately. Tracing everything is expensive at scale; see `references/tracing.md`.

## Definition of Done

- [ ] The on-call questions are written down, and each new signal maps to one.
- [ ] Metrics: a counter for operations and errors, a histogram for latency, a gauge for saturation (queues, pool use). Names use base units and a `_total` suffix on counters.
- [ ] Logs: structured, level-appropriate, context attached, no secrets or personal data, each error handled once.
- [ ] Traces: spans on service methods, database queries, and outbound calls, with errors recorded as above.
- [ ] Correlation: a correlation ID and `trace_id` appear in logs; context propagates to downstream calls.
- [ ] The new telemetry was observed in real output, not only written.
- [ ] Alerts and dashboard queries exist for the new metrics, or a ticket tracks them.

## References

- `references/logging.md`. Read when adding or reviewing structured logging, correlation IDs (including Python structlog contextvars), or log/trace correlation.
- `references/metrics.md`. Read when declaring metrics, choosing instrument types, or fixing cardinality.
- `references/tracing.md`. Read when adding spans, propagation, sampling, or error recording.
- `references/alerting.md`. Read when writing alert rules or choosing what to page on.
- `references/slo.md`. Read when defining SLIs, SLOs, error budgets, or burn-rate alerts.
- `references/profiling.md`. Read when enabling pprof or continuous profiling.

For Sentry error tracking setup, use the `sentry-sdk` skill if it is installed. This skill covers the OpenTelemetry and Prometheus path.

Step 1 (on-call questions first) and the entry-point field are adapted from addyosmani/agent-skills `observability-and-instrumentation` (MIT, Copyright (c) 2025 Addy Osmani). The structlog contextvars pattern in `references/logging.md` is adapted from wshobson/agents `python-observability` (MIT, Copyright (c) 2024 Seth Hobson). See `LICENSE` in the plugin root.
