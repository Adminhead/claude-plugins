#!/usr/bin/env bash
# Usage: pw.sh [-s=<name>] <verb> [args...]
# Checks the session name and the verb against allowlists, then execs
# playwright-cli with argv unchanged. This wrapper is the only pre-approved
# way to run playwright-cli; any other verb (eval, run-code, state-*, cookie-*,
# *storage-*, route, upload, pdf, ...) must be run directly and prompts.
set -eu

die() {
  echo "pw.sh: $*" >&2
  exit 2
}

[ "$#" -ge 1 ] || die "usage: pw.sh [-s=<name>] <verb> [args...]"

if [ "${1#-s=}" != "$1" ]; then
  name=${1#-s=}
  case $name in
    '' | *[!A-Za-z0-9_-]*) die "session name must match [A-Za-z0-9_-]{1,64}" ;;
  esac
  [ "${#name}" -le 64 ] || die "session name must match [A-Za-z0-9_-]{1,64}"
  [ "$#" -ge 2 ] || die "missing verb after $1"
  verb=$2
else
  verb=$1
fi

case $verb in
  open | goto | close | snapshot | find | click | dblclick | fill | type | hover | select \
    | check | uncheck | press | keydown | keyup | go-back | go-forward | reload \
    | screenshot | resize | tab-list | tab-new | tab-select | tab-close | console \
    | requests | list | set-color-scheme | set-reduced-motion | set-forced-colors \
    | set-contrast | set-media | clear-color-scheme | clear-reduced-motion \
    | clear-forced-colors | clear-contrast | clear-media) ;;
  *) die "verb not allowed: $verb (run playwright-cli directly; it will prompt)" ;;
esac

# Flags are scanned in every position, because playwright-cli reads them anywhere.
# --config can change launch options; --cdp, --endpoint, --extension, --profile and
# --persistent attach to or persist a real browser; -s/--session builds a file path.
# --filename is limited to a relative path without '..' or an absolute /tmp/ path.
check_filename() {
  case $1 in
    '' | *..* | -*) die "--filename must be a relative path without '..' or an absolute /tmp/ path" ;;
    /tmp/*) ;;
    /*) die "--filename must be a relative path without '..' or an absolute /tmp/ path" ;;
  esac
}
n=0
want_filename=0
for arg in "$@"; do
  n=$((n + 1))
  if [ "$want_filename" -eq 1 ]; then
    check_filename "$arg"
    want_filename=0
    continue
  fi
  case $arg in
    -s* | --session*)
      if [ "$n" -ne 1 ] || [ "${arg#-s=}" = "$arg" ]; then
        die "session flag only allowed as the first argument: -s=<name>"
      fi
      ;;
    --config | --config=*) die "--config is not allowed here (run playwright-cli directly)" ;;
    --cdp* | --endpoint* | --extension* | --profile* | --persistent*)
      die "$arg attaches to or persists a real browser (run playwright-cli directly; it will prompt)" ;;
    --filename) want_filename=1 ;;
    --filename=*) check_filename "${arg#--filename=}" ;;
  esac
done
[ "$want_filename" -eq 0 ] || die "--filename needs a value"

exec playwright-cli "$@"
