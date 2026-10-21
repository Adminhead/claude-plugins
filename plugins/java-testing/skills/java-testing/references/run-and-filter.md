# Running and filtering Java tests

Contents: Maven, Gradle, why no tests are found, tags, Failsafe.

## Maven (Surefire)

```sh
./mvnw test -Dtest=OrderServiceTest                      # one class
./mvnw test -Dtest='OrderServiceTest#cancelsOrder'       # one method
./mvnw test -Dtest='OrderServiceTest#cancels*+rejects*'  # several methods
./mvnw test -Dtest='com.acme.order.*Test'                # package pattern
./mvnw -pl order-service -am test -Dtest=OrderServiceTest -Dsurefire.failIfNoSpecifiedTests=false
```

- In a multi-module build, `-Dtest` fails every module that has no match ("No tests matching pattern"). Add `-Dsurefire.failIfNoSpecifiedTests=false`, or pick the module with `-pl <module> -am`.
- `@ParameterizedTest` rows can't be selected with `#method[1]`; run the method and read the output.
- Surefire's default includes are `**/Test*.java`, `**/*Test.java`, `**/*Tests.java` and `**/*TestCase.java`. A class named `OrderServiceSpec` or `OrderServiceCheck` is skipped unless `<includes>` says otherwise.

## Gradle

```sh
./gradlew test --tests OrderServiceTest
./gradlew test --tests 'com.acme.order.OrderServiceTest.cancelsOrder'
./gradlew :order-service:test --tests '*OrderService*' --rerun   # --rerun ignores up-to-date; older Gradle: cleanTest
./gradlew test --info                                            # shows engines, skipped and filtered tests
```

- `--tests` applies to one task. In a multi-project build name the project (`:order-service:test`), or the filter errors in projects without the class.
- `--tests` takes class or method names with `*` wildcards, not Maven's `#`.

## "No tests found" checklist

Work down the list; stop at the first match.

1. Gradle and `useJUnitPlatform()`: without `tasks.test { useJUnitPlatform() }` Gradle runs the JUnit 4 runner and Jupiter tests are invisible. Gradle reports "No tests found for given includes" for a `--tests` filter that matches nothing it could run.
2. Wrong task or project: the class lives in another module, or in `integrationTest`, `src/it` or another source set, so `test` never sees it.
3. Wrong annotation package: `org.junit.Test` in a Jupiter-only build, or `org.junit.jupiter.api.Test` with only the JUnit 4 runner. Check the imports and the engines on the classpath (`junit-jupiter-engine` for Jupiter, `junit-vintage-engine` for JUnit 4 tests under JUnit 5/6).
4. Maven Surefire older than 2.22 doesn't support the JUnit Platform; pin a current `maven-surefire-plugin` in `pluginManagement`.
5. Class name or modifiers: not matching the include pattern, abstract, or a nested class that isn't `static` and isn't annotated `@Nested`. A private or non-void test method is ignored.
6. Test is excluded: `@Disabled`, a `<groups>`/`<excludedGroups>` or `excludeTags` setting, or an `@EnabledIf...` condition. Look for skipped counts in the output.
7. Stale build output: rebuild with `./mvnw clean test` or `./gradlew cleanTest test`.
8. Typo in the filter itself. List the real names first: `find . -name 'OrderServiceTest*.java'`.

Then confirm the count: the summary must show `Tests run:` above zero (Maven) or the test appear under `--info` (Gradle).

## Tags

```sh
./mvnw test -Dgroups=fast -DexcludedGroups=slow           # Surefire, JUnit tags
./gradlew test -PincludeTags=fast                         # needs includeTags wired in build.gradle(.kts)
```

In Gradle: `tasks.test { useJUnitPlatform { includeTags("fast"); excludeTags("integration") } }`.

## Failsafe

- Failsafe runs `**/IT*.java`, `**/*IT.java` and `**/*ITCase.java` at `integration-test`; the build fails at `verify`. `mvn test` never runs them, so "my IT passes locally but CI is green without it" usually means `mvn test` was run.
- Run one: `./mvnw verify -Dit.test=OrderRepositoryIT -Dfailsafe.failIfNoSpecifiedTests=false`.
- Both plugins need `<goal>integration-test</goal>` and `<goal>verify</goal>` bound; without the `verify` goal failures are swallowed.
