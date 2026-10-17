---
name: chezmoi
description: Manages, migrates and troubleshoots chezmoi dotfiles with a preview-first apply. Use when a task runs chezmoi commands or edits ~/.local/share/chezmoi, dot_/private_/.tmpl source files, .chezmoidata, .chezmoiexternal, run_ scripts, or age or password-manager secrets in dotfiles.
---

# chezmoi

Not for generic Git work or Home Manager-managed dotfiles. Checked against chezmoi v2.73.1 (`chezmoi help`) and chezmoi.io on 2026-10-17; run `chezmoi --version` and `chezmoi help <command>` when a flag matters.

chezmoi computes a target state from the source directory (normally `~/.local/share/chezmoi`), the config (`~/.config/chezmoi/chezmoi.toml`), and the destination (normally `$HOME`). `apply` changes real files, so always preview the computed state first.

## Inspect first

```bash
chezmoi status
chezmoi diff
chezmoi cat-config
chezmoi source-path ~/.example   # target -> source path
chezmoi target-path dot_example  # source -> target path
```

`chezmoi cd` opens a subshell, which doesn't work from Bash. Use `chezmoi source-path` and operate on files there directly.

## Common workflows

- **Manage an existing file.** `chezmoi add PATH`, edit the source file (path from `chezmoi source-path PATH`), then `chezmoi diff PATH`.
- **Pull source changes.** `chezmoi update --apply=false`, inspect `chezmoi diff`, then apply. A bare `update` pulls and applies.
- **Bootstrap a machine.** `chezmoi init REPO`, then `chezmoi diff`. `chezmoi init --apply` deploys immediately and needs explicit approval.
- **Commit source changes.** Use the `git-commit` skill (if installed) inside the source directory, committing only the intended files. Avoid `chezmoi push`, which runs `git add`, `git commit` and `git push` on everything in the source directory.

Read [core operations](references/core-operations.md) for command semantics and config inspection.

## Apply gate

1. Run `chezmoi diff` and `chezmoi apply --dry-run --verbose`. Look for every unexpected deletion, permission change, script, external fetch, or secret prompt.
2. Ask with AskUserQuestion before a real `apply`, naming the affected targets and any scripts that will run. Dry runs never execute scripts, so call that out.
3. After applying, run `chezmoi status` and, where a clean state is expected, `chezmoi verify` (exit 0 means targets match).

Never run `destroy`, `purge`, `remove`/`rm`, `state delete-bucket`, or anything with `--force` without explicit approval and a checked backup. `forget` stops managing a file without deleting it, which is usually the safer choice. Read [safety and recovery](references/safety-recovery.md) for diagnostics and destructive boundaries.

## Source-state model

- Source names encode target name, type, and attributes: `dot_gitconfig` → `~/.gitconfig`. Prefixes such as `private_`, `executable_`, `readonly_`, `create_`, `modify_`, `encrypted_`, and `exact_`, and the `.tmpl` suffix, change behavior.
- Change attributes with `chezmoi add --template|--encrypt|--create|--exact` or `chezmoi chattr`, not by renaming files by hand. Prefix order matters.
- Explain and get approval before creating `exact_`, `remove_`, `run_`, `run_once_`, or `run_onchange_` entries. They can delete files or run programs on apply.
- Use `chezmoi add --follow` when migrating from a symlink-based manager.

Read [source state](references/source-state.md) before editing attributes, symlinks, exact directories, or scripts.

## Templates and data

- Model stable, non-secret machine differences as data. Shared values go in `.chezmoidata.*`, per-machine values in the config's `[data]`. Inspect with `chezmoi data`.
- Test rendering with `chezmoi execute-template` before applying.
- Put init prompts only in `.chezmoi.toml.tmpl`, using `promptStringOnce` and the other `*Once` forms.
- Exclude targets per machine with `.chezmoiignore`.

Read [templates, data, and config](references/templates-data-config.md) for data precedence and init-template testing.

## Secrets, externals, scripts

- To render a secret into a target, use the password-manager template function for the provider the user already has. For Proton Pass that is `protonPass "pass://..."`; build references with the `pass-cli` skill if installed.
- To version a secret file, encrypt it with `chezmoi add --encrypt`, using the mechanism `chezmoi cat-config` shows as configured (age, GPG, or another). `chezmoi edit-encrypted` opens an editor, so from Bash edit the deployed target instead and re-run `chezmoi add --encrypt PATH`.
- Rendered output can contain secrets. Don't print `chezmoi cat` or `execute-template` output for secret-bearing files; check exit status or redirect to a private temp file.
- Pin `.chezmoiexternal.*` entries with a checksum or immutable release. Refresh deliberately with `--refresh-externals`.
- Scripts need a shebang, must be idempotent, and must not modify source or destination state during the same run.

Read [secrets and encryption](references/secrets-encryption.md) and [externals and scripts](references/externals-scripts.md) before adding either.

## Report

List source files changed, target paths affected, any attributes, scripts, externals, or secrets added, the preview and verify commands run, and whether a real apply happened. Never call a dry run a deployment.
