#!/usr/bin/env bash
# Smoke test for claude-tmux.sh on an isolated tmux server with a stub claude.
set -euo pipefail

script=$(cd "$(dirname "$0")" && pwd)/claude-tmux.sh
tmp=$(mktemp -d)
export TMUX_TMPDIR=$tmp
# tmux uses the server in $TMUX over TMUX_TMPDIR, so when run inside tmux the kill-server below would hit the real server.
unset TMUX
# Stub agent and prompt files so the test does not depend on this machine's ~/.claude symlinks.
export HOME=$tmp/home
mkdir -p "$HOME/.claude/agents" "$HOME/.claude/prompts"
: > "$HOME/.claude/agents/orchestration.md"
: > "$HOME/.claude/prompts/system_override.md"
trap 'tmux kill-server 2>/dev/null || true; rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin" "$tmp/my.proj" "$tmp/repo/src/deep"
git -C "$tmp/repo" init -q
# shellcheck disable=SC2016 # $PWD and $* belong to the stub, not this shell
printf '#!/bin/sh\nprintf "%%s|%%s\\n" "$PWD" "$*" > "%s/args.$2"\nexec sleep 30\n' "$tmp" > "$tmp/bin/claude"
chmod +x "$tmp/bin/claude"
export PATH=$tmp/bin:$PATH
# claude-tmux.sh starts claude as the orchestration agent with the system override (667dd0f).
launch="--agent orchestration --append-system-prompt-file $HOME/.claude/prompts/system_override.md"

# Run the script as if from inside tmux; switch-client fails with no attached client.
tmux new-session -d -s host
TMUX=$(tmux display -p -t host '#{socket_path},#{pid},0')
export TMUX
run() { "$script" "$@" 2>/dev/null || true; }
fail() { echo "FAIL: $*" >&2; exit 1; }
recorded() { # wait up to 2s for session $1's stub to record "<cwd>|<args>"
  local f=$tmp/args.$1
  for _ in {1..20}; do [[ $(cat "$f" 2>/dev/null) == "$2" ]] && return; sleep 0.1; done
  fail "$1: got '$(cat "$f" 2>/dev/null)', want '$2'"
}

# Outside a repo: claude-<dir name>, with "." sanitized
run "$tmp/my.proj"
tmux has-session -t "=claude-my-proj" || fail "default session name"
recorded claude-my-proj "$tmp/my.proj|-n claude-my-proj $launch"

# Inside a repo: named after the repo root, but started in the current dir
(cd "$tmp/repo/src/deep" && run)
tmux has-session -t "=claude-repo" || fail "repo-root session name"
recorded claude-repo "$tmp/repo/src/deep|-n claude-repo $launch"

# An existing prefix-matching session must not satisfy an exact name
tmux new-session -d -s api-foo
run -s api "$tmp"
tmux has-session -t "=api" || fail "prefix match hijacked session name"

# Dashed args go to claude and DIR defaults to $PWD
(cd "$tmp/my.proj" && run -s dashed -c)
recorded dashed "$tmp/my.proj|-n dashed $launch -c"

# Args after DIR go to claude, including non-dashed values
run -s after "$tmp" --resume abc
recorded after "$tmp|-n after $launch --resume abc"

# Bad directory, missing -s value, and help
if "$script" /nonexistent 2>/dev/null; then fail "bad dir accepted"; fi
if "$script" -s 2>/dev/null; then fail "-s without name accepted"; fi
"$script" -h | grep -q '^Usage: claude-tmux' || fail "help"

echo "all claude-tmux checks passed"
