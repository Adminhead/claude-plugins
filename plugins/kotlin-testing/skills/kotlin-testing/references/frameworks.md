# Test frameworks and running them

## Which runner is active

| Signal | Stack |
| --- | --- |
| `import org.junit.Test`, `@RunWith`, `@Rule`, `junit:junit` | JUnit 4 |
| `org.junit.jupiter.api.*`, `useJUnitPlatform()` | JUnit Jupiter |
| `import kotlin.test.*`, `kotlin("test")` | kotlin.test on top of the above |
| `: FunSpec({`, `StringSpec`, `BehaviorSpec`, `kotest-runner-junit5` | Kotest |

Rules that cause silent non-runs:
- A JUnit 4 `@Test` in a Jupiter-only module, or the reverse, is never run. Check the annotation import against the dependency.
- Gradle's `test` task runs JUnit 4 unless `tasks.test { useJUnitPlatform() }` (JVM module) or `testOptions.unitTests.all { it.useJUnitPlatform() }` (Android). Kotest and Jupiter need it. "No tests found for given includes" with a correct filter usually means this.
- JUnit 4 and Jupiter in one module needs the Vintage engine; prefer converting new tests to the module's main runner.
- `kotlin("test")` picks its JUnit variant from the build: with `useJUnitPlatform()` it resolves to the Jupiter adapter, otherwise JUnit 4. Don't add `kotlin-test-junit` and `kotlin-test-junit5` together.

## kotlin.test

`@Test`, `@BeforeTest`, `@AfterTest`, `assertEquals(expected, actual)`, `assertTrue`, `assertNull`, `assertContentEquals`, `assertFailsWith<T> { }` (returns the exception), `assertIs<T>(x)` (smart-casts). Backticked names with spaces are fine in JVM unit tests.

## Kotest

Choose the style the project's other specs use; for a new spec in a project with none, `FunSpec` reads like JUnit.

```kotlin
class PriceTest : FunSpec({
    val calc = PriceCalculator(clock = Clock.fixed(...))

    test("weekend discount applies") {
        calc.total(10.toBigDecimal(), 1) shouldBe 9.5.toBigDecimal()
    }

    context("tiers") {
        withData(10 to "0.95", 100 to "0.85") { (qty, rate) -> /* ... */ }
    }
})
```

- Matchers: `shouldBe`, `shouldNotBe`, `shouldBeNull`, `shouldThrow<T> { }`, `shouldContainExactly`, and `assertSoftly { }` to report all failures of one result.
- Test bodies are `suspend`, so a plain call to a suspend function works. For virtual time, enable Kotest's coroutine test scope in the spec or project config (check the option name for your Kotest version) or call `runTest { }` inside the test.
- Waiting for async work: `eventually(5.seconds) { ... }`, never `Thread.sleep`.
- Set up and tear down with `beforeTest`/`afterTest`, `beforeSpec`/`afterSpec`; isolation defaults to one spec instance for all tests, so don't keep state in spec-level vars unless it's reset.
- Property tests (`checkAll`, `forAll` with `Arb`) fit pure functions with a clear invariant (round-trip, ordering). Keep the iteration count and a fixed seed in the failure output for reproduction.

## Running one test

```bash
./gradlew :module:test --tests 'com.acme.OrderServiceTest'             # class
./gradlew :module:test --tests 'com.acme.OrderServiceTest.rejects*'    # method pattern
./gradlew :app:testDebugUnitTest --tests 'com.acme.OrderViewModelTest' # Android unit tests
./gradlew :shared:jvmTest --tests 'com.acme.ParserTest'                # Multiplatform JVM target
./gradlew :module:test --rerun -i                                      # force rerun, show output
```

Quote the filter. A backticked name containing spaces is matched with `*` in place of each space. Reports are in `module/build/reports/tests/test/index.html` (`testDebugUnitTest` for Android). Kotest specs filter by the spec's class name with `--tests`; for one test inside a spec use Kotest's own test-path filter (`-Dkotest.filter.tests=...`) or run the spec.
