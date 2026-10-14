---
name: bash
description: Write, review, and test defensive Bash scripts, covering strict mode and its holes, quoting, arrays, trap cleanup, temp files, argument parsing, dry-run, ShellCheck config and findings, and Bats tests. Use when writing or changing *.sh, *.bash, or *.bats files, CI or hook scripts, or when fixing ShellCheck warnings and shell failures. Not for generic code changes (`coding-core:coding`), generic test strategy (`testing:unit`), chezmoi run_ scripts (`chezmoi:chezmoi`, if installed), or wiring the shellcheck pre-commit hook (`tooling:pre-commit`, if installed).
---

# Efficient Bash

Keep the script's observable contract (arguments, exit codes, output, side effects) unless the request changes it. Shell fails quietly, so the work is making failure loud and the behavior checkable.

## Workflow

1. **Pick the target shell.** Read the shebang, the file extension, and where the script runs (CI image, container, macOS, hook). Use `#!/usr/bin/env bash` for Bash, which finds the Bash on `PATH` and works where Bash isn't in `/bin`. If the script must run under `sh` (Alpine, `dash`, minimal images), read [POSIX sh](references/posix.md) and avoid Bash-only syntax. If it must run on macOS system Bash 3.2, skip `mapfile`, associative arrays, and `${var^^}`.
2. **Start from the skeleton** in [patterns](references/patterns.md): strict mode, a cleanup trap, `main "$@"`. Match an existing script's logging and option style when the repo has one.
3. **Make the change** with the rules below. Read [patterns](references/patterns.md) for argument parsing, dry-run, idempotency, file iteration, and logging.
4. **Run ShellCheck** on every changed script and fix the cause of each finding. Read [ShellCheck](references/shellcheck.md) before adding a `disable` or a `.shellcheckrc`.
5. **Test behavior, not syntax.** `bash -n` and ShellCheck don't run the script. Run it against a throwaway directory, and add Bats tests where the repo has them or the logic branches. Read [Bats](references/bats.md) for layout, `run`, stubbing, and temp dirs.
6. **Report** the commands run and what they showed. Name anything not run, such as a platform you couldn't reach.

## Strict mode and its holes

`set -Eeuo pipefail` catches most unplanned failures, but `set -e` is switched off in several places. Don't rely on it for correctness.

| Hole | What happens | Do instead |
| --- | --- | --- |
| Condition context: `if f`, `f \|\| x`, `f && x`, `while f` | `-e` is disabled inside `f`, so a failure mid-function doesn't stop it | Call `f` as its own statement so `-e` applies, or make the function check each step with `\|\| return` |
| `local x=$(cmd)`, `export x=$(cmd)` | The status of `local` replaces the status of `cmd` (SC2155) | Declare, then assign on the next line: `local x; x=$(cmd)` |
| Pipelines | Without `pipefail` only the last command's status counts | Keep `pipefail`; read `${PIPESTATUS[@]}` when one stage may fail legitimately |
| Command substitution inside another command | Bash ignores `-e` in the substitution unless `inherit_errexit` is set (Bash 4.4+) | `shopt -s inherit_errexit` |
| `((x++))` when `x` is 0 | The arithmetic result 0 is status 1, which exits | `x=$((x + 1))` |
| `! cmd` mid-script | `! cmd` returns 1 when `cmd` succeeds, but `-e` ignores it (SC2251) | Use `if cmd; then fail; fi` or `cmd && exit 1` |

`set -u` makes an unset variable fatal. Give optional variables an explicit default, `${VAR:-}`, and require mandatory ones with `${VAR:?message}`. On Bash older than 4.4, expanding an empty array under `set -u` is an error.

## Rules

- **Quote every expansion** (`"$var"`, `"${arr[@]}"`) because unquoted values split on whitespace and glob. Leave one unquoted only on purpose and say why.
- **Use arrays for argument lists**, never a string that gets re-split. Fill them with `mapfile -t arr < <(cmd)` instead of `arr=($(cmd))`.
- **Don't parse `ls`.** Iterate with a glob (`for f in ./*.txt`), or `find ... -print0` read with `IFS= read -r -d ''`, so odd filenames survive. Prefix globs with `./` or end options with `--`.
- **Clean up with a trap that is safe at every point.** Create the temp path first or guard the variable, use single quotes so it expands when the trap fires (SC2064), and never name a variable `TMPDIR`, which is the system temp directory. See the skeleton.
- **Use `mktemp`** for files and directories, with `-d` for a directory. Never build names from `$$` or the clock.
- **Guard destructive paths.** Write `rm -rf -- "${dir:?}"` so an empty variable aborts instead of expanding toward `/` (SC2115).
- **Check dependencies up front** with `command -v tool >/dev/null 2>&1`, which is a builtin and portable, where `which` isn't.
- **Print data with `printf '%s\n' "$x"`**, because `echo` mangles values that start with `-` or contain backslashes. Send diagnostics to stderr.
- **Use `[[ ]]`** in Bash for tests without word splitting; use `[ ]` only for POSIX targets.
- **Make reruns safe.** Test state before changing it (`mkdir -p`, `ln -sfn`, grep before append) and offer `--dry-run` for scripts that modify things.
- **Treat inputs as hostile.** Validate arguments against an allow-list pattern, pass `--` before user-supplied names, and never `eval` a string built from input.
- **Keep secrets out of `set -x` traces and argument lists.** Read them from files or environment variables, and turn tracing off around them.
- **Avoid `cd` without a check.** Use `cd -- "$dir" || exit` (SC2164) or a subshell, and resolve the script's own directory with `"$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"`.

## References

- [Patterns](references/patterns.md). Read for the script skeleton, argument parsing, dry-run, logging, idempotency, safe file iteration, and common pitfalls.
- [ShellCheck](references/shellcheck.md). Read to configure it, interpret findings, or suppress one correctly.
- [Bats](references/bats.md). Read to write or debug shell tests.
- [POSIX sh](references/posix.md). Read when the script must run under `sh` rather than Bash.
