---
name: android-performance
description: 'Sets up and reads Android Macrobenchmark and Baseline Profile work and app size reduction, including the benchmark module, StartupTimingMetric and FrameTimingMetric, CompilationMode, the androidx.baselineprofile plugin and BaselineProfileRule, reportFullyDrawn for time to full display, comparing two benchmark runs, and APK or AAB size with APK Analyzer. Use for requests such as "add a baseline profile for startup", "cold start regressed between two CI runs", "write a startup benchmark", "is the profile actually installed", or "why is the release APK so big" in a Gradle Android project.'
---

# Android performance

Measure on a build that matches what ships, change one thing, measure again, and report what was and was not measured.

Not for: Perfetto and system traces, heap and memory, startup trace analysis (`android-skills:android-profiler`), ANRs (`android-skills:anr-audit-and-fix`), Compose recomposition and stability (`android-skills:jetpack-compose-performance`), R8 keep rules and code shrinking (`android-skills:r8-analyzer`), and unit or UI test setup (`android-testing`).

## Orient

1. Find the modules: an `com.android.test` module with `androidx.benchmark.macro` (Macrobenchmark), one applying `androidx.baselineprofile` (the profile producer), and the app module that consumes the profile. Read `gradle/libs.versions.toml` for the AndroidX Benchmark version; the baselineprofile plugin and `benchmark-macro-junit4` are released together.
2. Find the build types. Timings need a non-debuggable, release-like type (usually `benchmark`, initialised from `release`, signed with the debug key), not `debug`.
3. Check for a device. `adb devices` must list a physical device; an emulator gives numbers that say nothing about users. Without one, you can write the code and the Gradle wiring but cannot claim any timing. With several attached, pin one with `ANDROID_SERIAL=<serial>` for every Gradle and adb command, and name the device in the report.
4. Check what already exists before adding: a `baseline-prof.txt` under `app/src/main/`, `generated/baselineProfiles/`, or `profileinstaller` in dependencies.
5. Done when you can name the benchmark module, the build type under test, the device, and whether a profile is already shipped.

## Rules for any timing claim

1. Measure a build that is not debuggable and matches the shipped minification and resource shrinking. A debug build can be several times slower and shows different bottlenecks.
2. Record, with every result: build type, whether R8 ran, compilation mode, device model and API level, iteration count, and the metric names.
3. Run at least 10 iterations per scenario; compare medians and look at the min to max spread. A difference smaller than the spread within one run is noise, not a result.
4. Never turn on `androidx.benchmark.suppressErrors` to get a number. Macrobenchmark refuses debuggable apps, emulators and low battery for a reason; fix the setup instead.
5. End the report with a "Not measured" line: for example warm and hot start, other devices, low-memory conditions, or a run on the CI hardware.

## Macrobenchmark

1. Create the module with the `com.android.test` plugin, `targetProjectPath` set to the app, and a `benchmark` build type that falls back to the app's `release`. Details and a rule skeleton are in `references/macrobenchmark.md`.
2. Pick the metric by question. Startup: `StartupTimingMetric` (time to initial display, plus time to full display once the app calls `reportFullyDrawn`). Scrolling and animation: `FrameTimingMetric`. Use a `StartupMode` of `COLD` for startup claims.
3. Pick the compilation mode on purpose: `None` is the worst case with no profile, `Partial` uses the shipped baseline profile, `Full` is the best case with everything ahead-of-time compiled. A startup claim compares `None` against `Partial`.
4. Drive the app with UiAutomator inside `measureBlock`, with a fixed scenario and `setupBlock` that resets state.
5. Done when the benchmark runs on a device through Gradle and produces a JSON result for each mode.

## Baseline Profiles

1. Apply `androidx.baselineprofile` in the producer module and the app, point the app at the producer with the `baselineProfile` configuration, and write a generator with `BaselineProfileRule.collect`. `references/baseline-profiles.md` has the wiring and the generate command.
2. Cover the startup path and the one or two journeys users take most, not every screen. A profile that lists everything dilutes the benefit.
3. Verify the profile ships: the built APK or AAB contains `assets/dexopt/baseline.prof`, the device compiled it (`speed-profile`), and a `Partial` benchmark beats `None`. Without that comparison the profile is unproven.
4. Done when the generated profile is committed (or generated in the release job) and the verification numbers sit beside the build type and device.

## Time to full display

`reportFullyDrawn()` in the Activity, or `ReportDrawnWhen` in Compose, marks the point where the content users came for is shown. Call it once the data the first screen needs is on screen, not at `onCreate`. Without it the time-to-full-display metric is missing. The macrobenchmark and the profile both improve when this is honest.

## Comparing runs and CI

1. Compare the same device, build type, compilation mode and iteration count; change one variable at a time.
2. Keep the JSON each run writes and compare median and spread per metric. Fail a CI job only on a regression larger than the spread, with a stated percentage threshold, and re-run once before blocking.
3. Pin CI to one device model; mixed fleets produce shifts that are not regressions. `references/macrobenchmark.md` shows where the JSON lands and what to read.

## App size

Measure first, then cut the largest contributor: `references/size.md` covers APK Analyzer and `apkanalyzer`, download size vs install size, resource shrinking, native libraries and ABIs, and the order to attack them. Code shrinking itself goes to `android-skills:r8-analyzer`.
