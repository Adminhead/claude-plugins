---
name: android-testing
description: 'Writes and fixes Android tests where the test setup already exists. Use for "No compose hierarchies found", "Method d in android.util.Log not mocked", a Compose UI test that sleeps or flakes, onNodeWithText not finding a node, Hilt test rules, Robolectric versus instrumented tests, and connectedDebugAndroidTest failures. Covers createComposeRule, waitUntil, idling, useUnmergedTree, Gradle Managed Devices and Orchestrator.'
---

# Android testing

Write and fix tests that need Android, in a project whose test setup exists. Read `app/build.gradle(.kts)` and any existing tests first: JUnit 4 versus Jupiter, Truth or AssertJ, Robolectric present or not, the `testInstrumentationRunner`, and whether Hilt is in use. Match what is there.

Not for:
- choosing a test strategy, installing test libraries, building harnesses or setting up screenshot tooling (`android-skills:testing-setup`);
- tests that run on the plain JVM with no Android runtime, including ViewModel tests with fakes, `runTest` and Turbine (`kotlin-testing`);
- general strategy and what to test (`unit-testing`);
- crash logs and device state (`android-device`);
- browser end-to-end tests (`e2e-testing`);
- Compose authoring (`jetpack-compose`).

## Rules that outrank any default

- Assert behavior, state and side effects: a callback fired, a node enabled or absent, a row saved, a navigation target. Do not assert copy, labels, layout, colors or element order.
- No coverage quotas and no coverage tooling unless the user asks. Do not add JaCoCo.
- Screenshot tests only where the project already has them, or the user asks. Extend the existing tool and baselines; never introduce one.
- A flaky test is fixed by waiting for a condition (see below), never by `Thread.sleep`, retries or a longer timeout alone.

## Pick the runtime

| The test needs | Run as |
| --- | --- |
| Pure logic, no `android.*` | local JVM test in `src/test` (see `kotlin-testing`) |
| `Context`, resources, `Looper`, `Log`, SharedPreferences, a Room in-memory database, a Compose UI test, no hardware | Robolectric in `src/test` |
| Real device behavior: permissions dialogs, WebView, camera, real rendering, OEM quirks, Espresso against the real activity | instrumented test in `src/androidTest` |

Prefer the cheapest runtime that shows the behavior. Moving a test from instrumented to Robolectric is a speed win; moving a test with device-specific behavior the other way is a correctness fix.

## "Method ... not mocked"

`RuntimeException: Method d in android.util.Log not mocked` means a local test touched the stub `android.jar`. Fix in this order:
1. Take the Android call out of the class under test (inject a logger, pass in the value) so the test stays on the JVM.
2. Run the test under Robolectric when the class truly needs the framework.
3. `testOptions { unitTests.isReturnDefaultValues = true }` only as a last resort: every Android call then returns null, 0 or false and can hide real bugs.

Details and a Robolectric setup: [references/robolectric.md](references/robolectric.md).

## Compose UI tests

- Drive the plain, state-driven composable with `setContent` and assert a semantic result or a callback; avoid the full app graph.
- Wait with `waitForIdle`, `runOnIdle` or a bounded `waitUntil { ... }` on a real condition. Never sleep.
- `onNodeWithText` merges semantics; add `useUnmergedTree = true` to reach a child inside a merged button or card.
- "No compose hierarchies found" almost always means no content was set, or the activity is not the one hosting it.

Patterns, interaction state, idling and diagnosis: [references/compose-ui.md](references/compose-ui.md).

## Hilt

`@HiltAndroidTest`, `HiltAndroidRule` ordered first, a custom runner that returns `HiltTestApplication`, `@TestInstallIn` to replace modules. Setup, Robolectric variant and the Compose activity: [references/hilt.md](references/hilt.md).

## Espresso and interop

Espresso is for View-based screens; `onView(withId(...)).perform(click()).check(matches(isEnabled()))`. In a mixed screen use `createAndroidComposeRule` and Espresso in the same test; Compose and Espresso synchronize with each other. Match views by id or content description, not by displayed text.

## Run one test

```
./gradlew :app:testDebugUnitTest --tests 'com.example.FooTest.bar'
./gradlew :app:connectedDebugAndroidTest -Pandroid.testInstrumentationRunnerArguments.class=com.example.FooTest#bar
```

Always name the module and variant. `connected*` runs on every attached device; set `ANDROID_SERIAL` to pick one. Gradle Managed Devices, Orchestrator, sharding and "No tests found": [references/running.md](references/running.md).

## Test data and reports

- Use disposable app data and test accounts. Never point a test at a production backend, make a real purchase or send a real message; use a fake server, a debug flavor or a sandbox.
- Do not run `pm clear`, `adb uninstall` or wipe an emulator without asking.
- Redact tokens, emails, phone numbers and keys from logs and screenshots you quote in a report.
- Report what was run (task, device or Robolectric, API level) and what was not run.
