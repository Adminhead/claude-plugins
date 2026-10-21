# Boot 3 to Boot 4 test changes

Checked against the Spring Boot 4.0 migration guide and Maven Central (Boot 4.1.1 manages JUnit Jupiter 6.0.3, Testcontainers 2.0.5, Mockito 5.23.0, Jackson 3). Fix compile errors in this order.

## 1. Bean overrides

`@MockBean` and `@SpyBean` are removed. Replace with `@MockitoBean` and `@MockitoSpyBean` (`org.springframework.test.context.bean.override.mockito`). Fields in test classes need only the annotation swap. Direct uses on `@Configuration` classes or as repeatable class-level annotations have no direct equivalent; declare a bean in a `@TestConfiguration`.

## 2. Modular test starters

Replace the single `spring-boot-starter-test` with a starter per technology under test: `spring-boot-starter-webmvc-test`, `-webflux-test`, `-data-jpa-test`, `-restclient-test`, `-security-test`, `-jdbc-test`, and so on. Each brings `spring-boot-starter-test` transitively, so drop the generic one. `@WithMockUser` and `@WithUserDetails` need `spring-boot-starter-security-test`. A quick path is `spring-boot-starter-test-classic`, which restores the old all-in-one classpath; plan to remove it.

## 3. Package moves

Slice and `@AutoConfigure*` annotations moved into per-technology packages, for example `org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest`, `org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest`, `org.springframework.boot.restclient.test.autoconfigure.RestClientTest`. Re-import them.

## 4. HTTP test clients

`@SpringBootTest` no longer provides `TestRestTemplate` or `WebTestClient` beans. Choose:

- `@AutoConfigureRestTestClient` + `RestTestClient` (preferred; needs `spring-boot-resttestclient`)
- `@AutoConfigureTestRestTemplate` + `TestRestTemplate` (now in `org.springframework.boot.resttestclient`)
- `@AutoConfigureWebTestClient` + `WebTestClient`

## 5. Jackson 3

Boot prefers Jackson 3 (`tools.jackson` packages; `jackson-annotations` keeps `com.fasterxml.jackson.annotation`). Custom serializers, modules and `ObjectMapper` imports in `@JsonTest` and MVC tests change to `JsonMapper`/`tools.jackson`.

## 6. JUnit and Testcontainers

JUnit Jupiter is 6.x (Java 17 baseline). Remove JUnit 4 rules and runners, or migrate them. Testcontainers is 2.x: modules are named `testcontainers-<module>` (for example `testcontainers-postgresql`, `testcontainers-junit-jupiter`) and some package names changed.

## 7. Framework 7 behaviors

- A mocked prototype or scoped bean is replaced by a singleton mock; do not assume per-injection mocks.
- Nested test classes and extension context scope: if `@Nested` classes lose injected state, set the extension context to test-class scope per the Spring Framework 7 testing docs (verify the annotation name against the Framework version in use before adding it).
- Unused cached contexts may be paused. See [context-caching.md](context-caching.md).

## Checklist

- [ ] No `@MockBean`/`@SpyBean` left (`grep -rn "MockBean\|SpyBean" src/test`)
- [ ] Test starters per technology; no stray JUnit 4
- [ ] Slice annotation imports updated
- [ ] A client bean chosen for each `@SpringBootTest` that calls HTTP
- [ ] Testcontainers module names updated
- [ ] Full test run green; context cache hit count unchanged or better
