---
name: spring-boot-testing
description: Writes and fixes Spring Boot 3/4 tests that need a Spring context. Covers test slices (@WebMvcTest, @DataJpaTest, @RestClientTest, @JsonTest, @WebFluxTest), @MockitoBean and @MockitoSpyBean, MockMvcTester, RestTestClient, WebTestClient, Testcontainers with @ServiceConnection, Spring Security tests (@WithMockUser, jwt(), csrf()), and slow suites that rebuild the application context. Use for "No qualifying bean" in a test, @MockBean errors after an upgrade, a 403 on a mock POST, or a @SpringBootTest that takes minutes.
---

# Spring Boot testing

Pick the narrowest test that proves the behavior, then keep the application context cache warm. Match the Boot line first: read the parent or `org.springframework.boot` plugin version (3.5.x vs 4.x). Boot 4 changed packages, starters and a few test types; see [references/sb4-migration.md](references/sb4-migration.md).

Not for: plain JUnit or Mockito with no Spring context (`java-testing`), application code, configuration or wiring (`spring-boot`), general test strategy (`unit-testing`), or build files (`maven`, `gradle`).

## Choose the test

| Question | Test | Loads |
| --- | --- | --- |
| Pure logic, collaborators mockable by constructor | plain JUnit + Mockito, no annotation | nothing |
| Request mapping, validation, status, JSON body, security rules | `@WebMvcTest(Controller.class)` | MVC beans only |
| Reactive controller | `@WebFluxTest` + `WebTestClient` | WebFlux beans only |
| Custom JPA query, mapping, cascade | `@DataJpaTest` on a real database | JPA beans, DataSource |
| Outbound `RestClient`/`RestTemplate` calls | `@RestClientTest` + `MockRestServiceServer` | the client bean |
| Custom (de)serializer | `@JsonTest` | Jackson only |
| Wiring, filters plus database, full request flow | `@SpringBootTest`, listing `classes` where possible | everything requested |

Read [references/slices.md](references/slices.md) for what each slice includes and the "No qualifying bean" causes. Default to a slice. One slice per test class; do not mix `@WebMvcTest` and `@DataJpaTest`.

## Rules

- Replace beans with `@MockitoBean` and `@MockitoSpyBean` (`org.springframework.test.context.bean.override.mockito`). `@MockBean` and `@SpyBean` are deprecated on Boot 3.4+ and removed in Boot 4. Never write them.
- A `@WebMvcTest` slice does not load `@Service` or `@Repository` beans. Add a `@MockitoBean` for each constructor dependency of the controller, or the context fails with "No qualifying bean".
- Do not put `@MockitoBean` in a `@DataJpaTest`; the point of that slice is the real repository.
- Assert with AssertJ. For MVC use `MockMvcTester`, and read [references/mockmvc.md](references/mockmvc.md) for request, body and `convertTo` patterns. On Boot 4 an in-server client test uses `RestTestClient`; on Boot 3 use `TestRestTemplate`.
- Use a real database through Testcontainers and `@ServiceConnection`, not H2, when SQL dialect matters. Read [references/testcontainers.md](references/testcontainers.md) for setup, reuse and the `@DynamicPropertySource` fallback.
- Share fixtures through `@TestConfiguration` classes (or `@Import`), not per-class mock variations.
- Cover the failure path too: a not-found service call, a validation error, a 401 and a 403. Name tests for the behavior.
- Run the narrowest command first (`./mvnw -q test -Dtest=OrderControllerTest` or `./gradlew test --tests OrderControllerTest`), then the module.

## Context caching

Spring caches a built context per configuration key: the slice and its classes, `@MockitoBean` set, `@ActiveProfiles`, `@TestPropertySource`, `@Import` and `@TestConfiguration`. Each distinct key builds a new context. A suite that "builds the context 40 times" has 40 keys.

- Remove `@DirtiesContext` unless the test truly changes bean definitions; clean data instead.
- Give every test class in a group the same `@MockitoBean` fields, profiles and properties. Move shared mocks to a base class or a `@TestConfiguration`.
- Enable `logging.level.org.springframework.test.context.cache=DEBUG` to count hits and misses.

Read [references/context-caching.md](references/context-caching.md) when the suite is slow or contexts rebuild.

## Security tests

`@WebMvcTest` loads the security filter chain. Test 200, 401 and 403 for each secured route. `@WithMockUser(roles = "ADMIN")` adds the `ROLE_` prefix itself. A mock POST without `.with(csrf())` returns 403. `@PreAuthorize` only runs in a context that enables method security. Read [references/security-testing.md](references/security-testing.md) for `jwt()`, `@WithUserDetails`, OIDC login, custom `@WithSecurityContext` and the reactive `mockUser()`/`mockJwt()` variants.

## Dependencies

- Boot 3: `spring-boot-starter-test` covers JUnit, AssertJ, Mockito and Spring Test. Add `spring-security-test` for security and `spring-boot-testcontainers` plus `org.testcontainers:postgresql` (or the module you need) for containers.
- Boot 4: add the test starter for each technology under test (`spring-boot-starter-webmvc-test`, `-data-jpa-test`, `-restclient-test`, `-security-test`, `-webflux-test`). Testcontainers 2 module names are `testcontainers-postgresql` and so on.

## Verified on 2026-10-20

Against docs.spring.io (Boot and Framework testing reference, Framework 7.0.9) and the Boot 4.0 migration guide, plus Maven Central for Boot 4.1.1 (JUnit Jupiter 6.0.3, Testcontainers 2.0.5, Mockito 5.23.0).

- `MockMvcTester` is the AssertJ entry point for MockMvc and is auto-configured in `@WebMvcTest`. It arrived with Spring Framework 6.2 (Boot 3.4), not Boot 3.2. The docs page does not state the version, so that introduction point is from release history.
- `RestTestClient` is new in Framework 7 and Boot 4. It needs `@AutoConfigureRestTestClient` and the `spring-boot-resttestclient` module (or `spring-boot-starter-restclient-test`).
- `@ServiceConnection` is `org.springframework.boot.testcontainers.service.connection.ServiceConnection`, usable on a `@Container` field or a `@Bean` in a `@TestConfiguration`.
- `@MockBean` and `@SpyBean` are removed in Boot 4.
- Unverified: Boot 3.5 specifics beyond the above, and the exact deprecation date of `@MockBean`.

## References

- [references/slices.md](references/slices.md) when choosing a slice, writing a `@JsonTest` or `@RestClientTest`, or fixing a slice that fails to load.
- [references/mocking.md](references/mocking.md) when stubbing, verifying or spying beans with `@MockitoBean`, `@MockitoSpyBean` or `@TestBean`.
- [references/mockmvc.md](references/mockmvc.md) when testing a controller with `MockMvcTester` or `RestTestClient`.
- [references/testcontainers.md](references/testcontainers.md) when a test needs a real database or broker.
- [references/context-caching.md](references/context-caching.md) when the suite is slow.
- [references/security-testing.md](references/security-testing.md) when a test touches authentication, authorization, CSRF or WebFlux.
- [references/sb4-migration.md](references/sb4-migration.md) when upgrading tests from Boot 3 to 4.

Adapted from awesome-copilot `spring-boot-testing` (MIT) and spring-ai-community/spring-testing-skills (Apache-2.0); see NOTICE.
