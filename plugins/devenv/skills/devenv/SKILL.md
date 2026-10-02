---
name: devenv
description: Configure, migrate, debug, and verify devenv.sh developer environments. Use when a task touches devenv.nix, devenv.yaml, devenv.lock, or devenv commands (shell, test, up, tasks, update), including languages.*, services.*, processes, tasks, scripts, git-hooks, profiles, inputs, or SecretSpec. Not for NixOS system config or Home Manager.
---

# Devenv

Keep devenv modules, inputs, and lifecycle separate from general Nix and NixOS configuration.

## Establish the project state

- Read repo instructions and inspect `devenv.nix`, `devenv.yaml`, `devenv.lock`, imported modules, and the current diff.
- Run `devenv version`. Target that version unless the user names another.
- Treat `.devenv/` as generated state. Never copy or edit it.
- Before `devenv init` in a new project, check that no conflicting config already exists.

## Check option shapes before editing

- devenv options change between releases. Look up exact `languages.*`, `services.*`, `git-hooks.*`, profile, process-manager, and SecretSpec shapes with Context7 (`/cachix/devenv`) or the devenv option reference.
- Read a current value with `devenv eval <attribute>` (JSON) instead of guessing.
- For migrations or lock bumps, run `devenv changelogs` and state the source and target versions.

## Put each concern in its file

| Concern | Where |
| --- | --- |
| Inputs, allowed unfree or insecure packages | `devenv.yaml` |
| Packages, `languages.*`, `services.*`, scripts, tasks, processes, profiles, hooks, tests, shell behavior | `devenv.nix` or imported modules |

- Add inputs with `devenv inputs add` or a minimal YAML edit, then `devenv update <input>` for each one you changed. A bare `devenv update` refreshes every input, so run it only when that is the goal. Never hand-edit `devenv.lock`.
- Use `packages` for plain binaries. Use a `languages.*` module when you need toolchain integration or version selection.
- `scripts.<name>` exposes a command in the shell. `tasks.<name>` is dependency-ordered work. `processes.<name>` is a long-running program for `devenv up`.
- Keep `enterShell` fast, deterministic, and offline-safe. Don't hide networked or stateful setup there.
- Preserve existing inputs, imports, platform conditions, profiles, and naming. Prefer a built-in service module over a hand-written wrapper. Add profiles, containers, outputs, or inputs only when the task needs them.

## Keep secrets out of evaluation

- `env.*` values are public. Anything Nix evaluates can land in the store, caches, or logs.
- Never put credentials in `devenv.nix`, `devenv.yaml`, or dotenv-backed evaluation. devenv deprecates dotenv for secrets.
- Use SecretSpec, or pass secret file paths and runtime env vars without interpolating their contents into Nix.
- Enable unfree or insecure packages only with project or user approval.

## Validate, cheapest first

1. `devenv info` to evaluate and inspect the environment.
2. `devenv test` when the project defines `enterTest` or git hooks. Add `--override-dotfile` to run against a temporary `.devenv` instead of local state.
3. `devenv shell -- <command>` to run the affected command and the project's focused checks.
4. `devenv tasks run <task>` for tasks.
5. For processes, run `devenv up -d` only when runtime proof is needed. Watch readiness or logs, then stop what you started with `devenv down`.
6. After input changes, confirm the `devenv.lock` diff touches only the intended inputs.

## Failure handling

- **Unknown option or type mismatch.** Compare the installed version with the option reference. Don't guess a renamed path.
- **Missing package.** Use `devenv search <name>` and confirm the input provides it on every supported system.
- **Migration failure.** Separate evaluation errors from runtime errors and apply one documented migration at a time.
- **State-sensitive failure.** Reproduce with `devenv test --override-dotfile` before deleting generated state. Never delete project data or service volumes as a shortcut.
