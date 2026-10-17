# Setting up prek or pre-commit

Read this when adding hooks to a repo, changing the config, updating revisions, or wiring hooks into CI. Checked against the prek 0.5 CLI reference (prek.j178.dev/reference/cli) and pre-commit's docs (pre-commit.com).

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

For a team or CI, record the version (in `mise.toml`, a CI install step, or the package manager's lockfile) so everyone runs the same one. The standalone `curl ... | sh` installer is also documented; use only the release-versioned URL from the install page.

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
- Use `repo: local` with `language: system` for tools the project already installs (`cargo fmt`, `go vet`, `npm exec`). Local hooks run only where that tool exists, so CI needs the same setup.
- Keep hooks fast. Format and lint staged files at commit time. Put slow type checks, full test suites and anything networked in CI or a `pre-push` stage (`stages: [pre-push]`).
- Hooks that fix files (formatters) fail the commit on the first run because the files changed. Re-stage and commit again.
- The hook config is executable code. Review revs and hook URLs in pull requests like build scripts.

To use prek's native `prek.toml`, run `prek util yaml-to-toml`. Keep the YAML when the same config must work with upstream pre-commit, which can't read `prek.toml`. prek-only keys (`repo: builtin`, `priorities`, glob mappings) also break that portability.

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

Run `--all-files` once after adding or changing a hook, so existing files get checked. Expect a large diff on first adoption, and commit that formatting pass separately from the config change.

## Update revisions

```bash
prek update --dry-run          # preview
prek update                    # latest tags, rewrites the config
prek update --freeze           # write commit SHAs with # frozen: comments
prek update --cooldown-days 7  # skip releases newer than 7 days
```

`pre-commit autoupdate` is the equivalent (`--freeze` and `--repo <url>` exist there too). After an update, run `prek run --all-files` and review the rev changes before committing, since a new hook version can reformat files.

## CI

Run the same config in CI so a hook skipped locally can't land bad code:

```bash
prek run --all-files
```

It exits nonzero when a hook fails or modifies files. Also:

- Check out the repo, install a pinned prek, and run it. For GitHub Actions, `j178/prek-action` wraps the install and run. Pin it by SHA per the repo's action-pinning convention (the `gh-actions` skill, if installed).
- `--from-ref origin/main --to-ref HEAD` needs both refs in the checkout, so fetch deeper. Fall back to `--all-files` when history is shallow.
- `prek update --check` in a scheduled job flags stale revs without rewriting the file.
- pre-commit.ci is a hosted alternative for GitHub repos. It runs the config, can push autofix commits to pull requests and opens autoupdate PRs, configured through the `ci:` key (`autofix_prs`, `autoupdate_schedule`, `skip`). It supports only hooks from remote repositories, so `repo: local` and `language: system` hooks go in `ci: skip`. It sends your code to a third-party service, so confirm the user wants it before adding the key or the app.
- Cache `PREK_HOME` (`~/.cache/prek` by default) only after measuring that environment setup is slow.
