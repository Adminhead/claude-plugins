#!/usr/bin/env bash
# Smoke test for claude-tmux.sh on an isolated tmux server with a stub claude.
set -euo pipefail

script=$(cd "$(dirname "$0")" && pwd)/claude-tmux.sh
tmp=$(mktemp -d)
export TMUX_TMPDIR=$tmp
# tmux uses the server in $TMUX over TMUX_TMPDIR, so when run inside tmux the kill-server below would hit the real server.
unset TMUX
trap 'tmux kill-server 2>/dev/null || true; rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin" "$tmp/my.proj" "$tmp/repo/src/deep"
git -C "$tmp/repo" init -q
# Install path of the crew plugin; the launcher appends its system prompt from here.
installPath=$tmp/cache/crew/1.0.0
mkdir -p "$installPath/prompts"
: > "$installPath/prompts/system_override.md"

# The stub serves $STUB_DIR/plugins.json for `claude plugin list --json`, and records each launch.
export STUB_DIR=$tmp
cat > "$tmp/bin/claude" <<'EOF'
#!/bin/sh
if [ "$1" = plugin ]; then
  echo "$*" >> "$STUB_DIR/plugin-calls"
  cat "$STUB_DIR/plugins.json"
  exit 0
fi
printf '%s|%s\n' "$PWD" "$*" > "$STUB_DIR/args.$2"
printf '%s %s\n' "$CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS" "$CLAUDE_CODE_DISABLE_AUTO_MEMORY" > "$STUB_DIR/env.$2"
exec sleep 30
EOF
chmod +x "$tmp/bin/claude"
export PATH=$tmp/bin:$PATH
launch="--agent crew:orchestration --append-system-prompt-file $installPath/prompts/system_override.md"

user_crew='{"id":"crew@adminhead","scope":"user","enabled":true,"installPath":"'"$installPath"'"}'
plugins() { printf '[%s]\n' "$1" > "$tmp/plugins.json"; } # plugins ENTRY[,ENTRY...]
plugins "$user_crew"

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
expect_die() { # expect_die NAME DIR MESSAGE: exit non-zero, print MESSAGE, create no session
  local err
  if err=$("$script" -s "$1" "$2" 2>&1 >/dev/null); then fail "$1: launched"; fi
  [[ $err == *"$3"* ]] || fail "$1: stderr '$err', want '$3'"
  if tmux has-session -t "=$1" 2>/dev/null; then fail "$1: session created"; fi
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

# Enabled at user scope: the launch gets the crew agent, prompt and env
run -s crew-on "$tmp"
recorded crew-on "$tmp|-n crew-on $launch"
[[ $(cat "$tmp/env.crew-on") == "1 1" ]] || fail "crew-on env: '$(cat "$tmp/env.crew-on")'"
grep -qx 'plugin list --json' "$tmp/plugin-calls" || fail "preflight did not list plugins"

# A directory-backed install takes the prompt from readFromFolder, not the cache
mkdir -p "$tmp/src/crew/prompts" && : > "$tmp/src/crew/prompts/system_override.md"
plugins '{"id":"crew@adminhead","scope":"user","enabled":true,"installPath":"'"$installPath"'","readFromFolder":"'"$tmp/src/crew"'"}'
run -s crew-folder "$tmp"
recorded crew-folder "$tmp|-n crew-folder --agent crew:orchestration --append-system-prompt-file $tmp/src/crew/prompts/system_override.md"
plugins "$user_crew"

# Missing or disabled at user scope: die with the fix
plugins ''
expect_die crew-missing "$tmp" "claude plugin install crew@adminhead --scope user"
plugins '{"id":"crew@adminhead","scope":"user","enabled":false,"installPath":"'"$installPath"'"}'
expect_die crew-off "$tmp" "claude plugin enable crew@adminhead --scope user"
plugins "$user_crew"

# Disabled at project scope for this directory: die with the fix
proj_off='{"id":"crew@adminhead","scope":"project","enabled":false,"projectPath":"'"$tmp/my.proj"'"}'
plugins "$user_crew,$proj_off"
expect_die crew-proj "$tmp/my.proj" "claude plugin enable crew@adminhead --scope project"

# A disabled override for another directory does not block this one
other_off='{"id":"crew@adminhead","scope":"local","enabled":false,"projectPath":"'"$tmp/repo"'"}'
plugins "$user_crew,$other_off"
run -s crew-elsewhere "$tmp/my.proj"
recorded crew-elsewhere "$tmp/my.proj|-n crew-elsewhere $launch"
plugins "$user_crew"

# Attaching to an existing session skips the preflight
tmux new-session -d -s crew-attach sleep 30
plugins ''
rm -f "$tmp/plugin-calls"
run -s crew-attach "$tmp"
if [[ -e $tmp/plugin-calls ]]; then fail "attach ran the plugin preflight"; fi
if [[ -e $tmp/args.crew-attach ]]; then fail "attach launched claude"; fi
plugins "$user_crew"

# Bad directory, missing -s value, and help
if "$script" /nonexistent 2>/dev/null; then fail "bad dir accepted"; fi
if "$script" -s 2>/dev/null; then fail "-s without name accepted"; fi
"$script" -h | grep -q '^Usage: claude-tmux' || fail "help"

echo "all claude-tmux checks passed"
