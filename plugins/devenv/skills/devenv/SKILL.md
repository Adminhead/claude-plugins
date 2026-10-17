---
name: devenv
description: Configures, migrates, debugs and verifies devenv.sh developer environments. Use when a task touches devenv.nix, devenv.yaml, devenv.lock or secretspec.toml, or runs devenv commands (shell, test, up, processes, tasks, update), including languages.*, services.*, processes, tasks, scripts, git-hooks, profiles and inputs.
---

# devenv

Not for NixOS system configuration, Home Manager, plain flakes without devenv, or Dev Containers (the `devcontainer` skill, if installed).

Keep devenv modules, inputs, and lifecycle separate from general Nix and NixOS configuration. Checked against devenv 2.3.1 (`devenv --help`) and the devenv docs (devenv.sh, Context7 `/cachix/devenv`) on 2026-10-17.

## Establish the project state

- Read repo instructions and inspect `devenv.nix`, `devenv.yaml`, `devenv.lock`, imported modules, and the current diff.
- Run `devenv version`. Target that version unless the user names another. 1.x and 2.x differ in commands and options, so don't carry flags across without checking `devenv <command> --help`.
- Treat `.devenv/` as generated state. Never copy or edit it.
- Before `devenv init` in a new project, check that no conflicting config already exists. `devenv generate` is removed in 2.x (it exits with a pointer to devenv.new); in 1.x it uploaded the repo's git-tracked files to the hosted devenv.new generator. Don't use either unless the user asks, since project details leave the machine.

## Check option shapes before editing

- devenv options change between releases. Look up exact `languages.*`, `services.*`, `git-hooks.*`, profile, process, and SecretSpec shapes with Context7 (`/cachix/devenv`) or the devenv option reference.
- Read a current value with `devenv eval <attribute>` (JSON) instead of guessing. `devenv search <name>` finds packages and options.
- Try an option without editing files with `-O <attr>:<type> <value>` (for example `devenv shell -O languages.python.version:string 3.12 -- python -V`). Types are `string`, `int`, `float`, `bool`, `path`, `pkg`, `pkgs`; `pkgs!` replaces a list instead of appending.
- For migrations or lock bumps, run `devenv changelogs` and state the source and target versions.

## Put each concern in its file

| Concern | Where |
| --- | --- |
| Inputs, imports, allowed unfree or insecure packages, `secretspec` enablement | `devenv.yaml` |
| Packages, `languages.*`, `services.*`, scripts, tasks, processes, profiles, hooks, tests, shell behavior | `devenv.nix` or imported modules |
| Secret declarations (names and descriptions, never values) | `secretspec.toml` |

- Add inputs with `devenv inputs add` or a minimal YAML edit, then `devenv update <input>` for each one you changed. A bare `devenv update` refreshes every input, so run it only when that is the goal. Never hand-edit `devenv.lock`. To test an input change first, use `-o <name> <uri>` (`--override-input`).
- Use `packages` for plain binaries. Use a `languages.*` module when you need toolchain integration or version selection.
- `scripts.<name>` exposes a command in the shell. `tasks.<name>` is dependency-ordered work. `processes.<name>` is a long-running program for `devenv up`.
- Keep `enterShell` fast, deterministic, and offline-safe. Don't hide networked or stateful setup there.
- Preserve existing inputs, imports, platform conditions, profiles, and naming. Prefer a built-in service module over a hand-written wrapper. Add profiles, containers, outputs, or inputs only when the task needs them.
- Commit-time hooks: `git-hooks.*` is devenv's own pre-commit integration. If the repo also has a `.pre-commit-config.yaml`, keep one source of truth (the `pre-commit` skill covers the standalone tool, if installed).

## Keep secrets out of evaluation

- `env.*` values are public. Anything Nix evaluates can land in the store, caches, or logs.
- Never put credentials in `devenv.nix`, `devenv.yaml`, or dotenv-backed evaluation.
- Use SecretSpec: declare names in `secretspec.toml` and let each developer supply values from their own provider. Prefer runtime loading, `secretspec run -- <cmd>` inside `devenv shell`, which exposes the secret only to that process. Reading `config.secretspec.secrets.<NAME>` in `devenv.nix` puts the value into evaluation, so use it only where a service module requires it and the user accepts that.
- Pass secret file paths and runtime env vars without interpolating their contents into Nix.
- Enable unfree or insecure packages only with project or user approval.

## Validate, cheapest first

1. `devenv info` to evaluate and inspect the environment.
2. `devenv test` when the project defines `enterTest` or git hooks. Add `--override-dotfile` to run against a temporary `.devenv` instead of local state.
3. `devenv shell -- <command>` to run the affected command and the project's focused checks.
4. `devenv tasks list`, then `devenv tasks run <task>`. `--mode single` skips dependencies; the default `before` runs them first.
5. For processes, run `devenv up -d` only when runtime proof is needed. Use `devenv processes wait`, `status <name>` or `logs <name>` to watch readiness, then stop what you started with `devenv down`. `devenv up` auto-allocates a free port when one is taken unless `--strict-ports` is set, so read the actual port from the logs.
6. After input changes, confirm the `devenv.lock` diff touches only the intended inputs.

## Failure handling

- **Unknown option or type mismatch.** Compare the installed version with the option reference. Don't guess a renamed path.
- **Missing package.** Use `devenv search <name>` and confirm the input provides it on every supported system.
- **Migration failure.** Separate evaluation errors from runtime errors and apply one documented migration at a time.
- **State-sensitive failure.** Reproduce with `devenv test --override-dotfile` before deleting generated state. Never delete project data or service volumes as a shortcut. `devenv gc` deletes old shell generations only; run it when asked.

## Report

List the files changed, the devenv version targeted, the validation commands run and their results, any processes started and stopped, and any input or lock changes.
