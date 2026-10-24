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

# --config can point at a file that changes launch options, so it is not pre-approved.
for arg in "$@"; do
  case $arg in
    --config | --config=*) die "--config is not allowed here (run playwright-cli directly)" ;;
  esac
done

exec playwright-cli "$@"
