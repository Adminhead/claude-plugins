---
name: android-device
description: 'Triages Android crashes and manages device state with adb and logcat: an app that closes on launch, a Java "Caused by" chain or native tombstone, `adb logcat -b crash`, INSTALL_FAILED_UPDATE_INCOMPATIBLE, INSTALL_FAILED_INSUFFICIENT_STORAGE and INSTALL_FAILED_VERSION_DOWNGRADE, `pm grant` and `pm revoke`, deep links with `am start`, and choosing one device when several are attached. Use for symptoms such as "the app crashes when I open it, how do I see why", "error: more than one device/emulator", or "install fails on the phone". Pins one serial and asks before uninstall, `pm clear` or wiping data.'
---

# Android device

Pin one device and one app before touching either, read the evidence the device already holds, and ask before any command that destroys data.

Not for: the `android` CLI (project creation, `android run`, emulators, SDK packages, screenshots, layout dumps, input, journeys, `android docs`; `android-skills:android-cli`), writing or running instrumented tests (`android-testing`), and ANR traces (`android-skills:anr-audit-and-fix`).

## Target

1. Run `adb devices -l`. Record the serial, its state (`device`, not `unauthorized` or `offline`) and whether it is an emulator.
2. With more than one device attached, export `ANDROID_SERIAL=<serial>` or pass `-s <serial>` on every command, including `logcat` and `install`. Ask which device when the choice is not obvious. Never run an adb command that has no target while two are attached.
3. Find the application ID from the module's `build.gradle(.kts)` (`applicationId` plus any `applicationIdSuffix` of the variant in use), or confirm with `adb -s <serial> shell pm list packages <fragment>`.
4. Find the Android user with `adb -s <serial> shell am get-current-user`. Work profiles and secondary users hold separate app data; add `--user <id>` to `pm` and `am` commands when it is not 0.
5. Done when serial, application ID and user are each written down.

## Install

`./gradlew installDebug` installs on every connected device. Use `./gradlew assembleDebug` and then `adb -s <serial> install -r <apk>` instead. A failure code means:

- `INSTALL_FAILED_UPDATE_INCOMPATIBLE`: the installed copy has a different signature. The only fix that keeps the signature is uninstalling, which deletes the app's data; ask first, and offer a different `applicationIdSuffix` as the alternative.
- `INSTALL_FAILED_VERSION_DOWNGRADE`: raise `versionCode`, or for a debuggable build add `-d` to `install -r`.
- `INSTALL_FAILED_INSUFFICIENT_STORAGE`: check `adb -s <serial> shell df /data`. Name what could be freed and ask; do not clear other apps to make room.

## Crashes

1. Reproduce the crash once, then read the crash buffer after the process has died: `adb -s <serial> logcat -b crash -d`. Use `--pid=$(adb -s <serial> shell pidof -s <appId>)` only while the process is still running.
2. For a Java or Kotlin crash, read the whole `Caused by:` chain to the last one and quote the first frame that belongs to the app's package. Report the exception, that frame as `File.kt:line` and a one-line cause.
3. For a native crash (`Fatal signal`, `SIGSEGV`, `backtrace:`), read the tombstone: the `logcat -b crash` text, or `adb -s <serial> shell dumpsys dropbox --print data_app_native_crash`. Symbolize frames against the unstripped `.so` from the build.
4. Done when the report names the exception or signal, the app frame, and the command output it came from. If the buffer is empty, say so and widen with `logcat -d -t 300` before guessing.

Read [references/logcat.md](references/logcat.md) for buffers, filters and tombstone locations.

## State

- Permissions: `adb -s <serial> shell pm grant <appId> android.permission.CAMERA` and `pm revoke`. Only runtime (dangerous) permissions can be granted this way.
- Deep links: `adb -s <serial> shell am start -W -a android.intent.action.VIEW -d '<uri>' <appId>`. Single-quote the URI so the local shell does not split on `&`.
- Check the result with `dumpsys package <appId>` or the activity that came to the front.

Read [references/adb.md](references/adb.md) for these commands in full and for app-state inspection.

## Ask first

State the command and what it deletes, then wait for a yes. This holds even when the user's request implies it.

- `adb uninstall` and `pm uninstall`
- `pm clear`, `rm` on app storage
- `emulator -wipe-data`, deleting or recreating an AVD
- `adb reboot` into recovery or bootloader, `adb root`, and any factory reset
- installing any tool, SDK package or system image, including the `android` CLI and `adb` itself

## Gotchas

- `adb logcat` without `-d` never returns. Always pass `-d` (or `-t <n>`) when the output is read back.
- A wireless device and an emulator can show the same app; the serial, not the app name, decides which one a command hits.
- A crash that vanishes from `logcat` after the app restarts is still in `-b crash` until the buffer rolls over; read it before relaunching.
