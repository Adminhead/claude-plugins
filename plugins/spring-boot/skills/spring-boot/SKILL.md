---
name: spring-boot
description: Writes, reviews and debugs Spring Boot 3/4 applications. Covers @ConfigurationProperties and profiles, bean wiring and auto-configuration ("No qualifying bean", condition report), MVC and WebFlux controllers, validation and ProblemDetail, Spring Data JPA and @Transactional, Spring Security SecurityFilterChain, Actuator, and the 3.x to 4 upgrade (modular starters, Jackson 3). Use for @SpringBootApplication code, application.yml or application.properties, spring-boot-starter-* dependencies, startup failures such as "required a bean of type ... that could not be found" after moving classes, and a @Transactional method that does not roll back.
---

# Spring Boot

Follow the Boot line the project already uses. Keep the existing observable contract (endpoints, property names, transaction boundaries) unless the request changes it.

Not for: tests (`spring-boot-testing`), plain Java language questions (`java`), Maven or Gradle build problems (`maven`, `gradle`), API contract design (`api-rest-design`), database schema design (`db-schema-design`).

Verified on 2026-10-20 against spring.io and docs.spring.io: Boot 4.1 is the current line (4.1.1), 4.0 and 3.5 are older lines, and 3.5 is the last 3.x. Boot 4 sits on Spring Framework 7, Jakarta EE 11 (Servlet 6.1) and Java 17+; Boot 3.5 uses Framework 6.2. Support end dates were not published on the pages checked, so confirm them at spring.io/projects/spring-boot#support before promising a window.

## Orient

- Find the Boot line: `spring-boot-starter-parent` version, the `org.springframework.boot` Gradle plugin, or the `spring-boot-dependencies` BOM import. 3.5.x or 4.x decides the Framework, Jackson and test-annotation APIs you may use.
- Read `maven.compiler.release` or the Gradle toolchain, then the `application.yml` or `.properties` files and active profiles.
- Check the starters. In Boot 4 `spring-boot-starter-web` is `spring-boot-starter-webmvc`, and each technology has a `-test` starter. Read [references/migration-3-to-4.md](references/migration-3-to-4.md) when the project is on or moving to 4.x.
- Pick MVC or WebFlux from the starter and keep to it; do not mix blocking and reactive code in one request path.

## Configuration

- Bind settings with a `@ConfigurationProperties` record, `@Validated`, and constraint annotations. Register it with `@ConfigurationPropertiesScan` or `@EnableConfigurationProperties`. Replace scattered `@Value` with it; keep `@Value` only for one-off SpEL.
- Put secrets in environment variables or `spring.config.import` (`configtree:`, vault), never in committed files. Use profile-specific files only for environment differences.
- Read [references/config.md](references/config.md) when adding properties, profiles, `spring.config.import`, or debugging which value won.

## DI and auto-configuration

- Constructor injection with `final` fields; one constructor needs no `@Autowired`. No field injection.
- "No qualifying bean" or "required a bean": check the class sits under the `@SpringBootApplication` package (moved packages fall out of component scan), carries a stereotype, and is not excluded by an unmet `@Conditional`. Two candidates need `@Primary` or `@Qualifier`.
- Run with `--debug` or open `/actuator/conditions` for the condition report; read "Negative matches" for the starter you expected.
- Circular dependencies mean the design is wrong; extract a third bean instead of `@Lazy` or `spring.main.allow-circular-references`.

## Web

- Controllers stay thin: map the request DTO, call the service, map the response DTO. Never return JPA entities.
- Validate with `@Valid @RequestBody`, and put constraints such as `@Min` straight on `@RequestParam`/`@PathVariable` parameters without `@Validated` on the controller class (built-in method validation, `HandlerMethodValidationException`). Return errors as `ProblemDetail` from one `@RestControllerAdvice`; enable `spring.mvc.problemdetails.enabled=true`.
- Read [references/web.md](references/web.md) when writing controllers, exception handling, RestClient calls, or WebFlux handlers.

## Data

- `@Transactional` belongs on service methods. It works through a proxy, so self-invocation, `private` or `final` methods, and non-Spring-managed instances silently run without a transaction. Checked exceptions do not roll back unless `rollbackFor` says so.
- Set `spring.jpa.open-in-view=false`. Fetch what the response needs with projections or `@EntityGraph`; look for N+1 when a loop touches a lazy association.
- Read [references/data.md](references/data.md) when writing repositories, transactions, pagination or fixing lazy-loading errors.

## Security and runtime

- Declare a `SecurityFilterChain` bean with the lambda DSL (`http.authorizeHttpRequests(...)`); `WebSecurityConfigurerAdapter` is gone. Deny by default, then open specific matchers.
- Disable CSRF only for stateless token APIs. Keep it on for browser sessions.
- Expose few Actuator endpoints (`management.endpoints.web.exposure.include`) and secure the rest.
- `spring.threads.virtual.enabled=true` on Java 21+ moves request handling to virtual threads. On Java 21 to 23, check for `synchronized` pinning around blocking I/O first; Java 24 (JEP 491) removes that pinning.
- Read [references/security.md](references/security.md) for authn/authz, CORS, headers, rate limiting and secrets, and [references/observability.md](references/observability.md) for Actuator, health probes, metrics, tracing and logging.

## Validate

- Compile and run the narrowest relevant build task (`./mvnw -q -pl <module> verify`, `./gradlew :module:check`); for startup failures read the `APPLICATION FAILED TO START` analysis first.
- Tests go through `spring-boot-testing`. Use `@MockitoBean`, never `@MockBean`, which Boot 4 removed.

## Gotchas

- Boot 4 uses Jackson 3 (`tools.jackson.*`, except `jackson-annotations`), so Jackson 2 imports fail to compile; `@JsonComponent` is now `@JacksonComponent`.
- Boot 4 liveness and readiness probes are on by default.
- Relaxed binding matches `app.payments.base-url`, `appPayments.baseUrl` and `APP_PAYMENTS_BASEURL`-style env names to the same field, but it ignores unknown keys, so a typo or renamed key silently leaves the default. `spring-boot-properties-migrator` reports renamed keys on an upgrade.

## References

- [references/config.md](references/config.md) when working with properties, profiles or config import.
- [references/web.md](references/web.md) when working with controllers, errors or HTTP clients.
- [references/data.md](references/data.md) when working with JPA, transactions or repositories.
- [references/security.md](references/security.md) when working with Spring Security or secrets.
- [references/observability.md](references/observability.md) when working with Actuator, metrics or logs.
- [references/migration-3-to-4.md](references/migration-3-to-4.md) when upgrading 3.x to 4.x.

Adapted in part from github/awesome-copilot (java-springboot, springboot-4-migration) and affaan-m/everything-claude-code (springboot-patterns, springboot-security), both MIT; see LICENSE and NOTICE at the plugin root.
