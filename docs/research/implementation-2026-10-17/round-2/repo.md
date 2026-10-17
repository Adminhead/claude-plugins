# Batch `repo` report (round 2)

## Plugins created

| Name | Type | Description (plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `pre-commit` | skill | Commit-time hooks with prek or pre-commit (and Husky for Node): pinned config, installs, all-files runs, rev updates, CI parity, and repairing a failing hook without bypassing it. | archive tooling/skills/pre-commit (+ references/husky-lint-staged.md), archive tooling/skills/hook-repair merged in as the "Repair a failing hook" section; archive tooling/evals (routing) | none |
| `devcontainer` | skill | Dev container skill: review and write devcontainer.json, Dev Container Features and Codespaces config against sourced spec rules, plus Codespaces startup and cost tuning. | awesome-copilot instructions/devcontainers.instructions.md -> references/rules.md; awesome-copilot skills/github-codespaces-efficiency (SKILL + 2 refs) -> references/codespaces.md. MIT, LICENSE (Copyright GitHub, Inc.) shipped | none |
| `setup-wizard` | skill (manual, `disable-model-invocation`) | Manual skill that generates a bash wizard for human-only setup steps: opens each dashboard, captures secrets with hidden input, writes a gitignored .env and sets GitHub secrets. | mattpocock/skills engineering/wizard (SKILL.md + template.sh). MIT, LICENSE (Copyright (c) 2026 Matt Pocock) shipped | none |

Layout:
- plugins/pre-commit/skills/pre-commit/{SKILL.md (63 lines), references/setup.md, references/husky-lint-staged.md}; evals/pre-commit-routing, evals/hook-repair-routing (both now grade `pre-commit:pre-commit`; the old "not pre-commit" negative grader was dropped since hook repair is now this skill).
- plugins/devcontainer/skills/devcontainer/{SKILL.md (41 lines), references/rules.md, references/codespaces.md}; evals/devcontainer-routing (new, one trigger case); LICENSE.
- plugins/setup-wizard/skills/setup-wizard/{SKILL.md (68 lines), template.sh, tests/template.spec.sh}; LICENSE.

## Validation and tests

- `claude plugin validate --strict plugins/{pre-commit,devcontainer,setup-wizard}`: all pass.
- `.claude/skills/skill-authoring/scripts/validate_skill.py` on each skill dir: all valid.
- `bash -n` + `shellcheck` on template.sh and tests/template.spec.sh: clean (two documented SC2329 disables in template.sh for trap/library helpers; SC2015/SC2016 disabled in the spec).
- `bash plugins/setup-wizard/skills/setup-wizard/tests/template.spec.sh`: 10/10 pass (round-trip of quotes/$/backslashes, gitignore added + mode 0600, decline stops before writing, upsert keeps one line, injection name refused (no command run), reserved name refused, multi-line value refused, ask_secret hides value, no temp file left, tracked .env guarded). The spec isolates git from the caller's global config (this machine's global excludes ignore .env).
- Old-name grep (codegraph, claude-mem, coding-core:, github:, github-admin:, tooling:, devenv:, Efficient, dynamic-workflows): none.
- Evals not run (`claude plugin eval` not invoked).

## template.sh audit (setup-wizard)

Upstream was already decent (read -rs, gh secret via stdin, 0600 create, single-quote escaping). Fixes made:
1. `printf -v "$key"` / `grep -E "^${key}="` took unvalidated names: a name like `x[$(cmd)]` executes cmd (confirmed). Added `_check_name` (identifier regex + reserved list: PATH, IFS, ENV_FILE, library vars, BASH*, HIST*...).
2. `.env` gitignore was never checked. Added `_ensure_env_ignored` before the first write: tracked file needs explicit yes; unignored file gets `/name` appended to the sibling .gitignore after a confirm, re-verified with `git check-ignore`, else the wizard stops.
3. Temp file for the upsert was in shared /tmp and leaked on Ctrl-C; now `mktemp "$ENV_FILE.XXXXXX"` under umask 077, removed by an EXIT trap.
4. EXIT trap restores `stty echo` if interrupted during hidden entry.
5. `set +x` at the top so `bash -x` can't trace secrets.
6. Multi-line/CR values refused (would corrupt the .env line format).
7. Warn when an existing ENV_FILE is group/world readable.
8. `set_var` documented as public-only (value is in argv); `confirm` prompt missing RESET fixed; `finish` uses if-blocks instead of `&&` lists; SC1087 false positive quieted with `${e}`.

## Facts verified (2026-10-17)

- containers.dev json_reference: userEnvProbe default loginInteractiveShell and four-file note; updateRemoteUserUID default true on Linux; waitFor default updateContentCommand; onCreateCommand/updateContentCommand caching/prebuild wording; workspaceMount/workspaceFolder "Requires" wording; overrideFeatureInstallOrder row has no label tag.
- docs.github.com Codespaces prebuilds: onCreate/updateContent run, postCreate does not.
- code.claude.com/docs/en/devcontainer: root rejection of --dangerously-skip-permissions, ~/.claude + CLAUDE_CONFIG_DIR, NET_ADMIN/NET_RAW. Also added the page's exfiltration caveat to rules.md.
- prek CLI reference (docs at 0.5.5): `update` with --dry-run/--freeze/--cooldown-days/--check, `install --overwrite/--prepare-hooks`, `run --from-ref/--to-ref/--last-commit/--show-diff-on-failure/--files`, `util yaml-to-toml` all exist.
- Not re-read: the waitFor enum in the JSON schema, the CLI's omit-config-remote-env flag, the Features spec quotes, VS Code schema deprecations (upstream checked 2026-09-01). Hook revs in the pre-commit starter config (pre-commit-hooks v6.0.0, ruff-pre-commit v0.16.10) carried from the archive, not rechecked.

## Deviations

- Plan says the devcontainer source has "11 sourced rules"; the file has twelve (11 spec + 1 Claude Code vendor rule, fenced off). Kept all twelve as upstream did.
- pre-commit: "never bypass" now also covers `SKIP=` and `core.hooksPath=` (both blocked by check-bypass-guard), not only `--no-verify`; the user is told to run a skip themselves if they insist.
- awesome-copilot's codespaces review-rubric.md dropped (meta-rubric about the skill itself, no user value).
- setup-wizard test is a bash `*.spec.sh` (not `*.test.*`, to stay out of `claude plugin test`).

## Follow-ups

- Run `claude plugin eval` on pre-commit (routing, esp. hook-repair prompt) and devcontainer; add near-miss negatives (e.g. plain Dockerfile -> docker, not devcontainer).
- Coordinator: register the three plugins; `pre-commit` likely belongs near `check-bypass-guard` docs; `devcontainer` could join `iac-meta` or stay direct.
