#!/usr/bin/env bash
# Image entrypoint: install the project's mise tools for the cwd, then run the command.
set -euo pipefail

if ! mise install; then
  echo "sandbox-entry: mise install failed in $PWD; if the config is untrusted, run \`mise trust\` on the host" >&2
  exit 1
fi
exec "$@"
