---
name: terraform
description: Write, review, and run Terraform, OpenTofu, and Terragrunt changes safely, covering module layout, provider pinning, remote state and locks, plan review, saved-plan apply, targeted plans, import, moved and removed blocks, for_each over count, secrets in state, and terragrunt.hcl errors. Use when editing .tf or terragrunt.hcl files, running or reviewing tofu or terraform plan and apply (directly or through mise, make, or task wrappers), applying a saved plan file, adding a VM or other resource to existing infrastructure code, waiting on a state lock, or diagnosing a pasted tofu or terragrunt error. Plan-only by default. Not for Kubernetes manifests (infra:kubernetes), Helm charts (infra:helm), or AWS service questions (`aws:architecture-review` or `aws:resource-query`, if installed).
---

# Terraform, OpenTofu, and Terragrunt

This skill was checked against Terraform 1.16 docs (developer.hashicorp.com/terraform), OpenTofu 1.13 docs (opentofu.org/docs), and Terragrunt 1.1 docs (docs.terragrunt.com). The CLI is `terraform` or `tofu`; commands below work with both unless a section says otherwise. Find which one the repo uses (a `.terraform.lock.hcl` from either, CI scripts, a `.tofu` file, an `encryption` block) and keep using it. Many repos run it through a wrapper (`mise run tofu`, `make`, `task`, or Terragrunt). Read the wrapper's definition and use it, since it sets the working directory, workspace, and credentials.

## Safety contract

- Run `init`, `validate`, `fmt -check`, and `plan` freely. Never run `apply`, `destroy`, `state rm`, `state mv`, `force-unlock`, or `import` (the CLI command) without an explicit instruction naming the target workspace. These change real infrastructure or state, and state edits are hard to undo.
- Save plans with `plan -out=tfplan` and show the user the diff. Apply only that saved file, so what was reviewed is what runs. A plan file holds sensitive values in plaintext, so add `tfplan*` and `*.tfplan.json` to `.gitignore`, keep them out of commits, and delete them after apply or scan.
- Never paste state, plan, or `.tfvars` contents into replies. They hold secrets in plain text (see the secrets section).
- Use `-lock=false` only for a stated emergency, and say so. Prefer `-lock-timeout` when another run holds the lock.
- Treat `-target` as a scoped last resort (see "Running plans and applies"). It plans a partial graph and hides drift.

## Workflow for a change

1. Identify the root module, backend, workspace, and provider versions: `terraform version`, `terraform providers`, and the `terraform {}` block.
2. Edit. Keep the diff small, one logical change per plan.
3. `terraform fmt -check -recursive` and `terraform validate`.
4. `terraform plan -out=tfplan -detailed-exitcode`. Exit 0 means no changes, 1 an error, 2 changes present.
5. Review the plan with the checklist below, then report to the user. Applying is the user's step.

## Running plans and applies

Wrapper commands change the spelling, not the rules. Check the wrapper's task definition for how it forwards arguments.

- **Saved-plan flow.** Plan to a file, show it to the user, apply that exact file only on instruction, then delete it.
  ```
  tofu plan -out=<root>.tfplan -lock-timeout=5m
  tofu show <root>.tfplan
  tofu apply <root>.tfplan -lock-timeout=5m
  rm <root>.tfplan
  ```
  Passing a plan file is the approval, so `-auto-approve` is ignored. Apply accepts no planning options such as `-target` or `-var` with a saved plan, because the file already holds those decisions, so set them at plan time. Ephemeral variables must be passed again on apply. If another apply changed the state after the plan was made, re-plan instead of forcing it.
- **Shared state.** When several people, CI jobs, or agents share a backend, add `-lock-timeout=<duration>` to `plan` and `apply` so a run waits for the lock instead of failing at once. It does not clear a stuck lock. Read the holder from the lock error (ID, who, created) before considering `force-unlock`, which needs explicit instruction.
- **`-target` as a last resort.** Use `-target=module.<name>` or a resource address when a shared root holds unrelated work in flight, or to apply a dependency the rest needs first. Say so in the report, because drift outside the target is not shown. Follow with an untargeted `plan` that shows no changes. Never use it to hide an unexpected diff.
- **`-auto-approve` without a saved plan** applies whatever the fresh plan contains. Do not use it on shared roots without instruction.
- **Terragrunt.** See the Terragrunt section below for the `run` forms and two recurring errors.

## Plan review checklist

- Every `destroy` and `replace` (shown as `-/+`) has a reason the user can state. Replacement of stateful resources (databases, disks, buckets) is a stop sign.
- Address changes show as destroy plus create. That means a rename or move needs a `moved` block, not a new resource (see `references/refactoring.md`).
- Changes you did not make point to drift, a provider upgrade, or a changed default. Run `terraform plan -refresh-only` to separate drift from config changes.
- Count the resources. A plan of 200 changes for a one-line edit means an address or `for_each` key shifted.
- Sensitive values appear as `(sensitive value)`. Check the plan does not force replacement because of them.
- The plan was made against the intended workspace and backend, with the same provider versions CI will use.

## Module and file layout

Follow the standard module structure: `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`, a README, `modules/` for nested modules, and `examples/` for usage.

- Give every variable and output a `description`. Add a `type`, and a `validation` block where a bad value would produce a confusing failure later.
- Separate environments by root module and state, not by copy-pasted resources. Each environment directory calls shared modules with its own inputs and backend.
- Write a module when you can name the pattern it encapsulates and at least two callers exist. A module that wraps one resource with the same inputs adds indirection only.
- Pass provider configurations into modules through `providers`, and never configure providers inside a reusable module.
- Tag or label resources through a single `tags` variable merged with defaults, or the provider's `default_tags`, rather than per-resource literals.

## for_each over count

Use `for_each` for any collection where items have identity (subnets, users, buckets). `count` addresses instances by position, so removing the second of three subnets renumbers the third and plans a destroy and recreate of it. `for_each` keys instances by map key or set member, so removals touch only that instance.

```hcl
resource "aws_subnet" "private" {
  for_each          = var.private_subnets   # map: name => { cidr, az }
  vpc_id            = aws_vpc.main.id
  cidr_block        = each.value.cidr
  availability_zone = each.value.az
}
```

- Keys must be known at plan time. A key built from another resource's generated ID fails with "value depends on resource attributes that cannot be determined until apply". Key on a stable input name instead.
- Sensitive values cannot be used as `for_each` keys.
- Keep `count` for a conditional single resource (`count = var.enabled ? 1 : 0`) or truly identical copies. OpenTofu 1.11 adds `lifecycle { enabled = ... }` for the conditional case.
- Converting an existing `count` resource to `for_each` changes every address. Add one `moved` block per instance in the same change.

## Provider and version pinning

```hcl
terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
}
```

- Set `required_version` and a version range for every provider. `~>` allows only the rightmost component to rise, so patch and minor updates arrive without a breaking major.
- Commit `.terraform.lock.hcl`. It pins exact provider versions and checksums and makes review of upgrades possible. Upgrade deliberately with `init -upgrade` and read the diff.
- If CI and developers use different platforms, run `providers lock -platform=linux_amd64 -platform=darwin_arm64` so the lock file holds checksums for each.
- Pin module `source` to a tag or version (`version = "~> 5.0"` for registry modules, `?ref=v1.2.3` for git). A floating branch makes plans irreproducible.

## State, backends, and locking

Read `references/state-and-backends.md` for backend choice, locking, encryption, workspaces, and state surgery. The rules that always apply:

- Use a remote backend with locking for anything more than one person or CI. Local state on a laptop gets lost and cannot be locked.
- Keep credentials out of the `backend` block. Supply them through environment variables or a credential file, because values passed via `-backend-config` or hardcoded are written into `.terraform/` and plan files.
- Treat the state file as a secret.
- Split state by blast radius and change rate (network, data, apps). One giant state slows every plan and makes every change risky.

## Secrets

Terraform stores all resource attributes in state, including passwords and keys the provider returns, and `sensitive = true` only hides them from CLI output.

- Prefer values that never reach state. Ephemeral resources, variables, and write-only (`*_wo`) arguments omit values from state and plan files. They need Terraform 1.10 and 1.11 respectively; check that the provider resource offers a `_wo` argument before relying on it.
- Otherwise read secrets from a secret manager at runtime (the application fetches them) instead of passing them through Terraform.
- Where a secret must be in state, encrypt the backend and restrict who can read it. OpenTofu can also encrypt state client-side (see `references/opentofu.md`).
- Never commit `.tfvars` with secrets. Supply them via `TF_VAR_<name>` or the CI secret store.

## Terragrunt

Read `references/terragrunt.md` when the repo has `terragrunt.hcl` or `root.hcl`, or the error output mentions Terragrunt, a `dependency`, or `.terragrunt-cache`. It covers the CLI forms, dependency outputs and mocks, and the causes of `There is no variable named "dependency"` and `Provider produced inconsistent final plan ... user_data`.

## Import, moved, and removed

Read `references/refactoring.md` before renaming resources, moving them into modules, importing existing infrastructure, or dropping resources from management. Use declarative blocks (`import`, `moved`, `removed`) in code instead of CLI state commands, so the change is reviewed in a plan and reproducible in every environment.

## Testing and scanning

- `terraform test` (1.6+) runs `.tftest.hcl` files. A `run` block defaults to `command = apply`, which creates real infrastructure. Use `command = plan` or mock providers (1.7+) for unit-style checks, and say which one you ran.
- Static scan: `trivy config .` reads Terraform sources, and also a saved plan converted with `terraform show -json tfplan > tfplan.json`. The JSON file also holds plaintext secrets, so delete it after the scan. Checkov is an alternative scanner. Scan results are findings for the user, not an instruction to suppress rules.
- Pin scanner versions in CI and avoid options that upload code to a hosted service unless the user opted in.

## Drift

`terraform plan -refresh-only` shows differences between state and real infrastructure without proposing config changes. Decide per difference whether to revert it (normal plan and apply) or accept it (update the config, or `apply -refresh-only` after approval). Run it on a schedule in CI with `-detailed-exitcode` and alert on exit 2.

## Sources

- developer.hashicorp.com/terraform: cli/commands/apply; language/block/moved, removed, import; language/import/generating-configuration; cli/commands/plan; language/meta-arguments/for_each; language/state/sensitive-data; language/backend/s3; language/tests; language/block/terraform; language/modules/develop/structure
- opentofu.org/docs: language/state/encryption, language/files/dependency-lock, language/settings/backends/configuration, language/meta-arguments/enabled
- opentofu.org/docs/cli/commands/apply
- docs.terragrunt.com: reference/hcl/blocks (dependency), reference/hcl/overview (parsing order), migrate/cli-redesign
- trivy.dev/latest/docs/coverage/iac/terraform
