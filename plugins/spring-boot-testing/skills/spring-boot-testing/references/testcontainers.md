# Testcontainers

Use a real database when SQL dialect, constraints, JSON columns or migrations matter. H2 passes queries that PostgreSQL rejects.

## Dependencies

- Boot 3: `spring-boot-testcontainers`, `org.testcontainers:junit-jupiter`, and the module (`org.testcontainers:postgresql`).
- Boot 4 (Testcontainers 2): `spring-boot-testcontainers`, `org.testcontainers:testcontainers-junit-jupiter`, and `org.testcontainers:testcontainers-postgresql`. Package names for container classes also changed in 2.x, so let the compiler guide imports.

## `@ServiceConnection`

It creates the matching `ConnectionDetails` bean from the container, so no `spring.datasource.*` properties are needed.

```java
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Testcontainers
class OrderRepositoryTest {

  @Container
  @ServiceConnection
  static PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:17");

  @Autowired OrderRepository orders;
}
```

Pin the image tag to the production major version. The field must be `static` (one container for the class). Use `name = "..."` only when the image name is not recognized (`@ServiceConnection(name = "redis")`).

## Share one container across classes

Starting a container per test class makes a suite take minutes. Declare containers once in a `@TestConfiguration` and import it:

```java
@TestConfiguration(proxyBeanMethods = false)
public class ContainersConfig {
  @Bean
  @ServiceConnection
  PostgreSQLContainer postgres() {
    return new PostgreSQLContainer("postgres:17").withReuse(true);
  }
}

@DataJpaTest
@Import(ContainersConfig.class)
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
class OrderRepositoryTest { }
```

With the same `@Import` on every class, the context cache key is identical, so Spring builds one context and one container. For local dev, `.withReuse(true)` plus `testcontainers.reuse.enable=true` in `~/.testcontainers.properties` keeps the container across JVM runs. Never enable reuse on CI.

A singleton container started in a static initializer of a shared base class also works, and avoids `@Container` lifecycle per class.

## `@DynamicPropertySource` fallback

For a container with no `@ServiceConnection` support, register properties from the container:

```java
@DynamicPropertySource
static void props(DynamicPropertyRegistry r) {
  r.add("app.search.url", search::getHttpHostAddress);
}
```

## Schema setup

Run the app's real migrations (Flyway/Liquibase run automatically in `@DataJpaTest` when present). Avoid `spring.jpa.hibernate.ddl-auto=create` against a Testcontainers database when production uses migrations, since it hides migration errors. Use `.withInitScript("seed.sql")` only for fixtures.

## Gotchas

- `@DataJpaTest` replaces the `DataSource` with an embedded one unless `replace = NONE`. Without it `@ServiceConnection` is ignored.
- Docker must be reachable. A missing daemon fails the whole class; gate with `@Testcontainers(disabledWithoutDocker = true)` only if skipping is acceptable.
- The Maven/Gradle test task needs the same Docker environment as the IDE, so check `DOCKER_HOST` in CI.
