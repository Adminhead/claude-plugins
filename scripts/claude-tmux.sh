#!/usr/bin/env bash
# claude-tmux: attach to, or create, a tmux session running Claude Code.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: claude-tmux [-s NAME] [DIR] [CLAUDE_ARGS...]
       claude-tmux -l

Attach to, or create, a tmux session running Claude Code in DIR (default: $PWD).
The session is named claude-<git repo root name>, or claude-<DIR name> outside
a repo, so every directory in a project shares one session. Inside tmux it
switches sessions instead of nesting. The pane closes when Claude exits.

Claude runs as crew:orchestration from the crew plugin, with the plugin's
prompts/system_override.md appended to its system prompt, the built-in Explore
and Plan agents off, and auto memory off (claude-mem covers it). Plain `claude`
keeps the defaults. A new session first checks that crew is enabled for DIR.
Attaching to an existing session skips that check.

  -s NAME   use NAME as the session name
  -l        pick an existing session with fzf (live preview)
  -h        show this help

Arguments after DIR, or starting with "-", go to claude:
  claude-tmux -c                    # continue the last conversation here
  claude-tmux ~/code/api --resume   # resume picker in ~/code/api
EOF
}

die() { echo "claude-tmux: $*" >&2; exit 1; }

go_to() { # attach, or switch when already inside tmux
  if [[ -n ${TMUX:-} ]]; then exec tmux switch-client -t "=$1"; fi
  exec tmux attach-session -t "=$1"
}

# Sets $prompt to the crew system prompt. Reads the plugin list from $dir so
# project and local overrides for $dir apply.
preflight() {
  command -v jq >/dev/null || die "jq not found (install: sudo pacman -S jq)"
  local plugins user_crew off_scope
  plugins=$(cd "$dir" && claude plugin list --json) || die "claude plugin list failed"
  user_crew=$(jq -c '[.[] | select(.id == "crew@adminhead" and .scope == "user")][0] // empty' <<<"$plugins")
  [[ -n $user_crew ]] || die "crew@adminhead is not installed at user scope; run: claude plugin install crew@adminhead --scope user"
  [[ $(jq -r .enabled <<<"$user_crew") == true ]] || die "crew@adminhead is disabled at user scope; run: claude plugin enable crew@adminhead --scope user"
  off_scope=$(jq -r --arg dir "$dir" '[.[] | select(.id == "crew@adminhead" and (.scope == "project" or .scope == "local") and .projectPath == $dir and .enabled == false) | .scope][0] // empty' <<<"$plugins")
  [[ -z $off_scope ]] || die "crew@adminhead is disabled at $off_scope scope for $dir; run: claude plugin enable crew@adminhead --scope $off_scope"
  prompt=$(jq -r .installPath <<<"$user_crew")/prompts/system_override.md
  [[ -f $prompt ]] || die "missing $prompt"
}

command -v tmux >/dev/null || die "tmux not found (install: sudo pacman -S tmux)"

name=
while (($#)); do
  case $1 in
    -h|--help) usage; exit 0 ;;
    -s) (($# > 1)) || die "-s needs a session name"; name=$2; shift 2 ;;
    -l)
      command -v fzf >/dev/null || die "fzf not found (install: sudo pacman -S fzf)"
      sessions=$(tmux list-sessions -F '#S' 2>/dev/null) || die "no tmux sessions running"
      pick=$(fzf --prompt 'session> ' --preview 'tmux capture-pane -ep -t ={}:' \
        --preview-window right,65% <<<"$sessions") || exit 0
      go_to "$pick" ;;
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

if [[ -z $name ]]; then
  root=$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null) || root=$dir
  name=claude-$(basename "$root")
fi
name=${name//[.:]/-} # tmux forbids . and : in session names

if tmux has-session -t "=$name" 2>/dev/null; then
  (($# == 0)) || echo "claude-tmux: $name already exists; ignoring: $*" >&2
else
  preflight
  tmux new-session -d -s "$name" -c "$dir" \
    -e CLAUDE_CODE_DISABLE_AUTO_MEMORY=1 -e CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1 \
    claude -n "$name" --agent crew:orchestration --append-system-prompt-file "$prompt" "$@"
fi
go_to "$name"
