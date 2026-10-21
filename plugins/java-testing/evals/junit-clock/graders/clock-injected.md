---
type: llm
focus: { source: file, path: src/main/java/shop/PriceCalculator.java }
weight: 3
---

Judge only the final src/main/java/shop/PriceCalculator.java.

PASS only if both hold:
1. The class no longer reads the wall clock directly: there is no call to `LocalDate.now()`, `LocalDateTime.now()`, `Instant.now()` or `new Date()` unless it is passed a Clock the caller supplied.
2. A `java.time.Clock` (or an equivalent supplier of the current date) is injected, through the constructor or a method parameter, and the weekend check uses it.

FAIL otherwise. Do not reward length.
