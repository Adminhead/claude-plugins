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
check_reject snapshot -s=../../x
check_reject open --session=../../x
check_reject -s=x snapshot -s=y
check_reject -s=x snapshot --session=y
check_reject snapshot -s
check_reject open --session x
check_reject open https://x --cdp=http://localhost:9222
check_reject -s=x open --cdp-endpoint=ws://x
check_reject open --endpoint=ws://x
check_reject open --extension
check_reject open --profile=/home/u/.config/chrome
check_reject -s=x open --profile /tmp/p
check_reject open --persistent
check_reject -s=x open --persistent https://x
check_reject -s=x screenshot --filename=/etc/cron.d/x
check_reject -s=x screenshot --filename=../x.png
check_reject -s=x screenshot --filename=/tmp/../etc/x
check_reject -s=x screenshot --filename ../x.png
check_reject -s=x screenshot --filename
check_pass -s=x open https://x
check_pass -s=x screenshot
check_pass -s=x screenshot --filename=/tmp/bt-1/a.png
check_pass -s=x snapshot --filename=artifacts/a.md

[ "$fail" -eq 0 ] && echo "pw-spec: ok"
exit "$fail"
