# Testcontainers

Contents: one container per JVM, reuse, waiting, isolation between tests, CI.

## Slow suite: a container per class

A `@Container` on a non-static field, or a new `PostgreSQLContainer` in each test class, starts a container per test (or per class). Nine-minute suites usually come from this. Share one:

```java
abstract class PostgresIT {
    static final PostgreSQLContainer<?> PG = new PostgreSQLContainer<>("postgres:16-alpine");
    static { PG.start(); }   // singleton for the JVM; Ryuk removes it at exit
}
class OrderRepositoryIT extends PostgresIT { ... }
```

- Pin the image tag; `latest` makes runs irreproducible.
- Don't call `stop()` on the singleton; the JVM exit cleans up.
- JUnit extension variant: `@Testcontainers` with a `static @Container` field shares the container across the tests of one class only. The singleton above shares across classes.
- Spring Boot apps: declare the container as a `@Bean` with `@ServiceConnection` (see `spring-boot-testing`).

## Isolation without restarting

Reset data between tests instead of containers: truncate tables in `@BeforeEach`, roll back in a transaction, or use a template database. Unique keys per test (`UUID`) avoid ordering coupling.

## Reuse across runs

Local development only: `container.withReuse(true)` plus `testcontainers.reuse.enable=true` in `~/.testcontainers.properties`. It is opt-in per machine and still marked experimental; never rely on it in CI, where each job starts clean.

## Waiting

- Prefer the module's built-in wait strategy (the Postgres, Kafka and similar modules ship one). For a generic container, use `Wait.forListeningPort()`, `Wait.forHttp("/health")` or `Wait.forLogMessage(regex, 1)`.
- Never `Thread.sleep` for readiness. Raise `withStartupTimeout(Duration.ofMinutes(2))` for slow images.

## Failures

- "Could not find a valid Docker environment": no Docker socket in the environment; skip with `@Testcontainers(disabledWithoutDocker = true)` only if the project accepts silent skips, otherwise fix the environment.
- Port conflicts: use `getMappedPort(...)` and `getJdbcUrl()`; don't hard-code the exposed port.
- Keep `*IT` classes out of `mvn test` (Failsafe), so unit runs need no Docker.
