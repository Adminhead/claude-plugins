#!/usr/bin/env bash
# Spec for scripts/pw.sh, run with a stub playwright-cli on PATH.
set -u

here=$(cd "$(dirname "$0")" && pwd)
pw=$here/../scripts/pw.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
mkdir "$tmp/bin"
cat >"$tmp/bin/playwright-cli" <<'EOF'
#!/bin/sh
: >"$STUB_OUT"
for a in "$@"; do printf '%s\n' "$a" >>"$STUB_OUT"; done
EOF
chmod +x "$tmp/bin/playwright-cli"
export PATH="$tmp/bin:$PATH" STUB_OUT="$tmp/out"

fail=0
check_pass() {
  rm -f "$STUB_OUT"
  expected=$(printf '%s\n' "$@")
  if ! "$pw" "$@" >/dev/null 2>&1; then
    echo "FAIL (exit): $*"; fail=1; return
  fi
  if [ "$(cat "$STUB_OUT" 2>/dev/null)" != "$expected" ]; then
    echo "FAIL (argv changed): $*"; fail=1
  fi
}
check_reject() {
  rm -f "$STUB_OUT"
  if "$pw" "$@" >/dev/null 2>&1; then
    echo "FAIL (accepted): $*"; fail=1; return
  fi
  if [ -e "$STUB_OUT" ]; then
    echo "FAIL (stub ran): $*"; fail=1
  fi
}

for verb in open goto close snapshot find click dblclick fill type hover select \
  check uncheck press keydown keyup go-back go-forward reload screenshot resize \
  tab-list tab-new tab-select tab-close console requests list \
  set-color-scheme set-reduced-motion set-forced-colors set-contrast set-media \
  clear-color-scheme clear-reduced-motion clear-forced-colors clear-contrast clear-media; do
  check_pass "$verb"
  check_pass "$verb" "a b" "--filename=x;y"
  check_pass "-s=checkout" "$verb" e12 "two words"
done
check_pass -s=A_z-9 snapshot
check_pass -s="$(printf 'a%.0s' $(seq 64))" snapshot

for verb in eval run-code state-save state-load cookie-list cookie-set localstorage-get \
  sessionstorage-set route unroute webmcp-call upload pdf request response-body \
  install install-browser kill-all close-all delete-data attach drop drag tracing-start; do
  check_reject "$verb"
  check_reject "-s=x" "$verb" "1+1"
done
check_reject
check_reject -s=x
check_reject "-s=x;y" snapshot
check_reject '-s=$(id)' snapshot
check_reject "-s=" snapshot
check_reject "-s=a b" snapshot
check_reject "-s=$(printf 'a%.0s' $(seq 65))" snapshot
check_reject -s=a -s=b snapshot
check_reject --json snapshot
check_reject -s snapshot
check_reject open --config=evil.json
check_reject -s=x open --config evil.json

[ "$fail" -eq 0 ] && echo "pw-spec: ok"
exit "$fail"
