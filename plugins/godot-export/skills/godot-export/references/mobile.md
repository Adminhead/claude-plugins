# Android and iOS

Platform deltas beyond a generic export: toolchain, signing, store formats, lifecycle, permissions and native APIs. Touch input and UI layout live in the `godot` skill; store submission flows in `game-publish`.

## Contents

- Renderer and textures
- Android toolchain
- Android signing and AAB
- Gradle build and plugins
- iOS
- App lifecycle
- Permissions
- Calling Android APIs
- Safe area and device features
- C# on mobile
- Checklist

## Renderer and textures

Use the Mobile renderer (or Compatibility for older devices). Enable `rendering/textures/vram_compression/import_etc2_astc` so textures import in a mobile format. The iOS simulator runs only Compatibility.

## Android toolchain

- OpenJDK 17 (newer JDKs work; 17 is recommended) and the Android SDK with platform-tools 35+, build-tools 35.0.1, platform 35, command-line tools, CMake 3.10.2.4988404 and NDK r28b. One command: `sdkmanager --sdk_root=<sdk> "platform-tools" "build-tools;35.0.1" "platforms;android-35" "cmdline-tools;latest" "cmake;3.10.2.4988404" "ndk;28.1.13356709"`. These versions are for 4.7; recheck the "Exporting for Android" page for the project's version.
- Set Java SDK Path and Android SDK Path in Editor Settings > Export > Android (per user, not per project; first-run defaults come from `JAVA_HOME` and `ANDROID_HOME`). On Linux, don't use the distro's SDK packages.
- Set `package/unique_name` (reverse DNS), `version/code` (integer, bump every upload) and `version/name`.
- "Could not install to device": an app with the same package name but another signing key is installed; uninstall it.

## Android signing and AAB

```bash
keytool -v -genkey -keystore mygame.keystore -alias mygame -keyalg RSA -validity 10000
```

- Preset: `keystore/release` (path), `keystore/release_user` (alias), `keystore/release_password`. The keystore and key passwords must currently be the same. Use letters and digits only; special characters can break the export.
- Uncheck Export With Debug for store builds.
- CI overrides: `GODOT_ANDROID_KEYSTORE_RELEASE_PATH`, `GODOT_ANDROID_KEYSTORE_RELEASE_USER`, `GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD` (and `..._DEBUG_...`).
- Google Play requires AAB for new apps: set `gradle_build/use_gradle_build = true` and `gradle_build/export_format` to AAB. Back up the upload keystore; losing it blocks updates.
- 4.7 removed built-in OBB (APK expansion) support. Ship large content in the AAB with Play Asset Delivery, or install the separate Godot OBB plugin that now holds the old logic.

## Gradle build and plugins

- Project > Install Android Build Template creates `res://android/build` (commit it, or regenerate in CI with `--install-android-build-template` next to the export flag). It's required for AAB, v2 Android plugins and store billing. 4.7 removed the experimental label from Use Gradle Build.
- Android plugins (v2) ship as Godot editor plugins that inject AARs and dependencies through `EditorExportPlugin`; enable them in Project Settings > Plugins and then in the preset.
- In-app purchases and ads come from store-specific plugins (Google Play Billing, StoreKit, ad SDK wrappers). They move fast; follow the plugin's own README for the project's Godot version instead of pinning code here.

## iOS

- Export only from macOS with Xcode installed. Godot writes an Xcode project; build, sign and upload from Xcode.
- Required: App Store Team ID (the 10-character code, not the team name) and a bundle identifier (letters, digits, hyphens, periods; reverse DNS). Avoid spaces in the exported project name.
- Device builds need a provisioning profile and signing identity matching the bundle ID; set them in the preset or in Xcode.
- The simulator supports only the Compatibility renderer.

## App lifecycle

```gdscript
func _notification(what: int) -> void:
    match what:
        NOTIFICATION_APPLICATION_PAUSED:      # 2015: backgrounded
            SaveManager.save_now()            # iOS allows about 5 s before killing the app
        NOTIFICATION_APPLICATION_RESUMED:     # 2014
            _refresh_session()
        NOTIFICATION_WM_GO_BACK_REQUEST:      # 1007: Android Back
            _open_pause_menu()
```

`NOTIFICATION_WM_CLOSE_REQUEST` is desktop-only, so mobile games must save on pause. Focus in and out (2016, 2017) also fire on mobile. Android picture-in-picture (4.7+): `DisplayServer.pip_mode_enter()` and the `NOTIFICATION_APPLICATION_PIP_MODE_ENTERED/EXITED` notifications; hide non-essential UI there.

## Permissions

Enable each permission in the preset (`permissions/internet`, `permissions/vibrate`, `permissions/post_notifications`, ...) and request dangerous ones at runtime:

```gdscript
func _ready() -> void:
    get_tree().on_request_permissions_result.connect(_on_permission)
    if not OS.request_permission("android.permission.POST_NOTIFICATIONS"):
        pass                                   # result arrives in the signal

func _on_permission(permission: String, granted: bool) -> void:
    print(permission, " granted: ", granted)
```

`OS.request_permission()` returns true when already granted; the permission must also be ticked in the preset or the request silently fails. Networked games need `permissions/internet`.

## Calling Android APIs

- Cross-platform first: `Input.vibrate_handheld(ms)` (needs the vibrate permission), `OS.shell_open(url)`, `DisplayServer.file_dialog_show()` (native picker on Android).
- 4.4+: `JavaClassWrapper.wrap("java.class.Name")` calls Java and Kotlin classes from GDScript with no plugin; the `AndroidRuntime` singleton (`Engine.get_singleton("AndroidRuntime")`) exposes `getActivity()`, `getApplicationContext()` and `createRunnableFromGodotCallable()`.
- 4.7+: `JavaClassWrapper.create_proxy(object, interfaces)` implements Java interfaces with a Godot object, and `create_sam_callback(interface, callable)` wraps a Callable for a single-method interface. Both return null off Android, so guard with `OS.get_name() == "Android"`.

```gdscript
func show_build_time() -> void:
    if OS.get_name() != "Android":
        return
    var LocalDateTime = JavaClassWrapper.wrap("java.time.LocalDateTime")
    print(LocalDateTime.now().toString())
```

## Safe area and device features

- `DisplayServer.get_display_safe_area()` (Rect2i) gives the area clear of notches and rounded corners; inset HUD containers by it. `get_display_cutouts()` lists cutouts on Android.
- Orientation: `display/window/handheld/orientation` in Project Settings; 4.7+ `DisplayServer.orientation_changed` signals changes.
- Motion sensors: `Input.get_accelerometer()`, `get_gravity()`, `get_gyroscope()`, `get_magnetometer()` (enable the sensors in Project Settings > Input Devices > Sensors).
- 4.7+: the built-in `VirtualJoystick` Control replaces hand-rolled touch sticks.

## C# on mobile

Android and iOS C# exports exist since 4.2 and are still marked experimental; iOS C# exports only from macOS, and the official iOS simulator templates are x64 only. Required .NET versions change between releases; check the C# "platform support" section of the docs for the project's version, and test the C# mobile export early. C# can't export to Web.

On Godot 4.7, Android C# exports need .NET 9 (other platforms .NET 8+); see `godot-csharp` for the project setup.

## Checklist

- [ ] Mobile or Compatibility renderer; ETC2/ASTC import on.
- [ ] Android: SDK and JDK paths set; package name, version code bumped; release keystore set (env vars in CI); Export With Debug off; Gradle build and AAB for Play.
- [ ] iOS: exported on macOS; Team ID and bundle ID set; provisioning matches.
- [ ] Save on `NOTIFICATION_APPLICATION_PAUSED` within the iOS budget.
- [ ] Permissions ticked in the preset and requested at runtime.
- [ ] HUD inside the safe area.
- [ ] No OBB dependence on 4.7+.
