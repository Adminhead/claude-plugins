#!/usr/bin/env bash
# shellcheck disable=SC2015,SC2016  # pass||fail one-liners; snippets run in a child bash
# Non-interactive checks for the wizard library in ../template.sh.
# Run: bash tests/template.spec.sh   (needs bash and git; no network)
set -euo pipefail

here=$(cd "$(dirname "$0")" && pwd)
tpl="$here/../template.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
# Ignore the caller's global git config and excludes (a global .env ignore
# would hide the gitignore paths under test).
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 XDG_CONFIG_HOME="$work/xdg"
fails=0
pass() { printf 'ok   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }

# The library is everything above run_wizard().
sed '/^run_wizard() {$/,$d' "$tpl" > "$work/lib.sh"

# run SCRIPT [STDIN]: run a snippet against the library in a fresh repo dir.
run() {
  local dir; dir=$(mktemp -d "$work/case.XXXXXX")
  git -C "$dir" init -q
  ( cd "$dir" && printf '%s' "${2:-}" | bash -c "source '$work/lib.sh'; $1" ) 2>&1
  echo "dir=$dir"
}

# 1. Quotes, $ and backslashes round-trip through write_env and _existing.
out=$(run 'write_env TOKEN "a'"'"'b\$c\\d \"e\"" >/dev/null; printf "[%s]" "$(_existing TOKEN)"' $'y\n')
[[ "$out" == *"[a'b\$c\\d \"e\"]"* ]] && pass "round-trip special characters" || fail "round-trip: $out"

# 2. First write adds .env to .gitignore after a yes, and the file is 0600.
out=$(run 'write_env A 1 >/dev/null; git check-ignore -q .env && echo IGNORED; stat -c %a .env' $'y\n')
[[ "$out" == *IGNORED* && "$out" == *600* ]] && pass "gitignore added, mode 0600" || fail "gitignore/mode: $out"

# 3. Declining the gitignore prompt stops before anything is written.
out=$(run 'write_env A 1; echo SHOULD-NOT-REACH' $'n\n') || true
[[ "$out" != *SHOULD-NOT-REACH* && "$(sed -n 's/^dir=//p' <<<"$out")" ]] && ! [[ -e "$(sed -n 's/^dir=//p' <<<"$out")/.env" ]] \
  && pass "decline stops without writing" || fail "decline: $out"

# 4. Upsert replaces the old line instead of appending a second one.
out=$(run 'write_env A 1 >/dev/null; write_env A 2 >/dev/null; grep -c "^A=" .env; cat .env' $'y\n')
[[ "$out" == *$'1\n'"A='2'"* ]] && pass "upsert keeps one line" || fail "upsert: $out"

# 5. Unsafe names are refused before printf -v or grep see them.
out=$(run 'write_env "x[\$(touch pwned)]" v; echo SHOULD-NOT-REACH' $'y\n') || true
d=$(sed -n 's/^dir=//p' <<<"$out")
[[ ! -e "$d/pwned" && "$out" != *SHOULD-NOT-REACH* && "$out" == *"invalid name"* ]] && pass "invalid name refused" || fail "invalid name: $out"
out=$(run 'write_env PATH v; echo SHOULD-NOT-REACH' $'y\n') || true
[[ "$out" == *reserved* && "$out" != *SHOULD-NOT-REACH* ]] && pass "reserved name refused" || fail "reserved: $out"

# 6. Multi-line values are refused.
out=$(run 'write_env A "$(printf "a\nb")"; echo SHOULD-NOT-REACH' $'y\n') || true
[[ "$out" == *"spans lines"* ]] && pass "multi-line value refused" || fail "multi-line: $out"

# 7. ask_secret reads into the variable and never prints the value.
out=$(run 'ask_secret S "Secret:"; printf "len=%s" "${#S}"' $'hunter2-secret\n')
[[ "$out" == *len=14* && "$out" != *hunter2* ]] && pass "ask_secret hides value" || fail "ask_secret: $out"

# 8. No temp file is left next to .env.
out=$(run 'write_env A 1 >/dev/null; ls -a' $'y\n')
[[ "$out" != *".env."* ]] && pass "no temp file left" || fail "temp file: $out"

# 9. A tracked .env needs an explicit yes.
out=$(run ': > .env; git add .env; write_env A 1; echo SHOULD-NOT-REACH' $'n\n') || true
[[ "$out" == *"tracked by git"* && "$out" != *SHOULD-NOT-REACH* ]] && pass "tracked .env guarded" || fail "tracked: $out"

(( fails == 0 )) && echo "all passed" || { echo "$fails failed"; exit 1; }
