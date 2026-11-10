# Retrievers, exporters, notifiers

Source: GOFF docs `/integrations/*`. Retrievers poll at `pollingInterval`. Keep secrets in env vars, not in the file.

## Retrievers

| kind | Fields | Notes |
|---|---|---|
| `file` | `path` | Absolute path inside the container. |
| `http` | `url`, `method` (GET), `body`, `headers`, `clientCertPath`, `clientKeyPath`, `caCertPath`, `timeout` (10000 ms) | mTLS via the cert fields. |
| `configmap` | `namespace`, `configmap`, `key` | Only when the proxy runs inside the cluster. |
| `s3` | `bucket`, `item`; folder mode (omit `item`): `prefix`, `pattern`, `recursive` (false) | Creds: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION`. Folder mode needs `s3:ListBucket` and `s3:GetObject`, merges files, fails on duplicate flag keys, one format for all. MinIO, Ceph, Garage: use `s3` with `AWS_ENDPOINT_URL_S3`. |
| `googleStorage` | `bucket`, `object` | `GOOGLE_APPLICATION_CREDENTIALS`. |
| `azureBlobStorage` | `container`, `accountName`, `object`, `accountKey` | |
| `github` | `repositorySlug`, `path`, `branch` (main), `token`, `baseUrl`, `timeout` | Rate limits: raise `pollingInterval`. |
| `gitlab` | `repositorySlug`, `path`, `baseUrl` (https://gitlab.com), `branch`, `token`, `timeout` | Do not URL-encode slug or path. |
| `bitbucket` | `repositorySlug`, `path`, `baseUrl`, `branch`, `token`, `timeout` | |
| `mongodb` | `uri`, `database`, `collection` | Each document is the flag JSON plus a `flag` field with the name. |
| `redis` | `options` (go-redis Options), `prefix` | One JSON flag per key, scanned by prefix. |
| `postgresql` | `uri`, `table`, `columns` | Columns `flag_name`, `flagset`, `config` (JSONB), unique `(flag_name, flagset)`. The flagSet `name` must equal the `flagset` column value. |

A custom Go retriever needs a recompiled proxy.

## Exporters

Bulk (buffered, flush on `flushInterval` ms or `maxEventInMemory`, retry in memory on failure): `file`, `s3`, `googleStorage`, `azureBlobStorage`, `bigquery`. Streaming (sync): `kafka`, `kinesis`, `pubsub`, `sqs`, `webhook`, `log`, `opentelemetry`.

| kind | Fields |
|---|---|
| `log` | On by default, nothing to set. |
| `file` | `outputDir`, `flushInterval` (60000), `maxEventInMemory` (100000), `format` (JSON/CSV/Parquet), `filename`, `csvTemplate`, `parquetCompressionCodec` (SNAPPY) |
| `s3` | `bucket`, `path`, plus the bulk options above |
| `googleStorage` | `bucket`, `path`, plus bulk options |
| `azureBlobStorage` | `container`, `accountName`, `accountKey`, `path`, plus bulk options |
| `webhook` | `endpointUrl`, `flushInterval`, `maxEventInMemory`, `secret` (HMAC-SHA256 hex in `X-Hub-Signature-256`), `meta`, `headers` |
| `kafka` | `kafka.topic`, `kafka.addresses`, `kafka.config` (Sarama) |
| `sqs` | `queueUrl` |
| `kinesis` | `streamArn` and/or `streamName` |
| `pubsub` | `projectID`, `topic` |
| `bigquery` | `projectID`, `datasetID`, `tableName`, `googleCredentials` (else ADC), `autoMigrate` (false), `eventType` |
| `opentelemetry` | Span `feature_flag.evaluate` per evaluation. Needs the proxy's own OTel config. `tracerName` default: verify against docs. |

`eventType` is `feature` (default, one event per evaluation) or `tracking` (OpenFeature Tracking API). For both, add two exporter entries. Events need a flag with `trackEvents` not false and at least one exporter. MinIO with a hostname endpoint needs `MINIO_DOMAIN` and a `{bucket}.{host}` alias, since the proxy cannot force path-style.

## Notifiers

| kind | Fields |
|---|---|
| `slack` | `webhookUrl` |
| `discord` | `webhookUrl` |
| `microsoftteams` | `webhookUrl` |
| `webhook` | `endpointUrl`, `secret` (X-Hub-Signature-256), `meta`, `headers` |

Webhook body: `{"meta":{"hostname":...},"flags":{"deleted":{},"added":{},"updated":{"<flag>":{"old_value":{},"new_value":{}}}}}`. Scheduled rollout steps do not trigger notifiers. A `log` notifier is listed in the concept page; config: verify against docs.
