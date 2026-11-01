# Baseline Profiles

Verified 2026-11-01: `androidx.baselineprofile` Gradle plugin 1.5.0 stable (1.6.0-alpha01 exists), `androidx.profileinstaller:profileinstaller` 1.4.1. The plugin version matches the Benchmark release. Recheck the DSL at developer.android.com/topic/performance/baselineprofiles/overview.

## What it is

A text list of classes and methods in `baseline-prof.txt`, compiled into the APK or AAB as `assets/dexopt/baseline.prof`. At install the runtime ahead-of-time compiles those paths, so first launch skips interpretation and JIT warmup. Play delivers it with the bundle; for sideloaded builds `profileinstaller` installs it at first run.

## Wiring

Producer module (generator), plugin `com.android.test` and `androidx.baselineprofile`:

```kotlin
plugins {
    id("com.android.test")
    id("androidx.baselineprofile")
}
android { targetProjectPath = ":app" }
baselineProfile { useConnectedDevices = true }   // or managed devices
dependencies { implementation(libs.androidx.benchmark.macro.junit4) }
```

Consumer (the app, or a library module for library profiles):

```kotlin
plugins { id("androidx.baselineprofile") }
dependencies {
    implementation(libs.androidx.profileinstaller)
    baselineProfile(project(":baselineprofile"))
}
```

The plugin adds `nonMinified` and `benchmark` variants for generation. Let it create them rather than hand-declaring build types; add `baselineProfile { saveInSrc = true }` in the consumer to write the result into `src/<variant>/generated/baselineProfiles/` for committing.

## Generator

```kotlin
@RunWith(AndroidJUnit4::class)
class BaselineProfileGenerator {
    @get:Rule val rule = BaselineProfileRule()

    @Test fun generate() = rule.collect(
        packageName = "com.example.app",
        includeInStartupProfile = true,
    ) {
        pressHome()
        startActivityAndWait()
        // the first journey users take, e.g. open the feed and scroll once
    }
}
```

- Wait for the real content, not just the first frame, or the profile misses the code that renders it.
- Cover startup and one or two core journeys. Add a second `collect` for another journey rather than one long script.
- `includeInStartupProfile = true` also feeds the startup profile used for DEX layout optimisation in R8.

## Generate

`./gradlew :app:generateBaselineProfile` (or `generateReleaseBaselineProfile` for one variant). A physical device or a Gradle managed device on API 28 or higher is needed. Re-generate when startup code changes materially; regenerating in the release job keeps it fresh, committing it keeps builds reproducible. Pick one and say which.

## Verify it is installed and used

1. In the artifact: `unzip -l app-release.apk | grep dexopt` shows `assets/dexopt/baseline.prof` and `baseline.profm`. For an AAB, look under the base module's `assets/dexopt/`.
2. On the device after install: `adb shell dumpsys package dexopt | grep -A3 com.example.app` should show a compiler filter of `speed-profile`; `verify` or `run-from-apk` means the profile was not applied. On sideloaded installs, give ProfileInstaller a moment, or run `adb shell cmd package compile -f -m speed-profile com.example.app` to force it.
3. By measurement: the `Partial` benchmark beats the `None` benchmark on cold start. Report both medians and the spread. A profile that shows no difference is not helping; check the generator covered the path.

## Common faults

- Generated from a debuggable or debug build: nothing useful gets recorded. Use the plugin's variants.
- Package name mismatch between the generator, the benchmark and a `.debug` applicationId suffix.
- Profile missing from the release artifact because the consumer plugin or the `baselineProfile(project(...))` line was not applied to that variant.
- Library code not covered: libraries ship their own profile only if their module applies the plugin as a consumer.
