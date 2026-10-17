# ShellCheck

Read this to configure ShellCheck, interpret findings, or suppress one correctly. Behavior here matches the ShellCheck man page and wiki (0.11.0).

## Run it

```bash
shellcheck script.sh                      # shell is deduced from the shebang
shellcheck -x script.sh                   # also follow `source`d files
shellcheck -S warning -f gcc ./*.sh       # fail only on warning and above, one line per finding
shellcheck -f diff script.sh | git apply  # apply the auto-fixes it offers
```

Exit status is 0 for no findings, 1 for findings, 2 when a file couldn't be processed, and 3 or 4 for bad flags or formats. A script with no shebang and no `shell=` directive gets SC2148, so add a shebang or a `# shellcheck shell=bash` line (files meant to be sourced).

Severity runs `error`, `warning`, `info`, `style`. `-S` sets the lowest level reported. Pick a threshold the repo already passes, then tighten it.

## Configuration

ShellCheck reads `.shellcheckrc` (or `shellcheckrc`) from the script's directory and each parent, then `~/.shellcheckrc`, then `$XDG_CONFIG_HOME/shellcheckrc`. Only the first file found in the home fallback is used. `--norc` skips it, and `--rcfile` names one. The format is `key=value` lines.

```text
# .shellcheckrc at the repo root
shell=bash
source-path=SCRIPTDIR
external-sources=true
enable=require-variable-braces
disable=SC2312
```

- `shell=` sets the dialect when there is no shebang. Valid values are `sh`, `bash`, `dash`, `ksh`, and `busybox`.
- `source-path=SCRIPTDIR` resolves `source ./lib.sh` relative to the checked script. `external-sources=true` lets ShellCheck open any sourced file, which is safe for normal development.
- `enable=` turns on an optional check. List them with `shellcheck --list-optional`. Useful ones are `require-variable-braces`, `quote-safe-variables`, `check-unassigned-uppercase`, `check-extra-masked-returns`, `check-set-e-suppressed`, `deprecate-which`, and `require-double-brackets`.
- `SHELLCHECK_OPTS` sets default flags for every run, such as `--shell=bash --exclude=SC2016`.

Prefer the rc file for repo-wide settings and inline directives for single sites. Don't disable a code repo-wide to silence one line.

## Directives

```bash
# shellcheck source=./lib/common.sh
source "$LIB_DIR/common.sh"        # tells ShellCheck which file this loads

# shellcheck disable=SC2016
printf '%s\n' 'literal $HOME, not expanded'

# shellcheck disable=SC2317  # invoked through trap
cleanup() { rm -rf -- "$tmpdir"; }
```

- A directive before the first command is file-wide. Elsewhere it covers the next command or block, and a function definition or brace group counts as one block.
- Put the reason after the code on the same line. A bare `disable` with no reason is the thing a reviewer must reject.
- `disable=SC3000-SC4000` takes a range, and `disable=all` disables everything, which hides real bugs.
- Disable a code only after the finding is understood and judged wrong for this site.

## Findings that come up most

| Code | Meaning | Usual fix |
| --- | --- | --- |
| SC2086 | Unquoted expansion splits and globs | Quote it, or use an array |
| SC2046 | Unquoted command substitution | Quote it, or `mapfile` |
| SC2155 | `local x=$(cmd)` masks the status | Declare, then assign |
| SC2164 | `cd` can fail | `cd -- "$d" \|\| exit` |
| SC2064 | `trap "..."` expands now | Single-quote the trap, or call a function |
| SC2115 | `rm -rf "$d/"` could hit `/` | `"${d:?}"` |
| SC2181 | Testing `$?` indirectly | `if cmd; then` |
| SC2162 | `read` without `-r` | `read -r` |
| SC2207 | `arr=($(cmd))` | `mapfile -t arr < <(cmd)` |
| SC2068, SC2128 | Unquoted `$@`/array, or array without index | `"${arr[@]}"` |
| SC2012 | Parsing `ls` | Glob or `find` |
| SC2035 | `*` glob can become an option | `./*` or `--` |
| SC2034 | Variable assigned, never used | Remove it, or export it if another process reads it |
| SC2154 | Variable used, never assigned | Assign it, or check the spelling |
| SC2016 | `$x` inside single quotes | Intended? disable with a reason. Otherwise use double quotes |
| SC2317, SC2329 | Unreachable code, or a function never invoked | Correct for a `trap` or dispatch target, so disable with a reason. Otherwise delete the dead code |
| SC1090, SC1091 | Can't follow `source` | `source=` directive, `source-path`, or `-x` |
| SC2251 | `!` mid-script skips `-e` | Test with `if` |
| SC3010, SC3043 | `[[` or `local` under `sh` | Use POSIX forms, or change the shebang to Bash |

SC2310 and SC2312 only appear with the optional `check-set-e-suppressed` and `check-extra-masked-returns` checks. They flag the `set -e` holes covered in [SKILL.md](../SKILL.md). Enable them on scripts that rely on `set -e`.

Each code has a wiki page at `https://www.shellcheck.net/wiki/SC<number>` with good and bad examples.

## Tooling

- `shfmt` formats shell. Use it only when the repo has an `.editorconfig` or a CI step for it, and run `shfmt -d` to see the diff without writing.
- To run ShellCheck on commit, see `pre-commit` if installed.
- In CI, run `shellcheck` over `git ls-files '*.sh'` (and add `*.bash` and `*.bats` as needed). GitHub-hosted Ubuntu runners include it. Pin any action by full commit SHA and any tool installer by version (the `gh-actions` skill covers this, if installed), or follow the repo's existing convention.
