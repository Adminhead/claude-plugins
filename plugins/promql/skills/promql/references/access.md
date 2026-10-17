# Running queries

## HTTP API

The Prometheus HTTP API works against Prometheus and compatible backends. Endpoints: `GET|POST /api/v1/query` (instant), `/api/v1/query_range` (`start`, `end`, `step`), `/api/v1/label/<name>/values`, `/api/v1/series`, `/api/v1/metadata`, and `/api/v1/targets`. Check the backend's docs for differences (Thanos, Mimir, and VictoriaMetrics add tenancy headers or path prefixes).

Keep the credential out of the command. Put the header line in a file the user owns and let curl read it:

```bash
# ~/.config/prom/auth-header (chmod 600), one line: Authorization: Bearer <token>
curl -sG "$PROM_URL/api/v1/query" --data-urlencode 'query=up{job="api"}' -H @"$HOME/.config/prom/auth-header"
```

`-H @file` needs curl 7.55 or newer. For basic auth use `curl --netrc-file <file>` instead. Use `POST` with `--data-urlencode` for long queries. Pipe through `jq` to trim output.

## Optional: promql CLI

`promql-cli` (github.com/nalbury/promql-cli) gives ASCII graphs and subcommands (`metrics`, `labels`, `meta`). Its repository was archived and read-only as of March 2026, so treat it as optional and unmaintained. Use it only if already installed.

```bash
promql 'up'                                   # instant query
promql 'rate(http_requests_total[5m])' --start 1h    # range query, ASCII graph
promql 'up' --output json                     # json or csv
promql labels <metric>; promql meta <metric>
```

It reads `~/.promql-cli.yaml` (`host`, `output`, `step`, `auth-type`, `auth-credentials`) and the env vars `PROMQL_AUTH_TYPE` and `PROMQL_AUTH_CREDENTIALS`. Credentials may be a file path. The user creates that config; do not write it.

Common errors: `connection refused` or `no such host` means a wrong host; `401` means a missing or invalid token; `403` means insufficient permissions.
