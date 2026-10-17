---
name: helm
description: Authors, validates and releases Helm charts (Chart.yaml, values and schema, helpers, dependencies, lint and template checks, helm diff, atomic upgrades, OCI publishing, provenance). Use when creating or changing a chart, packaging or publishing one, or debugging a failed helm install or upgrade.
allowed-tools:
  - Bash(bash ${CLAUDE_SKILL_DIR}/scripts/validate-chart.sh *)
---

# Helm charts

Not for plain manifests or Kustomize (the `kubernetes` skill), Argo CD or Flux delivery (`gitops`), or Dockerfiles (`docker`).

Build charts that render to valid, hardened manifests from a small, documented values surface. Check the installed major version first with `helm version`, because Helm 4 renamed some flags (below).

## Safety contract

- `helm lint`, `helm template`, `helm show`, `helm get`, `helm list`, `helm history`, and `helm diff` change nothing. Run them freely.
- `helm install`, `upgrade`, `rollback`, `uninstall`, and `push` change a cluster or registry. Ask first, and state the kube context and namespace.
- Don't run `helm get values` or `helm get manifest` on a release and paste the result. Both can contain credentials. `helm diff` redacts Secret values by default, so don't add `--show-secrets`.

## Workflow

1. **Locate the chart.** Read `Chart.yaml`, `values.yaml`, `templates/`, and any `values.schema.json` or CI that already lints the chart. Follow existing conventions. For a new chart, `helm create <name>` gives the standard layout.
2. **Edit.** Follow [chart authoring](references/chart-authoring.md) for layout, values design, helpers, and dependencies.
3. **Validate.** Run the bundled check, then read its output:

   ```sh
   bash ${CLAUDE_SKILL_DIR}/scripts/validate-chart.sh <chart-dir> [-f <values-file>]...
   ```

   It runs `helm lint --strict`, renders the chart once per values file, and schema-checks the output with `kubeconform` when installed. Run it for the default values and for each environment values file the chart ships.
4. **Review the rendered output.** `helm template <release> <chart-dir> -f <values>` and read it against the checklist in the `kubernetes` skill (pinned image, requests, probes, restricted securityContext).
5. **Preview the change.** For an existing release, `helm diff upgrade <release> <chart> -f <values> -n <ns>` shows what an upgrade would modify. It needs the `helm-diff` plugin, which Helm 4 installs only from a signed tarball. See [release](references/release.md).
6. **Release** with approval, following [release](references/release.md) for upgrade flags, OCI publishing, and signing.

## Version-sensitive flags

| Helm 3 | Helm 4 |
| --- | --- |
| `--atomic` | `--rollback-on-failure` (`--atomic` is deprecated) |
| `--wait` | `--wait` means `--wait=watcher`. Omitting it means `hookOnly`, which doesn't wait for workloads to become ready. |
| `--force` | `--force-replace` |

Helm 4 uses server-side apply for new releases (`--server-side auto` follows the previous release), and post-renderers are plugins. Chart `apiVersion: v2` charts work in both. Write commands for the major version installed.

## Troubleshooting

| Symptom | First checks |
| --- | --- |
| Template error | `helm template <rel> <chart> --debug` shows the failing template and line. Check for a missing value, wrong indentation after `nindent`, or an unquoted value that YAML parses as a number or boolean. |
| Lint passes, install fails | `helm install --dry-run=server` or `kubectl apply --dry-run=server` on the rendered output. The API server enforces what `lint` can't. |
| "no matches for kind" | A CRD is missing. Install the CRD chart first, or check `crds/` handling. Helm installs `crds/` once and never upgrades or deletes them. |
| Resource "exists and cannot be imported" | Another release or manual `kubectl apply` owns it. Adopt it by adding the `meta.helm.sh/release-name` and `release-namespace` annotations and the `app.kubernetes.io/managed-by: Helm` label, or use `--take-ownership` (Helm 3.17 and later). |
| Release stuck `pending-upgrade` | `helm history <rel>`. After confirming no operation is running, roll back to the last good revision (ask first). |
| Dependency missing | `helm dependency list <chart>`, then `helm dependency build` to restore from `Chart.lock`, or `helm dependency update` to re-resolve. |
| Values ignored | Check the key path against `values.yaml` (and the `--set` quoting). A subchart reads its values under its name or alias. |

## Review checklist

- [ ] `Chart.yaml` has `apiVersion: v2`, a chart `version` bumped for every change, and an accurate `appVersion`.
- [ ] `values.yaml` documents every key, and `values.schema.json` rejects bad input.
- [ ] Defined template names carry the chart name as a prefix.
- [ ] Dependencies pinned to a version range that resolves reproducibly, with `Chart.lock` committed.
- [ ] `helm lint --strict` and the validate script pass for every values file.
- [ ] No credentials in `values.yaml`. Secrets come from an existing Secret or an external store.

## References

- [chart-authoring](references/chart-authoring.md): read when creating or restructuring a chart, designing values, or writing helpers and dependencies.
- [release](references/release.md): read when upgrading or publishing a chart, installing helm-diff, or signing and verifying packages.

Adapted from wshobson/agents `helm-chart-scaffolding` (MIT, Copyright (c) 2024 Seth Hobson). See `LICENSE` in the plugin root.
