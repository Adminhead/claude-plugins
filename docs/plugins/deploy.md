# deploy

Adds six deployment skills: Docker and Compose, Kubernetes, Helm, GitOps with Argo CD or Flux, rollout planning, and production-readiness review. These skills were part of `infra` before the regroup. `deploy` is not in the `baseline` set. Install it in the projects that ship containers or run on a cluster.

Most of the skills are read-only by default. They ask before any step that changes a cluster, registry, or deployed state.

## What it adds

| Skill | Purpose |
| --- | --- |
| `deploy:docker` | Write and review Dockerfiles, Compose files, and `.dockerignore`: multi-stage builds, non-root runtime, secret handling, hardening, and container debugging |
| `deploy:kubernetes` | Write and review manifests (probes, resources, RBAC, NetworkPolicy, Pod Security, Jobs, HPA, PDB, Kustomize) and triage failing workloads with read-only `kubectl` |
| `deploy:helm` | Author, validate, and release Helm charts, with a bundled validation script and upgrade, OCI, and troubleshooting guidance |
| `deploy:gitops` | Set up and review Argo CD or Flux delivery: repo layout, sync policy per environment, health checks, and secrets with External Secrets, Sealed Secrets, or SOPS |
| `deploy:rollout` | Plan and verify a production rollout: strategy choice, preflight go/no-go, verification signals, rollback criteria, and post-deploy follow-up. Plans only |
| `deploy:production-readiness` | Ship-or-block review from local repo evidence and any deployed URL you name. Reports Blocked, Risky, or Caveats with evidence checked and evidence missing. Moved here from the former `quality` plugin; see the [old-to-new table](coding.md#old-to-new-names) |

Scope boundaries: Helm charts belong to `deploy:helm`, GitOps controllers to `deploy:gitops`, rollout strategy to `deploy:rollout`, and ship-or-block review of an application to `deploy:production-readiness`. Cloud service questions go to `aws:architecture-review` or `aws:resource-query`, if installed. Infrastructure as code (Terraform, OpenTofu, Ansible) is in [infra](infra.md), and home networks are in [homelab](homelab.md).

## Requirements

Each skill uses only the tools its task needs. None is required just to install the plugin.

| Skill | Tools |
| --- | --- |
| `deploy:docker` | `docker` with the Compose plugin |
| `deploy:kubernetes` | `kubectl`. Optional: `kubeconform`, `kube-linter`, `kube-score` |
| `deploy:helm` | `helm` (3 or 4). Optional: `kubeconform`, the `helm-diff` plugin |
| `deploy:gitops` | `argocd` or `flux`, plus `kubectl`. Optional: `kubeconform` |
| `deploy:rollout` | None |
| `deploy:production-readiness` | None. Optional: `gh`, to read CI results |

## Install

```
claude plugin install deploy@adminhead --scope local
```

To try it without installing:

```
claude --plugin-dir plugins/deploy
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/deploy
   ```
2. Start a fresh session. The skill list should show `deploy:docker`, `deploy:kubernetes`, `deploy:helm`, `deploy:gitops`, `deploy:rollout`, and `deploy:production-readiness`.
3. Optionally check the Helm script's usage text. It needs `helm` only for real runs.
   ```
   bash plugins/deploy/skills/helm/scripts/validate-chart.sh --help
   ```

## Safety

What each skill does without asking, and what it does only after approval.

| Skill | Runs freely | Needs your approval |
| --- | --- | --- |
| `deploy:kubernetes` | `kubectl get`, `describe`, `logs`, `events`, `top`, `explain`, `api-resources`, `auth can-i`, `diff`, and `apply --dry-run=server` | `apply`, `create`, `patch`, `delete`, `scale`, `rollout undo` and `restart`, `drain`, `cordon`, `label`, and `exec` into a production pod |
| `deploy:helm` | `lint`, `template`, `show`, `get`, `list`, `history`, `diff` | `install`, `upgrade`, `rollback`, `uninstall`, `push`. It states the kube context and namespace first |
| `deploy:gitops` | `argocd app get`, `diff`, `history`, `flux get`, `flux check`, `kubectl get` and `describe` | Bootstrap, `argocd app sync`, `flux reconcile`, `suspend` and `resume`, enabling `prune`, deleting an Application or Kustomization, and pushes to the GitOps repo |
| `deploy:docker` | `docker compose ps`, `logs`, `config --quiet`, `inspect`, `stats` | `docker compose down -v`, `docker system prune`, `docker rm`, and `docker compose up --build` on shared hosts |
| `deploy:rollout` | Everything. It writes a plan and runs no deploys | Not applicable |
| `deploy:production-readiness` | Reading the checkout, git history, CI config, and CI results through `gh`. It sends only unauthenticated or test-account requests, and only to a URL you name | Nothing. It reports and fixes nothing until you pick items |

Rules that apply across skills:

- `deploy:kubernetes` states the context and namespace before the first command and passes `-n` and `--context` explicitly. It does not print Secret values (no `kubectl get secret -o yaml` or `-o jsonpath`).
- `deploy:helm` does not paste `helm get values` or `helm get manifest` output, and does not add `--show-secrets` to `helm diff`.
- `deploy:gitops` warns before deleting an Argo CD Application with the resources finalizer or a Flux Kustomization with `prune: true`, since both delete managed resources. It does not print Secret values or the initial admin credential.
- `deploy:docker` does not print `docker inspect` or `docker compose config` output wholesale, and never writes a secret literal into a Dockerfile, committed Compose file, or command line.

## Helm script

`deploy:helm` has one tool grant. Its `allowed-tools` entry covers only `bash ${CLAUDE_SKILL_DIR}/scripts/validate-chart.sh *`. The script runs `helm lint --strict`, renders the chart per values file, and runs `kubeconform` if installed. Without `kubeconform` it prints `SKIP`. It changes nothing.

## Limits

- Helm 4 renamed some flags (`--atomic` to `--rollback-on-failure`, `--force` to `--force-replace`). The skill writes commands for the installed major version.
- `deploy:kubernetes` schema checks with `kubeconform` cannot catch what the API server enforces. The server-side dry run covers that.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable deploy@adminhead` |
| Uninstall | `claude plugin uninstall deploy@adminhead` |

The plugin ships skills and a script, so both commands remove everything. Start a new session to be sure they are gone.
