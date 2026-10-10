#!/usr/bin/env bash
# Offline tests for scripts/docs-sync-nudge.py, using temp git repos.
set -u

script=$(cd "$(dirname "$0")/.." && pwd)/docs-sync-nudge.py
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

pass=0 fail=0
check() { # name, condition exit status
  if [ "$2" -eq 0 ]; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1"; fi
}

mkrepo() { # path
  mkdir -p "$1/docs"
  git -C "$1" init -q
  git -C "$1" config user.email t@example.com
  git -C "$1" config user.name t
  echo 'print(1)' >"$1/widget.py"
  echo 'The widget.py module does the work.' >"$1/docs/guide.md"
  git -C "$1" add -A
  git -C "$1" commit -qm init
}

# hook <mode> <repo> [extra json]; sets out and rc. The session id is the repo name.
hook() {
  local mode=$1 repo=$2 extra=${3:-}
  out=$(printf '{"session_id":"%s","cwd":"%s"%s}' "$(basename "$repo")" "$repo" "$extra" |
    CLAUDE_PLUGIN_DATA="$root/data" python3 "$script" "$mode" 2>"$root/stderr")
  rc=$?
}
empty() { [ -z "$out" ]; }
blocks() { printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); sys.exit(0 if d["decision"]=="block" and "docs/guide.md" in d["reason"] and "authoring:docs-audit" in d["reason"] else 1)'; }

# No change.
r=$root/clean; mkrepo "$r"; hook start "$r"; hook stop "$r"
check "no change: silent, exit 0" $((rc + $(empty; echo $?)))

# Code change with a referencing doc: working tree.
r=$root/code; mkrepo "$r"; hook start "$r"
echo 'print(2)' >"$r/widget.py"
hook stop "$r"
blocks; check "code change with referencing doc blocks" $?

# Same change set again: silent.
hook stop "$r"
check "repeat with same change set is silent" $(empty; echo $?)

# A new change set blocks again.
echo 'print(3)' >"$r/gizmo.py"
hook stop "$r"
check "new change set blocks again" $(blocks; echo $?)

# Committed since session start still counts.
r=$root/committed; mkrepo "$r"; hook start "$r"
echo 'print(2)' >"$r/widget.py"; git -C "$r" commit -qam change
hook stop "$r"
blocks; check "commit since recorded HEAD blocks" $?

# Doc-only change.
r=$root/doconly; mkrepo "$r"; hook start "$r"
echo 'more words about widget.py' >>"$r/docs/guide.md"
hook stop "$r"
check "doc-only change is silent" $(empty; echo $?)

# Code change where the referencing doc was edited too: nothing left to check.
r=$root/both; mkrepo "$r"; hook start "$r"
echo 'print(2)' >"$r/widget.py"; echo 'updated widget.py note' >>"$r/docs/guide.md"
hook stop "$r"
check "referencing doc already edited is silent" $(empty; echo $?)

# Code change with no referencing doc.
r=$root/unref; mkrepo "$r"; hook start "$r"
echo 'x' >"$r/lonely_module.py"
hook stop "$r"
check "unreferenced code change is silent" $(empty; echo $?)

# stop_hook_active.
r=$root/active; mkrepo "$r"; hook start "$r"
echo 'print(2)' >"$r/widget.py"
hook stop "$r" ',"stop_hook_active":true'
check "stop_hook_active exits 0 silently" $((rc + $(empty; echo $?)))
hook stop "$r"
blocks; check "stop_hook_active did not consume the change set" $?

# Outside git and malformed input fail open.
mkdir -p "$root/plain"; hook stop "$root/plain"
check "non-git dir: silent, exit 0" $((rc + $(empty; echo $?)))
out=$(echo 'not json' | CLAUDE_PLUGIN_DATA="$root/data" python3 "$script" stop 2>/dev/null); rc=$?
check "malformed stdin fails open" $((rc + $(empty; echo $?)))
r=$root/nodata; mkrepo "$r"; echo 'print(2)' >"$r/widget.py"
out=$(printf '{"session_id":"nodata","cwd":"%s"}' "$r" | env -u CLAUDE_PLUGIN_DATA python3 "$script" stop 2>/dev/null); rc=$?
check "unset CLAUDE_PLUGIN_DATA fails open" $((rc + $(empty; echo $?)))

# Docs list is bounded.
r=$root/many; mkrepo "$r"
for i in $(seq 1 15); do echo 'widget.py' >"$r/docs/d$i.md"; done
git -C "$r" add -A; git -C "$r" commit -qm docs
hook start "$r"
echo 'print(2)' >"$r/widget.py"
hook stop "$r"
n=$(printf '%s' "$out" | grep -o '\.md' | wc -l)
check "docs list is capped at 10" $(( n == 10 ? 0 : 1 ))

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
