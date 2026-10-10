#!/usr/bin/env bash
# Land the current slice branch onto its parent, one slice at a time.
#
#   land-slice.sh <parent-branch> <check-command>
#
# Run from the slice's worktree with the slice branch checked out. Takes an
# exclusive flock on <git-common-dir>/slice-land.lock, rebases the slice on the
# parent, runs the check, then fast-forwards the parent. Exits 1 and leaves the
# parent untouched on a rebase conflict (aborted cleanly) or a failed check.
set -euo pipefail

[ $# -eq 2 ] || { echo "usage: land-slice.sh <parent-branch> <check-command>" >&2; exit 2; }
parent=$1 check=$2

slice=$(git symbolic-ref --short HEAD) || { echo "land-slice: detached HEAD" >&2; exit 2; }
[ "$slice" != "$parent" ] || { echo "land-slice: slice and parent are both $slice" >&2; exit 2; }
git rev-parse --verify -q "refs/heads/$parent" >/dev/null || { echo "land-slice: no branch $parent" >&2; exit 2; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "land-slice: commit or stash tracked changes first" >&2; exit 2; }

lock=$(git rev-parse --path-format=absolute --git-common-dir)/slice-land.lock
exec 9>"$lock"
flock 9 # released when the script exits

if ! git rebase -q "$parent"; then
  git rebase --abort
  echo "land-slice: REFUSED, $slice conflicts with $parent; rebase aborted" >&2
  exit 1
fi

if ! bash -c "$check"; then
  echo "land-slice: REFUSED, check failed: $check" >&2
  exit 1
fi

# Fast-forward the parent where it is checked out; otherwise move the ref.
parent_wt=$(git worktree list --porcelain | awk -v b="refs/heads/$parent" '
  $1 == "worktree" { wt = substr($0, 10) } $1 == "branch" && $2 == b { print wt }')
if [ -n "$parent_wt" ]; then
  git -C "$parent_wt" merge -q --ff-only "$slice"
else
  git fetch -q . "$slice:$parent"
fi
echo "land-slice: landed $slice on $parent at $(git rev-parse --short "$slice")"
