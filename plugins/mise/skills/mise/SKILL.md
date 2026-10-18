---
name: mise
description: Configures and debugs mise (mise-en-place, mise.jdx.dev) for pinned tool versions, project env vars and tasks. Use when a task touches mise.toml, .mise.toml, mise.local.toml or .tool-versions, or runs mise commands (use, install, exec, run, trust, env, tasks, ls, which, activate), including [tools], [env], [tasks], backends such as aqua, github, cargo, npm and pipx, and "command not found" for a tool that mise should provide. Not for Nix-based environments (devenv.nix, the `devenv` skill) or project dependency files such as package.json, pyproject.toml and uv.lock (the language package-manager skills).
---

# mise

Not for devenv or Nix shells, and not for installing project dependencies; mise pins tool versions (node, python, uv, kubectl, ...) and project env and tasks, while `npm`, `uv` and `cargo` still manage the project's own dependencies. Run `mise --version` and `mise <command> --help` before relying on a flag or setting.

## Establish the state

- Run `mise --version`, `mise config` (loaded files in precedence order) and `mise ls` (what is requested, installed and active). Read these before editing.
- Per directory, `mise.local.toml` beats `mise.toml` beats `.config/mise/config.toml`, and `.tool-versions` ranks lowest. Deeper directories override parents. Per `[tools]` entry, the nearest file replaces that tool's whole entry; it does not merge.
- `mise.local.toml` is personal and uncommitted; check `.gitignore` before putting anything there. `mise.<env>.toml` loads only when that environment is selected (`MISE_ENV`, `-E`).

## Tools

- `mise use node@24` installs and records the request in config. `mise install` only installs what config already requests and never edits config; a tool installed that way is not on PATH until it is configured. `mise exec node@24 -- cmd` runs once without recording anything.
- `mise use` writes to the nearest project config's lowest-precedence file. In a directory that only has `.tool-versions` it can write there, so check `git diff` for which file changed. `-g` writes the global config, which you should do only when the user asks.
- Pin versions in committed config (`node = "24.4"` or a major) rather than `latest`. `mise use --pin` writes the resolved version.
- Backend order of preference for CLI tools: `aqua:` and `github:` (prebuilt release assets), then language backends (`cargo:`, `npm:`, `pipx:`/`pypi:`, `go:`), which need the language runtime installed through mise first. `ubi:` is deprecated in favour of `github:` and slated for removal in 2027.1.0; migrate existing entries. Quote prefixed names as TOML keys: `"github:BurntSushi/ripgrep" = "15"`.
- Migrating `.tool-versions`: translate each line to `[tools]` in `mise.toml`, run `mise install`, check `mise ls` shows the same versions, then delete `.tool-versions` only if the user wants asdf compatibility gone. Do not keep both with differing versions; `mise.toml` wins and asdf users silently diverge.
- Version files like `.nvmrc` and `.python-version` are read only for tools listed in the `idiomatic_version_file_enable_tools` setting. Put the version in `mise.toml` instead of relying on them.

## Env

- `[env]` values are plain strings. Directives use `_`: `_.file = ".env"` loads a dotenv file, `_.path = ["{{config_root}}/node_modules/.bin"]` prepends to PATH, `_.source = "script.sh"` sources a script. Relative paths resolve from the config root.
- Put secrets in `mise.local.toml` or a gitignored dotenv, never in committed `mise.toml`. Mark names in the top-level `redactions` list so `mise env` and task output hide them.
- `[vars]` holds template values that are not exported to the environment.

## Tasks

- Define in `[tasks.name]` (`run`, `depends`, `description`, `dir`, `env`, `sources`/`outputs`) or as executable files under `mise-tasks/` with `#MISE` header comments. `run` may be a list: entries run in order and stop at the first failure.
- `depends` run first, independent ones in parallel (limited by the `jobs` setting), shared ones once. `depends_post` runs afterwards. `wait_for` only orders against tasks already scheduled; it does not add them. A task's `env` is not passed to its `depends`.
- `sources` plus `outputs` make mise skip an up-to-date task; use `mise run --force` when a task seems to do nothing.
- Pass arguments with `mise run task arg1 arg2`; mise flags go before the task name. Declare typed arguments with `usage`, read as `$usage_<name>`.
- List with `mise tasks`; show the graph with `mise tasks deps`. Steps in a `run` list are not shown as dependencies.

## Trust

- mise loads only trusted config. A config with only `[tools]` plain versions and `[tasks]` (none listing `secrets`) and no template syntax needs no trust; `[env]` directives, templates and tasks with `secrets` do. `mise run`, `mise install` and `mise exec` trust the active config for you, which is exactly why you must read an unfamiliar `mise.toml` before running any of them.
- Treat a freshly cloned or generated `mise.toml` as untrusted code: it can source scripts and run tasks. Inspect it, then `mise trust` that one file. Avoid `mise trust --all` and `trusted_config_paths` wildcards unless the user asks. `mise trust --show` lists status.

## Shell integration for agents

- `mise activate` hooks the prompt and does nothing in a non-interactive shell such as the Bash tool; shims may not be on PATH either. Use `mise exec -- cmd` (or `mise x`), or `mise run task`. Neither needs activation, only `mise` on PATH.
- `mise exec` and shims set `[env]` for the child only; `echo $VAR` in a plain shell stays empty. To get the variables in a shell, `eval "$(mise env -s bash)"`, or run the command under `mise exec`.
- Shims do not run `cd` hooks or export `[env]` into the shell, and `command -v tool` succeeds even when the tool is not installed for this directory. Check with `mise which tool`. With `not_found_system_fallback` on, a shim can also silently run an unrelated system binary of the same name.
- `mise exec` and shims auto-install missing tools, which downloads and runs binaries: shims follow `not_found_auto_install` (default true), `mise exec` follows `exec_auto_install` and `auto_install`. In an untrusted or offline setting, check `mise ls` first (uninstalled versions are marked `(missing)`), and turn those settings off if the user does not want downloads.
- A loop that calls a shimmed tool pays the resolve cost each call; wrap it in one `mise exec -- bash script.sh`.

## Failure handling

- **"Config file is not trusted".** Read the file, then `mise trust <path>`. Do not trust a parent directory wholesale.
- **Wrong version active.** `mise ls` and `mise config`: a nearer or `.local` file is overriding. `mise which <tool>` shows the real path.
- **Tool "not installed" after `mise use`.** The install may have failed; run `mise install -v` and read the backend error. Language backends need the runtime (`node`, `python`, `rust`) first.
- **Slow or surprising CI.** Use `mise exec`/`mise run`, and consider `lockfile = true` with a committed `mise.lock` for reproducible versions.

## Report

List the files changed, the mise version, the tools and versions now active (`mise ls`), the commands run, and anything installed or trusted.
