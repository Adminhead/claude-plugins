# Batch obs (round 2)

## Plugins created

| Plugin | Type | Description (plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `observability-instrumentation` | S | Observability instrumentation skill: structured logs with correlation IDs, metrics with bounded labels, OpenTelemetry traces, profiling, symptom alerts, and SLOs with burn-rate alerts, starting from the questions on-call will ask. | archive observability/instrumentation + agent-skills observability-and-instrumentation (MIT, on-call questions step, entry-point field) + wshobson python-observability (MIT, structlog contextvars) | none |
| `promql` | S | PromQL and Prometheus skill: correct counter and histogram queries, query cost limits, RED and USE investigations, data gaps, scrape and rule config, Alertmanager routing, and promtool checks, with credentials kept out of commands. | archive observability/promql (+ promql-routing eval) | none |
| `grafana-dashboards` | S | Grafana dashboards skill: dashboards built from operator questions with RED and USE panel sets, a quality checklist, current panel types and JSON models, and dashboards as code via provisioning, Terraform or the Foundation SDK. | archive observability/dashboards | none |
| `postmortem` | S | Blameless postmortem skill: gap-flagged UTC timeline, 5 Whys to a fixable system gap, impact and detection gaps, owned and dated actions, plus a quick template for minor incidents and runbook rules. | archive observability/postmortem | none |
| `sentry-sdk` | S | Sentry SDK skill: init, errors, tracing, structured logs, metrics and crons across platforms, driven by the project's ## Sentry profile, with current-docs lookups and notes for self-hosted Sentry. | archive sentry-core/sentry (all references + profile-changes-output outcome eval) | none |
| `sentry-mcp-self-hosted` | P | Sentry's MCP server (@sentry/mcp-server 0.42.0, pinned) over stdio for self-hosted Sentry, read-only by default. Off until enabled; prompts for the host and a user auth token kept in secure storage. | archive sentry-mcp-self-hosted | none |

## Validation and tests

- `claude plugin validate --strict plugins/<name>` for all six: passed.
- `.claude/skills/skill-authoring/scripts/validate_skill.py` on the five skills: valid. Descriptions 312-330 chars; SKILL.md bodies 47-82 lines.
- grep for `codegraph`, `claude-mem`, `coding-core:`, `github:`, `Efficient `, `observability:`, `sentry-core`, `sentry-cli:`, `authoring:`, `dataviz`: no hits.
- No scripts or mods in this batch, so nothing to `bun test` / `claude plugin test`. Evals were moved and renamed but not run.

## What changed in the ports

- **observability-instrumentation**: new workflow step 1 "write 2-4 on-call questions first" and DoD item; "verify the telemetry itself" step; entry-point field for multi-entry logs (agent-skills). `references/logging.md` gained a Correlation IDs section with structlog `merge_contextvars` + `clear_contextvars`/`bind_contextvars` middleware that binds request ID and entry point only, with an explicit rule against binding raw `user_id`/email/IP (wshobson and structlog's own examples bind `user_id`; deliberately not copied). `LICENSE` carries both MIT notices; attribution line at the end of SKILL.md.
- **promql / grafana-dashboards / postmortem**: renamed, descriptions rewritten third-person and trimmed, "Not for" moved into the body, cross-refs mapped to new names (`adr-writing` "if installed"; dropped the `dataviz` mention). grafana-dashboards: JSON-model paragraph now names the three schema models; provisioning.md notes V2 dashboards must be file-provisioned in the Kubernetes resource format. postmortem: added a line keeping personal data out of the document.
- **sentry-sdk**: all `sentry-cli:sentry-cli` and hosted `sentry-mcp` references replaced by the `sentry-mcp-self-hosted` MCP tools or the Sentry UI (sentry-cli plugin is not in the plan). New "Self-hosted Sentry" section: point upload tools at the instance (`SENTRY_URL`/plugin `url`), and check the server release before promising Logs/metrics ingest. Eval grader renamed to `sentry-sdk:sentry-sdk`.
- **sentry-mcp-self-hosted**: pinned `@sentry/mcp-server@0.42.0` (`npm view` on 2026-10-17; engines node >=22.13). Token stays `sensitive: true`. Inspected the 0.42.0 tarball (read only, not run) to confirm env names: `SENTRY_HOST`, `SENTRY_ACCESS_TOKEN`, `MCP_SKILLS`, `SENTRY_URL`, `SENTRY_DSN`/`DEFAULT_SENTRY_DSN`, `EMBEDDED_AGENT_PROVIDER`; all are read with truthiness checks, so `""` means unset. Additions over the archive: a `sentry_skills` userConfig (default `inspect`, read-only; triage and project-management are opt-in) passed as `MCP_SKILLS`; blanked `SENTRY_URL` (shell value would override host), `SENTRY_DSN`/`DEFAULT_SENTRY_DSN` (the server's own Sentry telemetry records tool inputs/outputs via vercelAIIntegration and would go to any DSN in the user's shell). Kept blanking of LLM keys so Sentry data doesn't go to a third-party LLM. Token scope guidance narrowed to read-only by default. README.md covers install, enable, fields, scopes per tool group, what each env var does, troubleshooting, and license (FSL-1.1-ALv2, fetched at runtime).

## Deviations

- Added the `sentry_skills` userConfig field and the extra blanked env vars (not in the brief); reasons above.
- Eval case for promql retains the archive's single routing prompt; no new trigger evals written.

## Unverified / TODO

- MCP server not started against a live self-hosted instance; `${user_config.*}` substitution in `.mcp.json` env is per the Claude Code manifest docs, not exercised. Not confirmed that `defaultEnabled: false` prompts for userConfig on enable (it validated strict).
- Token scope list for `inspect` (org/project/team/event:read) is inferred from the tool group descriptions in the package, not from Sentry docs.
- Self-hosted minimum versions for Logs/metrics ingest left unstated on purpose (no reliable source checked).
- Version facts kept from the archive and not rechecked this round: Go `slog.NewMultiHandler` (Go 1.26+), promql-cli archived March 2026, Sentry platform version gates in `references/platforms/*`. Grafana schema models and structlog contextvars API were checked via Context7.
- Evals not run (`claude plugin eval plugins/promql`, `plugins/sentry-sdk`).

## Follow-ups

- Run the two evals; add hard-negative trigger evals (promql vs grafana-dashboards vs observability-instrumentation).
- Consider whether `sentry-sdk` should list `sentry-mcp-self-hosted` as an optional companion in the catalog.
- Bump the pin on a schedule (Renovate-style) after reading release notes.
