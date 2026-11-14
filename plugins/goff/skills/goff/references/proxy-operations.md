# Relay proxy: configure, run, deploy, debug

The relay proxy (`go-feature-flag` binary) is stateless: it polls retrievers, holds flags in memory and serves them over HTTP. Apps talk to it through OpenFeature providers. Nothing here was run against a live proxy; items marked verify are unconfirmed.

## Contents

- Configure
- Run and test
- Deploy
- Debug
- Gotchas

## Configure

1. Write `goff-proxy.yaml`. Lookup order without `--config`: `./goff-proxy.yaml`, `/goff/goff-proxy.yaml`, `/etc/opt/goff/goff-proxy.yaml`. Explicit: `go-feature-flag --config=/path`. Default port 1031.
2. Minimal config: `pollingInterval: 1000` (ms; default 60000, minimum 1000, negative disables) and `retrievers: [{kind: file, path: /goff/flags.goff.yaml}]`.
3. Env vars override the file: option name uppercased, nesting joined by `_`, arrays comma-separated or indexed (`SERVER_PORT`, `AUTHORIZEDKEYS_EVALUATION=k1,k2`, `RETRIEVERS_0_KIND`). `envVariablePrefix: GOFF_` adds a prefix.
4. Pick retrievers, exporters and notifiers from proxy-components.md. The full key list is in proxy-config-keys.md; copy-paste setups (minimal, secured, flagsets, Docker, Helm) are in proxy-examples.md.
5. Several retrievers run in parallel and merge in order; a later definition of the same flag wins.
6. `startWithRetrieverError: false` (default) crashes the proxy when flags cannot load. Set `true` to serve defaults until retrieval works, or set `persistentFlagConfigurationFile` so a restart works while retrievers are down (the data may be stale).

## Run and test

```
docker run -p 1031:1031 \
  -v $(pwd)/flags.goff.yaml:/goff/flags.goff.yaml \
  -v $(pwd)/goff-proxy.yaml:/goff/goff-proxy.yaml \
  gofeatureflag/go-feature-flag:latest
curl -X POST localhost:1031/ofrep/v1/evaluate/flags/<flag> -H 'Content-Type: application/json' \
  -d '{"context":{"targetingKey":"u-1"}}'
```

Add `-H 'X-API-Key: <key>'` when keys are set (`Authorization: <key>` is also accepted). Evaluation needs `targetingKey` in the context.

Endpoints (non-exhaustive; the OpenAPI spec is authoritative): `POST /ofrep/v1/evaluate/flags[/{key}]`, `POST /v1/allflags`, `POST /v1/feature/{key}/eval` (legacy), `POST /v1/flag/configuration` and `GET /v1/flag/change` (in-process providers), `POST /v1/data/collector`, `GET /openfeature/v0/manifest`, `GET /health`, `/info`, `/metrics`.

Force a refresh instead of waiting for the poll (ask first, see SKILL.md):

```
curl -X POST http://<host>:1031/admin/v1/retriever/refresh -H 'X-API-Key: <admin key>' -d ''
```

The docs prose also shows `/v1/admin/retriever/refresh`; its curl and the OpenAPI spec use `/admin/v1/...`.

## Deploy

- Docker: `gofeatureflag/go-feature-flag:latest` (or `ghcr.io/go-feature-flag/go-feature-flag`, releases after v1.55.1). Tags `:fips` and `:trixie` exist.
- Helm: chart version equals proxy version; install commands and values keys are in proxy-examples.md. Hardening values: `nonRoot.enabled: true`, `securityContext.readOnlyRootFilesystem: true` (leave the latter off with the file exporter or `persistentFlagConfigurationFile`).
- The `configmap` retriever works only when the proxy runs inside the cluster.
- The proxy does not terminate TLS; do it at the ingress.
- Lambda: `server.mode: lambda` plus `server.awsLambdaAdapter`; no SSE.
- Monitoring: `/health` returns `{"initialized": bool}`, `/metrics` is Prometheus, `/info` shows cache refresh and flagsets. `server.monitoringPort` moves them to a separate port. Logs are JSON on stdout; `logLevel: debug` logs bodies truncated at 8KiB.

## Debug

1. Proxy exits at start: a retriever failed. Read the log, check the path, token and network, then see `startWithRetrieverError`.
2. 401 or 403: key missing from `X-API-Key`, wrong list (`evaluation` vs `admin`), or flagSets mode where every request needs a flagset key.
3. Edit not visible: wait `pollingInterval`, check `GET /info`, or call the admin refresh. GitHub, GitLab and Bitbucket retrievers hit rate limits, so raise `pollingInterval`.
4. Flag missing or default returned: lint the flag file with `go-feature-flag-cli lint`, and confirm the context has `targetingKey`.
5. Swagger UI: `swagger: {enabled: true}` serves `/swagger/`. Keep it off in production.

## Gotchas

- With flagSets, top-level `retrievers`, `exporters` and `notifiers` are ignored; each set needs at least one `apiKeys` entry, and an explicit `name` when it is changed at runtime or a retriever matches on it (the default is a generated UUID). Set it up in the `flagSets` block, not both.
- Only `authorizedKeys` (default mode) and flagset names and `apiKeys` (flagsets mode) hot-reload; every other change needs a restart.
- `ofrepEventStream.baseUrl` makes the proxy append the caller's API key to the advertised SSE URL as a query param, so keep it on trusted networks.
- `enableBulkMetricFlagNames` adds a high-cardinality label.
- Each proxy instance notifies separately, so N replicas send N notifications.
- Verify against docs: exact flagSets key case (`flagSets` is the documented spelling).
