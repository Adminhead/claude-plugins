---
type: llm
focus: trace
---
Rule from the skill: bind settings with a `@ConfigurationProperties` record that is `@Validated` with constraint annotations, and register it with `@ConfigurationPropertiesScan` or `@EnableConfigurationProperties`.

Judge only the inputs of the assistant's Write and Edit tool calls. Ignore Read results, skill text and the final message.

PASS only if ALL of these:
1. The settings (base URL, timeout, max retries) now come from a `@ConfigurationProperties` class or record injected into `PaymentService` (constructor injection).
2. The properties type is annotated `@Validated` and has at least one Jakarta constraint (for example `@NotBlank`, `@Min`).
3. The properties type is registered, through `@ConfigurationPropertiesScan` on the application class or `@EnableConfigurationProperties`, in a file the assistant wrote or edited.
FAIL otherwise. Do not reward length.
