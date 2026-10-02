# SLIs, SLOs, and error budgets

## Terms

- SLI: a measured ratio of good events to valid events.
- SLO: the target for the SLI over a window, such as 99.9 percent over 28 days.
- Error budget: `1 - SLO`. A 99.9 percent SLO allows 0.1 percent bad events, about 43 minutes of full outage in 30 days.

## SLI types

| Type | Good event | PromQL shape |
| --- | --- | --- |
| Availability | non-5xx response | `sum(rate(http_requests_total{code!~"5.."}[5m])) / sum(rate(http_requests_total[5m]))` |
| Latency | response under threshold | `sum(rate(http_request_duration_seconds_bucket{le="0.5"}[5m])) / sum(rate(http_request_duration_seconds_count[5m]))` |
| Freshness / durability | write succeeded, data under N minutes old | success counter over total counter |

The latency form needs `0.5` to be an actual bucket edge. Measure at the load balancer or server, close to what users experience. Pick SLOs from user expectations and current performance, not a round number.

## Error budget policy

Agree in advance what happens as the budget drains, for example: normal pace above 50 percent remaining; review risky changes below 50; freeze non-critical changes below 10; reliability work only at 0. Write the policy where the team can find it, since the argument happens when the budget is gone.

## Multi-window burn-rate alerts

Burn rate is the error ratio divided by the budget (`1 - SLO`). A rate of 1 spends the budget exactly over the window. Alerting needs both a long and a short window, so the alert fires on a real, ongoing burn and clears quickly after recovery. The Google SRE workbook recommends:

| Severity | Burn rate | Long window | Short window | Budget spent |
| --- | --- | --- | --- | --- |
| Page | 14.4 | 1h | 5m | 2% |
| Page | 6 | 6h | 30m | 5% |
| Ticket | 1 | 3d | 6h | 10% |

Recording rules for a 99.9 percent availability SLO (budget 0.001):

```yaml
groups:
  - name: slo-availability
    rules:
      - record: job:sli_errors:ratio_rate1h
        expr: sum by (job) (rate(http_requests_total{code=~"5.."}[1h])) / sum by (job) (rate(http_requests_total[1h]))
      - record: job:sli_errors:ratio_rate5m
        expr: sum by (job) (rate(http_requests_total{code=~"5.."}[5m])) / sum by (job) (rate(http_requests_total[5m]))
      - alert: ErrorBudgetFastBurn
        expr: job:sli_errors:ratio_rate1h > (14.4 * 0.001) and job:sli_errors:ratio_rate5m > (14.4 * 0.001)
        labels: {severity: page}
        annotations: {summary: "{{ $labels.job }} is burning error budget at over 14.4x", runbook_url: "<runbook-url>"}
```

Add the 6x pair (6h and 30m) the same way. Recording rules for the 6h, 30m, and 3d windows follow the `level:metric:operations` naming in `observability:promql`. Do not compute a 28-day SLI with a single `rate(...[28d])` in a live alert; it is expensive and slow to react.

Sources: Google SRE Workbook, "Alerting on SLOs"; Prometheus recording-rule naming.
