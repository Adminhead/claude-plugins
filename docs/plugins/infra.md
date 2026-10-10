# infra

Adds nine infrastructure skills: Docker and Compose, Kubernetes, Helm, GitOps with Argo CD or Flux, rollout planning, production-readiness review, homelab networking, Terraform with OpenTofu and Terragrunt, and Ansible. Most are read-only by default and ask before any step that changes a cluster, registry, network, or state.

## What it adds

| Skill | Purpose |
| --- | --- |
| `infra:docker` | Write and review Dockerfiles, Compose files, and `.dockerignore`: multi-stage builds, non-root runtime, secret handling, hardening, and container debugging |
| `infra:kubernetes` | Write and review manifests (probes, resources, RBAC, NetworkPolicy, Pod Security, Jobs, HPA, PDB, Kustomize) and triage failing workloads with read-only `kubectl` |
| `infra:helm` | Author, validate, and release Helm charts, with a bundled validation script and upgrade, OCI, and troubleshooting guidance |
| `infra:gitops` | Set up and review Argo CD or Flux delivery: repo layout, sync policy per environment, health checks, and secrets with External Secrets, Sealed Secrets, or SOPS |
| `infra:rollout` | Plan and verify a production rollout: strategy choice, preflight go/no-go, verification signals, rollback criteria, and post-deploy follow-up. Plans only |
| `infra:production-readiness` | Ship-or-block review from local repo evidence and any deployed URL you name. Reports Blocked, Risky, or Caveats with evidence checked and evidence missing. Moved here from the former `quality` plugin; see the [old-to-new table](efficient.md#old-to-new-names) |
| `infra:homelab-network` | Plan and stage home or homelab network changes: inventory, VLAN and trust zones, default-deny rules, Pi-hole or AdGuard cutover, WireGuard, and link diagnosis |
| `infra:terraform` | Write, review, and run Terraform, OpenTofu, or Terragrunt changes: module layout, version pinning, state and backends, plan review, the saved-plan apply flow, `-target` and `-lock-timeout` on shared state, `import`, `moved` and `removed` blocks, secrets in state, and Terragrunt dependency and `user_data` errors |
| `infra:ansible` | Write, review, and run playbooks, roles, and inventories: the project's runner, layout, idempotency reruns (`changed=0`), check-mode limits and `validate:`, handlers, vault or sops secrets with `no_log`, and FQCN modules |

Sources: some ideas were adapted from third-party skill collections. They are credited in the Acknowledgements section of the repository README.

## Requirements

Each skill uses only the tools its task needs. None is required just to install the plugin.

| Skill | Tools |
| --- | --- |
| `infra:docker` | `docker` with the Compose plugin |
| `infra:kubernetes` | `kubectl`. Optional: `kubeconform`, `kube-linter`, `kube-score` |
| `infra:helm` | `helm` (3 or 4). Optional: `kubeconform`, the `helm-diff` plugin |
| `infra:gitops` | `argocd` or `flux`, plus `kubectl`. Optional: `kubeconform` |
| `infra:rollout` | None |
| `infra:production-readiness` | None. Optional: `gh`, to read CI results |
| `infra:homelab-network` | None. Platform tools depend on your gateway and firewall |
| `infra:terraform` | `terraform` or `tofu`. Optional: `terragrunt`, and `trivy` or Checkov for scanning |
| `infra:ansible` | `ansible-core`, usually through the project's runner (`mise exec`, `uv run`). Optional: `ansible-lint`, `ansible-vault` or `sops` |

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install infra@adminhead
```

To enable it for one project only, add `--scope local`.

```
claude plugin install infra@adminhead --scope local
```

To try it without installing:

```
claude --plugin-dir plugins/infra
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/infra
   ```
2. Start a fresh session. The skill list should show `infra:docker`, `infra:kubernetes`, `infra:helm`, `infra:gitops`, `infra:rollout`, `infra:production-readiness`, `infra:homelab-network`, `infra:terraform`, and `infra:ansible`.
3. Optionally check the Helm script's usage text. It needs `helm` only for real runs.
   ```
   bash plugins/infra/skills/helm/scripts/validate-chart.sh --help
   ```

## Safety

What each skill does without asking, and what it does only after approval.

| Skill | Runs freely | Needs your approval |
| --- | --- | --- |
| `infra:kubernetes` | `kubectl get`, `describe`, `logs`, `events`, `top`, `explain`, `api-resources`, `auth can-i`, `diff`, and `apply --dry-run=server` | `apply`, `create`, `patch`, `delete`, `scale`, `rollout undo` and `restart`, `drain`, `cordon`, `label`, and `exec` into a production pod |
| `infra:helm` | `lint`, `template`, `show`, `get`, `list`, `history`, `diff` | `install`, `upgrade`, `rollback`, `uninstall`, `push`. It states the kube context and namespace first |
| `infra:gitops` | `argocd app get`, `diff`, `history`, `flux get`, `flux check`, `kubectl get` and `describe` | Bootstrap, `argocd app sync`, `flux reconcile`, `suspend` and `resume`, enabling `prune`, deleting an Application or Kustomization, and pushes to the GitOps repo |
| `infra:terraform` | `init`, `validate`, `fmt -check`, `plan` | `apply`, `destroy`, `state rm`, `state mv`, `force-unlock`, and the `import` command, each needing an explicit instruction naming the target workspace |
| `infra:ansible` | `--syntax-check`, `ansible-lint`, `ansible-inventory --graph`, `ansible-doc`, and `--check --diff --limit <host>` | Any run without `--check`, always with an explicit `--limit`. It never prints decrypted vault or sops values |
| `infra:docker` | `docker compose ps`, `logs`, `config --quiet`, `inspect`, `stats` | `docker compose down -v`, `docker system prune`, `docker rm`, and `docker compose up --build` on shared hosts |
| `infra:rollout` | Everything. It writes a plan and runs no deploys | Not applicable |
| `infra:production-readiness` | Reading the checkout, git history, CI config, and CI results through `gh`. It sends only unauthenticated or test-account requests, and only to a URL you name | Nothing. It reports and fixes nothing until you pick items |
| `infra:homelab-network` | Inspecting and planning | Any firewall, NAT, VLAN, DHCP, or VPN change |

Rules that apply across skills:

- `infra:kubernetes` states the context and namespace before the first command and passes `-n` and `--context` explicitly. It does not print Secret values (no `kubectl get secret -o yaml` or `-o jsonpath`).
- `infra:helm` does not paste `helm get values` or `helm get manifest` output, and does not add `--show-secrets` to `helm diff`.
- `infra:terraform` saves plans with `plan -out=tfplan` and applies only that file. It does not paste state, plan, or `.tfvars` contents, uses `-lock=false` only for a stated emergency, and treats `-target` as a scoped last resort that it reports. It prefers `-lock-timeout` on shared state. Applying is the user's step.
- `infra:ansible` uses the project's runner, adds `validate:` to config templates because check mode cannot validate them, puts `no_log` on secret-handling tasks, and proves idempotency with a rerun that shows `changed=0`.
- `infra:gitops` warns before deleting an Argo CD Application with the resources finalizer or a Flux Kustomization with `prune: true`, since both delete managed resources. It does not print Secret values or the initial admin credential.
- `infra:docker` does not print `docker inspect` or `docker compose config` output wholesale, and never writes a secret literal into a Dockerfile, committed Compose file, or command line.
- `infra:homelab-network` requires console or out-of-band access before changing management VLANs, trunk ports, default firewall policy, or DHCP and DNS. It gives vendor syntax only for a confirmed platform and firmware, and never prints or stores private keys, preshared keys, or admin passwords.

## Limits

- `infra:helm` has one tool grant. Its `allowed-tools` entry covers only `bash ${CLAUDE_SKILL_DIR}/scripts/validate-chart.sh *`. The script runs `helm lint --strict`, renders the chart per values file, and runs `kubeconform` if installed. Without `kubeconform` it prints `SKIP`. It changes nothing.
- Helm 4 renamed some flags (`--atomic` to `--rollback-on-failure`, `--force` to `--force-replace`). The skill writes commands for the installed major version.
- `infra:terraform` was checked against Terraform 1.16, OpenTofu 1.13, and Terragrunt 1.1 docs. It uses whichever CLI the repo already uses. `infra:ansible` was checked against ansible-core 2.21 and ansible-lint 26.9. The Terragrunt `user_data` cause is marked UNCONFIRMED in the reference until checked against the AWS provider v6 upgrade guide.
- `infra:kubernetes` schema checks with `kubeconform` cannot catch what the API server enforces. The server-side dry run covers that.
- Scope boundaries: Helm charts belong to `infra:helm`, GitOps controllers to `infra:gitops`, rollout strategy to `infra:rollout`, and ship-or-block review of an application to `infra:production-readiness`. AWS service questions go to `aws:architecture-review` or `aws:resource-query`, if installed.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable infra@adminhead` |
| Uninstall | `claude plugin uninstall infra@adminhead` |

The plugin ships skills and one script inside the Helm skill, so both commands remove everything. Start a new session to be sure they are gone.
