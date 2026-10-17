# Alerting

## What to page on

The four golden signals, measured at the edge users see:

| Signal | Alert example |
| --- | --- |
| Latency | p99 of successful requests over the SLO threshold |
| Traffic | request rate drops sharply (often an upstream outage) |
| Errors | error ratio above target |
| Saturation | queue, disk, or pool nearing exhaustion with time-to-full under an hour |

Prefer SLO burn-rate alerts (`slo.md`) over fixed thresholds for user-facing services. Alert on symptoms. Causes such as high CPU belong on dashboards unless they predict an outage.

## Rule hygiene

- Every rule has `for:` so a single bad scrape does not page. Use `keep_firing_for` to stop flapping on recovery.
- Use `rate()` in alert expressions. `irate()` reacts to one pair of samples and flaps.
- Label severity (page or ticket) and route on it. A page means a human must act now.
- Annotations carry a summary, the affected service, and a `runbook_url`. A rule without a runbook link sends the responder to guess.
- Test rules with `promtool test rules` (see `observability:promql`).
- Delete alerts nobody acts on. Each one trains responders to ignore the next.

Generic rule libraries (such as awesome-prometheus-alerts) are a good starting point for dependencies like databases and brokers. Review thresholds against your own baselines before enabling them.
