#!/usr/bin/env bash
# Offline tests for scripts/land-slice.sh, using temp git repos and worktrees.
set -u

script=$(cd "$(dirname "$0")/.." && pwd)/land-slice.sh
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

pass=0 fail=0
check() { # name, condition exit status
  if [ "$2" -eq 0 ]; then pass=$((pass + 1)); echo "ok   $1"; else fail=$((fail + 1)); echo "FAIL $1"; fi
}

main=$root/main
mkdir -p "$main"
git -C "$main" init -q -b main
git -C "$main" config user.email t@example.com
git -C "$main" config user.name t
echo base >"$main/shared.txt"
git -C "$main" add -A; git -C "$main" commit -qm init

slice() { # name file content: worktree on a new branch with one commit
  git -C "$main" worktree add -q "$root/$1" -b "$1" main
  echo "$3" >"$root/$1/$2"
  git -C "$root/$1" add -A; git -C "$root/$1" commit -qm "$1"
}

# Two disjoint slices land serially; the second is rebased over the first.
slice a a.txt A
slice b b.txt B
(cd "$root/a" && "$script" main true >/dev/null 2>&1); check "slice a lands" $?
(cd "$root/b" && "$script" main 'test -f a.txt && test -f b.txt' >/dev/null 2>&1)
check "slice b rebases over a, passes its check, lands" $?
[ -f "$main/a.txt" ] && [ -f "$main/b.txt" ]
check "parent worktree holds both slices" $?
[ "$(git -C "$main" rev-list --merges main | wc -l)" -eq 0 ]
check "history stays linear" $?

# A conflicting slice is refused and left clean.
slice c shared.txt C
echo changed >"$main/shared.txt"; git -C "$main" commit -qam "main edits shared"
before=$(git -C "$main" rev-parse main)
(cd "$root/c" && "$script" main true >/dev/null 2>"$root/err"); rc=$?
check "conflicting slice is refused" $(( rc == 1 ? 0 : 1 ))
[ "$(git -C "$main" rev-parse main)" = "$before" ]; check "parent is untouched after a refusal" $?
[ -z "$(git -C "$root/c" status --porcelain)" ] && [ ! -d "$(git -C "$root/c" rev-parse --git-path rebase-merge)" ]
check "refused slice has no rebase in progress" $?
grep -q REFUSED "$root/err"; check "refusal says why" $?

# A failing check refuses the landing.
slice d d.txt D
before=$(git -C "$main" rev-parse main)
(cd "$root/d" && "$script" main false >/dev/null 2>&1); rc=$?
check "failed check is refused" $(( rc == 1 ? 0 : 1 ))
[ "$(git -C "$main" rev-parse main)" = "$before" ]; check "parent is untouched after a failed check" $?

# The lock serializes concurrent landings.
slice e e.txt E
slice f f.txt F
log=$root/order.log
(cd "$root/e" && "$script" main "echo e-start >>$log; sleep 1; echo e-end >>$log" >/dev/null 2>&1) &
sleep 0.3
(cd "$root/f" && "$script" main "echo f-start >>$log; echo f-end >>$log" >/dev/null 2>&1) &
wait
[ "$(tr '\n' ' ' <"$log")" = "e-start e-end f-start f-end " ]
check "concurrent landings run their checks one at a time" $?
[ -f "$main/e.txt" ] && [ -f "$main/f.txt" ]
check "both concurrent slices landed" $?

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
