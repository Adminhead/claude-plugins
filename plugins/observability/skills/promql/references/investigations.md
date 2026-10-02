# Investigation workflows

Replace `<job>` and metric names with the real ones, and discover them first with `/api/v1/label/__name__/values` or `promql metrics`.

## RED (a service)

```promql
sum(rate(http_requests_total{job="<job>"}[5m]))                                   # rate
sum(rate(http_requests_total{job="<job>",code=~"5.."}[5m])) / sum(rate(http_requests_total{job="<job>"}[5m]))   # errors
histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{job="<job>"}[5m])))             # duration
```

Break a bad number down: `sum by (route)`, then `sum by (instance)`, then isolate the one instance with the problem and compare it with its peers.

## USE (a resource)

```promql
1 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle"}[5m]))     # CPU utilization
node_load1 / count by (instance) (node_cpu_seconds_total{mode="idle"})    # CPU saturation proxy
1 - node_memory_MemAvailable_bytes / node_memory_MemTotal_bytes           # memory utilization
rate(node_disk_io_time_seconds_total[5m])                                 # disk utilization
rate(node_network_receive_errs_total[5m])                                 # errors
```

Metric names here are node_exporter's; other exporters differ.

## Useful functions

| Need | Function |
| --- | --- |
| Per-second rate of a counter | `rate(x[5m])` |
| Total over a window | `increase(x[1h])` |
| Share of observations under a bound | `histogram_fraction(0, 0.5, x)` (native histograms) |
| Trend and time to exhaustion | `predict_linear(x[6h], 4*3600)`, `deriv(x[1h])` |
| Quantile of a gauge over time | `quantile_over_time(0.95, x[1h])` |
| Detect a vanished series | `absent(x{job="<job>"})`, `absent_over_time(x[10m])` |
| Reshape labels | `label_replace(...)` |
| Floor a value | `clamp_min(x, 0)` |

## Data gaps

1. `up{job="<job>"}`. A `0` means the last scrape failed; the application may be fine.
2. No `up` series at all points to service discovery or a relabel rule dropping the target. Check `/api/v1/targets`.
3. `up` is `1` but the metric is missing: the exporter no longer emits it, or `metric_relabel_configs` drops it. Check `absent()` against the exact name.
4. Gaps shorter than the range window are smoothed by `rate()`; they are real gaps in raw data.
