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

## Ops guard

The plugin registers a `PreToolUse` hook on Bash (`scripts/cloud-ops-guard.ts`, run by `bun` with `--no-env-file --config=/dev/null`, 10-second timeout). It covers `tofu`, `terraform`, `terragrunt`, and `aws`.

Since 0.5.0 the hook is TypeScript on a shell AST walker (`scripts/shell/walk.ts` over a vendored `unbash` parser, copied byte for byte from the coremods plugin). It replaces the Python 3 script, so `bun` must be on `PATH`. If `bun` is missing, the hook errors and the normal permission flow decides, as it did when `python3` was missing. The rules are the same, with deeper coverage: the walker sees tool calls inside `$(...)`, backticks, `<(...)`, `bash -c`, `eval`, unquoted heredoc bodies and the wrappers below. A `bash -c 'tofu apply -auto-approve'` or `eval "tofu apply"` that used to get ask is now deny, as is a destroy or unplanned apply inside a substitution or a heredoc body that runs. A variable or `<(...)` word with no literal subcommand (`terragrunt list --filters-file <(echo "$f")`) is also deny now, where it was ask.

| Decision | When |
| --- | --- |
| allow | The whole command is one of the exact forms in the allowlist |
| deny | A best-effort parse finds an unsafe apply, a destroy, an import, or state surgery, or a subagent runs a credentialed command without the brief marker |
| ask | The parse finds a guarded tool it cannot check |
| no output | Anything else, so the normal permission flow applies |

### Allowlist

An allow skips the permission prompt, so it rests on an exact grammar instead of a parser. The command may use only letters, digits, and `_ . / = : @ , + -`, with single spaces between words. Quotes, `$`, backticks, redirects, separators, globs, comments, and newlines all rule allow out.

| Prefix | Then |
| --- | --- |
| `tofu` or `terraform`, optionally `-chdir=<path>` | a subcommand from the next table |
| `mise exec -- tofu` or `mise exec -- terraform`, optionally `-chdir=<path>` | a subcommand |
| `mise run tofu <env>`, with one lowercase environment word | a subcommand |
| `aws` | `--version`, or `help` as the last of at most three lowercase words (`aws ec2 help`) |

| Subcommand | Arguments |
| --- | --- |
| `plan`, `validate`, `fmt`, `init` | Single-word flags only (`-flag` or `-flag=value`). `-out=` must name `tfplan` or `<name>.tfplan` |
| `state list`, `state show` | Flags, then resource addresses. `state show` takes exactly one |
| `version`, `-version`, `--version` | Flags only |

Never allowed:

- `-migrate-state`, `-force-copy`, `-from-module`, `-generate-config-out`, and `-show-sensitive`.
- `VAR=` prefixes, since `PATH=` or `LD_PRELOAD=` can change what runs.
- `terragrunt`, whose flags take separate values, so no exact grammar fits it.
- `mise run` flags and `:::` task chains.

### Deny and ask

The deny check is best-effort. It splits compound commands and sees through `VAR=` prefixes, `env`, `sudo`, `mise`, shell keywords such as `if` and `do`, and the wrappers Claude Code strips before matching allow rules (`timeout`, `time`, `nice`, `nohup`, `stdbuf`, `command`, `builtin`, and `noglob`).

| Command | Decision |
| --- | --- |
| `apply` with `-auto-approve` or `-destroy`, or without one literal plan file as its last argument | deny: save a plan, review it, then apply that file |
| `destroy`, `import`, `state rm`, `state mv`, `state push`, `state replace-provider` | deny, with the safe alternative in the reason |
| Any of those subcommand words anywhere in a segment, so a flag value cannot hide the real one (`--working-dir plan destroy`) | deny |
| A variable or substitution as the subcommand or `state` verb (`tofu $S`, `tofu state "$V" x`), since it may hide `destroy` or `state rm` | deny |
| `taint`, `refresh`, `workspace`, `console`, `test`, `show`, an unknown subcommand, or a never-allowed flag | ask |
| A guarded tool inside `$()`, backticks, `<()`, `xargs`, `env -S`, or `mise exec -c`, or after a command the guard does not know (`op run --`) | ask, unless the same walk also finds a deny |
| A guarded tool inside a literal `bash -c`, `sh -c`, `eval`, or an unterminated heredoc, which the guard parses as commands | the findings of the nested commands, plus ask (a `bash -c 'tofu apply -auto-approve'` is a deny) |
| A variable as the command, a `>\|` redirect, or a second guarded tool in one segment | ask |
| A parse error, such as an unterminated quote or a zsh-only expansion, in a command that mentions a guarded tool | ask |

The strictest result wins. Any deny denies the whole command, then any ask asks. If the guard crashes or gets malformed input, it answers `ask`.

### Heredocs

A heredoc body is data, so the guard does not read it as commands. A runbook written with `cat > runbook.md <<'EOF'`, or a commit message passed through `"$(cat <<'EOF' ...)"`, gets no decision even when it mentions `tofu destroy`. Three cases are still checked:

- A body that mentions a guarded tool and reaches a shell or interpreter (`cat <<EOF | sh`, `bash <<EOF`, `python3 - <<EOF`) gets ask.
- A body under an unquoted delimiter that holds `$(` or a backtick runs code, so the guard parses it as commands.
- A body whose delimiter line never comes is parsed as commands.

### Subagents

Inside a subagent, `aws` (except `--version` and the help forms), `plan`, and `apply` of a saved plan are denied unless the brief has a whole line `ALLOW: cloud-ops`.

- The marker is something the model writes into a brief. It is not user consent, and a model can write it for any task.
- The guard finds the brief by `agent_id` in `<session>/subagents/agent-<id>.jsonl` beside the main transcript. It skips `isMeta` lines, reads the first plain user message, and reads at most 1 MB per line.
- If the brief cannot be read or found, the guard asks.

### Guard limits

- Allow is strict, and deny is best-effort. The guard is a guardrail, not a sandbox.
- An encoded payload, a script file, a variable or alias that expands to a command, or a wrapper the guard does not know can evade the deny check. A mod's `tool.check` can override a hook block.
- If the hook times out or fails to start, the normal permission flow decides.
- `plan`, `init`, and `validate` run provider plugins and `external` data sources from the configuration, so allowing them trusts the code in that directory. An allowed `mise run tofu` command likewise trusts the `tofu` task in `mise.toml`.
- `apply` of a saved plan and `output` are never allowed, so both reach your normal permission prompt. Applying changes infrastructure, and `output -json` or `-raw` prints sensitive values. A saved plan can hold a `plan -destroy`, so review it before you approve the apply.
- Settings deny and ask rules still apply over the guard's allow.

### Settings

Replace blanket allow rules such as `Bash(mise run tofu:*)` in the project's `settings.local.json`. The guard already allows the safe `mise run tofu` forms. A blanket rule approves every command the deny check misses, because a hook's ask or deny overrides an allow rule but its silence does not. Edit that file yourself. The plugin never changes settings.

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

The plugin ships skills, a script inside the Helm skill, and the ops guard hook, so both commands remove everything. Start a new session to be sure they are gone.
