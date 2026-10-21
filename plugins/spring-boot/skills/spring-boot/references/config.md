# Configuration

## Typed properties

```java
@ConfigurationProperties(prefix = "app.payments")
@Validated
public record PaymentsProperties(
    @NotBlank String baseUrl,
    @DefaultValue("5s") Duration timeout,
    @Min(1) @DefaultValue("3") int maxRetries) {}
```

- Enable with `@ConfigurationPropertiesScan` on the application class, or `@EnableConfigurationProperties(PaymentsProperties.class)` on a configuration class. A record with one constructor binds by constructor; no `@ConstructorBinding` needed.
- Use `Duration`, `DataSize` and enums instead of raw numbers and strings. `@Validated` plus Jakarta constraints makes startup fail fast on a bad value.
- Add `spring-boot-configuration-processor` (annotation processor) to get IDE metadata. In Gradle it is `annotationProcessor`; in Maven add it to `annotationProcessorPaths`.
- Boot 4.1 binds `Optional` constructor parameters to `Optional.empty()` rather than `null`.
- Relaxed binding: `app.payments.base-url`, `APP_PAYMENTS_BASEURL` and `app.payments.baseUrl` all bind `baseUrl`. Prefer kebab-case in files, upper snake case in the environment.

## Precedence (high to low, abridged)

Command-line args, `SPRING_APPLICATION_JSON`, OS environment variables, `application-{profile}` files outside then inside the jar, `application` files outside then inside the jar, `@PropertySource`, defaults. Use `/actuator/env` (secured) or `--debug` to see which source won.

## Profiles and import

- Activate with `spring.profiles.active` (env `SPRING_PROFILES_ACTIVE`). Group them with `spring.profiles.group.prod=prod-db,prod-metrics`.
- In one YAML, split documents with `---` and `spring.config.activate.on-profile`.
- `spring.config.import=optional:file:./local.yml,configtree:/run/secrets/` pulls extra sources in. Prefix `optional:` when the file may be missing, or startup fails.
- Never commit credentials; put `${DB_PASSWORD}` placeholders in `application.yml` and supply the value from the environment or a secret store.

## Replacing `@Value`

Before: `@Value("${app.payments.base-url}") String baseUrl` in each service. After: inject `PaymentsProperties` through the constructor and read `props.baseUrl()`. Keep one properties class per prefix, not one global bag.

## Gotchas

- A `@ConfigurationProperties` class that is never registered binds nothing and no error appears; check the scan or enable annotation first.
- `@Validated` on a record needs `spring-boot-starter-validation` on the classpath (web starters have not included it since Boot 2.3); without it constraints are silently ignored.
- Properties in `application-test.yml` do not load unless the `test` profile is active.
- `spring.config.import` entries run before profile activation, so they cannot use `spring.profiles.active` placeholders set in the same file.
