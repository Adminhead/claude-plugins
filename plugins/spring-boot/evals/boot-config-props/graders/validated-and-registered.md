---
type: llm
---
Rule from the skill: bind settings with a `@ConfigurationProperties` record that is `@Validated` with constraint annotations, and register it with `@ConfigurationPropertiesScan` or `@EnableConfigurationProperties`.

PASS only if ALL of these:
1. The settings (base URL, timeout, max retries) now come from a `@ConfigurationProperties` class or record injected into `PaymentService` (constructor injection).
2. The properties type is annotated `@Validated` and has at least one Jakarta constraint (for example `@NotBlank`, `@Min`).
3. The properties type is registered, through `@ConfigurationPropertiesScan` on the application class or `@EnableConfigurationProperties`, or the answer explicitly shows one of them.
FAIL otherwise. Do not reward length.
