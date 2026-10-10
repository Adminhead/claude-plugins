#!/usr/bin/env bash
# Build, then flash the connected device. Writes to real hardware, so run it
# only on purpose. PORT is required: no port scanning, so the wrong board
# never gets flashed. Check sdkconfig for security options first, because
# some builds burn eFuses on first boot.
# Extra arguments go to `idf.py flash`. SKIP_BUILD=1 skips the build step.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source-path=SCRIPTDIR source=common.sh
. "${SCRIPT_DIR}/common.sh"

[ -n "${PORT:-}" ] || die "PORT is not set. Export PORT=<serial device> to flash."
[ -e "$PORT" ] || die "PORT=${PORT} does not exist."

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  "${SCRIPT_DIR}/build.sh"
fi

log "Flashing ${PORT} at ${IDF_BAUD} baud"
run_idf -p "$PORT" -b "$IDF_BAUD" flash "$@"
log "Flash complete."
