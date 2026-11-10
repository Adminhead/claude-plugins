# Example configs

Secrets are placeholders; supply them through env vars or secret mounts.

## Minimal

```yaml
pollingInterval: 1000
retrievers:
  - kind: file
    path: /goff/flags.goff.yaml
```

## Secured, GitHub retriever, exporter, notifier

```yaml
server:
  port: 1031
  monitoringPort: 1032
pollingInterval: 60000
enablePollingJitter: true
startWithRetrieverError: true
persistentFlagConfigurationFile: /goff/persist.yaml
logLevel: info
# authorizedKeys: the proxy is fully open until keys are set.
# Set AUTHORIZEDKEYS_EVALUATION=key1,key2 and AUTHORIZEDKEYS_ADMIN=adminkey,
# or add an authorizedKeys block with evaluation and admin key lists.
retrievers:
  - kind: github
    repositorySlug: my-org/flag-config
    path: flags.goff.yaml
    # token via RETRIEVERS_0_TOKEN
exporters:
  - kind: s3
    bucket: evaluation-data-bucket
notifiers:
  - kind: slack
    webhookUrl: https://hooks.slack.com/services/REPLACE_ME  # placeholder; set NOTIFIERS_0_WEBHOOKURL from a secret
```

Env var names follow the uppercase-and-underscore rule; confirm array-index names for your config with a test run.

## Flag sets

```yaml
server:
  mode: http
  port: 1031
flagSets:
  - name: teamA
    apiKeys: ["team-a-key"]     # supply via secrets
    retrievers:
      - kind: file
        path: /flags/team-a-flags.yaml
    exporters:
      - kind: log
  - name: teamB
    apiKeys: ["team-b-key"]
    retrievers:
      - kind: s3
        bucket: my-feature-flag-bucket
        item: team-b/flags.yaml
```

Providers pass the set's key as `apiKey`; every request needs one.

## Docker compose

```yaml
services:
  goff:
    image: gofeatureflag/go-feature-flag:latest
    ports: ["1031:1031"]
    volumes:
      - ./flags.goff.yaml:/goff/flags.goff.yaml
      - ./goff-proxy.yaml:/goff/goff-proxy.yaml
    environment:
      AUTHORIZEDKEYS_EVALUATION: ${GOFF_EVAL_KEY}
      AUTHORIZEDKEYS_ADMIN: ${GOFF_ADMIN_KEY}
```

## Helm

```
helm repo add go-feature-flag https://charts.gofeatureflag.org/
helm install relay-proxy go-feature-flag/relay-proxy -f values.yaml
# or: helm install relay-proxy oci://ghcr.io/go-feature-flag/charts/relay-proxy --version <chart-version> -f values.yaml
```

Values keys the docs name: `image.repository` (`ghcr.io/go-feature-flag/go-feature-flag` for the GHCR image, versions after v1.55.1), `nonRoot.enabled: true`, `securityContext.readOnlyRootFilesystem: true`. The rest of the values schema (config, env, ingress): verify against the chart docs.
