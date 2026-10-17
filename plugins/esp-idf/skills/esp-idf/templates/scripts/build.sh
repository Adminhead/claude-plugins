#!/usr/bin/env bash
# Build the project. --strict-warnings runs `idf.py fullclean` first, so every
# file recompiles and the warning check sees them all, then fails on any warning.
set -Eeuo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source-path=SCRIPTDIR source=common.sh
. "${SCRIPT_DIR}/common.sh"

strict=0
if [ "${1:-}" = "--strict-warnings" ]; then
  strict=1
  shift
fi

if [ "$strict" -eq 1 ]; then
  run_idf fullclean
fi
mkdir -p -- "$BUILD_DIR"
build_log=${BUILD_LOG_FILE:-"${BUILD_DIR}/build.log"}

log "Building ${PROJECT_DIR}"
run_idf build "$@" 2>&1 | tee -- "$build_log"

if [ "$strict" -eq 1 ] && grep -Eiq '(^|[^[:alpha:]])warning:' "$build_log"; then
  die "build produced warnings and --strict-warnings is set (see ${build_log})."
fi
log "Build succeeded."
