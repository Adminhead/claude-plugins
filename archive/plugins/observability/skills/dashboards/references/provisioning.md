# Dashboards as code

Keep dashboards in version control. UI edits drift, vanish with the instance, and cannot be reviewed. Grafana's maturity ladder ends at generated, versioned dashboards.

## File provisioning

Provider file in Grafana's `provisioning/dashboards/`:

```yaml
apiVersion: 1
providers:
  - name: services
    orgId: 1
    folder: Services
    type: file
    disableDeletion: true
    allowUiUpdates: false
    updateIntervalSeconds: 30
    options:
      path: /var/lib/grafana/dashboards
      foldersFromFilesStructure: true
```

- `allowUiUpdates: false` makes the file the source of truth; edits in the UI are lost or refused.
- `foldersFromFilesStructure` maps directories to folders; do not combine it with `folder`.
- Give each dashboard a stable `uid` so links survive reprovisioning.

Provision data sources with fixed UIDs so dashboard JSON that references `uid` works across instances:

```yaml
apiVersion: 1
datasources:
  - name: Prometheus
    uid: prometheus-main
    type: prometheus
    url: http://prometheus:9090
```

Never put credentials in the file; use `secureJsonData` populated from environment variables (`$__env{...}` expansion, see Grafana's provisioning docs) or a secret manager.

## Terraform

```hcl
resource "grafana_folder" "services" { title = "Services" }

resource "grafana_dashboard" "api" {
  folder      = grafana_folder.services.uid
  config_json = file("${path.module}/dashboards/api.json")
  overwrite   = true
}
```

Arguments `config_json`, `folder`, `overwrite`, and `message` are confirmed in the provider docs. `folder` accepts a folder id or uid; prefer the uid.

## Other options

Grafana's Observability as Code docs list: the Foundation SDK (define dashboards in Go, TypeScript, Python, Java, or PHP), the Terraform provider, Git Sync (dashboards stored in GitHub, synced with pull requests), the Grafana Operator for Kubernetes, and a Grafana CLI. Prefer generating from code when many dashboards share a layout.

## Legacy sources

Older community examples use `graph` panels, panel-attached `alert` blocks, and name-based datasources. Take their queries and layout ideas, then rebuild the JSON from a current export.
