#!/usr/bin/env bash
# SessionStart hook: index the session's git repo with CodeGraph if it has no index.
# Every skip logs one line to ${CLAUDE_PLUGIN_DATA}/codegraph-autoinit.log and exits 0,
# so this hook never fails a session.
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

# 1. User option.
[ "${CLAUDE_PLUGIN_OPTION_CODEGRAPH_AUTO_INIT:-}" = "false" ] && skip "codegraph_auto_init option is false"

# 2. Neutral cwd, so a repo's mise or direnv cannot swap the binary.
cd "$CLAUDE_PLUGIN_DATA" || skip "cannot cd to $CLAUDE_PLUGIN_DATA"
command -v codegraph >/dev/null 2>&1 || skip "codegraph not on PATH"

# 3. Git repos only.
dir=${CLAUDE_PROJECT_DIR:-$PWD}
top=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || skip "$dir is not a git repo"

# 4. Linked worktrees resolve to the parent's index.
git_dir=$(git -C "$top" rev-parse --path-format=absolute --git-dir 2>/dev/null)
common_dir=$(git -C "$top" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
[ "$git_dir" != "$common_dir" ] && skip "$top is a linked worktree"

# 5. Never index a home directory or the filesystem root.
{ [ "$top" = "${HOME:-}" ] || [ "$top" = "/" ]; } && skip "$top is \$HOME or /"

# 6. An index at the top level or any ancestor already covers this repo.
d=$top
while :; do
  [ -d "$d/.codegraph" ] && skip "index exists at $d/.codegraph"
  [ "$d" = "/" ] && break
  d=$(dirname "$d")
done

# 7. Per-repo opt-out: git config code-search.codegraph false.
[ "$(git -C "$top" config --bool code-search.codegraph 2>/dev/null)" = "false" ] && skip "code-search.codegraph is false in $top"

# 8. Size cap.
max=${CODE_SEARCH_CODEGRAPH_MAX_FILES:-25000}
count=$(git -C "$top" ls-files | wc -l)
[ "$count" -gt "$max" ] && skip "$top has $count tracked files, over the cap of $max"

# 9. Keep the index out of git status without touching tracked files.
if ! git -C "$top" check-ignore -q .codegraph/ 2>/dev/null; then
  mkdir -p "$common_dir/info"
  printf '/.codegraph/\n' >>"$common_dir/info/exclude"
fi

# 10. Index.
say "init: $top ($count tracked files)"
if out=$(nice codegraph init -y "$top" 2>&1); then
  say "init done: $top"
else
  say "init failed (exit $?): $top"
fi
[ -n "$out" ] && printf '%s\n' "$out" >>"$log"
exit 0
