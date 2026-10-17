#!/usr/bin/env bash
# Test for install.sh against a temp HOME and a stub claude; touches neither the real HOME nor the real claude.
set -euo pipefail

script=$(cd "$(dirname "$0")" && pwd -P)/install.sh
repo=$(dirname "$(dirname "$script")")
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin"
export STUB_LOG=$tmp/calls STUB_MKT=$tmp/markets.json STUB_LIST=$tmp/list.json
# Tool shims (mise) look for their config and installs under HOME; keep them reading the real XDG dirs.
export XDG_CONFIG_HOME=${XDG_CONFIG_HOME:-$HOME/.config} XDG_DATA_HOME=${XDG_DATA_HOME:-$HOME/.local/share}
export XDG_CACHE_HOME=${XDG_CACHE_HOME:-$HOME/.cache} XDG_STATE_HOME=${XDG_STATE_HOME:-$HOME/.local/state}
export HOME=$tmp/home
unset CLAUDE_CONFIG_DIR STUB_FAIL_ADD STUB_FAIL_INSTALL
cat > "$tmp/bin/claude" <<'EOF'
#!/bin/sh
echo "$*" >> "$STUB_LOG"
case "$*" in
  "plugin marketplace list --json") cat "$STUB_MKT" ;;
  "plugin list --json") cat "$STUB_LIST" ;;
  "plugin marketplace add "*) [ "$4" = "${STUB_FAIL_ADD:-}" ] && exit 1 ;;
  "plugin install "*) [ "$3" = "${STUB_FAIL_INSTALL:-}" ] && exit 1 ;;
esac
exit 0
EOF
chmod +x "$tmp/bin/claude"
export PATH=$tmp/bin:$PATH

mapfile -t required < <(echo baseline; jq -r '.dependencies[]' "$repo/plugins/baseline/.claude-plugin/plugin.json")
launcher=$HOME/.local/bin/claude-tmux
crew_launcher=$HOME/.local/bin/claude-crew
fail() { echo "FAIL: $*" >&2; exit 1; }

list_with() { # list_with SKIP: plugin list json with every required id at user scope except SKIP
  local id entries=()
  for id in "${required[@]}"; do
    [[ $id == "${1:-}" ]] || entries+=("{\"id\":\"$id@adminhead\",\"scope\":\"user\",\"enabled\":true}")
  done
  (IFS=,; echo "[${entries[*]}]")
}
reset() { # fresh HOME, no marketplaces, all plugins listed, empty call log
  rm -rf "$HOME" "$STUB_LOG"; mkdir -p "$HOME/.claude"; : > "$STUB_LOG"
  echo '[]' > "$STUB_MKT"; list_with > "$STUB_LIST"; unset STUB_FAIL_ADD STUB_FAIL_INSTALL
}
mutating() { grep -v -e '^plugin list --json$' -e '^plugin marketplace list --json$' "$STUB_LOG" || true; }
baks() { find "$HOME/.local/bin" -maxdepth 1 -name 'claude-tmux.bak-*' | wc -l; }

expected_installs="plugin install baseline@adminhead --scope user"$'\n'
third_party="plugin marketplace add boostvolt/claude-code-lsps
plugin marketplace add conorbronsdon/avoid-ai-writing
plugin install avoid-ai-writing@conorbronsdon-skills --scope user"

# 1. Fresh HOME: launcher link and the exact order of adds and installs
reset
out=$("$script" 2>&1) || fail "1: fresh run failed:"$'\n'"$out"
[[ $(readlink "$launcher") == "$repo/scripts/claude-tmux.sh" ]] || fail "1: launcher link"
[[ $(readlink "$crew_launcher") == "$repo/scripts/claude-crew.sh" ]] || fail "1: crew launcher link"
want="plugin marketplace add $repo"$'\n'"$expected_installs$third_party"
[[ $(mutating) == "$want" ]] || fail "1: calls were:"$'\n'"$(mutating)"

# 2. Rerun with adminhead at the repo path: no backup, update runs
echo "[{\"name\":\"adminhead\",\"source\":\"directory\",\"path\":\"$repo\"}]" > "$STUB_MKT"
: > "$STUB_LOG"
"$script" >/dev/null 2>&1 || fail "2: rerun failed"
(( $(baks) == 0 )) || fail "2: rerun made a backup"
mutating | grep -qx 'plugin marketplace update adminhead' || fail "2: no marketplace update"
if mutating | grep -q 'marketplace add .*claude-plugins$'; then fail "2: re-added adminhead"; fi

# 3. Existing launcher path: real file, wrong symlink, dangling symlink; backups stay unique
echo old > "$tmp/other"
pre=$launcher.bak-pre.AAAA
for kind in file wrong dangling; do
  reset; mkdir -p "$HOME/.local/bin" "$pre"; echo keep > "$pre/claude-tmux"
  case $kind in
    file) echo old > "$launcher" ;;
    wrong) ln -s "$tmp/other" "$launcher" ;;
    dangling) ln -s "$tmp/nowhere" "$launcher" ;;
  esac
  out=$("$script" 2>&1) || fail "3 $kind: run failed"
  [[ $(readlink "$launcher") == "$repo/scripts/claude-tmux.sh" ]] || fail "3 $kind: link"
  (( $(baks) == 2 )) || fail "3 $kind: want 2 backups, got $(baks)"
  [[ $(cat "$pre/claude-tmux") == keep ]] || fail "3 $kind: old backup touched"
  new=$(find "$HOME/.local/bin" -maxdepth 1 -name 'claude-tmux.bak-*' ! -path "$pre")
  [[ $out == *"$new"* ]] || fail "3 $kind: backup path not printed"
  case $kind in
    file) [[ $(cat "$new/claude-tmux") == old ]] || fail "3 file: contents lost" ;;
    wrong) [[ $(readlink "$new/claude-tmux") == "$tmp/other" ]] || fail "3 wrong: link lost" ;;
    dangling) [[ $(readlink "$new/claude-tmux") == "$tmp/nowhere" ]] || fail "3 dangling: link lost" ;;
  esac
done

# 4. adminhead at another path: refuse before any change
reset
echo '[{"name":"adminhead","source":"directory","path":"/elsewhere/clone"}]' > "$STUB_MKT"
if "$script" >/dev/null 2>"$tmp/err"; then fail "4: accepted another path"; fi
grep -q '/elsewhere/clone' "$tmp/err" || fail "4: error does not name the path"
[[ -z $(mutating) ]] || fail "4: mutating calls: $(mutating)"
[[ ! -e $HOME/.local ]] || fail "4: touched launcher dir"

# 5. CLAUDE_CONFIG_DIR elsewhere: refuse
reset
if CLAUDE_CONFIG_DIR=/elsewhere "$script" >/dev/null 2>&1; then fail "5: accepted CLAUDE_CONFIG_DIR"; fi
[[ ! -s $STUB_LOG && -z $(ls -A "$HOME/.claude") && ! -e $HOME/.local ]] || fail "5: changed state"

# 6. --dry-run on fresh HOME: nothing changes, only list calls, every command printed
reset
out=$("$script" --dry-run 2>&1) || fail "6: dry run failed"
[[ -z $(mutating) ]] || fail "6: mutating calls: $(mutating)"
[[ ! -e $HOME/.local ]] || fail "6: created launcher dir"
for line in "+ ln -s $repo/scripts/claude-tmux.sh $launcher" \
  "+ ln -s $repo/scripts/claude-crew.sh $crew_launcher" \
  "+ claude plugin marketplace add $repo" \
  "+ claude plugin install baseline@adminhead --scope user" \
  "+ claude plugin marketplace add boostvolt/claude-code-lsps" \
  "+ claude plugin install avoid-ai-writing@conorbronsdon-skills --scope user"; do
  [[ $out == *"$line"* ]] || fail "6: missing '$line'"
done

# 7. Third-party add fails: required installs still run, then nonzero exit
reset
if STUB_FAIL_ADD=boostvolt/claude-code-lsps "$script" >/dev/null 2>&1; then fail "7: exit 0"; fi
mutating | grep -qx 'plugin install baseline@adminhead --scope user' || fail "7: required installs missing"
mutating | grep -qx 'plugin install avoid-ai-writing@conorbronsdon-skills --scope user' || fail "7: later step skipped"

# 8. Read-back misses one required id: nonzero exit
reset; list_with crew > "$STUB_LIST"
if "$script" >/dev/null 2>"$tmp/err"; then fail "8: exit 0"; fi
grep -q 'crew@adminhead' "$tmp/err" || fail "8: error does not name crew"
[[ $(tail -n1 "$tmp/err") == "error: 1 required plugin(s) not installed: crew@adminhead" ]] || fail "8: no final summary: $(tail -n1 "$tmp/err")"

# 9. A member is installed but disabled: nonzero exit, error names it and the fix
reset; list_with | jq -c 'map(if .id == "crew@adminhead" then .enabled = false else . end)' > "$STUB_LIST"
if "$script" >/dev/null 2>"$tmp/err"; then fail "9: exit 0"; fi
grep -q 'crew@adminhead is installed but disabled; run: claude plugin enable crew@adminhead --scope user' "$tmp/err" || fail "9: no disabled message"
[[ $(tail -n1 "$tmp/err") == "error: 1 required plugin(s) not installed: crew@adminhead" ]] || fail "9: no final summary"

# 10. A member exists only at project scope: it is not installed at user scope
reset; list_with | jq -c 'map(if .id == "crew@adminhead" then .scope = "project" else . end)' > "$STUB_LIST"
if "$script" >/dev/null 2>"$tmp/err"; then fail "10: exit 0"; fi
grep -q 'crew@adminhead is not installed at user scope' "$tmp/err" || fail "10: no scope message"

# 11. Partial install: the baseline install fails and only coremods landed; every gap is named
reset; list_with | jq -c 'map(select(.id == "coremods@adminhead"))' > "$STUB_LIST"
if STUB_FAIL_INSTALL=baseline@adminhead "$script" >/dev/null 2>"$tmp/err"; then fail "11: exit 0"; fi
grep -q 'install failed: baseline@adminhead' "$tmp/err" || fail "11: no install failure message"
for id in "${required[@]}"; do
  [[ $id == coremods ]] || grep -q "$id@adminhead" "$tmp/err" || fail "11: $id not reported"
done
mutating | grep -qx 'plugin install avoid-ai-writing@conorbronsdon-skills --scope user' || fail "11: later step skipped"

echo "all install checks passed"
