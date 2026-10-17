# chezmoi

Teaches Claude Code to manage, migrate, and troubleshoot [chezmoi](https://www.chezmoi.io/) dotfiles. The skill puts a preview-then-approve gate in front of every `apply` and keeps secrets out of the transcript.

## What it adds

| Skill | Replaces | Purpose |
| --- | --- | --- |
| `chezmoi:chezmoi` | `chezmoi` | Manage, migrate, and troubleshoot chezmoi-managed dotfiles: source-state attributes, templates, machine data, age/GPG encryption, password-manager functions, externals, `run_` scripts, and safe apply |

It replaces the user-level skill of the same name. Invoke it as `chezmoi:chezmoi`. The bare name `chezmoi` no longer works.

The skill has six references: core operations, source state, templates and data, secrets and encryption, externals and scripts, and safety and recovery.

## Behavior

- Inspects first with `chezmoi status`, `diff`, and `cat-config`.
- Requires `chezmoi diff` and `chezmoi apply --dry-run --verbose` before a real `apply`, then asks before applying.
- Does not run `destroy`, `purge`, `remove`, `state delete-bucket`, or any `--force` command without approval and a checked backup.
- Asks before creating `exact_`, `remove_`, `run_`, `run_once_`, or `run_onchange_` entries.
- Does not print rendered output of secret-bearing files.

## Requirements

- `chezmoi` on `PATH`. The skill names no tested version.
- Optional `pass-cli:pass-cli` plugin, used to build `protonPass "pass://..."` references for templates.
- Optional `git:commit` skill, used to commit source changes.
- Encryption examples use age; GPG, git-crypt, and transcrypt are also covered.

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install chezmoi@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/chezmoi
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/chezmoi
   ```
2. Start a fresh session. The skill list should show `chezmoi:chezmoi`.

## Limits

- `chezmoi cd` and `chezmoi edit-encrypted` open an interactive shell or editor, so Claude works around them from Bash.
- A dry run never executes scripts. The skill says so before asking to apply.
- It is not for generic Git work or Home Manager-managed dotfiles.
- The `protonPass` examples assume Proton Pass. Other password managers are not covered.

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable chezmoi@adminhead` |
| Uninstall | `claude plugin uninstall chezmoi@adminhead` |

The plugin ships only a skill, so both commands remove it. Start a new session to be sure it is gone.
