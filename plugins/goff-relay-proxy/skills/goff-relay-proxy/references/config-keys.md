# Relay proxy config keys

Source: GOFF docs v1.58.1 `/relay-proxy/configure-relay-proxy`. Env override rule: uppercase option name, nested keys joined by `_`.

| Option | Type, default | Notes |
|---|---|---|
| `retrievers` | list, required unless `flagSets` | Parallel, applied in order, later flag definition wins. |
| `startWithRetrieverError` | bool, false | false crashes at start on retrieval failure. |
| `persistentFlagConfigurationFile` | string | Persists flags so the proxy can start with retrievers down. May be stale. |
| `fileFormat` | yaml/json/toml, yaml | |
| `pollingInterval` | int ms, 60000 | Minimum 1000, negative disables. |
| `enablePollingJitter` | bool, false | Up to 10 percent either way. |
| `logLevel` | error/warn/info/debug, info | debug truncates bodies at 8KiB. |
| `logFormat` | json/logfmt, json | |
| `enablePprof` | bool, false | Serves `/debug/pprof/`. |
| `exporters` | list | Run in parallel. |
| `notifiers` | list | |
| `disableNotifierOnInit` | bool, false | No notification on first load. |
| `debug` | bool, false | Debug logs plus echo and pprof debug. |
| `hideBanner` | bool, false | |
| `swagger.enabled` | bool, false | UI at `http://<host>:<port>/swagger/`. |
| `swagger.host` | string, localhost | |
| `ofrepEventStream.baseUrl` | string | Enables SSE advertisement in OFREP bulk responses. Absolute http(s) URL, no query. Not for Lambda. |
| `ofrepEventStream.inactivityDelaySec` | int, 0 | |
| `disableVersionHeader` | bool, false | Drops `x-gofeatureflag-version`. |
| `disableFlagDetailsInStream` | bool, false | Websocket payloads omit flag definitions. Restart needed. |
| `authorizedKeys.evaluation` | list of string | Sent in `X-API-Key`. Unset everywhere means open proxy. |
| `authorizedKeys.admin` | list of string | Needed for `/admin/v1/*`. |
| `evaluationContextEnrichment` | map | Merged into every context, overrides same-named fields. `env` becomes an attribute for queries. |
| `openTelemetryOtlpEndpoint` | string | Also `OTEL_EXPORTER_OTLP_ENDPOINT` or nested `otel.exporter.otlp.endpoint`. Service name `go-feature-flag`. |
| `flagSets` | list | Replaces top-level retrievers, exporters, notifiers. |
| `envVariablePrefix` | string, "" | |
| `enableBulkMetricFlagNames` | bool, false | `flag_name` label, high cardinality. |
| `server.mode` | http/lambda/unixsocket, http | |
| `server.host` | string, 0.0.0.0 | http mode. |
| `server.port` | int, 1031 | http mode. |
| `server.monitoringPort` | int | Separate port for `/health`, `/info`, `/metrics`. |
| `server.unixSocketPath` | string | Required for unixsocket mode. |
| `server.awsLambdaAdapter` | APIGatewayV2 (default)/APIGatewayV1/ALB | lambda mode. |
| `server.awsApiGatewayBasePath` | string | lambda mode, strips a prefix. |

## Deprecated spellings (seen in older docs, migrate)

`monitoringPort`, `enableSwagger` with `host`, `startAsAwsLambda`, `awsLambdaAdapter`, `awsApiGatewayBasePath`, `apiKeys` (top level), `listen` move to `server.*`, `swagger.*` and `authorizedKeys`. The source also accepts singular `notifier`, `retriever`, `exporter`; use plural.

## flagSets entries

Options per set: `name, apiKeys, retrievers, exporters, notifiers, fileFormat, pollingInterval, startWithRetrieverError, enablePollingJitter, disableNotifierOnInit, evaluationContextEnrichment, persistentFlagConfigurationFile, environment`. Without a `name` a UUID is generated and the set cannot be managed at runtime. At runtime you can add or remove named sets and change a set's `apiKeys`; other edits log an error and wait for a restart. No inheritance between sets.
