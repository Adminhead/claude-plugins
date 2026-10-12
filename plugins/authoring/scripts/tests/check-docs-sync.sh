#!/usr/bin/env bash
# Offline tests for scripts/docs-sync-nudge.ts, using temp git repos.
set -u

script=$(cd "$(dirname "$0")/.." && pwd)/docs-sync-nudge.ts
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

pass=0 fail=0
check() { # name, condition exit status
  if [ "$2" -eq 0 ]; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1"; fi
}

run() { bun --no-env-file --config=/dev/null "$script" "$@"; }

mkrepo() { # path
  mkdir -p "$1/docs/plans"
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
    CLAUDE_PLUGIN_DATA="$root/data" run "$mode" 2>"$root/stderr")
  rc=$?
}
# edit <repo> <path> [key]: the PostToolUse record for a Write/Edit (or NotebookEdit with key notebook_path).
edit() { hook edit "$1" ",\"tool_input\":{\"${3:-file_path}\":\"$2\"}"; }
empty() { [ -z "$out" ]; }
# nudges [needle...]: a non-error Stop additionalContext holding every needle.
nudges() {
  printf '%s' "$out" | NEEDLES=$(printf '%s\n' "$@") bun -e '
    const d = JSON.parse(await Bun.stdin.text()), h = d.hookSpecificOutput, c = h.additionalContext;
    const needles = (process.env.NEEDLES ?? "").split("\n").filter(Boolean);
    process.exit("decision" in d || h.hookEventName !== "Stop" || !c.includes("authoring:docs-audit") || needles.some((n) => !c.includes(n)) ? 1 : 0);'
}
nudges_doc() { nudges 'docs/guide.md:1 → widget.py'; }

# No change.
r=$root/clean; mkrepo "$r"; hook start "$r"; hook stop "$r"
check "no change: silent, exit 0" $((rc + $(empty; echo $?)))

# Edit through the hook to a file a doc mentions.
r=$root/code; mkrepo "$r"; hook start "$r"
echo 'print(2)' >"$r/widget.py"; edit "$r" "$r/widget.py"
hook stop "$r"
nudges_doc; check "recorded edit to a mentioned file nudges, naming doc, line and file" $?

# Same change set again: silent.
hook stop "$r"
check "repeat with same change set is silent" $(empty; echo $?)

# A new change set nudges again.
echo 'print(3)' >"$r/gizmo.py"; echo 'See gizmo.py.' >"$r/docs/gizmo.md"; git -C "$r" add docs/gizmo.md; git -C "$r" commit -qm gizmodoc; edit "$r" "$r/gizmo.py"
hook stop "$r"
nudges 'docs/gizmo.md:1 → gizmo.py'; check "new change set nudges again" $?

# Relative path, committed edit, and a notebook_path record.
r=$root/committed; mkrepo "$r"; hook start "$r"
echo 'print(2)' >"$r/widget.py"; git -C "$r" commit -qam change; edit "$r" widget.py
hook stop "$r"
nudges_doc; check "recorded edit that was then committed nudges" $?
r=$root/notebook; mkrepo "$r"; hook start "$r"
echo '{}' >"$r/analysis.ipynb"; echo 'Run analysis.ipynb first.' >"$r/docs/guide.md"
git -C "$r" add -A; git -C "$r" commit -qm nb; hook start "$r"
echo '{"a":1}' >"$r/analysis.ipynb"; edit "$r" "$r/analysis.ipynb" notebook_path
hook stop "$r"
nudges 'docs/guide.md:1 → analysis.ipynb'; check "notebook_path edit is recorded" $?

# Changes nobody recorded: dirty tree and another session's commit.
r=$root/other; mkrepo "$r"; hook start "$r"
echo 'print(2)' >"$r/widget.py"
hook stop "$r"
check "dirty file without a recorded edit is silent" $(empty; echo $?)
echo 'print(3)' >"$r/widget.py"; git -C "$r" commit -qam "other session"
hook stop "$r"
check "commit without a recorded edit is silent" $(empty; echo $?)

# The 2026-10-12 case: another session's commits plus a plan-only edit.
r=$root/planonly; mkrepo "$r"; hook start "$r"
echo 'print(2)' >"$r/widget.py"; git -C "$r" commit -qam "other session"
echo 'plan for widget.py' >"$r/docs/plans/p.md"; edit "$r" "$r/docs/plans/p.md"
hook stop "$r"
check "other session's commits plus a plan-only edit is silent" $(empty; echo $?)

# Edits outside the repo (another worktree) are dropped.
r=$root/outside; mkrepo "$r"; hook start "$r"
mkdir -p "$root/elsewhere"; echo 'x' >"$root/elsewhere/widget.py"; edit "$r" "$root/elsewhere/widget.py"
hook stop "$r"
check "edit outside the repo is silent" $(empty; echo $?)

# Mentions only in historical docs.
r=$root/historic; mkrepo "$r"
git -C "$r" rm -q docs/guide.md; mkdir -p "$r/docs/research" "$r/docs/adr" "$r/.agents"
for f in docs/plans/p.md docs/research/n.md docs/adr/0001.md .agents/a.md CHANGELOG.md; do echo 'widget.py' >"$r/$f"; done
git -C "$r" add -A; git -C "$r" commit -qm hist; hook start "$r"
echo 'print(2)' >"$r/widget.py"; edit "$r" "$r/widget.py"
hook stop "$r"
check "mentions only in plans, research, adr, .agents and CHANGELOG are silent" $(empty; echo $?)

# Doc-only change.
r=$root/doconly; mkrepo "$r"; hook start "$r"
echo 'more words about widget.py' >>"$r/docs/guide.md"; edit "$r" "$r/docs/guide.md"
hook stop "$r"
check "doc-only change is silent" $(empty; echo $?)

# Code change where the referencing doc was edited too: nothing left to check.
r=$root/both; mkrepo "$r"; hook start "$r"
echo 'print(2)' >"$r/widget.py"; echo 'updated widget.py note' >>"$r/docs/guide.md"
edit "$r" "$r/widget.py"; edit "$r" "$r/docs/guide.md"
hook stop "$r"
check "referencing doc already edited is silent" $(empty; echo $?)

# Code change with no referencing doc.
r=$root/unref; mkrepo "$r"; hook start "$r"
echo 'x' >"$r/lonely_module.py"; edit "$r" "$r/lonely_module.py"
hook stop "$r"
check "unreferenced code change is silent" $(empty; echo $?)

# Removed identifiers.
mkident() { # path: README names MAX_WIDGETS; config.py defines it
  mkrepo "$1"; git -C "$1" rm -q docs/guide.md
  echo 'MAX_WIDGETS = 3' >"$1/config.py"
  printf 'intro\nSet MAX_WIDGETS to limit widgets.\n' >"$1/README.md"
  git -C "$1" add -A; git -C "$1" commit -qm cfg; hook start "$1"
}
r=$root/rename; mkident "$r"
echo 'MAX_GADGETS = 3' >"$r/config.py"; edit "$r" "$r/config.py"
hook stop "$r"
nudges 'no longer exists' 'README.md:2 → MAX_WIDGETS'; check "renamed constant a README names gets a no-longer-exists entry" $?
r=$root/stillused; mkident "$r"
echo 'from config import MAX_WIDGETS' >"$r/other.py"; git -C "$r" add other.py; git -C "$r" commit -qm use
echo 'MAX_GADGETS = 3' >"$r/config.py"; edit "$r" "$r/config.py"
hook stop "$r"
check "renamed constant still used elsewhere is silent" $(empty; echo $?)
r=$root/ranked; mkident "$r"
printf 'See config.py.\n' >"$r/docs/extra.md"; git -C "$r" add -A; git -C "$r" commit -qm extra; hook start "$r"
echo 'MAX_GADGETS = 3' >"$r/config.py"; edit "$r" "$r/config.py"
hook stop "$r"
check "no-longer-exists entries come before mentions" $(printf '%s' "$out" | bun -e '
  const c = JSON.parse(await Bun.stdin.text()).hookSpecificOutput.additionalContext;
  process.exit(c.indexOf("README.md:2 → MAX_WIDGETS") > 0 && c.indexOf("README.md:2") < c.indexOf("docs/extra.md:1 → config.py") ? 0 : 1);'; echo $?)

# stop_hook_active.
r=$root/active; mkrepo "$r"; hook start "$r"
echo 'print(2)' >"$r/widget.py"; edit "$r" "$r/widget.py"
hook stop "$r" ',"stop_hook_active":true'
check "stop_hook_active exits 0 silently" $((rc + $(empty; echo $?)))
hook stop "$r"
nudges_doc; check "stop_hook_active did not consume the change set" $?

# Outside git and malformed input fail open.
mkdir -p "$root/plain"; hook stop "$root/plain"
check "non-git dir: silent, exit 0" $((rc + $(empty; echo $?)))
check "non-git dir: empty stderr" $([ ! -s "$root/stderr" ]; echo $?)
hook start "$root/plain"
check "non-git dir start: empty stderr" $([ ! -s "$root/stderr" ]; echo $?)
mkdir -p "$root/nocommit"; git -C "$root/nocommit" init -q
hook start "$root/nocommit"; hook stop "$root/nocommit"
check "no-commit repo: silent, empty stderr" $((rc + $(empty; echo $?) + $([ ! -s "$root/stderr" ]; echo $?)))
out=$(echo 'not json' | CLAUDE_PLUGIN_DATA="$root/data" run stop 2>/dev/null); rc=$?
check "malformed stdin fails open" $((rc + $(empty; echo $?)))
r=$root/nodata; mkrepo "$r"; echo 'print(2)' >"$r/widget.py"
out=$(printf '{"session_id":"nodata","cwd":"%s"}' "$r" | env -u CLAUDE_PLUGIN_DATA bun --no-env-file --config=/dev/null "$script" stop 2>/dev/null); rc=$?
check "unset CLAUDE_PLUGIN_DATA fails open" $((rc + $(empty; echo $?)))
out=$(printf '{"session_id":"nodata","cwd":"%s"}' "$r" | env -u CLAUDE_PLUGIN_DATA bun --no-env-file --config=/dev/null "$script" stop 2>&1 >/dev/null)
check "unset CLAUDE_PLUGIN_DATA: empty stderr" $([ -z "$out" ]; echo $?)

# cwd in a repo subdirectory.
r=$root/subdir; mkrepo "$r"; mkdir -p "$r/src/deep"; hook start "$r/src/deep"
echo 'print(2)' >"$r/widget.py"; edit "$r/src/deep" "$r/widget.py"
hook stop "$r/src/deep"
nudges_doc; check "subdirectory cwd finds root-level changes and docs" $?

# Non-ASCII file names.
r=$root/utf8; mkrepo "$r"; echo 'x' >"$r/café.py"; echo 'See café.py for details.' >"$r/docs/guide.md"
git -C "$r" add -A; git -C "$r" commit -qm utf8; hook start "$r"
echo 'y' >"$r/café.py"; edit "$r" "$r/café.py"
hook stop "$r"
nudges 'docs/guide.md:1 → café.py'; check "non-ASCII path is found" $?

# Old state files are pruned at session start.
mkdir -p "$root/data/docs-sync"; touch -d '60 days ago' "$root/data/docs-sync/old.seen"
r=$root/prune; mkrepo "$r"; hook start "$r"
check "state older than 30 days is pruned" $([ ! -e "$root/data/docs-sync/old.seen" ]; echo $?)

# Docs list is bounded.
r=$root/many; mkrepo "$r"
for i in $(seq 1 15); do echo 'widget.py' >"$r/docs/d$i.md"; done
git -C "$r" add -A; git -C "$r" commit -qm docs
hook start "$r"
echo 'print(2)' >"$r/widget.py"; edit "$r" "$r/widget.py"
hook stop "$r"
n=$(printf '%s' "$out" | grep -o '\.md:' | wc -l)
check "docs list is capped at 10" $(( n == 10 ? 0 : 1 ))

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
