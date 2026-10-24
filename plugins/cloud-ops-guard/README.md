# cloud-ops-guard

A PreToolUse hook on Bash (needs `bun`) that guards infrastructure commands: OpenTofu, Terraform, Terragrunt, the AWS CLI, Pulumi, and kubectl, helm, helmfile, talosctl and omnictl on production clusters. It denies the commands that should never run unreviewed, asks when it cannot tell, and otherwise says nothing so your own permission rules decide.

## Install

```
/plugin install cloud-ops-guard --marketplace Adminhead/claude-plugins
```

## What it decides

| Decision | Examples |
| --- | --- |
| deny | `tofu apply` without a saved plan, `apply -auto-approve`, `destroy`, `import`, `state rm`/`mv`/`push`; `kubectl delete` of PVs, PVCs, CRDs or nodes on a production cluster |
| ask | destructive aws operations (`delete-*`, `terminate-*`, `s3 rm`, `kms schedule-key-deletion`, …); `pulumi destroy`/`up`/`refresh`/`watch`, `--show-secrets` and `stack export`; `helmfile destroy`/`delete`/`sync`/`apply`; a pulumi or helmfile verb held in a variable; kubectl and helm changes on production or on a cluster it cannot identify; talosctl and omnictl resets, upgrades, deletes and applies anywhere; `output -json`, `state pull`, `console`; commands it cannot parse |
| subagent gate | a subagent's plan, init, state show, output, apply of a saved plan, `pulumi preview`, aws call or production cluster change is denied unless its brief has a line `ALLOW: cloud-ops`, and asks when the brief cannot be read |
| allow | only with `autoAllowReadOnly` on (below) |

Aliases and wrappers count: `tf`, `tg`, `k`, `kubecolor`, `oc`, `nix run nixpkgs#terraform -- …` (versioned attributes such as `terraform_1` too), `nix shell … -c`, `busybox sh -c`, `fish -c`, `python3 -m awscli`, `sudo`, `timeout`, `env`, `mise exec --`, `npx` and the like.

`-h` or `--help` next to an ask verb still asks (`pulumi destroy --help`), because the guard cannot tell whether an unknown flag takes `-h` as its value (`pulumi destroy --yes --event-log -h` runs the destroy).

The subagent token is the user's approval. The deny message tells the model to have the main session run the command or to ask the user, not to add the token itself.

## Settings

Set these in `/config` under cloud-ops-guard:

| Field | Default | Meaning |
| --- | --- | --- |
| `autoAllowReadOnly` | `false` | On: approve without a prompt the exact forms `tofu`/`terraform` `plan`, `init`, `validate`, `fmt`, `version`, `state list` and `state show`, also through `mise run tofu <env>` and `mise exec --`, and `aws --version` or `aws … help`. Off: the guard has no opinion on them. |
| `prodPattern` | `prod(uction)?\d*\|prd\|live` | Regex, at most 200 characters, matched case-insensitively as a whole word against kube contexts, kubeconfig paths, pulumi stacks and helmfile environments. An invalid pattern makes every production check ask. Keep it linear: no nested quantifiers such as `(a+)+`, since the hook runs it on command text the model writes. |

`plan`, `init` and `mise` tasks run code from the repository (providers, modules, the task's own script), so the default leaves them to your permission rules and adds a prompt for users who relied on the old auto-approval. Turn `autoAllowReadOnly` on to restore it. A subagent still needs the brief token with the option on.

A kubeconfig the guard cannot read counts as unknown, so a change through it asks. So does one that a command running first could switch or rewrite: an earlier command such as `kubectl config use-context …`, `aws eks update-kubeconfig` or `talosctl kubeconfig`, a substitution inside the command, or any other command when the change sits in a pipeline (its stages run at once) or the script has a loop, function, trap, `watch` or background job (`&`). Commands written after the change in plain sequence, kubectl, helm, talosctl and omnictl verbs that keep to the cluster, and `kustomize build` to stdout do not count. A `sh -c`, `bash -c` or `eval` script reads the same kubeconfig. A login or interactive shell, `zsh`, `fish`, `ssh`, `sudo` or `env` in front does not, and neither does a `KUBECONFIG` the outer script sets, so those ask.

## Limits

This is a guardrail, not a sandbox. Encoded payloads, script files and wrappers it does not know can evade it. Reasons are static: the command and environment are never printed.

The short aliases `tf`, `tg`, `k` and `oc` count as the tool only as the command word or behind a wrapper the guard knows. After a command it does not know (`watch k …`, `doas k …`) they read as data, since as arguments they are far more often something else, so spell out the tool name there.

## Tests

```
bash plugins/cloud-ops-guard/scripts/tests/check.sh
bun test plugins/cloud-ops-guard/scripts/cloud-ops-guard.spec.ts
```
