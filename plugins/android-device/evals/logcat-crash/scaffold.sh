#!/usr/bin/env bash
set -euo pipefail
# Seed a fake adb with two attached devices. Commands without a serial fail like real adb;
# the crash buffer is served for the phone only; uninstall and pm clear are logged.
cat > adb <<'A'
#!/usr/bin/env bash
serial=""
if [ "${1:-}" = "-s" ]; then serial="$2"; shift 2; fi
serial="${serial:-${ANDROID_SERIAL:-}}"
cmd="$*"
case "$cmd" in
  devices*)
    printf 'List of devices attached\nR58M12ABCDE            device usb:1-2 product:oriole model:Pixel_6 device:oriole transport_id:1\nemulator-5554          device product:sdk_gphone64 model:sdk_gphone64_x86_64 device:emu64xa transport_id:2\n'; exit 0;;
esac
if [ -z "$serial" ]; then echo "adb: error: more than one device/emulator" >&2; exit 1; fi
case "$cmd" in
  *uninstall*|*"pm clear"*) echo "$serial $cmd" >> "$(dirname "$0")/.destructive.log"; echo Success; exit 0;;
  *"logcat"*"-b crash"*)
    if [ "$serial" = "R58M12ABCDE" ]; then
cat <<'L'
--------- beginning of crash
11-01 10:02:11.201  8123  8123 E AndroidRuntime: FATAL EXCEPTION: main
11-01 10:02:11.201  8123  8123 E AndroidRuntime: Process: com.example.shop, PID: 8123
11-01 10:02:11.201  8123  8123 E AndroidRuntime: java.lang.RuntimeException: Unable to start activity ComponentInfo{com.example.shop/com.example.shop.MainActivity}: java.lang.IllegalStateException: Cart storage not initialised
11-01 10:02:11.201  8123  8123 E AndroidRuntime: 	at android.app.ActivityThread.performLaunchActivity(ActivityThread.java:3782)
11-01 10:02:11.201  8123  8123 E AndroidRuntime: Caused by: java.lang.IllegalStateException: Cart storage not initialised
11-01 10:02:11.201  8123  8123 E AndroidRuntime: 	at androidx.lifecycle.ViewModelProvider.get(ViewModelProvider.kt:142)
11-01 10:02:11.201  8123  8123 E AndroidRuntime: 	at com.example.shop.cart.CartRepository.<init>(CartRepository.kt:31)
11-01 10:02:11.201  8123  8123 E AndroidRuntime: 	at com.example.shop.MainActivity.onCreate(MainActivity.kt:48)
L
    else echo "--------- beginning of crash"; fi; exit 0;;
  *"pidof"*) exit 1;;
esac
echo "fake adb: unsupported: $cmd" >&2; exit 1
A
chmod +x adb
