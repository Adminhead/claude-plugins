#!/usr/bin/env bash
# Open the serial monitor. Needs an interactive terminal; Ctrl+] exits.
# Set PORT to pick a serial port; otherwise idf.py scans (read-only, safe).
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source-path=SCRIPTDIR source=common.sh
. "${SCRIPT_DIR}/common.sh"

args=()
if [ -n "${PORT:-}" ]; then
  [ -e "$PORT" ] || die "PORT=${PORT} does not exist."
  args+=(-p "$PORT")
fi
args+=(monitor)

run_idf "${args[@]}" "$@"
