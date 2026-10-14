---
name: gitops
description: Set up and review GitOps delivery to Kubernetes with Argo CD or Flux, covering the OpenGitOps principles, repo layout, Application and Kustomization setup, per-environment sync policy (prune, selfHeal, sync windows, retry), health checks, and secrets with External Secrets, Sealed Secrets, or SOPS. Use when choosing between Argo CD and Flux, bootstrapping a cluster from Git, writing Application, ApplicationSet, GitRepository, or Kustomization resources, or debugging sync and drift. Not for writing the workload manifests (deploy:kubernetes), Helm chart authoring (deploy:helm), or rollout strategy and rollback criteria (deploy:rollout).
---

# GitOps with Argo CD or Flux

Git holds the desired state, and an in-cluster agent pulls it and reconciles. Changes ship as commits, so review, history, and rollback come from Git.

## Safety contract

- Reading state is free: `argocd app get|diff|history`, `flux get ...`, `flux check`, `kubectl get|describe`. Use these first.
- Ask before anything that changes a cluster or a Git remote: bootstrap, `argocd app sync`, `flux reconcile`, `suspend|resume`, enabling `prune`, deleting an Application or Kustomization, and pushes to the GitOps repo.
- Deleting an Argo CD Application with the `resources-finalizer.argocd.argoproj.io` finalizer deletes the resources it manages. Deleting a Flux Kustomization with `prune: true` does the same. Say so before proposing either.
- Install from a release-pinned manifest or the project's Helm chart, and package-manager CLIs at a pinned version. Don't pipe a downloaded installer into a shell, and don't track `stable` or `latest`.
- Don't print Secret values or the initial admin credential into the transcript. Rotate or remove the initial Argo CD admin secret after first login.

## OpenGitOps principles

1. **Declarative.** The desired state is described declaratively.
2. **Versioned and immutable.** It lives in Git with full history.
3. **Pulled automatically.** Agents pull from the source. CI doesn't push to the cluster.
4. **Continuously reconciled.** Agents observe actual state and correct drift.

A pipeline that runs `kubectl apply` from CI is deployment automation, not GitOps. Use CI to build, test, and open the commit that bumps an image tag or chart version.

## Choose Argo CD or Flux

| Need | Argo CD | Flux |
| --- | --- | --- |
| Web UI for app status and diffs | Built in | Separate add-on |
| Footprint | Larger (API server, UI, repo server, Redis) | Lighter set of controllers |
| Multi-tenant app teams with projects and RBAC | `AppProject`, SSO, UI roles | Namespaced Kustomizations and Kubernetes RBAC |
| Many clusters or generated apps | `ApplicationSet` generators | Kustomization per cluster path |
| Helm | Renders charts itself | `HelmRelease` runs real Helm releases |
| SOPS secrets | Needs a plugin or other tool | Native decryption in Kustomization |

Default for a single homelab or small cluster: Flux, because it is lighter and bootstraps from one command. Choose Argo CD when people need the UI, project-level access control, or `ApplicationSet` fan-out. Keep an existing choice unless the user asks to migrate.

## Repo layout

Separate cluster wiring from application manifests, and give each environment a path:

```
gitops-repo/
  clusters/
    <cluster>/            # Flux bootstrap path, or Argo CD root app
  infrastructure/         # ingress, cert-manager, monitoring, CRDs
  apps/
    base/<app>/           # shared manifests or Helm values
    overlays/<env>/<app>/ # per-environment Kustomize overlays
```

- Use one branch (`main`) with a directory per environment, unless a promotion model needs separate branches. Directories make a promotion a visible diff.
- Install CRDs and controllers before the resources that use them. Express that with `dependsOn` (Flux) or sync waves (Argo CD).
- Keep application source repos separate from the GitOps repo, so a code commit doesn't redeploy by itself.

## Sync policy per environment

Prune and selfHeal are choices that depend on the environment, not defaults to copy.

| Setting | Meaning | Dev and staging | Production |
| --- | --- | --- | --- |
| Automated sync | Apply any new commit | On | On for low-risk apps, otherwise manual sync or a sync window |
| `prune` | Delete cluster resources removed from Git | On | On only after reviewing what would be pruned. Protect critical resources (see references). |
| `selfHeal` (Argo CD) | Revert out-of-band cluster edits | On | On, once nobody relies on `kubectl edit` as a workflow |
| Retry | Retry a failed sync with backoff | On | On, with a limit |

Argo CD leaves `prune` and `selfHeal` off unless you set them, and doesn't retry a sync against the same commit that already failed. Flux requires `prune` to be stated on every Kustomization. Details and manifests are in [argocd](references/argocd.md) and [flux](references/flux.md).

## Workflow

1. **Read what exists.** Find the GitOps repo layout, the Application or Kustomization resources, and the installed controller versions (`argocd version`, `flux --version`). Check API versions against the installed controllers, not the examples here.
2. **Pick the tool** with the table above, or follow what the repo already uses.
3. **Write the resources** from [argocd](references/argocd.md) or [flux](references/flux.md). Apply the sync policy table per environment.
4. **Handle secrets** with [secrets](references/secrets.md). Plaintext Secrets never go in the repo.
5. **Validate** the rendered manifests the way `deploy:kubernetes` describes (`kubeconform`, server-side dry run). Render Kustomize and Helm sources locally first.
6. **Preview**: `argocd app diff <app>` or `flux diff kustomization <name> --path <dir>` shows the change before it merges.
7. **Verify after merge** with `argocd app get <app>` or `flux get kustomizations`. Healthy and Synced (Argo CD) or Ready (Flux) is the done signal. Confirm the workload itself with `kubectl rollout status`.

## Progressive delivery

Canary and blue-green rollouts need a controller on top of GitOps, such as Argo Rollouts or Flagger. The GitOps tool syncs the `Rollout` or `Canary` resource, and the controller shifts traffic and promotes or aborts by metric. Strategy choice, promotion gates, and rollback criteria are in `deploy:rollout`.

## References

- [argocd](references/argocd.md): read when writing Applications, App of Apps, ApplicationSets, AppProjects, sync windows, or Argo CD health checks.
- [flux](references/flux.md): read when bootstrapping Flux or writing GitRepository, Kustomization, or HelmRelease resources.
- [secrets](references/secrets.md): read when a GitOps repo needs credentials, TLS keys, or any Secret value.
