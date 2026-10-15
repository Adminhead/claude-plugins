#!/usr/bin/env bash
# Smoke test for claude-crew.sh with a stub claude; runs in the foreground, no tmux.
set -euo pipefail

scripts=$(cd "$(dirname "$0")" && pwd)
script=$scripts/claude-crew.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin" "$tmp/my.proj"
# Install path of the crew plugin; the launcher appends its system prompt from here.
installPath=$tmp/cache/crew/1.0.0
mkdir -p "$installPath/prompts"
: > "$installPath/prompts/system_override.md"

# The stub serves $STUB_DIR/plugins.json for `claude plugin list --json`, and records each launch.
export STUB_DIR=$tmp
cat > "$tmp/bin/claude" <<'EOF'
#!/bin/sh
if [ "$1" = plugin ]; then
  cat "$STUB_DIR/plugins.json"
  exit 0
fi
printf '%s|%s|%s %s %s %s %s\n' "$PWD" "$*" "$CLAUDE_CODE_DISABLE_AUTO_MEMORY" "$CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS" "$CLAUDE_CODE_SHELL" "$CLAUDE_ENV_FILE" "$SHELL" > "$STUB_DIR/launched"
EOF
chmod +x "$tmp/bin/claude"
export PATH=$tmp/bin:$PATH

launched=$tmp/launched
launch_args="--agent crew:orchestration --append-system-prompt-file $installPath/prompts/system_override.md"
env_want="1 1 $(command -v bash) $scripts/agent.bashrc ${SHELL:-}"

user_crew='{"id":"crew@adminhead","scope":"user","enabled":true,"installPath":"'"$installPath"'"}'
plugins() { printf '[%s]\n' "$1" > "$tmp/plugins.json"; } # plugins ENTRY[,ENTRY...]
plugins "$user_crew"

fail() { echo "FAIL: $*" >&2; exit 1; }
recorded() { # recorded "<cwd>|<args>|<env>": the last launch matches
  [[ $(cat "$launched" 2>/dev/null) == "$1" ]] || fail "got '$(cat "$launched" 2>/dev/null)', want '$1'"
}
expect_die() { # expect_die DIR MESSAGE: exit non-zero, print MESSAGE, launch nothing
  local err
  rm -f "$launched"
  if err=$("$script" "$1" 2>&1 >/dev/null); then fail "$1: launched"; fi
  [[ $err == *"$2"* ]] || fail "$1: stderr '$err', want '$2'"
  [[ ! -e $launched ]] || fail "$1: claude launched despite the die"
}

# Default DIR is $PWD; the launch gets the crew agent, prompt and env
rm -f "$launched"
(cd "$tmp/my.proj" && "$script")
recorded "$tmp/my.proj|$launch_args|$env_want"

# DIR plus args: args after DIR go to claude, including non-dashed values
rm -f "$launched"
"$script" "$tmp" --resume abc
recorded "$tmp|$launch_args --resume abc|$env_want"

# Dashed args go to claude and DIR defaults to $PWD
rm -f "$launched"
(cd "$tmp/my.proj" && "$script" -c)
recorded "$tmp/my.proj|$launch_args -c|$env_want"

# -- ends launcher options, so DIR may still come first
rm -f "$launched"
"$script" -- "$tmp" -c
recorded "$tmp|$launch_args -c|$env_want"

# A directory-backed install takes the prompt from readFromFolder, not the cache
mkdir -p "$tmp/src/crew/prompts" && : > "$tmp/src/crew/prompts/system_override.md"
plugins '{"id":"crew@adminhead","scope":"user","enabled":true,"installPath":"'"$installPath"'","readFromFolder":"'"$tmp/src/crew"'"}'
rm -f "$launched"
"$script" "$tmp"
recorded "$tmp|--agent crew:orchestration --append-system-prompt-file $tmp/src/crew/prompts/system_override.md|$env_want"
plugins "$user_crew"

# Missing or disabled at user scope: die with the fix
plugins ''
expect_die "$tmp" "claude plugin install crew@adminhead --scope user"
plugins '{"id":"crew@adminhead","scope":"user","enabled":false,"installPath":"'"$installPath"'"}'
expect_die "$tmp" "claude plugin enable crew@adminhead --scope user"
plugins "$user_crew"

# Disabled at project scope for this directory: die with the fix
proj_off='{"id":"crew@adminhead","scope":"project","enabled":false,"projectPath":"'"$tmp/my.proj"'"}'
plugins "$user_crew,$proj_off"
expect_die "$tmp/my.proj" "claude plugin enable crew@adminhead --scope project"

# A disabled override for another directory does not block this one
other_off='{"id":"crew@adminhead","scope":"local","enabled":false,"projectPath":"'"$tmp/repo"'"}'
plugins "$user_crew,$other_off"
rm -f "$launched"
"$script" "$tmp/my.proj"
recorded "$tmp/my.proj|$launch_args|$env_want"
plugins "$user_crew"

# Bad directory and help
if "$script" /nonexistent 2>/dev/null; then fail "bad dir accepted"; fi
"$script" -h | grep -q '^Usage: claude-crew' || fail "help"

# agent.bashrc, layered after a login snapshot: it clears aliases and sets the pager
(
  alias ll='ls -l'
  # shellcheck source-path=SCRIPTDIR source=agent.bashrc
  . "$scripts/agent.bashrc"
  [[ -z $(alias) ]] || fail "alias survived agent.bashrc: $(alias)"
  [[ $PAGER == cat ]] || fail "PAGER is '$PAGER', want cat"
)

echo "all claude-crew checks passed"
