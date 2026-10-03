#!/usr/bin/env bash
# Run scope.sh against throwaway git repos and assert on its output.

set -euo pipefail

scope="$(cd "$(dirname "$0")/.." && pwd)/scope.sh"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
status=0

export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
export GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@example.com GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@example.com

# run <name> <dir> [args...] captures scope.sh output in $out and checks exit 0.
run() {
  local name=$1 dir=$2
  shift 2
  if out=$(cd "$dir" && "$scope" "$@"); then
    echo "ok   $name exits 0"
  else
    echo "FAIL $name exits non-zero"
    status=1
  fi
}

has() {
  if grep -qF -- "$2" <<<"$out"; then
    echo "ok   $1"
  else
    printf 'FAIL %s\n  wanted: %s\n  got:\n%s\n' "$1" "$2" "$out"
    status=1
  fi
}

lacks() {
  if grep -qF -- "$2" <<<"$out"; then
    printf 'FAIL %s\n  unwanted: %s\n  got:\n%s\n' "$1" "$2" "$out"
    status=1
  else
    echo "ok   $1"
  fi
}

# Upstream repo on main with Python, Go, a test, and docs.
up="$tmp/up"
git init -q -b main "$up"
mkdir -p "$up/pkg" "$up/tests"
cat >"$up/pkg/calc.py" <<'EOF'
def add(a, b):
    return a + b


class Box:
    def size(self):
        return 1
EOF
cat >"$up/pkg/calc.go" <<'EOF'
package pkg

func Add(a, b int) int {
	return a + b
}
EOF
echo 'def test_add(): pass' >"$up/tests/test_calc.py"
echo '# readme' >"$up/README.md"
git -C "$up" add -A
git -C "$up" commit -qm init

# Clone so origin/HEAD exists, then branch, commit, and leave local edits.
work="$tmp/work"
git clone -q "$up" "$work"
git -C "$work" switch -qc feature
cat >>"$work/pkg/calc.py" <<'EOF'


def parse_port(text):
    port = int(text)
    if not 0 < port < 65536:
        raise ValueError(text)
    return port
EOF
sed -i 's/return a + b/return b + a/' "$work/pkg/calc.go"
git -C "$work" commit -qam feature
sed -i 's/return 1/return 2/' "$work/pkg/calc.py"
echo 'def test_more(): pass' >>"$work/tests/test_calc.py"
echo 'more' >>"$work/README.md"
printf 'export function slug(s) {\n  return s.trim()\n}\n' >"$work/pkg/new.js"

run branch "$work"
has "base is origin/HEAD merge-base" "branch commits since origin/HEAD (merge-base"
has "counts changed source files" "files: 3 changed source files (2 others skipped"
has "python file listed" "pkg/calc.py (modified)"
has "new python def shown" "+ def parse_port(text):"
has "uncommitted method edit names its method" "in def size(self):"
has "go hunk names its function" "in func Add(a, b int) int {"
has "untracked file listed" "pkg/new.js (untracked)"
has "untracked def shown" "+ export function slug(s) {"
lacks "test file skipped" "tests/test_calc.py"
lacks "docs skipped" "README.md"

run subdirectory "$work/pkg"
has "subdirectory resolves repo root" "pkg/calc.go (modified)"

run override "$work" pkg/calc.py parse_port
has "argument overrides scope" "scope: argument override: pkg/calc.py parse_port"
lacks "override computes nothing" "files:"

echo 'x = 1' >>"$up/pkg/calc.py"
run on-main "$up"
has "on default branch falls back to local changes" "no branch commits ahead of main; scope is uncommitted and untracked changes only"
has "uncommitted change listed" "pkg/calc.py (modified)"

trunk="$tmp/trunk"
git init -q -b trunk "$trunk"
git -C "$trunk" commit -q --allow-empty -m init
run no-base "$trunk"
has "no default branch is stated" "no default branch found"
has "empty scope reported" "files: 0 changed source files"

mkdir "$tmp/plain"
run no-git "$tmp/plain"
has "no repository is stated" "scope: no git repository at $tmp/plain"

exit "$status"
