# Core operations

Official documentation reviewed: [quick start](https://www.chezmoi.io/user-guide/quick-start/), [concepts](https://www.chezmoi.io/reference/concepts/), [command overview](https://www.chezmoi.io/user-guide/command-overview/), and the [command reference](https://www.chezmoi.io/reference/commands/).

## State model

chezmoi computes target state from source state (normally `~/.local/share/chezmoi`), configuration (normally `~/.config/chezmoi/chezmoi.toml`), and current destination state (normally `$HOME`). It applies only necessary changes.

## Common commands

```sh
chezmoi init                         # initialize a new source state
chezmoi init REPOSITORY              # clone and initialize a source state
chezmoi add PATH                     # copy a destination file into source state
chezmoi edit PATH                    # edit source representation for target PATH
chezmoi edit --apply PATH            # edit then apply a single target
chezmoi diff [PATH]                  # show desired versus current target state
chezmoi status                       # show managed targets differing from desired state
chezmoi apply [PATH]                 # make target state match desired state
chezmoi update                       # pull source repo and apply by default
chezmoi update --apply=false         # pull only; safely inspect before applying
chezmoi cd                           # open a shell in source state
```

`edit`, `edit-config`, `cd`, and `merge` open an editor or subshell, so they need an interactive terminal. From a non-interactive shell, edit the file at `chezmoi source-path TARGET` directly, or suggest the user run the command with `! chezmoi ...`.

`apply` prompts if it would overwrite a target modified since chezmoi last wrote it. Still, use `diff` and `--dry-run --verbose` before a consequential apply.

## New-machine deployment

```sh
chezmoi init REPOSITORY
chezmoi diff
chezmoi apply --verbose
```

`chezmoi init --apply --verbose REPOSITORY` is a convenience bootstrap that deploys immediately. Require explicit authorization before it.

## Updating source state

When a person changed a destination file and wants that change managed, run `chezmoi add PATH`; this replaces its source representation. When the intended change is in source state, use `chezmoi edit PATH` instead. Review the repository diff after either operation.

On another machine, `chezmoi update` uses `update.command` when configured; otherwise it performs `git pull --autostash --rebase` (with configured/built-in Git) and applies by default. Prefer `--apply=false` when updating unattended or unfamiliar source state.

## Config inspection

```sh
chezmoi cat-config                   # effective config, with config templates rendered
chezmoi dump-config                  # config in source-state form
chezmoi edit-config                  # edit the configuration file
chezmoi source-path TARGET           # map target to source path
chezmoi target-path SOURCE           # map source to target path
```

Use global `--config FILE --config-format FORMAT` only when the task explicitly uses a nonstandard config location or format.
