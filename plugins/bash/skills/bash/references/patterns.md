# Bash patterns

Read this for the script skeleton, argument parsing, dry-run, logging, idempotency, file iteration, and common pitfalls.

## Skeleton

```bash
#!/usr/bin/env bash
# deploy.sh - one line on what this does.
# Usage: deploy.sh [--dry-run] [-v] <target>
set -Eeuo pipefail
shopt -s inherit_errexit

readonly SCRIPT_NAME=${0##*/}

tmpdir=''
cleanup() {
  [[ -z $tmpdir ]] || rm -rf -- "$tmpdir"
}
trap cleanup EXIT
trap 'printf "%s: error at line %d\n" "$SCRIPT_NAME" "$LINENO" >&2' ERR

main() {
  tmpdir=$(mktemp -d)
  # ...
}

main "$@"
```

- `tmpdir=''` comes first, so the trap can fire at any point, even before `mktemp` runs, without tripping `set -u`. The trap body is single-quoted or a function, so it expands at exit.
- Bash runs the `EXIT` trap when `SIGINT` or `SIGTERM` ends the script, so one trap covers normal exit, errors, and signals. `SIGKILL` can't be trapped. POSIX shells differ, see [POSIX sh](posix.md).
- `set -E` makes functions and subshells inherit the `ERR` trap. The trap reports the line but doesn't stop the script. `set -e` does that.
- `inherit_errexit` needs Bash 4.4 or newer. Drop it for 3.2 targets and check substitutions by hand.

## Argument parsing

For short options use `getopts`. For long options use a `while`/`case` loop, which has no dependencies.

```bash
dry_run=0 verbose=0
while (($#)); do
  case $1 in
    -n | --dry-run) dry_run=1 ;;
    -v | --verbose) verbose=1 ;;
    -h | --help) usage; exit 0 ;;
    --) shift; break ;;
    -*) printf '%s: unknown option: %s\n' "$SCRIPT_NAME" "$1" >&2; exit 2 ;;
    *) break ;;
  esac
  shift
done
(($# == 1)) || { usage >&2; exit 2; }
target=$1
```

Exit 2 for usage errors and 1 for runtime failures. Validate values after parsing, for example `[[ $target =~ ^[a-z][a-z0-9-]*$ ]]`, and pass `--` before user-supplied names to commands.

## Dry-run

Route every mutation through one function so the dry-run path can't drift from the real one.

```bash
run() {
  if ((dry_run)); then
    printf '[dry-run] %q' "$1"; (($# > 1)) && printf ' %q' "${@:2}"; printf '\n'
  else
    "$@"
  fi
}

run rm -rf -- "$old_release"
```

`printf %q` shows each argument shell-escaped, which is how the command would be typed.

## Logging

```bash
log()  { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" >&2; }
die()  { log "ERROR: $*"; exit 1; }
debug() { ((verbose)) && log "DEBUG: $*"; return 0; }
```

Logs go to stderr so stdout stays usable in pipelines. `debug` ends with `return 0` because a false `((verbose))` would otherwise return 1 and, called as the last statement of a function under `set -e`, exit the script.

## Idempotency

Test before changing, so a rerun after a partial failure converges.

```bash
mkdir -p -- "$dir"                              # no error if present
ln -sfn -- "$target" "$link"                    # replace the link atomically enough for most uses
grep -qxF -- "$line" "$file" || printf '%s\n' "$line" >> "$file"
command -v jq >/dev/null 2>&1 || die "jq is required"
```

Write a file by writing to a temp file in the same directory and `mv` it into place, so readers never see a half-written file.

For cron and timer jobs, stop a slow run from overlapping the next one with a lock (`flock` is in util-linux, so not on macOS by default):

```bash
exec 9>"${XDG_RUNTIME_DIR:-/tmp}/${SCRIPT_NAME}.lock"
flock -n 9 || { printf '%s: already running\n' "$SCRIPT_NAME" >&2; exit 0; }
```

The lock is released when the script exits and fd 9 closes, including on a crash, so there is no stale lock file to clean up.

## Iterating files and splitting output

```bash
# Globs. nullglob makes an unmatched pattern expand to nothing instead of itself.
shopt -s nullglob
for f in ./*.log; do ...; done

# find, with NUL separators for any filename
while IFS= read -r -d '' f; do ...; done < <(find . -name '*.tmp' -print0)

# Fill an array from lines (Bash 4+) or NUL-separated names (4.4+)
mapfile -t lines < <(git ls-files)
mapfile -d '' -t files < <(find . -type f -print0)
```

The `< <(...)` form keeps the loop in the current shell, so variables set inside it survive. A `cmd | while read` loop runs the body in a subshell and loses them. `mapfile` and process substitution hide the producer's failure, so check it when it matters, for example by writing to a file first.

## Pitfalls

| Pitfall | Why it bites | Fix |
| --- | --- | --- |
| `for f in $(ls)` | Splits on whitespace, globs the results | Glob or `find -print0` |
| `arr=($(cmd))` | Splits and globs the output (SC2207) | `mapfile -t arr < <(cmd)` |
| `[ $x = y ]` | Breaks when `x` is empty or has spaces | `[[ $x == y ]]` or quote |
| `cmd; if [ $? -eq 0 ]` | Verbose and fragile (SC2181) | `if cmd; then` |
| `read line` | Backslashes are mangled (SC2162) | `IFS= read -r line` |
| `cat file \| while read` | Subshell loses variables | `while read ...; done < file` |
| `echo "$x"` | `-n`, `-e`, and backslashes change meaning | `printf '%s\n' "$x"` |
| `cd dir; rm -rf *` | A failed `cd` deletes the current directory | `cd -- dir \|\| exit`, or use absolute paths |
| `trap "rm -rf $d" EXIT` | `$d` expands now, not at exit (SC2064) | Single quotes or a function |
| Backticks | Nest badly (SC2006) | `$(...)` |
| `sudo cmd > /root/file` | The redirect runs as you | `cmd \| sudo tee /root/file >/dev/null` |
| `local x=$(cmd)` | Masks `cmd`'s status (SC2155) | `local x; x=$(cmd)` |

## Quality checklist

- ShellCheck is clean, and each `disable` has a reason beside it.
- Every expansion is quoted, or the exception is commented.
- A trap removes every temp file and directory, and works if the script dies early.
- Usage errors, runtime failures, and success exit with different, documented codes.
- Mutating steps go through a dry-run path, and a second run changes nothing.
- A test covers at least the success path and one failure path.
