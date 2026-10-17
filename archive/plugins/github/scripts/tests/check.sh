#!/usr/bin/env bash
# Offline checks for mcp-headers.sh. `gh` is stubbed via PATH; no network.
set -uo pipefail

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
S=$here/../mcp-headers.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir "$tmp/bin" "$tmp/nogh"
# The stub records its arguments, then prints $GH_STUB_OUT (printf %b) or fails if unset.
cat >"$tmp/bin/gh" <<'STUB'
#!/bin/sh
echo "$*" >>"$GH_CALLS"
[ -n "${GH_STUB_OUT+x}" ] || { echo "gh: not logged in" >&2; exit 1; }
printf '%b' "$GH_STUB_OUT"
STUB
chmod +x "$tmp/bin/gh"
# Minimal PATH without gh (symlink only what the script needs).
for c in bash env; do ln -s "$(command -v "$c")" "$tmp/nogh/$c"; done
export GH_CALLS=$tmp/calls

fails=0
ok() { echo "ok   $1"; }
bad() { echo "FAIL $1"; fails=$((fails + 1)); }

# run PATH OUT [VAR=value...]: stdout in $tmp/out, stderr in $tmp/err, exit in $rc.
# OUT is the stub's output; "-" makes the stub fail. Token env vars are unset to
# mirror Claude Code's helper environment.
run() {
  local path=$1 out=$2
  shift 2
  : >"$GH_CALLS"
  local stub=(GH_STUB_OUT="$out")
  [[ $out == - ]] && stub=()
  env -u GITHUB_MCP_TOKEN -u GH_TOKEN -u GITHUB_TOKEN PATH="$path" "${stub[@]}" "$@" bash "$S" >"$tmp/out" 2>"$tmp/err" </dev/null
  rc=$?
}
withgh=$tmp/bin:$PATH

run "$withgh" ghp_stubtoken123
[[ $rc == 0 && $(<"$tmp/out") == '{"Authorization":"Bearer ghp_stubtoken123"}' ]] && ok "success JSON" || bad "success JSON"
[[ $(<"$GH_CALLS") == 'auth token --hostname github.com' ]] && ok "gh called with exact args" || bad "gh called with exact args"
grep -q 'using gh login for github.com' "$tmp/err" && ok "success logged to stderr" || bad "success logged to stderr"
grep -q ghp_stubtoken123 "$tmp/err" && bad "token leaked to stderr" || ok "token absent from stderr"

run "$withgh" ghp_stubtoken123 GH_HOST=ghe.example.com
[[ $rc == 0 && $(<"$GH_CALLS") == 'auth token --hostname github.com' ]] && ok "GH_HOST set: still github.com" || bad "GH_HOST set: still github.com"

run "$tmp/nogh" ghp_x
[[ $rc == 1 && ! -s $tmp/out ]] && grep -q 'gh not found' "$tmp/err" && ok "gh missing: exit 1, empty stdout, message" || bad "gh missing: exit 1, empty stdout, message"

run "$withgh" -
[[ $rc == 1 && ! -s $tmp/out ]] && grep -q "gh auth login --hostname github.com" "$tmp/err" && ok "gh fails: exit 1, empty stdout, message" || bad "gh fails: exit 1, empty stdout, message"

run "$withgh" ''
[[ $rc == 1 && ! -s $tmp/out ]] && ok "gh empty output: exit 1, empty stdout" || bad "gh empty output: exit 1, empty stdout"

bad_tok='bad"token'
for tok in "$bad_tok" 'ghp_abc \n' 'ghp_abc\r\n' 'ghp abc'; do
  run "$withgh" "$tok"
  [[ $rc == 1 && ! -s $tmp/out ]] && ok "rejected: $tok" || bad "rejected: $tok"
  grep -q 'ghp_abc\|bad"token' "$tmp/err" && bad "rejected token echoed: $tok"
done

pat=github_pat_$(printf 'A%.0s' {1..22})_$(printf 'b%.0s' {1..59})
for tok in "$pat" ghp_0123456789abcdef gho_0123456789abcdef; do
  run "$withgh" "$tok"
  [[ $rc == 0 && $(<"$tmp/out") == "{\"Authorization\":\"Bearer $tok\"}" ]] && ok "accepted: ${tok:0:11}" || bad "accepted: ${tok:0:11}"
done

if ((fails)); then
  echo "$fails check(s) failed"
  exit 1
fi
echo "all checks passed"
