---
name: kotlin-testing
description: 'Writes, runs and fixes JVM Kotlin tests (kotlin.test, JUnit, Kotest, MockK, coroutines-test, Turbine). Use for UncompletedCoroutinesError or a runTest that hangs, "Module with the Main dispatcher" errors and Dispatchers.setMain in ViewModel tests, MockK "no answer found for", coEvery versus every, Turbine flow assertions, tests slowed by delay, and running one test with ./gradlew :module:test --tests.'
---

# Kotlin testing

Test behavior through the public API with the stack the project already uses. Prefer a hand-written fake over a mock at a seam the code owns (a repository, a clock, a service client); use a mock for a boundary you cannot run in-process or to assert a side effect that is the behavior.

Not for: test strategy and what to test (`unit-testing`); anything that needs the Android runtime, such as Robolectric, resources, `Log`, Compose UI tests or a device (`android-testing`); a Spring context (`spring-boot-testing`); plain Java tests (`java-testing`); production coroutine or Flow design (`kotlin`); build wiring (`gradle`, `android-build`).

Versions verified 2026-11-01 on Maven Central: kotlinx-coroutines-test 1.11.0, Turbine 1.2.1, MockK 1.14.11, Kotest 6.2.6, mockito-kotlin 6.4.0. Keep `kotlinx-coroutines-test` on the same version as `kotlinx-coroutines-core`.

## Boundary with `android-testing`

Decide by the runtime the test needs, not by the class under test. A ViewModel test with fakes, a `MainDispatcherRule` and Turbine runs on the plain JVM and belongs here, even in an Android module. Once the test needs the framework (`Context`, `Log`, resources, `Looper`, Robolectric, an emulator), hand it to `android-testing`.

## Orient

Read the module's build file and a neighboring test before writing anything.

- Runner: JUnit 4 (`org.junit.Test`, `@Rule`), Jupiter (`org.junit.jupiter.api.Test`, `@BeforeEach`), `kotlin.test` (`kotlin.test.Test`, which delegates to whichever of those the build selects), or Kotest (a class extending `FunSpec`, `StringSpec`, `BehaviorSpec`, `DescribeSpec`). Do not mix JUnit 4 and Jupiter annotations in one class: the wrong one is silently never run. See [references/frameworks.md](references/frameworks.md).
- Mocking: MockK, Mockito-Kotlin, or none. Match it. Add no new mocking library.
- Assertions: `kotlin.test`, Kotest matchers, AssertJ, Truth. Match it.
- Coroutines: is `kotlinx-coroutines-test` on the test classpath, and does the code under test take its dispatcher or scope as a parameter?

## Structure

- Name tests for behavior (`` `rejects an expired token` ``). One behavior per test, arrange-act-assert, no order dependence.
- Wrong-argument-order traps: `assertEquals(expected, actual)`; a `shouldBe` reads `actual shouldBe expected`.
- Use `assertFailsWith<T> { ... }` (or Kotest `shouldThrow<T>`) and check the type and a stable part of the message or cause.
- Share setup through constructor injection in the class, a `@BeforeTest`/`@BeforeEach` method, or a rule or extension. Do not share mutable state between tests.
- Keep parameterized cases as data (JUnit `@ParameterizedTest`, Kotest `withData`) instead of a loop in one test, so a failing row is named.

## Coroutines and Flow

Never `Thread.sleep`, and never `runBlocking`, in a test. Use `runTest` and virtual time.

- `runTest { }` runs the body on a `TestScope`, skips `delay`, and fails after 60 seconds of real time with `UncompletedCoroutinesError`. Read [references/coroutines.md](references/coroutines.md) for the dispatcher choice, `advanceTimeBy`/`runCurrent`, `Dispatchers.setMain`, the `MainDispatcherRule` and the causes of that error.
- Inject dispatchers and scopes into the class under test; in the test pass `StandardTestDispatcher(testScheduler)` so all of it shares one virtual clock. A `Dispatchers.IO` or `Dispatchers.Default` hard-coded in production code makes `delay` real again.
- A collector that never finishes goes in `backgroundScope`, not in a plain `launch`.
- Flows: Turbine's `test { }`, or `toList` into a list from `backgroundScope`. Read [references/flow.md](references/flow.md) for `StateFlow` conflation, `SharedFlow` with no replay, `Channel` events and `stateIn`.

## Mocks

- MockK: `every { }` for plain calls, `coEvery { }` for suspend calls, `just Runs` for a `Unit` function, `verify`/`coVerify` for side effects that are the behavior. A relaxed mock hides missing stubs; use `relaxUnitFun = true` or stub the call. Read [references/mockk.md](references/mockk.md) for "no answer found", `confirmVerified`, captors and static mocking.
- Mockito-Kotlin: `mock<T>()`, `whenever(x).thenReturn(y)`, `onBlocking { }` and `verifyBlocking` for suspend functions; strict-stub and agent setup is the same as in `java-testing`.
- Kotlin classes are final by default. MockK and Mockito 5 mock them; for the rest, extract an interface and write a fake.

## Running

```bash
./gradlew :module:test --tests 'com.acme.OrderServiceTest'
./gradlew :module:test --tests '*OrderServiceTest.rejects*'
./gradlew :app:testDebugUnitTest --tests 'com.acme.OrderViewModelTest'
```

Use `:module:test` in a JVM module, `:app:testDebugUnitTest` in an Android module, and `jvmTest` in a Multiplatform JVM target. Quote the filter. Add `--rerun` to force a rerun of an up-to-date task and `-i` to see test output. "No tests found for given includes" means the filter missed (use the fully qualified name or a `*` pattern) or no engine ran (see [references/frameworks.md](references/frameworks.md)).

## Verify

After writing a test, run it, then break the production behavior it covers (flip a condition) and confirm it fails. A coroutine test that passes without ever advancing time or collecting is usually asserting nothing.
