---
name: dashboards
description: Design and build Grafana dashboards from operator questions (is it healthy, where is the bottleneck, what changed, what should someone do) rather than from the list of available metrics, then keep them as code. Covers RED and USE panel sets, a quality checklist, current panel types, datasource UIDs, file provisioning, and Terraform. Use when creating, reviewing, or refactoring a Grafana dashboard or its provisioning. Not for PromQL authoring (`observability:promql`), metric instrumentation or SLO design (`observability:instrumentation`), or chart design in apps (`dataviz`).
---

# Grafana dashboards

A dashboard is for answering questions during operation, not for showing every metric. Checked against Grafana's dashboard best practices, provisioning, and Observability as Code docs.

## Workflow

1. Write the operator questions first: Is it healthy? Where is the bottleneck? What changed? What should someone do? Ask the user for the audience and the failure they fear.
2. Choose the method. Use RED (rate, errors, duration) for services and USE (utilization, saturation, errors) for resources. Grafana recommends alerting on RED symptoms.
3. Inspect an existing dashboard and the data source first: metric names, labels, variable conventions, and the current JSON schema. Do not invent metrics. Query the backend (`observability:promql`, if installed) to confirm each one exists.
4. Build the smallest board that answers the questions, top to bottom: overview (health, big numbers), performance (latency and traffic trends), resources (saturation), then service-specific detail.
5. Cut every panel that no question needs. A panel earns its place by changing what someone does.
6. Save the dashboard as code and review the diff (`references/provisioning.md`).

## Panel sets

| Target | Panels |
| --- | --- |
| HTTP service (RED) | request rate, error ratio, p50/p95/p99 latency, saturation (in-flight, queue) |
| Resource (USE) | utilization, saturation (queue, load), errors |
| Queue or Kafka | broker or consumer count, lag, messages in and out, under-replicated partitions |
| Database | connections vs limit, query latency, replication lag, cache hit ratio, disk |

## Quality checklist

- [ ] Every panel has a title, unit, and a description or link when the meaning is not obvious.
- [ ] Thresholds and colors mean something (they match an SLO or alert, not decoration).
- [ ] Variables for the common filters (environment, service, instance), with sane defaults.
- [ ] Default time range and refresh suit the use; no 5-second refresh on a heavy query.
- [ ] Datasources are referenced by `uid`, not by name.
- [ ] Panels use current types (`timeseries`, `stat`, `gauge`, `table`, `heatmap`, `bargauge`). Grafana migrates the legacy Graph panel to time series automatically, so do not generate `graph`.
- [ ] Alerts live in Grafana Alerting or Prometheus rules, not on panels. Dashboard-attached legacy alerts are gone.
- [ ] No vanity panels; sections are grouped and ordered by the questions.

## Dashboard JSON

Grafana has several JSON schemas: the classic model, a v1 resource wrapping it in a `spec`, and a v2 resource for newer layouts. Do not write dashboard JSON from memory. Export one from the target instance (Dashboard settings, JSON Model) or from the Foundation SDK, and edit that, so the schema matches the running version. Use `$datasource` or `{"type": "prometheus", "uid": "<datasource-uid>"}` for data sources.

## References

- `references/provisioning.md`. Read when committing dashboards, wiring file provisioning, or using Terraform or the Foundation SDK.
