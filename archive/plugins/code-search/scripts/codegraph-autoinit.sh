#!/usr/bin/env bash
# SessionStart hook: index the session's git repo with CodeGraph if it has no index.
# Every skip logs one line to ${CLAUDE_PLUGIN_DATA}/codegraph-autoinit.log and exits 0,
# so this hook never fails a session. The index build itself runs detached, so it
# survives the end of a short session (for example `claude -p`).
set -u

if [ -z "${CLAUDE_PLUGIN_DATA:-}" ]; then
  echo "code-search: CLAUDE_PLUGIN_DATA is unset; skipping codegraph auto-init" >&2
  exit 0
fi
mkdir -p "$CLAUDE_PLUGIN_DATA" || {
  echo "code-search: cannot create $CLAUDE_PLUGIN_DATA; skipping codegraph auto-init" >&2
  exit 0
}
log="$CLAUDE_PLUGIN_DATA/codegraph-autoinit.log"

say() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$log"; }
skip() { say "skip: $*"; exit 0; }

# 1. User option. The serialization of a false boolean is UNCONFIRMED, so accept several.
opt=$(printf '%s' "${CLAUDE_PLUGIN_OPTION_CODEGRAPH_AUTO_INIT:-}" | tr '[:upper:]' '[:lower:]')
case $opt in
  false|0|no|off) skip "codegraph_auto_init option is $opt" ;;
esac

# 2. Neutral cwd, so a repo-pinned mise shim or relative PATH entry cannot swap the
# binary. PATH entries already exported by the launching shell still apply.
cd "$CLAUDE_PLUGIN_DATA" || skip "cannot cd to $CLAUDE_PLUGIN_DATA"
bin=$(command -v codegraph) || skip "codegraph not on PATH"

# 3. Git repos only.
dir=${CLAUDE_PROJECT_DIR:-$PWD}
top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || skip "$dir is not a git repo"

# Never run a codegraph binary that lives inside the repo being indexed.
real=$(realpath "$bin" 2>/dev/null || readlink -f "$bin" 2>/dev/null || printf '%s' "$bin")
case $real in
  "$top"/*) skip "codegraph resolves inside the repo: $real" ;;
esac

# 4. Linked worktrees resolve to the parent's index, if nested inside it.
# --path-format needs git 2.31+; on older git the values are empty, so skip.
git_dir=$(git -C "$top" rev-parse --path-format=absolute --git-dir 2>/dev/null)
common_dir=$(git -C "$top" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
{ [ -z "$git_dir" ] || [ -z "$common_dir" ]; } && skip "git too old for --path-format=absolute (need 2.31+)"
[ "$git_dir" != "$common_dir" ] && skip "$top is a linked worktree"

# 5. Never index a home directory or the filesystem root.
{ [ "$top" = "${HOME:-}" ] || [ "$top" = "/" ]; } && skip "$top is \$HOME or /"

# 6. An index at the top level or any ancestor below $HOME already covers this repo.
# A real index holds codegraph.db. ~/.codegraph holds global state only, so the walk
# stops at $HOME, and a .codegraph/ without codegraph.db counts as no index.
d=$top
while :; do
  [ "$d" = "${HOME:-}" ] && break
  [ -f "$d/.codegraph/codegraph.db" ] && skip "index exists at $d/.codegraph"
  [ "$d" = "/" ] && break
  d=$(dirname "$d")
done

# 7. Per-repo opt-out: git config code-search.codegraph false.
[ "$(git -C "$top" config --bool code-search.codegraph 2>/dev/null)" = "false" ] && skip "code-search.codegraph is false in $top"

# 8. Size cap.
max=${CODE_SEARCH_CODEGRAPH_MAX_FILES:-25000}
case $max in
  ''|*[!0-9]*) skip "invalid CODE_SEARCH_CODEGRAPH_MAX_FILES: $max" ;;
esac
count=$(git -C "$top" ls-files | wc -l)
[ "$count" -gt "$max" ] && skip "$top has $count tracked files, over the cap of $max"

# Lock the check-and-launch window against concurrent sessions. A lock older than
# 10 minutes is stale. The detached init outlives the lock; codegraph has its own.
lock="$CLAUDE_PLUGIN_DATA/autoinit.lock.d"
if [ -d "$lock" ] && [ -n "$(find "$lock" -maxdepth 0 -mmin +10 2>/dev/null)" ]; then
  rmdir "$lock" 2>/dev/null
fi
mkdir "$lock" 2>/dev/null || skip "another session is initializing"
trap 'rmdir "$lock" 2>/dev/null' EXIT

# 9. Keep the index out of git status without touching tracked files.
if ! git -C "$top" check-ignore -q .codegraph/ 2>/dev/null; then
  exclude=$common_dir/info/exclude
  mkdir -p "$common_dir/info"
  # Don't glue the entry onto a last line that has no trailing newline.
  if [ -s "$exclude" ] && [ "$(tail -c1 "$exclude" | wc -l)" -eq 0 ]; then
    printf '\n' >>"$exclude"
  fi
  printf '/.codegraph/\n' >>"$exclude"
fi

# 10. Index, detached so the build survives the end of the session.
say "init: $top ($count tracked files)"
# shellcheck disable=SC2016 # expands inside the child shell
runner='
nice codegraph init -y "$1" >>"$2" 2>&1
rc=$?
if [ "$rc" -eq 0 ]; then
  printf "%s init done: %s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$1" >>"$2"
else
  printf "%s init failed (exit %s): %s\n" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$rc" "$1" >>"$2"
fi'
if command -v setsid >/dev/null 2>&1; then
  setsid -f bash -c "$runner" _ "$top" "$log" </dev/null >/dev/null 2>&1
else
  nohup bash -c "$runner" _ "$top" "$log" </dev/null >/dev/null 2>&1 &
  disown 2>/dev/null
fi
exit 0
