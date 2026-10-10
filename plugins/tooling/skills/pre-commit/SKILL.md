---
name: pre-commit
description: Set up and maintain commit-time hooks with prek (preferred) or pre-commit, using a pinned .pre-commit-config.yaml, installed Git shims, all-files runs, hook updates, and CI parity. Use when adding or configuring pre-commit hooks, running hooks across a repo, updating hook revisions, or wiring hooks into CI. Node repos that want Husky and lint-staged get a reference. Not for repairing a failing hook (`tooling:hook-repair`), repos where devenv manages hooks (devenv:devenv), GitHub Actions authoring (github:actions), or deciding which linter to adopt.
---

# Commit-time hooks with prek or pre-commit

prek is a single-binary Rust reimplementation of pre-commit. It reads the same `.pre-commit-config.yaml` and hook repositories, so the config and workflow below work with either tool. Prefer prek because it needs no Python and runs faster. Fall back to pre-commit when the team already standardizes on it or prek can't be installed. This skill was checked against prek 0.5 (docs at prek.j178.dev) and pre-commit's docs at pre-commit.com.

## Check the starting state

- Look for `.pre-commit-config.yaml`, `prek.toml`, `.husky/`, and a `git-hooks` block in `devenv.nix`. If devenv owns the hooks, stop and use `devenv:devenv` if installed. Its `git-hooks` module generates `.pre-commit-config.yaml` as a symlink into the Nix store and installs the Git hook on `devenv shell`, so a second `prek install` would fight it.
- Run `prek --version` or `pre-commit --version`. Use whichever is installed, prek first.
- Run `git config core.hooksPath`. A custom path changes where shims go; prek follows repo-local `core.hooksPath`, while pre-commit refuses to install when it is set.
- Pick hooks from the repo's own tools (formatters, linters, type checkers). Hooks the project doesn't already run in CI are new policy, so list them for the user before adding them.

## Install the tool

Install a pinned version, and never pipe an unpinned script into a shell.

| Method | Command |
| --- | --- |
| uv | `uv tool install prek` |
| Homebrew | `brew install prek` |
| mise | `mise use prek` |
| npm | `npm install -g @j178/prek` |
| Nix | `nix profile install nixpkgs#prek` |
| pre-commit fallback | `uv tool install pre-commit` or `pip install pre-commit` |

For a team or CI, record the version (in `mise.toml`, a CI install step, or the lockfile of your package manager) so everyone runs the same one. The standalone `curl ... | sh` installer is also documented, but only use the release-versioned URL from the install page.

## Write the config

Create `.pre-commit-config.yaml` at the repo root. Pin every `rev` to a tag, or to a full commit SHA with a `# frozen: <tag>` comment when immutable pins are required. Branch names and `HEAD` are mutable and make runs unrepeatable.

```yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v6.0.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.16.10
    hooks:
      - id: ruff-check
        args: [--fix]
      - id: ruff-format
```

- Treat the revs above as a starting point and refresh them with the update command below.
- Use `repo: local` with `language: system` for tools the project already installs (for example `cargo fmt`, `go vet`, `npm exec`). Local hooks run only where that tool exists, so CI needs the same setup.
- Keep hooks fast. Format and lint staged files at commit time. Put slow type checks, full test suites, and anything networked in CI or a `pre-push` stage via `stages: [pre-push]`.
- Hooks that fix files (formatters) make the commit fail on the first run because the files changed. Re-stage and commit again.
- The hook config is executable code. Review revs and hook URLs in pull requests like build scripts.

To use prek's native `prek.toml`, run `prek util yaml-to-toml`. Keep the YAML when the same config must work with upstream pre-commit, since pre-commit can't read `prek.toml`. Newer prek-only keys (`repo: builtin`, `priorities`, glob mappings) also break that portability.

## Install the Git hook

```bash
prek install                 # writes .git/hooks/pre-commit
prek install --hook-type pre-push --hook-type commit-msg   # more stages, if the config uses them
prek install --prepare-hooks # also builds hook environments up front
```

Existing hooks from `pre-commit install` need `prek install --overwrite` once (`-f` also works). `prek install` installs only `pre-commit` unless `--hook-type` or `default_install_hook_types` in the config says otherwise. For pre-commit use `pre-commit install` with the same `--hook-type` flag.

Installing is a per-clone step. Document it in the contributing guide, or script it into the repo's setup command, since the shim lives in `.git/hooks` and isn't committed.

## Run hooks

```bash
prek run                       # staged files only
prek run --all-files           # every tracked file
prek run <hook-id>             # one hook
prek run --from-ref origin/main --to-ref HEAD   # files changed on a branch
prek run --last-commit
prek list                      # configured hooks
```

Run `--all-files` once after adding or changing a hook, so existing files get checked. Expect a large diff on first adoption. Commit that formatting pass separately from the config change. Don't use `--no-verify` or `SKIP=<id>` to get past a failing hook unless the user asks. Fix the cause instead.

## Update revisions

```bash
prek update --dry-run          # preview
prek update                    # latest tags, rewrites the config
prek update --freeze           # write commit SHAs with # frozen: comments
prek update --cooldown-days 7  # skip releases newer than 7 days
```

`pre-commit autoupdate` is the equivalent (`--freeze` and `--repo <url>` exist there too). After an update, run `prek run --all-files` and review the rev changes before committing, since a new hook version can reformat files.

## CI

Run the same config in CI so a skipped local hook can't land bad code:

```bash
prek run --all-files
```

The command exits nonzero when a hook fails or modifies files. Other points:

- Check out the repo, install a pinned prek, and run it. For GitHub Actions, `j178/prek-action` wraps the install and run. Pin it by SHA per the repo's action-pinning convention (`github:actions` if installed).
- `--from-ref origin/main --to-ref HEAD` needs both refs in the checkout, so use a deeper fetch. Fall back to `--all-files` when history is shallow.
- Use `prek update --check` in a scheduled job to flag stale revs without rewriting the file.
- pre-commit.ci is a hosted alternative for GitHub repos. It runs the config, can push autofix commits to pull requests, and opens autoupdate PRs. Configure it through the `ci:` key (`autofix_prs`, `autoupdate_schedule`, `skip`). It only supports hooks from remote repositories, so `repo: local` and `language: system` hooks must go in `ci: skip`. It sends your code to a third-party service, so confirm the user wants it before adding the key or the app.
- Cache `PREK_HOME` (`~/.cache/prek` by default) only after measuring that environment setup is slow.

## Node repos with Husky

A pure Node project can use Husky and lint-staged instead. Prefer prek when the repo is polyglot or already has `.pre-commit-config.yaml`. Read `references/husky-lint-staged.md` for the setup steps.

## Report

State which tool and version you used, the hooks added and why, whether `--all-files` passed, and anything you left uncommitted. Don't commit unless asked.
