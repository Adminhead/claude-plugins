# POSIX sh

Read this when the script must run under `sh` (Alpine and BusyBox `ash`, Debian `dash`, minimal containers) instead of Bash. Bash-only syntax in a `#!/bin/sh` script works on a machine where `sh` is Bash and breaks elsewhere, so check with a real `sh`.

## Verify the target

```bash
shellcheck -s sh script.sh      # POSIX findings appear as SC3xxx
dash script.sh                  # if installed, run it under a strict shell
```

ShellCheck treats `-s sh` as POSIX `sh`, not the local one, and flags portability problems.

## Not available in POSIX sh

| Bash feature | POSIX replacement |
| --- | --- |
| `[[ ... ]]`, `==` in tests | `[ ... ]` with `=`, and `case` for patterns |
| Arrays, `mapfile` | Positional parameters (`set --`, `"$@"`), or newline-delimited text with `while read` |
| `${var//a/b}`, `${var^^}` | `sed`, `tr`, or `case` and `${var#prefix}` / `${var%suffix}` |
| Process substitution `<(...)` | A temp file or a pipe |
| `pipefail` | Check stages separately, or write to a temp file |
| `&>`, `\|&` | `>file 2>&1` |
| `source file` | `. ./file` |
| `((x++))` as a command | `x=$((x + 1))` |
| `echo -e`, `echo -n` | `printf` |
| `function f {` | `f() {` |
| `trap ... ERR`, `RETURN` | Not defined. Use `EXIT` and explicit `\|\| exit` |
| `BASH_SOURCE`, `$RANDOM` | `$0`, and `mktemp` for unique names |

`local` is not in POSIX, although `dash` and BusyBox `ash` implement it. ShellCheck reports it as SC3043. Use it only when every target shell supports it, or name variables with a function prefix.

## Template

```sh
#!/bin/sh
set -eu

tmpdir=''
cleanup() {
  [ -z "$tmpdir" ] || rm -rf -- "$tmpdir"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

tmpdir=$(mktemp -d)
```

- `set -eu` is the strict mode. `pipefail` and `-E` are not POSIX, so check pipeline stages explicitly.
- Whether a shell runs the `EXIT` trap when a signal kills it varies, so trap `INT` and `TERM` to `exit` explicitly.
- Check tools with `command -v tool >/dev/null 2>&1`.
- Parse options with `getopts` for short flags, or a `while`/`case` loop with `shift`, ending at `--`.
- `IFS` changes leak across the script, so set it only on the command that needs it (`IFS=, read -r a b`).
