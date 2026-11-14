#!/usr/bin/env bash
# Build, then flash the connected device. Writes to real hardware, so run it
# only on purpose. PORT is required: no port scanning, so the wrong board
# never gets flashed. Refuses when the project's sdkconfig enables
# CONFIG_SECURE_BOOT or CONFIG_SECURE_FLASH_ENC_ENABLED, because flashing such a
# build burns eFuses irreversibly on first boot. ACK_EFUSE=1 overrides. A
# missing sdkconfig does not block. Other security options in sdkconfig are not
# checked here: see references/security-hardening.md.
# Extra arguments go to `idf.py flash`. SKIP_BUILD=1 skips the build step.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source-path=SCRIPTDIR source=common.sh
. "${SCRIPT_DIR}/common.sh"

[ -n "${PORT:-}" ] || die "PORT is not set. Export PORT=<serial device> to flash."
[ -e "$PORT" ] || die "PORT=${PORT} does not exist."

sdkconfig="${PROJECT_DIR}/sdkconfig"
if [ -f "$sdkconfig" ] && [ "${ACK_EFUSE:-0}" != "1" ]; then
  secure=$(grep -E '^CONFIG_(SECURE_BOOT|SECURE_FLASH_ENC_ENABLED)=y$' "$sdkconfig" || true)
  if [ -n "$secure" ]; then
    die "sdkconfig enables eFuse-burning options ($(printf '%s' "$secure" | tr '\n' ' ')). Flashing burns eFuses irreversibly. Set ACK_EFUSE=1 to proceed on this port."
  fi
fi

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  "${SCRIPT_DIR}/build.sh"
fi

log "Flashing ${PORT} at ${IDF_BAUD} baud"
run_idf -p "$PORT" -b "$IDF_BAUD" flash "$@"
log "Flash complete."
