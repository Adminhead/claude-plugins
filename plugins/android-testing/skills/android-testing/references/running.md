# Running tests

## One test or a subset

```
# local / Robolectric
./gradlew :app:testDebugUnitTest --tests 'com.example.FooTest'
./gradlew :app:testDebugUnitTest --tests 'com.example.FooTest.bar'

# instrumented
./gradlew :app:connectedDebugAndroidTest \
  -Pandroid.testInstrumentationRunnerArguments.class=com.example.FooTest#bar
```

- `class=` accepts a comma-separated list of classes or `Class#method`. Related arguments: `package=`, `notClass=`, `annotation=`, `notAnnotation=`, and `numShards=` with `shardIndex=`.
- Always name module and variant. A task without the module runs everywhere; a flavored app has `connectedFreeDebugAndroidTest`, not `connectedDebugAndroidTest`.
- `--tests` on a connected task is not supported; use the instrumentation argument.
- "No tests found for given includes": the filter names the wrong class or package, the variant has no test source set, or the class is a JUnit 4 test with a Jupiter runner configured (or the reverse). Print `./gradlew :app:tasks --all | grep -i test` to see the real tasks.
- `connected*` installs and runs on every attached device. Set `ANDROID_SERIAL=<serial>` (from `adb devices -l`) to use one. With no device attached the task fails; do not start or wipe an emulator without asking.

## Gradle Managed Devices

A reproducible emulator Gradle creates, boots and discards itself, good for CI.

```kotlin
android {
    testOptions {
        managedDevices {
            localDevices {
                create("pixel6api34") {
                    device = "Pixel 6"
                    apiLevel = 34
                    systemImageSource = "aosp-atd"   // "aosp" or "google" when the test needs them
                }
            }
        }
    }
}
```

Run `./gradlew :app:pixel6api34DebugAndroidTest`. The first run downloads a system image (large); say so before running it on a user's machine. Device groups (`groups { create("phones") { targetDevices.add(devices["pixel6api34"]) } }`) give one task per group. The ATD images are headless and faster, with no Play Store and no real graphics.

## Orchestrator

Runs each instrumented test in its own process and can clear app data between tests, which isolates state:

```kotlin
android {
    defaultConfig {
        testInstrumentationRunnerArguments["clearPackageData"] = "true"
    }
    testOptions { execution = "ANDROIDX_TEST_ORCHESTRATOR" }
}
dependencies {
    androidTestUtil("androidx.test:orchestrator:<version>")
}
```

Verified 2026-11-01: Espresso 3.7.0 is the latest release; use the version the project pins. Orchestrator makes the suite slower; use it to isolate state or contain crashes, not by default. `clearPackageData` clears the test app's data on the test device only.

## Flaky instrumented tests

Find the cause, in this order: shared state between tests (clear it in setup, or use Orchestrator); a real wait missing (`waitUntil` or an idling resource, never a sleep); animations on the device (disable window, transition and animator scale for the test device); a test depending on the clock, locale or network (inject fakes); a test ordering assumption. Re-run the single test several times to confirm the fix, and say how many runs.
