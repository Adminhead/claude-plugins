# Safety, verification, and recovery

Official documentation reviewed: [`apply`](https://www.chezmoi.io/reference/commands/apply/), [`verify`](https://www.chezmoi.io/reference/commands/verify/), [`doctor`](https://www.chezmoi.io/reference/commands/doctor/), [troubleshooting](https://www.chezmoi.io/user-guide/frequently-asked-questions/troubleshooting/), [`destroy`](https://www.chezmoi.io/reference/commands/destroy/), [`forget`](https://www.chezmoi.io/reference/commands/forget/), and [`purge`](https://www.chezmoi.io/reference/commands/purge/).

## Standard inspection sequence

```sh
chezmoi status
chezmoi diff
chezmoi --dry-run --verbose apply
chezmoi apply --verbose       # only after the preview is accepted
chezmoi verify
```

`verify` exits 0 when target state matches and 1 otherwise. It is appropriate for a post-apply check or CI-style assertion; it does not change targets.

## Diagnostics

```sh
chezmoi doctor
chezmoi doctor --no-network
chezmoi managed
chezmoi unmanaged
chezmoi ignored
chezmoi cat PATH
chezmoi source-path TARGET
chezmoi target-path SOURCE
chezmoi --debug diff PATH
chezmoi merge TARGET
```

For template problems, run `chezmoi execute-template` on the relevant source template. For script failures, confirm a shebang, interpreter availability/configuration, executable path, rendered contents, and whether a previous run's persistent state suppresses execution. Use `--keep-going` only when collecting independent errors; do not mistake it for a successful apply.

## Destructive boundaries

- `forget TARGET` stops managing a destination but does not remove it.
- `remove` / `rm`, `destroy`, and `purge` are destructive. Consult the exact command help/version before acting.
- `destroy` permanently removes source, destination, and state. `purge` removes chezmoi traces/configuration as part of intentional uninstallation.
- `--force` bypasses safety prompts.
- `exact_` directories and `remove_` entries can delete target files during apply.

Before a destructive operation, require explicit user authorization, identify affected paths, create or verify a restorable backup, run the narrowest applicable dry run, and report the recovery method. Never substitute a broad apply for an unverified targeted operation.
