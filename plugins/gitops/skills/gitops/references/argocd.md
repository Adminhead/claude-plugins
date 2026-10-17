# Argo CD

Check apiVersions against the installed version (`kubectl api-resources --api-group argoproj.io`). The manifests below use `argoproj.io/v1alpha1`, the version Argo CD's own docs use for Application, AppProject, and ApplicationSet.

## Install

Install into the `argocd` namespace from a release-tagged manifest or the project's Helm chart, pinned to a version. Follow the install page for that version. Don't apply `stable`, which moves under you. Retrieve the initial admin credential as the install docs describe, change it, then remove the initial secret. Prefer SSO for people and tokens with narrow project roles for automation.

## Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: <app>
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: <project>
  source:
    repoURL: <git-url>
    targetRevision: main
    path: apps/overlays/<env>/<app>
  destination:
    server: https://kubernetes.default.svc
    namespace: <ns>
  syncPolicy:
    automated:
      prune: false          # per environment, see SKILL.md
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

- The finalizer makes deleting the Application also delete what it deployed. Omit it when Application deletion must leave workloads running.
- Use a dedicated `AppProject` instead of `default`, so each project limits which repos, clusters, and namespaces its Applications can use.
- Pin `targetRevision` to a tag or commit for production when you need an explicit promotion step. A branch name follows every commit.
- Auto-sync acts only when the Application is OutOfSync, tries once per commit and parameter set, and doesn't retry a failed revision until it changes. Fix and push, or sync manually.
- Rollback with `argocd app rollback` doesn't work while automated sync is on. Revert the commit in Git instead.

## App of Apps and ApplicationSet

An App of Apps is one Application whose `path` holds other Application manifests. It bootstraps a cluster from a single root:

```yaml
spec:
  source:
    repoURL: <git-url>
    targetRevision: main
    path: argocd/applications
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd
```

Argo CD's docs recommend `ApplicationSet` for most fan-out cases (one app per cluster, per directory, or per environment). Use App of Apps for a small fixed set and `ApplicationSet` when the list is generated.

## Sync options and protection

| Option | Effect |
| --- | --- |
| `CreateNamespace=true` | Creates the destination namespace |
| `PrunePropagationPolicy=foreground` | Waits for pruned resources to delete |
| `PruneLast=true` | Prunes after the rest of the sync succeeds |
| `ApplyOutOfSyncOnly=true` | Applies only resources that differ, for large apps |
| `Validate=false` | Skips kubectl validation. Use only for a specific known failure. |

Protect a resource from pruning by annotating it with `argocd.argoproj.io/sync-options: Prune=false`. Use it for PersistentVolumeClaims and similar data-bearing objects when `prune` is on.

Order dependent resources with sync waves (`argocd.argoproj.io/sync-wave: "<n>"`, lower first), and run migrations or smoke checks as hooks (`argocd.argoproj.io/hook: PreSync`).

## Sync windows

Windows live on the `AppProject`, not the Application:

```yaml
spec:
  syncWindows:
    - kind: allow
      schedule: "0 8 * * 1-5"
      duration: 8h
      applications: ["*"]
      timeZone: Etc/UTC
    - kind: deny
      schedule: "0 0 * * 5"
      duration: 48h
      applications: ["*"]
      manualSync: true
```

- A matching `deny` window overrides an `allow` window, and blocks automated and manual syncs unless `manualSync: true`.
- Select by `applications`, `namespaces`, or `clusters`. The cron `schedule` uses the window's `timeZone` (UTC by default).

## Health checks

Argo CD knows the health of built-in kinds. For a custom resource with a `status.conditions` list, add a Lua health check in `argocd-cm` under `resource.customizations.health.<group>_<kind>`, returning `Healthy`, `Degraded`, or `Progressing`. Check the operator manual for the key format of the installed version.

## Diagnose

```sh
argocd app get <app>        # sync and health status, conditions
argocd app diff <app>       # live vs Git
argocd app history <app>
```

- OutOfSync that returns after every sync often means a controller mutates a field (HPA replicas, injected sidecars, webhook defaults). Add `ignoreDifferences` for that field rather than turning off `selfHeal`.
- Sync fails on a missing CRD: sync the CRD Application in an earlier wave, or enable `SkipDryRunOnMissingResource=true` for that resource.
