# targetSdk behavior changes

Source: developer.android.com behavior-change pages, read 2026-11-01. Verified for API 35 and 36. API 37 (Android 17) was not verified; read its page before relying on anything about it. Link the Play target-API page for deadlines; do not restate them here.

Two kinds: changes that apply to every app on a newer OS, and changes that apply only once `targetSdk` is raised. A crash that appears only on a newer device with an unchanged `targetSdk` is the first kind. A regression right after a `targetSdk` bump is the second. Raise `targetSdk` on its own change, test on a device or emulator at that level, and check `compileSdk` is at least as high.

## Targeting API 35

- Edge-to-edge is the default: content draws under the system bars unless insets are handled. Route fixes to `android-skills:edge-to-edge`.
- `dataSync` and `mediaProcessing` foreground services have a time limit (6 hours per 24 hours), after which `Service.onTimeout()` is called and the service must stop.
- `BOOT_COMPLETED` receivers cannot start several foreground service types (`dataSync`, `camera`, `mediaPlayback`, `phoneCall`, `mediaProjection`, `microphone`).
- Starting a foreground service from the background needs a visible overlay window if relying on `SYSTEM_ALERT_WINDOW`.
- A `PendingIntent` creator blocks background activity launches by default.
- Apps cannot change the global Do Not Disturb state; they contribute an `AutomaticZenRule`.
- Audio focus requests fail (`AUDIOFOCUS_REQUEST_FAILED`) unless the app is the top app or runs a foreground service.
- TLS 1.0 and 1.1 are disallowed.
- OpenJDK 17 API changes: stricter `String.format()` argument checks, `SequencedCollection` method collisions (`removeFirst`/`removeLast`), different `Random.ints()` sequences.
- `Configuration` screen sizes no longer exclude system bars; `TextView`/`EditText` text metrics changed for some scripts.

## Targeting API 36

- The edge-to-edge opt-out (`windowOptOutEdgeToEdgeEnforcement`) is gone.
- Predictive back is on by default: `onBackPressed()` and `KEYCODE_BACK` are not dispatched. Migrate to `OnBackPressedCallback`/`BackHandler` (`android-skills:navigation-event`), or opt out temporarily with `android:enableOnBackInvokedCallback="false"`.
- On displays with smallest width of 600dp or more, orientation, resizability and aspect-ratio restrictions are ignored. Layouts must adapt (`android-skills:adaptive`).
- `scheduleAtFixedRate` runs at most one missed execution when the app returns to a valid lifecycle.
- `BODY_SENSORS` is replaced by granular health permissions.
- `elegantTextHeight` is ignored.

## Checklist for a bump

1. Read the behavior-change page for each level between the old and new target, "all apps" and "targeting" sections both.
2. Search the code for each affected API (foreground services, alarms, `onBackPressed`, background starts, notification posting).
3. Run on a device or emulator at the new level; grep logcat for the new `StrictMode` or compatibility warnings.
4. Change `targetSdk` in its own commit.
