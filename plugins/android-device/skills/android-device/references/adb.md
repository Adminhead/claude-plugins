# adb commands

Contents: targeting, packages, permissions, deep links, app state, destructive commands.

Every command takes `-s <serial>` (or `ANDROID_SERIAL`). Examples below omit it for width; add it.

## Targeting

- `adb devices -l` lists serials, state, model and transport. `unauthorized` means accept the RSA prompt on the device; `offline` means reconnect, and `adb kill-server` is the last resort (ask when other tools share the server).
- "error: more than one device/emulator" means no target was given.
- `adb shell getprop ro.build.version.sdk` gives the API level; `ro.product.model` the model.

## Packages and users

- `adb shell pm list packages -3 --user <id>` lists third-party apps.
- `adb shell pm path <appId>` gives the installed APK path.
- `adb shell dumpsys package <appId>` shows version, signing, requested and granted permissions.
- `adb shell am get-current-user`, `adb shell pm list users`.

## Permissions

- `adb shell pm grant <appId> <permission>` and `pm revoke`, for runtime permissions the manifest declares. The command fails with `SecurityException` for install-time and signature permissions.
- `adb install -g` grants all runtime permissions at install; avoid it when testing the permission prompt.
- `adb shell appops set <appId> <op> allow|deny` covers app ops such as `SYSTEM_ALERT_WINDOW`.
- `grep granted=true` over `dumpsys package <appId>` confirms the result.

## Deep links

`adb shell am start -W -a android.intent.action.VIEW -d 'https://example.com/item?id=1&x=2' <appId>`

- `-W` waits and prints the launched activity and timing.
- Omit `<appId>` to see which app the system chooses; include it to test one app's filter.
- `Error: Activity not started, unable to resolve Intent` means no intent filter matches the scheme, host, path or the `autoVerify` state. Compare with the manifest `<intent-filter>`.
- Verified app links: `adb shell pm get-app-links <appId>`.

## App state

- `adb shell am force-stop <appId>` ends the process without deleting data.
- `adb shell pidof -s <appId>` is empty when the app is not running.
- `adb shell dumpsys activity activities | grep -E 'ResumedActivity|mResumed'` shows the foreground activity.
- `adb shell run-as <appId> ls files` reads app storage of a debuggable build without root.

## Destructive commands

These need the user's yes first, stated with what is lost.

| Command | Loses |
| :- | :- |
| `adb uninstall <appId>` | the app and all its data, for every user unless `--user` |
| `adb uninstall -k <appId>` | the app, but keeps data; still ask |
| `adb shell pm clear <appId>` | databases, preferences, files, granted permissions |
| `emulator -avd <name> -wipe-data` | the whole virtual device's user data |
| `avdmanager delete avd -n <name>` | the AVD |

Installing a tool, SDK package, system image or the `android` CLI also needs a yes. Do not pipe a downloaded script into a shell.
