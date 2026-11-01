# Macrobenchmark

Verified 2026-11-01 against Google Maven: AndroidX Benchmark 1.5.0 is the latest stable `benchmark-macro-junit4` and `androidx.baselineprofile` plugin. Recheck the APIs below against developer.android.com/topic/performance/benchmarking/macrobenchmark-overview when the version moves.

## Module setup

A separate module, plugin `com.android.test`:

- `targetProjectPath = ":app"`.
- A build type `benchmark` that `initWith(getByName("release"))`, sets `signingConfig` to the debug config, and `matchingFallbacks += listOf("release")`, so the module resolves the app's release-like variant. It must not be debuggable.
- `experimentalProperties["android.experimental.self-instrumenting"] = true`, and `testBuildType = "benchmark"`, where the AGP version in use still requires them. AGP's own template (Studio: New Module, Benchmarks, Macrobenchmark) is the reference for the current form; run it in a scratch project when unsure.
- Dependencies: `androidx.benchmark:benchmark-macro-junit4` and UiAutomator, plus `androidx.test.ext:junit`.
- In the app, a `benchmark` build type with the same fallbacks, and `<profileable android:shell="true" />` inside `<application>` so the profiler can attach to a non-debuggable build.

## A startup rule

```kotlin
@RunWith(AndroidJUnit4::class)
class StartupBenchmark {
    @get:Rule val rule = MacrobenchmarkRule()

    @Test fun coldNoProfile() = startup(CompilationMode.None())
    @Test fun coldWithProfile() = startup(CompilationMode.Partial())

    private fun startup(mode: CompilationMode) = rule.measureRepeated(
        packageName = "com.example.app",
        metrics = listOf(StartupTimingMetric()),
        compilationMode = mode,
        startupMode = StartupMode.COLD,
        iterations = 10,
        setupBlock = { pressHome() },
    ) {
        startActivityAndWait()
    }
}
```

`startActivityAndWait()` returns at the first frame, which is time to initial display. When the app calls `reportFullyDrawn`, the result also has a time-to-full-display metric, so wait for the content in the block (`device.wait(Until.hasObject(By.res("feed")), 10_000)`) before ending it.

## A scrolling rule

Use `FrameTimingMetric()`, `StartupMode.WARM` or no startup mode, a `setupBlock` that starts the activity, and a block that finds the scrollable, sets `setGestureMargin(device.displayWidth / 5)`, and calls `fling(Direction.DOWN)` a few times. Read `frameDurationCpuMs` and `frameOverrunMs` percentiles (P50, P90, P95, P99); the tail is what users see as jank.

## Compilation modes

| Mode | Meaning | Use |
| --- | --- | --- |
| `None()` | No ahead-of-time compilation | worst case, no profile |
| `Partial()` | Applies the shipped baseline profile | what a profile user gets |
| `Full()` | Everything ahead-of-time compiled | upper bound |
| `Ignore()` | Leaves the app as installed | when the install path is the subject |

`DEFAULT` behaves as `Partial` with the profile if one exists. Compare modes explicitly instead of relying on it.

## Running

- `./gradlew :macrobenchmark:connectedBenchmarkAndroidTest`, where the task name follows the `benchmark` build type. Filter with `-Pandroid.testInstrumentationRunnerArguments.class=com.example.StartupBenchmark`.
- With more than one device attached, prefix the command with `ANDROID_SERIAL=<serial>` so the run uses one device.
- Plug in the device, keep the screen unlocked and battery above the threshold, and run on the charger. Close other apps.
- Results land in the module's `build/outputs/connected_android_test_additional_output/`, as `*-benchmarkData.json` with per-metric `minimum`, `maximum`, `median` and `runs`, next to Perfetto traces for each iteration. Open a trace through `android-skills:android-profiler`.

## Comparing two runs

1. Same device, build type, mode and iterations; only the change under test differs. Keep the two JSON files.
2. Per metric, compare the median and also check that the ranges (minimum to maximum) overlap little before calling a regression.
3. Report as: metric, mode, median before, median after, spread before and after, device, build type. Say "not enough evidence" when the shift is inside the spread; add iterations or reduce setup noise instead of arguing from one run.
4. In CI, store the JSON as an artifact, compare to the last known-good run on the same device model, and fail only above a threshold you have written down. Rerun once on failure.

## Errors the library raises

`DEBUGGABLE`, `EMULATOR`, `LOW-BATTERY` and similar names mean the setup is invalid for timing. Fix the cause. Suppressing them is acceptable only to check that the harness runs, and the output then carries no performance claim.
