#!/usr/bin/env bash
# Offline tests for scripts/codegraph-autoinit.sh, using a stub codegraph and temp git repos.
set -u

script=$(cd "$(dirname "$0")/.." && pwd)/codegraph-autoinit.sh
root=$(mktemp -d)
trap 'rm -rf "$root"' EXIT

stubbin=$root/bin
mkdir -p "$stubbin"
cat >"$stubbin/codegraph" <<'STUB'
#!/usr/bin/env bash
# Creates the index like `codegraph init -y <path>`, then records cwd and args.
if [ "$1" = init ]; then
  mkdir -p "${@: -1}/.codegraph"
  : >"${@: -1}/.codegraph/codegraph.db"
fi
printf '%s|%s\n' "$PWD" "$*" >>"$STUB_LOG"
echo "stub init ok"
STUB
chmod +x "$stubbin/codegraph"

pass=0 fail=0
ok() { pass=$((pass + 1)); echo "ok   $1"; }
bad() { fail=$((fail + 1)); echo "FAIL $1"; }
check() { # name, condition exit status
  if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1"; fi
}

mkrepo() { # path, tracked file count
  mkdir -p "$1"
  git -C "$1" init -q
  git -C "$1" config user.email t@example.com
  git -C "$1" config user.name t
  for i in $(seq 1 "${2:-3}"); do echo "$i" >"$1/f$i.txt"; done
  git -C "$1" add -A
  git -C "$1" commit -qm init
}

# run <project dir> [VAR=value ...]; resets the stub and log, prints nothing.
run() {
  local proj=$1; shift
  : >"$root/stub.log"
  rm -rf "$root/data"
  env -u CLAUDE_PLUGIN_OPTION_CODEGRAPH_AUTO_INIT -u CODE_SEARCH_CODEGRAPH_MAX_FILES \
    PATH="$stubbin:$PATH" STUB_LOG="$root/stub.log" HOME="$root/home" \
    CLAUDE_PLUGIN_DATA="$root/data" CLAUDE_PROJECT_DIR="$proj" "$@" \
    "$script" >/dev/null 2>"$root/stderr"
  rc=$?
}
# wait_init: the init runs detached, so poll for the stub's record.
wait_init() {
  local i
  for i in $(seq 1 50); do
    [ "$(init_calls)" -ge 1 ] && return 0
    sleep 0.1
  done
  return 1
}
init_calls() { grep -c '|init ' "$root/stub.log"; }
log_has() { grep -q -- "$1" "$root/data/codegraph-autoinit.log" 2>/dev/null; }
log_lines() { wc -l <"$root/data/codegraph-autoinit.log" 2>/dev/null || echo 0; }

mkdir -p "$root/home"

# Fresh repo: init runs once from the data dir, exclude entry added, exit 0.
mkrepo "$root/fresh"
run "$root/fresh"
check "fresh repo exits 0" $((rc))
wait_init
check "fresh repo runs init once" $(( $(init_calls) == 1 ? 0 : 1 ))
grep -q "^$root/data|init -y $root/fresh\$" "$root/stub.log"
check "init runs from CLAUDE_PLUGIN_DATA with -y and the repo path" $?
grep -qx '/.codegraph/' "$root/fresh/.git/info/exclude"
check "fresh repo gets info/exclude entry" $?
status=$(git -C "$root/fresh" status --porcelain)
check "fresh repo stays clean after init" $(( ${#status} == 0 ? 0 : 1 ))

# Rerun is idempotent: the index exists now.
run "$root/fresh"
check "second session skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "index exists"
check "second session logs the index skip" $?
n=$(grep -c '/.codegraph/' "$root/fresh/.git/info/exclude")
check "exclude entry is not duplicated" $(( n == 1 ? 0 : 1 ))

# Existing index at the top level.
mkrepo "$root/indexed"; mkdir "$root/indexed/.codegraph"; : >"$root/indexed/.codegraph/codegraph.db"
run "$root/indexed"
check "existing index skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "index exists"
check "existing index logs one skip line" $(( $(log_lines) == 1 ? 0 : 1 ))

# Ancestor index.
mkdir -p "$root/outer/.codegraph"; : >"$root/outer/.codegraph/codegraph.db"
mkrepo "$root/outer/inner"
run "$root/outer/inner"
check "ancestor index skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "index exists at $root/outer/.codegraph"
check "ancestor index is logged" $?

# Option false.
mkrepo "$root/optoff"
run "$root/optoff" CLAUDE_PLUGIN_OPTION_CODEGRAPH_AUTO_INIT=false
check "option false exits 0" $((rc))
check "option false skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "option is false"
check "option false is logged" $?

# git config opt-out.
mkrepo "$root/optout"; git -C "$root/optout" config code-search.codegraph false
run "$root/optout"
check "git config opt-out skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "code-search.codegraph is false"
check "git config opt-out is logged" $?

# Not a git repo.
mkdir -p "$root/plain"
run "$root/plain"
check "non-git dir exits 0" $((rc))
check "non-git dir skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "not a git repo"
check "non-git dir is logged" $?

# Linked worktree.
mkrepo "$root/main"
git -C "$root/main" worktree add -q "$root/linked" -b linked
run "$root/linked"
check "linked worktree skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "linked worktree"
check "linked worktree is logged" $?

# Over the file cap.
mkrepo "$root/big" 5
run "$root/big" CODE_SEARCH_CODEGRAPH_MAX_FILES=4
check "over the cap skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "over the cap of 4"
check "over the cap is logged" $?
run "$root/big" CODE_SEARCH_CODEGRAPH_MAX_FILES=5
wait_init
check "at the cap still inits" $(( $(init_calls) == 1 ? 0 : 1 ))

# Option spellings, case-insensitive.
for v in FALSE 0 No off; do
  run "$root/optoff" CLAUDE_PLUGIN_OPTION_CODEGRAPH_AUTO_INIT=$v
  check "option '$v' skips" $(( $(init_calls) == 0 ? 0 : 1 ))
done

# Non-numeric cap is refused, not treated as unlimited.
mkrepo "$root/capbad" 5
run "$root/capbad" CODE_SEARCH_CODEGRAPH_MAX_FILES=abc
check "invalid cap skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "invalid CODE_SEARCH_CODEGRAPH_MAX_FILES"
check "invalid cap is logged" $?

# Global ~/.codegraph (no codegraph.db) must not count as an index for repos under HOME.
mkdir -p "$root/home/.codegraph" "$root/home/work"
echo '{}' >"$root/home/.codegraph/telemetry.json"
mkrepo "$root/home/work/proj"
run "$root/home/work/proj"
wait_init
check "repo under HOME with global ~/.codegraph inits" $(( $(init_calls) == 1 ? 0 : 1 ))

# A non-HOME ancestor .codegraph without codegraph.db is not an index either.
mkdir -p "$root/telo/.codegraph"; echo '{}' >"$root/telo/.codegraph/telemetry.json"
mkrepo "$root/telo/proj"
run "$root/telo/proj"
wait_init
check "ancestor .codegraph without codegraph.db inits" $(( $(init_calls) == 1 ? 0 : 1 ))

# Partial index in the repo (dir, no db): treated as uninitialized.
mkrepo "$root/partial"; mkdir "$root/partial/.codegraph"
run "$root/partial"
wait_init
check "partial .codegraph in repo inits" $(( $(init_calls) == 1 ? 0 : 1 ))

# info/exclude with no trailing newline is not corrupted.
mkrepo "$root/nonl"
mkdir -p "$root/nonl/.git/info"; printf '*.log' >"$root/nonl/.git/info/exclude"
run "$root/nonl"
wait_init
grep -qx '\*\.log' "$root/nonl/.git/info/exclude" && grep -qx '/.codegraph/' "$root/nonl/.git/info/exclude"
check "exclude without trailing newline keeps both lines" $?

# info/exclude already holds the entry and no index exists: no duplicate.
mkrepo "$root/hasexc"
mkdir -p "$root/hasexc/.git/info"; printf '/.codegraph/\n' >"$root/hasexc/.git/info/exclude"
run "$root/hasexc"
wait_init
n=$(grep -c '/.codegraph/' "$root/hasexc/.git/info/exclude")
check "existing exclude entry is not duplicated" $(( n == 1 ? 0 : 1 ))

# Old git without --path-format: skip instead of writing to /info.
mkrepo "$root/oldgit"
realgit=$(command -v git)
mkdir -p "$root/gitstub"
cat >"$root/gitstub/git" <<STUB
#!/usr/bin/env bash
for a in "\$@"; do [ "\$a" = --path-format=absolute ] && exit 129; done
exec "$realgit" "\$@"
STUB
chmod +x "$root/gitstub/git"
run "$root/oldgit" PATH="$root/gitstub:$stubbin:$PATH"
check "old git exits 0" $((rc))
check "old git skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "git too old"
check "old git is logged" $?

# A codegraph binary inside the repo is not run.
mkrepo "$root/trojan"
mkdir -p "$root/trojan/bin"; cp "$stubbin/codegraph" "$root/trojan/bin/codegraph"
run "$root/trojan" PATH="$root/trojan/bin:$PATH"
check "in-repo codegraph binary skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "resolves inside the repo"
check "in-repo codegraph binary is logged" $?

# A fresh lock blocks a second session; a stale one is cleared.
mkrepo "$root/locked"
run "$root/locked" # creates data dir, runs init
wait_init
rm -rf "$root/locked/.codegraph"
mkdir -p "$root/data/autoinit.lock.d"
: >"$root/stub.log"
env -u CLAUDE_PLUGIN_OPTION_CODEGRAPH_AUTO_INIT PATH="$stubbin:$PATH" STUB_LOG="$root/stub.log" HOME="$root/home" \
  CLAUDE_PLUGIN_DATA="$root/data" CLAUDE_PROJECT_DIR="$root/locked" "$script" >/dev/null 2>&1
check "fresh lock skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has "another session is initializing"
check "fresh lock is logged" $?
touch -d '1 hour ago' "$root/data/autoinit.lock.d"
env -u CLAUDE_PLUGIN_OPTION_CODEGRAPH_AUTO_INIT PATH="$stubbin:$PATH" STUB_LOG="$root/stub.log" HOME="$root/home" \
  CLAUDE_PLUGIN_DATA="$root/data" CLAUDE_PROJECT_DIR="$root/locked" "$script" >/dev/null 2>&1
wait_init
check "stale lock is cleared and init runs" $(( $(init_calls) == 1 ? 0 : 1 ))
lockdir=gone; [ -d "$root/data/autoinit.lock.d" ] && lockdir=present
check "lock is released after launch" $(( ${#lockdir} == 4 ? 0 : 1 ))

# Repo root is $HOME.
mkrepo "$root/homerepo"
run "$root/homerepo" HOME="$root/homerepo"
check "repo at HOME skips" $(( $(init_calls) == 0 ? 0 : 1 ))
log_has 'HOME or /'
check "repo at HOME is logged" $?

# codegraph missing from PATH.
mkrepo "$root/nobin"
nobin=$root/nobin-path # PATH with the script's tools but no codegraph
mkdir -p "$nobin"
for t in bash git date dirname mkdir rmdir wc nice cat tr tail find realpath readlink setsid sleep; do
  ln -s "$(command -v "$t")" "$nobin/$t" 2>/dev/null
done
: >"$root/stub.log"; rm -rf "$root/data"
env -u CLAUDE_PLUGIN_OPTION_CODEGRAPH_AUTO_INIT PATH="$nobin" HOME="$root/home" \
  CLAUDE_PLUGIN_DATA="$root/data" CLAUDE_PROJECT_DIR="$root/nobin" "$script" >/dev/null 2>&1
rc=$?
check "missing codegraph exits 0" $((rc))
log_has "not on PATH"
check "missing codegraph is logged" $?

# CLAUDE_PLUGIN_DATA unset: exit 0 with a clear stderr message.
mkrepo "$root/nodata"
: >"$root/stub.log"
env -u CLAUDE_PLUGIN_DATA PATH="$stubbin:$PATH" STUB_LOG="$root/stub.log" HOME="$root/home" \
  CLAUDE_PROJECT_DIR="$root/nodata" "$script" >/dev/null 2>"$root/stderr"
rc=$?
check "unset CLAUDE_PLUGIN_DATA exits 0" $((rc))
grep -q "CLAUDE_PLUGIN_DATA is unset" "$root/stderr"
check "unset CLAUDE_PLUGIN_DATA explains itself on stderr" $?
check "unset CLAUDE_PLUGIN_DATA runs nothing" $(( $(init_calls) == 0 ? 0 : 1 ))

# codegraph init failure still exits 0 and is logged.
mkrepo "$root/failinit"
cat >"$stubbin/codegraph" <<'STUB'
#!/usr/bin/env bash
echo "boom" >&2
exit 3
STUB
run "$root/failinit"
check "failing init exits 0" $((rc))
for _ in $(seq 1 50); do log_has "init failed" && break; sleep 0.1; done
log_has "init failed (exit 3)"
check "failing init is logged" $?

echo
echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
