# Robolectric

Robolectric runs Android framework code on the local JVM, so tests live in `src/test` and run with `testDebugUnitTest`. Verified 2026-11-01: Robolectric 4.17 is the latest release. Use the version the project already pins.

## Setup

```kotlin
// app/build.gradle.kts
android {
    testOptions {
        unitTests {
            isIncludeAndroidResources = true   // needed for resources, themes and Compose
        }
    }
}
dependencies {
    testImplementation("org.robolectric:robolectric:<project version>")
    testImplementation("androidx.test.ext:junit:<version in the project>")
}
```

```kotlin
@RunWith(AndroidJUnit4::class)
@Config(sdk = [34])
class PrefsStoreTest {
    private val context = ApplicationProvider.getApplicationContext<Context>()
    ...
}
```

- Use `androidx.test.ext.junit.runners.AndroidJUnit4`; it runs on Robolectric in `src/test` and on a device in `src/androidTest`, so shared test code works in both.
- `@Config(sdk = [..])` must name an SDK this Robolectric version supports. "Package targetSdkVersion=N > maxSdkVersion" means pin a supported `sdk` or upgrade Robolectric. Set defaults in `src/test/resources/robolectric.properties` (`sdk=34`).
- Robolectric downloads `android-all` jars on first use. On a CI machine without network, pre-fetch them or configure an offline mirror; do not skip the tests.
- Compose UI tests work under Robolectric with the same rule as on a device (see [compose-ui.md](compose-ui.md)).

## Looper and threads

The main looper is in PAUSED mode by default: posted tasks run when you idle it.
- `shadowOf(Looper.getMainLooper()).idle()` runs queued main-thread work.
- For coroutines, inject test dispatchers rather than relying on the looper.
- Prefer real framework behavior over shadows. Reaching for a custom `@Implementation` shadow usually means the code under test should be split.

## When Robolectric is the wrong tool

- Real rendering, GPU, camera, Bluetooth, WebView content, notification appearance, OEM behavior, or system dialogs: use an instrumented test.
- Robolectric fidelity gaps are real; a test that passes there but fails on a device means the device is right.
- Tests that need only plain Kotlin should not pay Robolectric's startup cost: take the Android call out of the class, or see `kotlin-testing`.

## Common failures

| Message | Fix |
| --- | --- |
| `Method ... not mocked` | the test is not under Robolectric; add the runner, or remove the Android call from the class under test |
| `Resources$NotFoundException` | `isIncludeAndroidResources = true` is missing |
| `No such manifest file` or theme errors | same setting, or a stale build; run `clean` for the module once |
| `ClassNotFoundException` for an Android class after JDK change | Robolectric needs the JDK the project builds with; do not run the IDE on another JDK |
| Test passes alone, fails in the suite | shared singleton or static state; reset it in `@After`; do not add ordering |
