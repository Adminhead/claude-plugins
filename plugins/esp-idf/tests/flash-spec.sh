#!/usr/bin/env bash
# Spec for templates/scripts/flash.sh with a stub idf.py on PATH.
# Run: bash plugins/esp-idf/tests/flash-spec.sh </dev/null
set -u

here=$(cd "$(dirname "$0")" && pwd)
src=$here/../skills/esp-idf/templates/scripts
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

mkdir -p "$tmp/bin" "$tmp/proj/scripts"
cp "$src"/*.sh "$tmp/proj/scripts/"
cat >"$tmp/bin/idf.py" <<'EOF'
#!/bin/sh
case "$*" in *--version*) echo "ESP-IDF stub"; exit 0 ;; esac
echo "$*" >>"$STUB_LOG"
EOF
chmod +x "$tmp/bin/idf.py"
export PATH="$tmp/bin:$PATH" STUB_LOG="$tmp/log" PORT="$tmp/port" SKIP_BUILD=1
: >"$PORT"
unset ACK_EFUSE

fail=0
run() { # name expect(pass|refuse) [env...]
  name=$1 expect=$2
  : >"$STUB_LOG"
  if env "${@:3}" bash "$tmp/proj/scripts/flash.sh" >"$tmp/out" 2>&1; then
    got=pass
  else
    got=refuse
  fi
  flashed=no
  grep -q flash "$STUB_LOG" && flashed=yes
  if [ "$got" != "$expect" ]; then
    echo "FAIL ($name): expected $expect, got $got"; fail=1
  elif [ "$expect" = refuse ] && [ "$flashed" = yes ]; then
    echo "FAIL ($name): refused but idf.py flash ran"; fail=1
  elif [ "$expect" = pass ] && [ "$flashed" = no ]; then
    echo "FAIL ($name): passed but idf.py flash did not run"; fail=1
  fi
}

printf 'CONFIG_IDF_TARGET="esp32"\n' >"$tmp/proj/sdkconfig"
run plain pass A=1

printf 'CONFIG_IDF_TARGET="esp32"\nCONFIG_SECURE_BOOT=y\n' >"$tmp/proj/sdkconfig"
run secure-boot refuse A=1
run secure-boot-ack pass ACK_EFUSE=1

printf 'CONFIG_IDF_TARGET="esp32"\nCONFIG_SECURE_FLASH_ENC_ENABLED=y\n' >"$tmp/proj/sdkconfig"
run flash-enc refuse A=1
run flash-enc-ack pass ACK_EFUSE=1

printf 'CONFIG_IDF_TARGET="esp32"\n# CONFIG_SECURE_BOOT is not set\n# CONFIG_SECURE_FLASH_ENC_ENABLED is not set\n' >"$tmp/proj/sdkconfig"
run disabled pass A=1

# Missing sdkconfig does not block the security check (check_target then fails
# inside idf.py wrapper, so only assert the refusal message is absent).
rm "$tmp/proj/sdkconfig"
bash "$tmp/proj/scripts/flash.sh" >"$tmp/out" 2>&1
grep -q "eFuse" "$tmp/out" && { echo "FAIL (no-sdkconfig): eFuse refusal"; fail=1; }

[ "$fail" -eq 0 ] && echo "flash-spec: all passed"
exit "$fail"
