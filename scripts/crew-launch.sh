# shellcheck shell=bash
# Shared by claude-tmux and claude-crew. Sourced, not run. The caller defines die() first.

# Sets $prompt to the crew system prompt. Reads the plugin list from $dir so
# project and local overrides for $dir apply. The caller sets $dir.
# shellcheck disable=SC2154
preflight() {
  command -v jq >/dev/null || die "jq not found (install: sudo pacman -S jq)"
  local plugins user_crew off_scope
  plugins=$(cd "$dir" && claude plugin list --json) || die "claude plugin list failed"
  user_crew=$(jq -c '[.[] | select(.id == "crew@adminhead" and .scope == "user")][0] // empty' <<<"$plugins")
  [[ -n $user_crew ]] || die "crew@adminhead is not installed at user scope; run: claude plugin install crew@adminhead --scope user"
  [[ $(jq -r .enabled <<<"$user_crew") == true ]] || die "crew@adminhead is disabled at user scope; run: claude plugin enable crew@adminhead --scope user"
  off_scope=$(jq -r --arg dir "$dir" '[.[] | select(.id == "crew@adminhead" and (.scope == "project" or .scope == "local") and .projectPath == $dir and .enabled == false) | .scope][0] // empty' <<<"$plugins")
  [[ -z $off_scope ]] || die "crew@adminhead is disabled at $off_scope scope for $dir; run: claude plugin enable crew@adminhead --scope $off_scope"
  # A directory marketplace runs the plugin from readFromFolder, not the cache copy.
  prompt=$(jq -r '.readFromFolder // .installPath' <<<"$user_crew")/prompts/system_override.md
  [[ -f $prompt ]] || die "missing $prompt"
}

# Environment for the agents' Claude process. CLAUDE_CODE_SHELL points the Bash
# tool at bash, so the user's zsh config never runs. CLAUDE_ENV_FILE is prepended
# to every Bash command. $SHELL stays as the user set it.
agent_dir=$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")
bash_path=$(command -v bash) || die "bash not found"
[[ $bash_path == /* ]] || die "bash not found at an absolute path: $bash_path"
# shellcheck disable=SC2034 # read by the launchers
agent_env=(
  CLAUDE_CODE_DISABLE_AUTO_MEMORY=1
  CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1
  "CLAUDE_CODE_SHELL=$bash_path"
  "CLAUDE_ENV_FILE=$agent_dir/agent.bashrc"
)
