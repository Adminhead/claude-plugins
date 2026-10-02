# Server-side config

## Layout

`prometheus.yml` holds `global` (`scrape_interval`, `evaluation_interval`), `rule_files`, `alerting` (Alertmanager targets), and `scrape_configs`.

```yaml
global:
  scrape_interval: 30s
  evaluation_interval: 30s
rule_files: ["rules/*.yml"]
alerting:
  alertmanagers:
    - static_configs: [{targets: ["alertmanager:9093"]}]
scrape_configs:
  - job_name: api
    metrics_path: /metrics
    authorization: {credentials_file: /etc/prometheus/secrets/api-token}
    static_configs: [{targets: ["api-1:8080", "api-2:8080"]}]
    metric_relabel_configs:
      - {source_labels: [__name__], regex: "go_gc_.*", action: drop}
```

- Pick one scrape interval for most jobs (15 to 60 seconds is typical). Set a longer one only for slow targets.
- Use `kubernetes_sd_configs` for Kubernetes discovery, then `relabel_configs` to select and name targets. `relabel_configs` runs before the scrape; `metric_relabel_configs` runs on scraped samples and is the place to drop expensive series.
- Reference credentials with `credentials_file` or `*_file` fields, never inline.

## Recording rules

Precompute expensive or repeated expressions. Name them `level:metric:operations`, where level is the aggregation labels, and drop `_total` when applying `rate()`.

```yaml
groups:
  - name: api-rules
    rules:
      - record: job_route:http_requests:rate5m
        expr: sum without (instance) (rate(http_requests_total[5m]))
```

Aggregate ratios by summing numerator and denominator separately, then dividing. Use `without` and list the labels you remove, so labels such as `job` survive.

## Alerting rules

```yaml
groups:
  - name: api-alerts
    rules:
      - alert: HighErrorRatio
        expr: job:http_errors:ratio_rate5m > 0.05
        for: 10m
        keep_firing_for: 5m
        labels: {severity: page}
        annotations:
          summary: "{{ $labels.job }} error ratio above 5%"
          runbook_url: "<runbook-url>"
```

## Alertmanager

The config has a `route` tree (`receiver`, `group_by`, `group_wait`, `group_interval`, `repeat_interval`, child `routes` matched by labels), `receivers`, and `inhibit_rules` (`source_matchers`, `target_matchers`, `equal`). The root route must match all alerts. Group by `alertname` and the service label so one outage sends one notification. Use inhibition to silence downstream symptoms while the root alert fires. Secrets use `*_file` fields (for example `api_url_file`, `api_key_file`) so the config can be committed.

## Validate

```bash
promtool check config prometheus.yml        # also checks referenced rule files
promtool check rules rules/*.yml
promtool test rules tests/api-alerts.test.yml
amtool check-config alertmanager.yml
```

Rule test file:

```yaml
rule_files: ["../rules/api-alerts.yml"]
evaluation_interval: 1m
tests:
  - interval: 1m
    input_series:
      - {series: 'job:http_errors:ratio_rate5m{job="api"}', values: '0.08x20'}
    alert_rule_test:
      - eval_time: 15m
        alertname: HighErrorRatio
        exp_alerts:
          - exp_labels: {severity: page, job: api}
            exp_annotations: {summary: "api error ratio above 5%", runbook_url: "<runbook-url>"}
```

Series notation: `a+bxn` steps by b, `axn` repeats a, `_` is a missing sample. Add a case where the alert must not fire. Reload a running server with a `SIGHUP` or `POST /-/reload` (the latter needs `--web.enable-lifecycle`).

## Self-monitoring

Alert on `up == 0` for each job and on Prometheus's own rule-evaluation and scrape failures. For high availability, run two identical Prometheus servers; use Thanos, Mimir, or similar for long-term storage and global views.
