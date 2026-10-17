# Flux

Check API versions against the installed controllers (`flux check`, `kubectl api-resources --api-group fluxcd.io`). These manifests use the stable APIs documented at fluxcd.io: `source.toolkit.fluxcd.io/v1`, `kustomize.toolkit.fluxcd.io/v1`, and `helm.toolkit.fluxcd.io/v2`.

## Install and bootstrap

Install the `flux` CLI from a package manager at a pinned version, or from a release archive whose checksum you verified. Don't pipe an install script into a shell.

```sh
flux check --pre            # read-only: cluster and version prerequisites
```

Bootstrap writes to the cluster and the Git remote, so get approval first:

```sh
read -rs GITHUB_TOKEN && export GITHUB_TOKEN   # paste at the prompt, or export from your credential store
flux bootstrap github \
  --owner=<owner> --repository=<repo> --branch=main \
  --path=clusters/<cluster> --personal
```

Bootstrap installs the controllers, commits their manifests to the repo, and configures Flux to update itself from Git. Use a token scoped to that repository. Never put it on a command line or in a file.

## Source and Kustomization

```yaml
apiVersion: source.toolkit.fluxcd.io/v1
kind: GitRepository
metadata:
  name: <app>
  namespace: flux-system
spec:
  interval: 5m
  url: <git-url>
  ref:
    branch: main
---
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: <app>
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 2m
  path: ./apps/overlays/<env>
  prune: true              # required field, per environment
  wait: true
  timeout: 5m
  sourceRef:
    kind: GitRepository
    name: <app>
  dependsOn:
    - name: infrastructure
```

- `prune` is required. `true` garbage-collects resources removed from Git. Protect a resource by labelling or annotating it `kustomize.toolkit.fluxcd.io/prune: disabled`.
- `wait: true` health-checks everything the Kustomization applied, and `healthChecks` lists specific resources to wait on. `dependsOn` orders Kustomizations, so infrastructure reconciles before the apps that need it.
- `interval` is the reconcile period (minimum 60 s). `retryInterval` sets the retry period after a failure and defaults to `interval`.
- `suspend: true` pauses reconciliation and drift detection. Use it for a controlled manual change, and resume afterward.
- Flux reverts drift on each reconcile for the resources it manages. That is the equivalent of Argo CD's `selfHeal`.
- Variable substitution (`postBuild.substitute`) fills `${var}` placeholders for small per-environment differences. Prefer overlays for structural differences.

## Helm releases

```yaml
apiVersion: helm.toolkit.fluxcd.io/v2
kind: HelmRelease
metadata:
  name: <release>
  namespace: <ns>
spec:
  interval: 10m
  chart:
    spec:
      chart: <chart>
      version: "<range>"
      sourceRef:
        kind: HelmRepository
        name: <repo>
        namespace: flux-system
  install:
    remediation:
      retries: 3
  upgrade:
    remediation:
      retries: 3
      strategy: rollback
  values: {}
```

- `chartRef` can point at an `OCIRepository` instead of `chart.spec` for charts published to an OCI registry.
- Remediation controls what Flux does when an install or upgrade fails (retry, then roll back or uninstall).
- Pin chart `version` for production so an upstream release doesn't deploy by itself.

## Secrets with SOPS

A Kustomization can decrypt SOPS-encrypted files with age, OpenPGP, or a cloud KMS through `spec.decryption`. The decryption key is a Secret in the cluster, created out of band. See [secrets](secrets.md).

## Diagnose

```sh
flux get sources git
flux get kustomizations
flux get helmreleases -A
flux diff kustomization <name> --path <dir>     # preview, changes nothing
flux logs --kind=Kustomization --name=<name>
```

`flux reconcile ...` forces a sync and `flux suspend|resume` pause it. Both change cluster behavior, so ask first.
