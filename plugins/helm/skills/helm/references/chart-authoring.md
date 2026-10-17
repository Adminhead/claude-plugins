# Chart authoring

## Layout

```
<chart>/
  Chart.yaml
  values.yaml
  values.schema.json     # optional but worth having
  .helmignore
  charts/                # packaged dependencies (from helm dependency build)
  crds/                  # plain YAML, installed once, never templated
  templates/
    _helpers.tpl
    NOTES.txt
    deployment.yaml
    service.yaml
    serviceaccount.yaml
    tests/
```

- One resource per file, named for the kind (`deployment.yaml`, `service.yaml`) in lowercase with dashes.
- Keep CRDs out of `templates/`. Files in `crds/` can't be templated, and Helm never upgrades or deletes them. Manage CRD upgrades separately, or in a dedicated chart.

## Chart.yaml

```yaml
apiVersion: v2
name: <chart>
description: <one line>
type: application
version: 0.1.0        # chart version, SemVer, bump on every chart change
appVersion: "1.4.2"   # the application version; need not be SemVer
kubeVersion: ">=1.27.0-0"
dependencies:
  - name: <dependency>
    version: "<range>"
    repository: oci://<registry>/<path>
    condition: <dependency>.enabled
```

- `version` is the chart's own version and changes whenever templates or defaults change. `appVersion` tracks the packaged application.
- Use `type: library` for charts that only provide shared templates.
- `condition` or `tags` toggle a dependency from values. `alias` lets one chart appear twice under different names.
- Commit `Chart.lock`. `helm dependency build` restores exactly those versions, and `helm dependency update` re-resolves and rewrites the lock.

## Values design

- Group by component with shallow nesting (`image.repository`, `service.port`, `ingress.enabled`). Deep nesting makes `--set` paths fragile.
- Default to the safe choice: `ingress.enabled: false`, resources set, restricted `securityContext`, `serviceAccount.create: true`.
- Document each key with a comment on the line above it. Helm doesn't read it, but readers and tooling do.
- Make image tags overridable and default to `.Chart.AppVersion`. Support a digest field for pinned deploys.
- Use `values.schema.json` (JSON Schema) to type and constrain input. `helm install`, `upgrade`, `lint`, and `template` all validate against it.
- Don't put credentials in defaults. Accept `existingSecret` names and let the user create the Secret.
- Keep per-environment overrides in separate files (`values-staging.yaml`) passed with `-f`. Later files win.

## Templates

- Namespace every `define` with the chart name (`{{ define "<chart>.fullname" }}`). Defined templates are global across a chart and its subcharts.
- Put names, labels, and selector labels in `_helpers.tpl` and call them with `include`. `include` returns a string you can pipe, `template` can't.
- Use `required` for values with no safe default so a missing value fails at render time with a clear message.
- Pipe structured values with `toYaml` and fix indentation with `nindent`:

  ```yaml
  resources:
    {{- toYaml .Values.resources | nindent 4 }}
  ```

- Quote strings that must stay strings (`{{ .Values.x | quote }}`), since YAML turns `on`, `1.10`, and `123` into other types.
- Gate optional resources with `{{- if .Values.ingress.enabled }}`.
- Use two-space indentation, spaces inside braces, and `{{-` to chomp whitespace. Use template comments (`{{- /* ... */ -}}`) for notes that shouldn't render.
- Selector labels (`matchLabels`) are immutable after the first install. Keep them to stable labels such as name and instance, not version.
- Add a checksum annotation on pods that must roll when a ConfigMap changes: `checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}`.

## Tests and NOTES

- Put `helm test` hooks in `templates/tests/` as pods with the `helm.sh/hook: test` annotation. Keep them to a smoke check, such as a request to the Service.
- `NOTES.txt` prints after install. Give the next step (how to reach the app), and keep secrets out of it.
