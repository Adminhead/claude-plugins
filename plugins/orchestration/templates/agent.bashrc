# shellcheck shell=bash
# agent.bashrc: sourced before every Bash command Claude runs when started by claude-launch,
# which sets CLAUDE_CODE_SHELL to bash and CLAUDE_ENV_FILE to this file. Your zsh or fish
# config never runs; bash's login files run once into a snapshot before this.
#
# scripts/install.mjs copies this template to ~/.config/claude-launch/agent.bashrc only when
# that file is missing, so edit the copy. Changes apply to the next Claude start.
#
# Claude prepends this file to each command, so don't set shell options (set -e, pipefail,
# nounset) here: they would change how the agent's own command runs. Guard each line on its
# tool or directory so the file works on machines that lack it.

unalias -a

# Non-interactive output: no pagers, no editors, no credential prompts, no colour codes.
export PAGER=cat GIT_PAGER=cat GH_PAGER=cat SYSTEMD_PAGER=cat MANPAGER=cat
export EDITOR=true VISUAL=true GIT_TERMINAL_PROMPT=0 NO_COLOR=1
export PYTHONDONTWRITEBYTECODE=1

# Values the launching shell exported win; these only fill gaps. This file runs before every
# command, so keep it cheap.
if [ -z "${LC_ALL:-}" ]; then
  if command -v locale >/dev/null && locale -a 2>/dev/null | grep -qi '^en_US\.utf-\?8$'; then
    export LC_ALL=en_US.UTF-8
  else
    export LC_ALL=C.UTF-8
  fi
fi

if [ -z "${CARGO_BUILD_JOBS:-}" ] && command -v nproc >/dev/null; then
  CARGO_BUILD_JOBS=$(nproc)
  export CARGO_BUILD_JOBS
fi

# PATH entries your zsh config would normally add.
if [ -d "$HOME/.local/bin" ]; then PATH="$HOME/.local/bin:$PATH"; fi
# shellcheck source=/dev/null
if [ -f "${CARGO_HOME:-$HOME/.cargo}/env" ]; then . "${CARGO_HOME:-$HOME/.cargo}/env"; fi
gobin=${GOBIN:-${GOPATH:-$HOME/go}/bin}
if [ -d "$gobin" ]; then PATH="$gobin:$PATH"; fi
unset gobin
if [ -d "${KREW_ROOT:-$HOME/.krew}/bin" ]; then PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"; fi
export PATH

# Personal settings go here, guarded so an exported value still wins, for example:
#   export GOPATH="${GOPATH:-$HOME/.go}" GOBIN="${GOBIN:-$HOME/.go/bin}"
# Don't put secrets here; export them from your shell or use a secret manager.

# Version managers last, so their shims come first on PATH. Shims, not hooks: the
# snapshot shell has no prompt for a cd hook to run from.
if command -v mise >/dev/null; then eval "$(mise activate bash --shims)"; fi
