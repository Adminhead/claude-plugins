# tooling

Adds three repo-tooling skills: creating or auditing an `.editorconfig` that agrees with the repo's formatters, setting up commit-time hooks with prek or pre-commit, and repairing a failing hook.

## What it adds

| Skill | Purpose |
| --- | --- |
| `tooling:editorconfig` | Create or audit `.editorconfig` so it matches the formatters already in use (Prettier, ruff, gofmt, rustfmt), and add `.gitattributes` line-ending rules where needed |
| `tooling:pre-commit` | Set up and maintain commit-time hooks with prek (preferred) or pre-commit: a pinned `.pre-commit-config.yaml`, installed Git shims, all-files runs, hook updates, and CI parity. Node repos that want Husky and lint-staged get a reference |
| `tooling:hook-repair` | Repair a failing pre-commit or prek hook: rerun the exact hook, fix only what it reports (re-staging files a formatter rewrote), and rerun to confirm. Leaves the fix uncommitted |

Sources: some ideas were adapted from third-party skill collections. They are credited in the Acknowledgements section of the repository README.

## Requirements

| Skill | Tools |
| --- | --- |
| `tooling:editorconfig` | `git`. Optional: the `editorconfig` CLI, and the repo's formatter in check mode (`prettier`, `ruff`, `gofmt`, `cargo fmt`) |
| `tooling:pre-commit` | `prek` (preferred) or `pre-commit`, and `git`. The skill lists install options (`uv`, Homebrew, mise, npm, Nix) and says to pin a version |
| `tooling:hook-repair` | `prek` or `pre-commit`, and `git` |

## Install

```
claude plugin marketplace add /path/to/claude-plugins
claude plugin install tooling@adminhead
```

To try it without installing:

```
claude --plugin-dir plugins/tooling
```

## Verify

1. Validate the plugin.
   ```
   claude plugin validate --strict plugins/tooling
   ```
2. Start a fresh session. The skill list should show `tooling:editorconfig`, `tooling:hook-repair`, and `tooling:pre-commit`.

## Safety

- `tooling:pre-commit` does not commit unless you ask. It reports the tool and version used, the hooks added, whether `--all-files` passed, and anything left uncommitted.
- It does not use `--no-verify` or `SKIP=<id>` to get past a failing hook unless you ask. It fixes the cause instead.
- `tooling:hook-repair` fixes the code a hook reports. It does not add `noqa` or other ignores, weaken tests, bulk-reformat unrelated files, edit the hook config, or use `--no-verify` or `SKIP=`. It does not commit, and it leaves the staged set as it found it, apart from re-staging files a formatter rewrote.
- It installs a pinned version and does not pipe an unpinned script into a shell.
- It pins every hook `rev` to a tag, or to a full commit SHA with a `# frozen: <tag>` comment. Hooks the project does not already run in CI are new policy, so it lists them for you before adding them.
- It stops if devenv owns the hooks (a `git-hooks` block in `devenv.nix`), because a second `prek install` would fight it. Use `devenv:devenv`, if installed.
- It asks before adding pre-commit.ci, because that service sends your code to a third party.
- `tooling:pre-commit` advises committing the first all-files formatting pass separately from the config change.
- `tooling:editorconfig` follows the repo's formatter config and says what it inferred. When a formatter check shows a diff, it fixes `.editorconfig`, not the formatter, unless you ask otherwise.
- Adding `.gitattributes` to a repo with CRLF files makes the next `git add --renormalize .` rewrite them. The skill runs it only when you want the churn, and in its own commit.

## Limits

- `tooling:pre-commit` was checked against prek 0.5 and pre-commit's docs. Example `rev` values are a starting point, and `prek update` refreshes them.
- prek-only features (`prek.toml`, `repo: builtin`, `priorities`, glob mappings) break compatibility with upstream pre-commit. The skill keeps the YAML when the config must work with both.
- A hook installs per clone, because the shim lives in `.git/hooks`. Document the install step or script it into the repo's setup command.
- `repo: local` and `language: system` hooks run only where the tool exists, so CI needs the same setup.
- Not covered: choosing a formatter or linter, running formatters in CI (for `tooling:editorconfig`), and GitHub Actions authoring (`github:actions`, if installed).

## Disable or uninstall

| Task | Command |
| --- | --- |
| Disable | `claude plugin disable tooling@adminhead` |
| Uninstall | `claude plugin uninstall tooling@adminhead` |

The plugin ships only skills, so both commands remove them. Files the skills created in a repo, such as `.editorconfig`, `.pre-commit-config.yaml`, and the installed Git hook, stay until you remove them. Start a new session to be sure the skills are gone.
