# shellcheck shell=bash
# Runs before every Bash command the crew agents make, after the bash login snapshot.
# Login files still run first, so their functions and shopt settings survive here.
# Adds no shell options: Claude prepends this file to each command, so set -e or
# pipefail would reach the agent's command. Each line checks for its tool or
# directory first, so the file is correct where one is missing. Edits take effect
# after a Claude restart.
unalias -a
export PAGER=cat GIT_PAGER=cat GH_PAGER=cat SYSTEMD_PAGER=cat MANPAGER=cat GIT_TERMINAL_PROMPT=0 EDITOR=true VISUAL=true NO_COLOR=1
export MISE_RUSTUP_HOME="$HOME/.local/share/rustup" MISE_CARGO_HOME="$HOME/.local/share/cargo"
export PYTHONDONTWRITEBYTECODE=1

GOPATH="$HOME/.go"
export GOPATH
export GOBIN="$GOPATH/bin"

if command -v nproc >/dev/null; then
  CARGO_BUILD_JOBS=$(nproc)
  export CARGO_BUILD_JOBS
fi

if command -v locale >/dev/null && locale -a 2>/dev/null | grep -qi '^en_US\.utf-\?8$'; then
  export LC_ALL=en_US.UTF-8
else
  export LC_ALL=C.UTF-8
fi

if [ -d "$HOME/.local/bin" ]; then PATH="$HOME/.local/bin:$PATH"; fi
if [ -d "${KREW_ROOT:-$HOME/.krew}/bin" ]; then PATH="${KREW_ROOT:-$HOME/.krew}/bin:$PATH"; fi
# shellcheck source=/dev/null
if [ -f "$HOME/.cargo/env" ]; then . "$HOME/.cargo/env"; fi

# Last, so the mise shims come first on PATH.
if command -v mise >/dev/null; then eval "$(mise activate bash --shims)"; fi
