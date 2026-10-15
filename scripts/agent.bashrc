# shellcheck shell=bash
# Runs before every Bash command the crew agents make, after the bash login snapshot.
# Login files still run first, so their functions and shopt settings survive here.
# Adds no shell options: Claude prepends this file to each command, so set -e or
# pipefail would reach the agent's command. Edits take effect after a Claude restart.
unalias -a
export PAGER=cat GIT_PAGER=cat GH_PAGER=cat SYSTEMD_PAGER=cat MANPAGER=cat GIT_TERMINAL_PROMPT=0 EDITOR=true VISUAL=true NO_COLOR=1
