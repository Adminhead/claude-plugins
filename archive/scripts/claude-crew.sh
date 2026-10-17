#!/usr/bin/env bash
# claude-crew: run Claude Code as crew:orchestration in the foreground, without tmux.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: claude-crew [DIR] [CLAUDE_ARGS...]
       claude-crew -h

claude-tmux without tmux: runs Claude Code in DIR (default: $PWD) in the foreground,
with the same setup. Claude runs as crew:orchestration from the crew plugin, with the
plugin's prompts/system_override.md appended to its system prompt, the built-in
Explore and Plan agents off, and auto memory off. The agents' Bash tool runs bash
with scripts/agent.bashrc instead of your login shell. A new session first checks
that crew is enabled for DIR.

  -h        show this help

Arguments after DIR, or starting with "-", go to claude:
  claude-crew ~/code/api --resume   # resume picker in ~/code/api
EOF
}

die() { echo "claude-crew: $*" >&2; exit 1; }

# shellcheck source-path=SCRIPTDIR source=crew-launch.sh
source "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/crew-launch.sh"

while (($#)); do
  case $1 in
    -h|--help) usage; exit 0 ;;
    --) shift; break ;;
    *) break ;;
  esac
done

dir=$PWD
if (($#)) && [[ $1 != -* ]]; then
  [[ -d $1 ]] || die "no such directory: $1"
  dir=$1
  shift
fi
dir=$(cd "$dir" && pwd)

command -v claude >/dev/null || die "claude not found"
preflight
cd "$dir" && exec env "${agent_env[@]}" claude --agent crew:orchestration --append-system-prompt-file "$prompt" "$@"
