---
name: pre-commit
description: Sets up, updates and repairs commit-time hooks with prek (preferred) or pre-commit, plus Husky and lint-staged for Node repos. Use when adding a .pre-commit-config.yaml, running hooks across a repo, bumping hook revs, wiring hooks into CI, or when a commit or `prek run` fails on a hook and needs fixing.
---

# Commit-time hooks with prek or pre-commit

Not for repos where devenv manages the hooks (the `devenv` skill, if installed), authoring GitHub Actions workflows (`gh-actions`, if installed), or choosing which linter to adopt.

prek is a single-binary Rust reimplementation of pre-commit. It reads the same `.pre-commit-config.yaml` and hook repositories, so everything here works with either tool. Prefer prek: it needs no Python and runs faster. Use pre-commit when the team already standardizes on it or prek can't be installed. Checked against prek 0.5 and pre-commit.com.

## Never bypass a hook

A hook failure is a finding in the code. Fix the code; don't route around the check. Never suggest or run `git commit --no-verify`, `SKIP=<id>`, `-c core.hooksPath=...`, or an edit to `.pre-commit-config.yaml` that disables or loosens a hook to get a commit through. The `check-bypass-guard` plugin blocks those git forms when installed. If the user explicitly wants a hook skipped, tell them the command to run themselves.

## Check the starting state

- Look for `.pre-commit-config.yaml`, `prek.toml`, `.husky/`, and a `git-hooks` block in `devenv.nix`. If devenv owns the hooks, stop: its module generates the config as a Nix-store symlink and installs the hook on `devenv shell`, so a second `prek install` would fight it.
- Run `prek --version`, else `pre-commit --version`. Use whichever is installed, prek first.
- Run `git config core.hooksPath`. prek follows a repo-local `core.hooksPath`; pre-commit refuses to install while it is set.
- Pick hooks from tools the repo already runs (formatters, linters, type checkers). A hook the project doesn't already run in CI is new policy, so list it for the user before adding it.

## Set up or update hooks

Read `references/setup.md` for the install table, a pinned starter config, `prek install` flags, run selections, `prek update` and CI wiring. The short version:

1. Install a pinned prek (`uv tool install prek`, `brew install prek`, `mise use prek`).
2. Write `.pre-commit-config.yaml` with every `rev` pinned to a tag or a frozen SHA. Keep commit-time hooks fast; move slow checks to `pre-push` or CI.
3. `prek install` (add `--hook-type` for other stages), then `prek run --all-files` once and commit the formatting pass separately from the config.
4. Run `prek run --all-files` in CI so a hook skipped locally can't land bad code.
5. To bump revs: `prek update --dry-run`, then `prek update`, then `prek run --all-files` and review the diff.

For a pure Node repo that wants Husky and lint-staged instead, read `references/husky-lint-staged.md`. Prefer prek when the repo is polyglot or already has a `.pre-commit-config.yaml`.

## Repair a failing hook

Use this when a commit, `prek run` or `pre-commit run` fails and the user wants it fixed.

1. **Capture.** Note the failing hook id (the name before the dots, or `id:` in the config) and the file selection (staged files for a commit, or `--all-files`). Record `git status --porcelain`; the repair ends with the same staged set.
2. **Reproduce** only that hook on the same selection: `prek run <hook-id> --show-diff-on-failure` (add `--all-files` or `--files a b` to match). Use `pre-commit run` with the same arguments when prek is absent. If it passes on rerun, the earlier failure was a formatter's first pass or a stale run; confirm and stop.
3. **Classify and fix.**

| Hook output | Meaning | Action |
| --- | --- | --- |
| "files were modified by this hook" (formatter, end-of-file, trailing whitespace) | The hook already rewrote the files. | Read the diff, re-stage the files that were staged before (`git add <those paths>`), rerun. |
| File and line findings (linter, type checker, secret scan, test) | The code breaks a rule. | Change the code so the rule holds, touching only the reported files and lines. |
| Hook can't run (missing tool, bad `rev`, network, absent `language: system` binary) | Environment problem, not a code finding. | Report the cause; fixing the toolchain is setup work (see above). |

Fix at the cause: a type error means fixing the types, a failing test means fixing the code under test. For an auto-fixable linter (`ruff --fix`, `eslint --fix`), run it only on the reported files and read the diff.

Don't, unless the user asks (and then name it in the report):

- Suppress a rule: no `# noqa`, `# type: ignore`, `eslint-disable`, `#[allow]`, `nolint`, or new `ignore`, `exclude` or `per-file-ignores` entries. If a finding looks like a false positive, say why and ask.
- Weaken a test (loosened assertion, skip, deleted case) to turn a hook green.
- Bulk-reformat the repo. Run formatters on the reported files only, so unrelated churn doesn't bury the fix.
- Edit the hook config to make a failure go away.

4. **Confirm.** Rerun the exact hook and expect a pass. When more than one hook was failing, rerun the full set once on the same selection, since one fix can trip another hook. Stop after three rounds that don't converge and report what each round changed and what still fails.
5. **Leave the tree as found.** Don't commit. The staged set should match the starting record, plus only files a formatter rewrote. A hook that passes after an unstaged rewrite still needs the user's commit to carry the rewritten bytes.

## Report

For setup: the tool and version, the hooks added and why, whether `--all-files` passed, and anything left uncommitted. For a repair: the hook id, the findings, the files changed and the rerun result. Don't commit unless asked.
