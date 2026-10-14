# observability

Adds four skills for instrumenting services, querying Prometheus, building Grafana dashboards, and writing blameless postmortems. They guide code and config changes and do not mutate a monitoring backend.

## What it adds

| Skill | Purpose |
| --- | --- |
| `observability:instrumentation` | Add and review structured logs, metrics, OpenTelemetry traces, profiles, and alerts, plus SLIs, SLOs, and burn-rate alerts. Language-agnostic with short Go, Python, and TypeScript snippets |
| `observability:promql` | Query and debug Prometheus-compatible backends (Prometheus, Thanos, Mimir, VictoriaMetrics) and write Prometheus server config: scrape configs, recording and alerting rules, Alertmanager routing, `promtool` checks and rule tests |
| `observability:dashboards` | Design Grafana dashboards from operator questions, with RED and USE panel sets, a quality checklist, datasource UIDs, file provisioning, and Terraform |
| `observability:postmortem` | Write a blameless postmortem: timeline with gap flags, 5 Whys, root cause versus contributing factors, detection gap, and owned, dated actions. Includes a short template for minor incidents and runbook rules |

Sources: some ideas were adapted from third-party skill collections. They are credited in the Acknowledgements section of the repository README.

## Requirements

Each skill uses only what its task needs.

| Skill | Tools |
| --- | --- |
| `observability:instrumentation` | None. Uses the repo's own OTel SDK, Prometheus client, and logging library |
| `observability:promql` | `promtool` for config and rule checks. For live queries, a Prometheus-compatible URL, `curl`, and optionally `jq`. A token or password in an environment variable or a file you created |
| `observability:dashboards` | A Grafana instance to export JSON from. Optional: the Terraform Grafana provider or the Foundation SDK |
| `observability:postmortem` | None |

`observability:promql` can also use `promql-cli` if it is already installed. Its owner archived the repo on 2026-03-29, so it is read-only (checked 2026-10-13). The skill treats it as optional.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install observability@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/observability
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/observability
   ```
2. Start a fresh session. The skill list should show `observability:instrumentation`, `observability:promql`, `observability:dashboards`, and `observability:postmortem`.

## Safety

- **Credentials in `observability:promql`.** A credential never passes through the prompt, a command line, or a file Claude writes. Claude reads the token or password from an environment variable or a file you created (`chmod 600`) and references it by name or path. On a 401 or 403, or with no host configured, it tells you what to set and waits. It does not create or edit your credential file or the `promql-cli` config. It asks only for the base URL, and treats a URL with embedded `user:pass@` as a secret.
- **Query cost in `observability:promql`.** Claude counts series first on an unfamiliar metric, confirms the time window with you before a range query, and narrows any query that takes over about 15 seconds. It aggregates in PromQL and does not pull raw series into scripts.
- **Config changes.** Claude validates every Prometheus or Alertmanager config change with `promtool check config` or `promtool check rules`, and tests alert logic with `promtool test rules`, before reporting done.
- **Dashboards.** `observability:dashboards` does not write dashboard JSON from memory. It exports one from the target instance and edits that, so the schema matches the running version. It does not invent metrics and checks that each one exists. Provisioning files carry no credentials. Use `secureJsonData` populated from environment variables or a secret manager.
- **Instrumentation.** `observability:instrumentation` rules include never logging secrets or personal data and keeping metric labels bounded.
- **Postmortems.** `observability:postmortem` writes a document in the repo (default `docs/postmortems/YYYY-MM-DD-<slug>.md`). It asks for missing facts, such as times, severity, and impact. It does not assign blame to a person, and each action needs a named owner and due date.

## Limits

- Instrumentation, PromQL, and dashboards guidance is checked against the OpenTelemetry, Prometheus, Grafana, and Google SRE docs. Grafana has several dashboard JSON schemas, so a dashboard must come from a version-matched export.
- `observability:promql` covers Prometheus-compatible backends. Thanos, Mimir, and VictoriaMetrics may add tenancy headers or path prefixes, so check the backend's docs.
- Live queries need network access to your backend and a credential you supply. Without them Claude can still write queries and config, and it cannot run them.
- Out of scope: Sentry SDK setup (`sentry-core:sentry`, if installed), chart design in apps (`dataviz`), architecture decision records (`authoring:adr-writing`), and live incident response.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable observability@adminhead` |
| Uninstall | `claude plugin uninstall observability@adminhead` |

The plugin ships only skills, so both commands remove them. Start a new session to be sure they are gone.
