# Terragrunt

Read when the repo has `terragrunt.hcl` or `root.hcl`, or a pasted error mentions Terragrunt. Checked against Terragrunt 1.1 docs (docs.terragrunt.com; latest release 1.1.6 on 2026-10-10).

## CLI forms

Terragrunt wraps `tofu` or `terraform`. Since 0.88 it no longer forwards unknown commands, so use `run`.

| Goal | Command |
| --- | --- |
| One unit (the current directory) | `terragrunt run -- plan -out=<name>.tfplan` |
| Another unit | `terragrunt run --working-dir <dir> -- plan` |
| Every unit under the directory, in dependency order | `terragrunt run --all plan` |
| Skip Terragrunt's confirmation prompts | `--non-interactive` |

Put OpenTofu or Terraform flags after `--`, so Terragrunt does not parse them. `run-all` is deprecated in favor of `run --all`.

- Saved plans and `-target` work per unit: `terragrunt run -- plan -out=x.tfplan -target=module.foo`, review, then `terragrunt run -- apply x.tfplan`. For a unit with a `source`, tofu runs inside `.terragrunt-cache`, so find the plan file's real path from the log before applying, and delete it afterward.
- `run --all apply` runs each unit as `tofu apply -auto-approve -input=false` (seen in logs). Use `run --all plan` for review, and apply unit by unit when you need a reviewed plan.
- `-lock-timeout` passes through the same way: `terragrunt run -- apply -lock-timeout=15m x.tfplan`.
- Never edit files in `.terragrunt-cache`. Terragrunt recreates them from the unit and its `source`.

## Error: `There is no variable named "dependency"`

The message is usually a symptom. Read the other lines of the output, then match a cause below.

1. **The dependency has no outputs yet (the common case).** The same output ends with `<path> is a dependency of <path> but detected no outputs. Either the target module has not been applied yet, or the module has no outputs.` Terragrunt could not read the outputs, so `dependency` is unset and every `dependency.<name>.outputs...` reference fails at once.
   - Apply the dependency unit first, on instruction, or use `run --all` so Terragrunt orders the units.
   - If a plan must work before the dependency exists, add `mock_outputs` to the `dependency` block and limit them with `mock_outputs_allowed_terraform_commands = ["validate", "plan"]`. Leave `apply` out so mocks never reach real resources. A plan built on mocks shows fake values, so say so in the review.
   - If the dependency has applied but lacks that output, the module is missing an `output` block.
2. **The reference is in `locals`.** Terragrunt evaluates `locals` before `dependency` blocks, so a local cannot read `dependency.<name>.outputs`. Move the expression into `inputs`.
3. **No matching block in scope.** The `dependency "<name>"` block is missing, misspelled, or in a file the unit does not include. Names must match exactly.

Commands other than plan and validate, such as `import`, also need to be listed in `mock_outputs_allowed_terraform_commands` if mocks are wanted for them.

## Error: `Provider produced inconsistent final plan` on `user_data`

Seen with the fck-nat module on `aws_instance`: `provider "registry.opentofu.org/hashicorp/aws" produced an invalid new value for .user_data: was cty.StringVal("\x1f\x8b...")`, with binary-looking bytes.

- **Cause.** The upstream module gzips its cloud-init content, base64-encodes it, and passes it to `user_data`. From AWS provider v6, `aws_instance.user_data` holds cleartext and the provider treats it as text. The gzip bytes are not valid UTF-8, so they come back with replacement characters during apply and the final plan no longer matches the planned value.
- **Fix.** Make the instance use `user_data_base64` with the module's rendered cloud-init output. That keeps the gzip and is binary-safe. Pin or vendor the module and change it there (a fork or a local copy), then re-plan. A retry does not help, because the mismatch is deterministic.
- **Do not.** Re-run the apply, edit `.terragrunt-cache`, widen `ignore_changes`, or downgrade the provider to dodge it. The apply may have partly run, so run a fresh plan and check what already exists.
- **UNCONFIRMED.** The mechanism comes from the AWS provider changelog as read in one earlier session, not from re-reading the v6 upgrade guide. Confirm it there before changing a module.
