---
name: promql
description: Query and debug Prometheus-compatible backends (Prometheus, Thanos, Mimir, VictoriaMetrics) and write Prometheus server config. Covers PromQL rules for counters, histograms, and query cost, USE and RED investigations, data gaps via `up`, scrape configs, recording and alerting rules, Alertmanager routing, `promtool` checks and rule tests, and metric naming. Credentials are read from the environment or a credential file and never pasted into prompts or commands. Use when writing or tuning PromQL, investigating latency, errors, or saturation from metrics, or editing Prometheus and Alertmanager config. Not for application instrumentation or SLO design (`observability:instrumentation`) or Grafana dashboards (`observability:dashboards`).
---

# PromQL and Prometheus

Two jobs share this skill. Query work reads metrics to answer a question. Config work changes what Prometheus scrapes, records, and alerts on. Checked against the Prometheus docs (querying functions, recording and alerting rules, unit testing, Alertmanager configuration).

## Credentials

A credential must never pass through the prompt, a command line, or a file you write. Command arguments land in shell history and process listings.

- Read the token or password from an environment variable or a file the user created (`chmod 600`). Reference it by name or path.
- If a query fails with 401 or 403, or no host is configured, tell the user what to set and wait. Do not create or edit their credential file.
- Ask for the base URL only. Treat a URL with embedded `user:pass@` as a secret.

See `references/access.md` for the HTTP API and the optional `promql` CLI.

## Query rules

1. Apply `rate()` or `increase()` to counters. A raw counter only climbs, so its absolute value says nothing.
2. Filter in the innermost selector (`rate(http_requests_total{job="api"}[5m])`). Selectors are evaluated first, so late filtering scans every series.
3. Keep `le` in the grouping when aggregating a classic histogram: `histogram_quantile(0.99, sum by (le, route) (rate(x_bucket[5m])))`. Without `le` the result is wrong or NaN.
4. Isolate one instance before aggregating when debugging. An average across replicas hides the one overloaded pod.
5. Aggregate in PromQL (`sum by`, `topk`), never by pulling raw series into a script.
6. Size the range window to at least a few scrape intervals. Use `rate()` for alerts and graphs; `irate()` only for fast-moving dashboards.
7. Sum numerators and denominators separately, then divide. Averaging ratios is wrong.

## Query cost

- Count series first on an unfamiliar metric: `count(metric_name)`. Add label filters if it is large.
- Confirm the time window with the user before a range query, and prefer several short ranges over one long one.
- A query that takes over about 15 seconds is too broad. Narrow the matchers, the range, or add an aggregation, then keep that scope for the session.
- Prefer small outputs (a graph, `topk`, a narrow window) over thousands of raw rows.
- When a metric shows gaps, run `up{job="...", instance="..."}` before blaming the application. A `0` means the scrape failed.

## Investigation workflows

Pick the method from the question, then read `references/investigations.md` for the queries.

- Service slow or failing: RED (rate, errors, duration).
- Host or resource slow: USE (utilization, saturation, errors).
- Missing data: check `up`, then scrape config.

## Config work

Read `references/server-config.md` before editing scrape configs, rules, or Alertmanager. Validate every change with `promtool check config` or `promtool check rules` and test alert logic with `promtool test rules` before reporting done.

## References

- `references/access.md`. Read when running queries against a live server or setting up credentials.
- `references/investigations.md`. Read when diagnosing latency, errors, saturation, or data gaps.
- `references/server-config.md`. Read when editing scrape configs, recording or alerting rules, or Alertmanager.
