# Metrics

## Instrument types

| Type | Use for | Example |
| --- | --- | --- |
| Counter | Totals that only rise | `http_requests_total`, `jobs_failed_total` |
| UpDownCounter / Gauge | Values that rise and fall | queue depth, open connections, in-flight requests |
| Histogram | Distributions | request duration, payload size |

OpenTelemetry names the same types Counter, UpDownCounter, Gauge, and Histogram, with asynchronous variants collected once per export cycle.

## Naming (Prometheus conventions)

- A short application prefix, then the measurement, then the unit: `myapp_http_request_duration_seconds`.
- Base units only: seconds, bytes, ratio (0 to 1). Never milliseconds or percent.
- Counters end in `_total`.
- Do not repeat the metric name inside labels.

## Cardinality

Each unique label combination is a new time series. Allowed label values must come from a small, fixed set: HTTP method, route template, status class, outcome. Keep user IDs, session IDs, raw URLs, and error strings out of labels; put them in logs or trace attributes. Before shipping a label, estimate its distinct values multiplied by the other labels. If the answer is unbounded, drop the label.

## Histograms over summaries

A summary computes quantiles inside each process, and quantiles from different processes cannot be combined. A histogram exposes bucket counts that sum across instances before `histogram_quantile()` runs. Prometheus recommends native histograms where the stack supports them, over classic histograms and summaries. Choose bucket boundaries around the SLO threshold so the threshold is a bucket edge.

## Snippets

Go (OTel):

```go
meter := otel.Meter("checkout")
requests, _ := meter.Int64Counter("checkout.requests")
latency, _ := meter.Float64Histogram("checkout.duration", metric.WithUnit("s"))
requests.Add(ctx, 1, metric.WithAttributes(attribute.String("route", route)))
latency.Record(ctx, time.Since(start).Seconds())
```

Python (OTel): `meter.create_counter("checkout.requests")`, `meter.create_histogram("checkout.duration", unit="s")`, then `.add(1, {"route": route})` and `.record(seconds, {"route": route})`.

TypeScript (OTel): `meter.createCounter("checkout.requests")`, `meter.createHistogram("checkout.duration", { unit: "s" })`, then `.add(1, { route })` and `.record(seconds, { route })`.

OTel metric names use dots; the Prometheus exporter converts them to underscores and appends unit suffixes. Check the exported names before writing PromQL against them.

## Exemplars

Attach a trace ID to a histogram observation so a latency spike links to a trace. Support depends on the client library and backend, so confirm both before relying on it.

## Process and runtime metrics

Export runtime metrics (GC pauses, heap, goroutines or threads, open file descriptors) through the client library's standard collectors. They answer saturation questions without custom code.
