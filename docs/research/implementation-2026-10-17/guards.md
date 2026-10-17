# Batch `guards` report

## Plugins created

| Name | Type | Description (exactly as plugin.json) | Sources | Deps |
| --- | --- | --- | --- | --- |
| `check-bypass-guard` | classic hooks (`hooks/hooks.json`, PreToolUse `Bash\|Edit\|Write\|MultiEdit` -> `bun scripts/check-bypass-guard.ts`) | Hook that denies git hook and signing bypasses (--no-verify, commit -n, --no-gpg-sign, core.hooksPath overrides, SKIP=) and asks before edits to existing lint, format and pre-commit configs or their ignore files. Needs bun. | ECC `scripts/hooks/block-no-verify.js` + `config-protection.js` (MIT, Affaan Mustafa), wshobson `plugins/block-no-verify` (MIT, Seth Hobson); shell walker + unbash vendor copied from `archive/plugins/coremods/hooks/` | none |
| `bash-danger-guard` | mod (`hooks/hooks.json` `"modules": ["./register.tsx"]`) | Mod that denies destructive Bash (rm -rf of root, system or home paths, disk wipes, recursive system chmod/chown, sudo) and unparseable or oversized commands, and asks before force-pushes, hard resets and piped installers like curl \| sh. | `archive/plugins/coremods/hooks/tool-mgr/danger.ts` (copied, messages renamed), `rules.ts` (cut down to classify/askRule/withAsk), `shell/walk.ts`, `vendor/unbash.*`; tests from `tests/tool-mgr.test.tsx` and `tests/shell.test.tsx` | none |

### check-bypass-guard layout
- `scripts/check-bypass-guard.ts`: entry; reads stdin (4 MB cap), dispatches by `tool_name`, prints one `hookSpecificOutput` JSON, always exits 0; internal error or malformed input -> `ask`.
- `scripts/git-bypass.ts` (pure): parses with the walker (so quoted commit messages are never flags), sees through wrappers (env, timeout, nice, sudo, xargs, ...), `sh -c`/`eval` bodies. Denies `--no-verify` (+ git's unambiguous prefixes, from `--no-veri`) on commit/push/merge/am/rebase/cherry-pick/revert/pull; `-n` in a commit short-option cluster (stops at value-taking letters); `--no-gpg-sign` and `-c *.gpgsign=false`; `-c core.hooksPath`/`include.path`/`includeIf.*.path`, `--config-env`, `GIT_CONFIG_PARAMETERS`/`GIT_CONFIG_KEY_n`; `SKIP=`, `HUSKY=0`, `LEFTHOOK=0`, `HUSKY_SKIP_HOOKS`, `LEFTHOOK_EXCLUDE` as prefixes, via `env`, or `export` earlier in the same command. 64 KB cap; a git command that is over it or doesn't parse gets `ask`; non-git commands are left alone.
- `scripts/config-protect.ts` (pure): ECC's list plus Python (ruff, flake8, mypy, pylint, pyright, isort), Go (.golangci.*), Rust (rustfmt, clippy), pre-commit and lefthook configs, ignore files. Case-insensitive. Section-aware for `pyproject.toml` (`[tool.ruff*]`, mypy, pylint, black, isort, pyright, ...), `setup.cfg` and `tox.ini`: an Edit/MultiEdit asks only when the old text sits in, or the new text adds, a lint section; a Write asks only when lint sections differ. New files pass (lstat; non-ENOENT errors count as present). Returns `ask`, never exit 2.

### bash-danger-guard layout
- `hooks/register.tsx`: `tool.call {tool: Bash}` denies via `classify()` with a fail-closed `.catch`; `classic.PreToolUse` adds the ask (remote-exec, git-rewrite) via `withAsk`, a deny from below stands.
- `hooks/danger/danger.ts` (archive copy), `hooks/danger/rules.ts` (scan of `sh -c`/`eval`/`env -S` bodies and shell-read heredoc bodies, 64 KB too-long, 256 KB reparse cap, parse-error deny). Dropped: sed/heredoc/echo hygiene, systemone, metrics, deny logging, `/tool-mgr`.

## Validation and tests
- `claude plugin validate --strict plugins/check-bypass-guard`: passed.
- `claude plugin validate --strict plugins/bash-danger-guard`: passed (hooks: `tool.call{tool=Bash}` gating with .catch, `classic.PreToolUse`; calls `$.ui.log`). Note printed by validate: `classic.PreToolUse` hooks in a user-installed plugin don't run where an organization manages Claude Code, so the ask tier is skipped there (the deny tier still runs).
- `claude plugin test plugins/bash-danger-guard`: 87 pass, 0 fail (walker suite, ported danger/ask/composition suite, register tests through `$.tool.call`).
- `bun test plugins/check-bypass-guard/scripts/tests`: 24 pass, 0 fail (git-bypass, config-protect, and a spawn test of the real hook).
- Grep for codegraph/claude-mem/coding-core:/github:/Efficient: none. Only "coremods tool-mgr" in two provenance comments.

## Deviations
- The bash-danger-guard deny hook fails closed (`.catch` denies). The archive let the call through when classify threw.
- `claude plugin test` can't fire `classic.PreToolUse` through `$` (`$.classic` isn't in the test kit), so the ask path is tested through `withAsk` directly. I didn't test it live in a session.
- check-bypass-guard uses one script for Bash and the edit tools under one matcher, not two hook entries.
- One archive test changed meaning: a nested shell heredoc that writes a file used to be `heredoc-write` and now passes, because hygiene rules were dropped.

## Unverified / TODO
- Neither plugin was tried in a live session (`claude --plugin-dir`).
- Bash-side config edits (`sed -i .eslintrc`, `echo >> .eslintignore`) are not covered. Neither are `package.json` `eslintConfig`/`prettier` keys or Cargo.toml `[lints]`.
- `git config core.hooksPath x` as a separate persistent command is not caught. Only command-line overrides are.

## Suggested follow-ups
- The plan wants one canonical walker shared by bash-danger-guard, check-bypass-guard, cloud-ops-guard and readonly-agent-gate, kept in sync by a script. All copies here are byte-identical to `archive/plugins/coremods/hooks/shell/walk.ts` and `vendor/unbash.*`. Add a sync/check step in `scripts/`.
- Consider catching Bash writes to protected config files in check-bypass-guard, reusing the walker's redirect data.
