# Releasing a chart

## Diff before upgrade

`helm-diff` (databus23/helm-diff) is a third-party plugin. Install it at a pinned release:

```sh
# Helm 3.18 and later
helm plugin install https://github.com/databus23/helm-diff --version <version>
# Helm 4 verifies plugin signatures by default, and a git URL can't be verified.
# Import the maintainer's GPG key (curl -sL https://github.com/databus23.gpg | gpg --import),
# check its fingerprint against the helm-diff README, then install the release tarball
# for a pinned tag (its .prov file sits beside it). <os> is linux, macos, windows or freebsd.
helm plugin install https://github.com/databus23/helm-diff/releases/download/v<version>/helm-diff-<os>-<arch>.tgz
```

Don't pass `--verify=false` to get around a failed signature check. Ask the user instead.

```sh
helm diff upgrade <release> <chart> -n <ns> -f <values> --detailed-exitcode
```

- `--detailed-exitcode` exits non-zero when changes exist, which suits CI gates.
- Secret values are redacted by default. Don't add `--show-secrets` in logs.
- Add `--install` (or `--allow-unreleased`) to diff a release that doesn't exist yet.

## Upgrade or install

```sh
helm upgrade --install <release> <chart> -n <ns> --create-namespace \
  -f <values> --wait --timeout 5m --atomic                  # Helm 3
helm upgrade --install <release> <chart> -n <ns> --create-namespace \
  -f <values> --wait --timeout 5m --rollback-on-failure     # Helm 4
```

Match the flag to the installed major (`helm version`). Helm 4 deprecates `--atomic` (it is gone from the Helm 4 flag reference) in favour of `--rollback-on-failure`. In Helm 4, `--wait` with no value means the `watcher` strategy, and leaving it off means `hookOnly`, which doesn't wait for workloads to become ready. Pass `--wait` explicitly.

| Flag | Effect |
| --- | --- |
| `--install` | Installs when the release doesn't exist, so one command serves first deploys and upgrades |
| `--wait` | Waits until resources are ready, up to `--timeout`. Helm 4 takes a strategy (`watcher`, the default for a bare `--wait`; `hookOnly`, the default when omitted; `legacy`). |
| `--atomic` (Helm 3) / `--rollback-on-failure` (Helm 4) | Rolls back to the last successful revision if the upgrade fails. Implies waiting (`watcher` in Helm 4). |
| `--server-side` (Helm 4) | `auto` (default) follows the previous release's apply method; `true` forces server-side apply. `--force-conflicts` overrides field-manager conflicts. |
| `--cleanup-on-fail` | Deletes resources created by a failed upgrade |
| `--timeout` | Applies to each Kubernetes operation, such as hook Jobs, not the whole release |
| `--dry-run=server` | Renders and submits to the API server without persisting |

- Pin the chart with `--version` for registry charts so a deploy is reproducible.
- `--reuse-values` merges new values onto the last release's values and silently keeps stale keys. Prefer passing the full values files every time, or `--reset-then-reuse-values` when you need to keep the last release's overrides.
- A rollback restores manifests, not data. Database migrations stay applied (see the `rollout-plan` skill).
- Don't pass secrets with `--set`. They land in shell history and in release records. Use an existing Secret or a values file kept out of Git.

## OCI registries

Helm (3.8 and later, and 4) pushes and pulls charts as OCI artifacts. The chart version becomes the tag.

```sh
helm package <chart-dir>
helm registry login <registry-host> -u <user> --password-stdin
helm push <chart>-<version>.tgz oci://<registry-host>/<path>
helm install <release> oci://<registry-host>/<path>/<chart> --version <version>
```

- `helm push` takes the repository path without the chart name or tag, and infers both from the package.
- Read the password from a credential store or a CI secret on stdin. Never put it on the command line.
- In dependencies, use `repository: oci://<registry-host>/<path>` with the chart `name` and `version`.

## Provenance

Sign packages so consumers can verify them:

```sh
helm package --sign --key '<key uid substring>' --keyring <secring> <chart-dir>
helm verify <chart>-<version>.tgz
helm install <release> <chart>-<version>.tgz --verify
```

- `--key` matches a substring of the key's user ID, not a fingerprint.
- Signing writes a `.prov` file beside the package. Publish both.
- Helm reads the legacy GnuPG keyring format. GnuPG 2 users may need to export to `pubring.gpg` and `secring.gpg`.
- Signing proves the chart came from the key holder. It doesn't scan the chart contents.
