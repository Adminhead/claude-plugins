---
name: java-testing
description: Writes, runs and fixes Java tests with JUnit Jupiter 5/6, Mockito, AssertJ and Testcontainers. Use for *Test.java files, parameterized or @Nested tests, UnnecessaryStubbingException, "No tests found for given includes", filtering with -Dtest or --tests, Surefire versus Failsafe, flaky tests that sleep or depend on the clock, a slow suite that starts a container per class, and Mockito agent warnings on Java 21+.
---

# Java testing

Test behavior through the public API with the framework the project already uses. Read the build file first: JUnit 4 vs Jupiter, AssertJ vs Hamcrest, Mockito version, and the Java release.

Not for: general test strategy and what to test (`unit-testing`); anything that needs a Spring context, such as `@WebMvcTest`, `@DataJpaTest`, `@SpringBootTest`, `@MockitoBean` (`spring-boot-testing`); build wiring (`maven`, `gradle`); production code design (`java`).

Verified on 2026-10-20: JUnit 6 requires Java 17 at runtime (code compiled for older releases can still be tested), and Platform, Jupiter and Vintage share one version (6.1.3); Vintage, the JUnit 3/4 engine, is deprecated. Mockito 5 uses the inline mock maker by default. On Java 21+ Mockito self-attaching prints a JVM warning and may fail later; configure `-javaagent` (see [references/mockito.md](references/mockito.md)).

## Orient

- Jupiter (`org.junit.jupiter.api`) and JUnit 4 (`org.junit.Test`) do not mix: a Jupiter `@Test` in a JUnit 4 setup is silently never run. Use the Jupiter imports in new tests unless the whole module is on JUnit 4.
- With JUnit 5 on the classpath, keep `junit-jupiter-api`, `-params` and `-engine` on one version (use the `junit-bom`). JUnit 6 versions the Platform, Jupiter and Vintage together.
- Match the project's assertion library. Default to AssertJ when none is present and it is on the classpath; plain `Assertions` otherwise.
- Find the narrowest command before editing ([references/run-and-filter.md](references/run-and-filter.md)).

## Structure

- Name the class `<Subject>Test`, one behavior per method, Arrange-Act-Assert. Name methods for behavior (`rejectsExpiredToken`), not for the method under test. Use `@DisplayName` only when the project does.
- Keep tests independent and order-free. Use `@BeforeEach` for per-test setup; `@BeforeAll` must be static unless the class is `@TestInstance(PER_CLASS)`.
- Use `@Nested` to group cases by state or scenario, `@Tag("integration")` to select a lane in the build, and `@Disabled("reason")` with a reason and a ticket.
- Use `assertThrows` (or AssertJ `assertThatThrownBy`) and check the type and a stable part of the message or cause. Use `assertAll` or AssertJ `SoftAssertions` when one result has several properties; a test that asserts a dozen unrelated things is several tests.
- Compare values with `usingRecursiveComparison()` rather than adding `equals` to production code for the test's sake.

## Parameterized tests

Collapse copy-pasted cases with `@ParameterizedTest`, not loops inside a test.

| Source | Use for |
| --- | --- |
| `@ValueSource`, `@NullAndEmptySource` | one literal argument, plus null and empty |
| `@CsvSource`, `@CsvFileSource` | input and expected-output rows |
| `@EnumSource` | every (or a filtered) enum constant |
| `@MethodSource("name")` | objects, `Arguments.of(...)`, shared providers (static unless `PER_CLASS`) |

Set `name = "{0} -> {1}"` so a failing row is identifiable. Put boundary values in the rows: empty, null, zero, max, off-by-one.

## Mocks and seams

- Mock only boundaries you own and cannot run in-process: HTTP clients, repositories, message producers. Use the real object for value types, pure collaborators and anything cheap. Use a hand-written fake when the interaction is stateful (an in-memory repository).
- Prefer `@ExtendWith(MockitoExtension.class)` with `@Mock`; its strict stubs fail a test on an unused stub (`UnnecessaryStubbingException`). Delete the stub or fix the code path; do not reach for `lenient()` unless a shared `@BeforeEach` stub is truly used by only some tests.
- Verify outcomes first (return value, state); use `verify` only for side effects that are the behavior (an email sent, an event published). Don't `verify` every stubbed call.
- Read [references/mockito.md](references/mockito.md) for argument captors, static and constructor mocking, spies, and the Java 21+ agent setup.
- Inject time: take a `java.time.Clock` (or `Supplier<Instant>`) instead of calling `LocalDate.now()` or `Instant.now()`; tests use `Clock.fixed(...)`. Inject randomness and ID generators the same way.
- Never `Thread.sleep` to wait for async work. Wait on the thing itself: `CompletableFuture.get(timeout)`, a `CountDownLatch`, or Awaitility (`await().atMost(Duration.ofSeconds(5)).untilAsserted(...)`). Pass an executor in so tests can run work synchronously.
- Use `@TempDir` for files and `@Timeout` on tests that could hang.

## Integration tests

- Name them `*IT` and run them with Failsafe (`mvn verify`), or in a separate Gradle test task, so `mvn test` stays fast.
- Use Testcontainers for real databases and brokers, not H2 in a compatibility mode. Start a container once per JVM (a static singleton or `@Testcontainers` with a static `@Container`), not per test class; read [references/testcontainers.md](references/testcontainers.md) for reuse and wait strategies.
- Spring apps: use `@ServiceConnection` from `spring-boot-testing`.

## Coverage

Use JaCoCo to find untested branches in code you changed, not to hit a number. Don't add a percentage gate or write assertion-free tests to raise it. See [references/coverage.md](references/coverage.md).

## Validate

1. Run the one new or changed test by name and watch it fail for the right reason before it passes (break the code or the expected value once).
2. Run the whole class, then the module. In a multi-module build use `-pl <module> -am`.
3. Confirm the test actually ran: look for "Tests run: N" with N above zero, not "No tests found".
4. Run it three times for anything with threads, time or a container; an intermittent failure is a defect to fix, not a retry to add.

## References

- [references/run-and-filter.md](references/run-and-filter.md) when running one test, filtering by tag, or when the build reports no tests found.
- [references/mockito.md](references/mockito.md) when stubbing gets complicated, on a Mockito warning, or when mocking statics, constructors or finals.
- [references/testcontainers.md](references/testcontainers.md) when a suite starts containers or is slow.
- [references/coverage.md](references/coverage.md) when configuring JaCoCo or asked about coverage targets.

Adapted in part from github/awesome-copilot `java-junit` and decebals/claude-code-java `test-quality` (both MIT; see LICENSE and NOTICE).
