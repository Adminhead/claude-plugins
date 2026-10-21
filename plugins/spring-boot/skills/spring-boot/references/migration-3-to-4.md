# Migrating Spring Boot 3.x to 4

Baselines: Java 17+ (25 recommended LTS), Spring Framework 7, Jakarta EE 11 with a Servlet 6.1 container, Kotlin 2.2+, GraalVM 25+ for native images, Gradle 8.5+. Boot 4.1 removes whatever 4.0 deprecated, so go 3.5 to 4.0 first if the project has many deprecation warnings, then to 4.1.

## Steps

1. Upgrade to the last 3.5.x. Build with deprecation warnings visible (`./gradlew build --warning-mode all`, or `-Xlint:deprecation`) and remove every use of a deprecated API.
2. Add `spring-boot-properties-migrator` (runtime) to learn about renamed properties; remove it after.
3. Bump the parent, plugin or BOM to 4.x. Keep `io.spring.dependency-management` current if used.
4. Fix starters (below), then Jackson, then tests, then properties.
5. Run the full build and the integration tests; check the Actuator endpoints and health probes.

## Modular starters

Boot 4 splits the large auto-configure jar into focused modules. Each technology has `spring-boot-starter-<tech>` and `spring-boot-starter-<tech>-test`.

| 3.x | 4.x |
| --- | --- |
| `spring-boot-starter-web` | `spring-boot-starter-webmvc` |
| `spring-boot-starter-web-services` | `spring-boot-starter-webservices` |
| `spring-boot-starter-aop` | `spring-boot-starter-aspectj` (only if code uses AspectJ annotations) |
| `spring-boot-starter-oauth2-client` / `-resource-server` / `-authorization-server` | `spring-boot-starter-security-oauth2-...` |
| Flyway or Liquibase as a bare dependency | `spring-boot-starter-flyway` / `spring-boot-starter-liquibase` |
| `spring-boot-starter-test` | per-technology `-test` starters, or `spring-boot-starter-test-classic` |

- Quick bridge: `spring-boot-starter-classic` and `spring-boot-starter-test-classic` restore the 3.x bundle. They are deprecated; plan to leave them.
- Optional dependencies are no longer packed into executable jars by default in Gradle.
- Removed: Undertow, Pulsar Reactive, embedded executable launch scripts, the classic uber-jar loader, Spring Session Hazelcast and MongoDB management, Spock support.

## Jackson 3

- Group and packages move from `com.fasterxml.jackson` to `tools.jackson`. `jackson-annotations` keeps `com.fasterxml.jackson.annotation`.
- Renames: `@JsonComponent` to `@JacksonComponent`, `@JsonMixin` to `@JacksonMixin`, `Jackson2ObjectMapperBuilderCustomizer` to `JsonMapperBuilderCustomizer`, `JsonObjectSerializer`/`JsonValueDeserializer` to `ObjectValueSerializer`/`ObjectValueDeserializer`. `ObjectMapper` becomes `JsonMapper` in new code.
- Properties: `spring.jackson.read.*` and `spring.jackson.write.*` move under `spring.jackson.json.*`.
- `spring.jackson.use-jackson2-defaults=true` keeps Jackson 2 behavior; the `spring-boot-jackson2` module (`spring.jackson2.*`) is a temporary stopgap, for example with Jersey, which does not support Jackson 3 yet.
- Libraries that expose Jackson 2 types in their API (some Kotlin modules, older Spring add-ons) need Jackson 3 releases.

## Tests

- `@MockBean` and `@SpyBean` are removed: use `@MockitoBean` and `@MockitoSpyBean` (they work on test fields, not on `@Configuration` classes).
- `MockitoTestExecutionListener` is gone: plain `@Mock` and `@Captor` need `@ExtendWith(MockitoExtension.class)`.
- `@SpringBootTest` no longer provides `MockMvc`, `WebTestClient` or `TestRestTemplate`; add `@AutoConfigureMockMvc`, `@AutoConfigureWebTestClient`, or `@AutoConfigureRestTestClient` (preferred) / `@AutoConfigureTestRestTemplate`. `TestRestTemplate` moved to `org.springframework.boot.resttestclient` and needs `spring-boot-resttestclient`.
- `@PropertyMapping` moved to `org.springframework.boot.test.context`.
- Hand test rewrites to `spring-boot-testing`.

## Code and property changes

- Package moves: `BootstrapRegistry` to `org.springframework.boot.bootstrap`, `EnvironmentPostProcessor` to `org.springframework.boot` (update `META-INF/spring.factories`), `@EntityScan` to `org.springframework.boot.persistence.autoconfigure`.
- `HttpMessageConverters` is deprecated for `ClientHttpMessageConvertersCustomizer` and `ServerHttpMessageConvertersCustomizer`.
- `PropertyMapper` no longer calls the target when the source is null; add `.always()` if you relied on that, and `alwaysApplyingNotNull()` is gone.
- Trailing-slash matching is removed in Framework 7; use `UrlHandlerFilter` if clients need it.
- JSpecify annotations are used across Spring: `RestClient...body()` and similar are `@Nullable`; Kotlin and NullAway builds can surface new errors. Actuator endpoint parameters need `org.jspecify.annotations.Nullable`.
- Properties: MongoDB non-Data settings `spring.data.mongodb.*` to `spring.mongodb.*` (some remain), `spring.session.redis.*` to `spring.session.data.redis.*`, `spring.dao.exceptiontranslation` to `spring.persistence.exceptiontranslation`, Kafka retry `backoff.random` to `backoff.jitter`.
- Liveness and readiness probes are on by default; set `management.endpoint.health.probes.enabled=false` for non-Kubernetes deployments that must not expose them.
- Devtools LiveReload is off by default.
- Boot 4.1 also removes the `layertools` jar mode (use `tools`), changes `-DskipTests` so it no longer skips Maven AOT processing (use `maven.test.skip`), and binds absent `Optional` constructor parameters to `Optional.empty()`.

## Libraries that support both lines

Do not publish one artifact for both Boot 3 and 4; the package and module reorganization makes that unreliable. Publish one artifact per major.

Sources: the Spring Boot 4.0 Migration Guide and 4.1 Release Notes on the spring-projects/spring-boot wiki (checked 2026-10-20), plus github/awesome-copilot's springboot-4-migration instructions (MIT).
