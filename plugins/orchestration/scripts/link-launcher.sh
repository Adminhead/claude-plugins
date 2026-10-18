#!/bin/sh
# SessionStart hook: points ~/.local/bin/claude-orchestrate at this install's launcher, so the
# link follows plugin updates. Leaves a regular file at that path alone. Prints nothing and
# always exits 0, so a failure never blocks a session.
src=${CLAUDE_PLUGIN_ROOT:-}/scripts/claude-orchestrate
dest=$HOME/.local/bin/claude-orchestrate
[ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -x "$src" ] || exit 0
if [ -e "$dest" ] && [ ! -L "$dest" ]; then exit 0; fi
[ "$(readlink "$dest" 2>/dev/null)" = "$src" ] && exit 0
mkdir -p "$(dirname "$dest")" 2>/dev/null && ln -sfn "$src" "$dest" 2>/dev/null
exit 0
