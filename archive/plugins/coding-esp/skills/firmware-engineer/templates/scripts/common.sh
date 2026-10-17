#!/usr/bin/env bash
# Shared helpers for build.sh, flash.sh, and monitor.sh. Source it; do not run it.
# Copy the four scripts into <project>/scripts/ and make them executable.

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_DIR=${PROJECT_DIR:-$(cd -- "${SCRIPT_DIR}/.." && pwd)}
BUILD_DIR=${BUILD_DIR:-"${PROJECT_DIR}/build"}
IDF_BAUD=${IDF_BAUD:-460800}

log() {
  printf '[esp-idf] %s\n' "$*" >&2
}

die() {
  log "ERROR: $*"
  exit 1
}

# idf.py must already be on PATH. export.sh is not safe to source under
# `set -u`, so the user loads the environment first.
preflight() {
  if [ "${IDF_PREFLIGHT_DONE:-0}" = "1" ]; then
    return 0
  fi
  command -v idf.py >/dev/null 2>&1 \
    || die "idf.py not found. Run '. \$IDF_PATH/export.sh' in this shell first."
  local version
  version=$(idf.py --version 2>&1) \
    || die "idf.py is on PATH but failed to run: ${version}"
  log "ESP-IDF ready: ${version}"
  export IDF_PREFLIGHT_DONE=1
}

# idf.py silently falls back to esp32 when sdkconfig has no target, and
# set-target wipes sdkconfig. So never switch targets here: require the
# project to be configured, and optionally check it against ESP_TARGET.
check_target() {
  local sdkconfig="${PROJECT_DIR}/sdkconfig"
  [ -f "$sdkconfig" ] \
    || die "no sdkconfig in ${PROJECT_DIR}. Run 'idf.py set-target <chip>' once."

  local configured
  configured=$(sed -n 's/^CONFIG_IDF_TARGET="\([^"]*\)"/\1/p' "$sdkconfig" | head -n 1)
  [ -n "$configured" ] || die "CONFIG_IDF_TARGET missing from ${sdkconfig}."

  if [ -n "${ESP_TARGET:-}" ] && [ "$ESP_TARGET" != "$configured" ]; then
    die "sdkconfig targets '${configured}' but ESP_TARGET is '${ESP_TARGET}'."
  fi
  log "Target: ${configured}"
}

run_idf() {
  preflight
  check_target
  idf.py -C "$PROJECT_DIR" -B "$BUILD_DIR" "$@"
}
