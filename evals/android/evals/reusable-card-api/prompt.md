---
name: reusable-card-api
description: "Reusable component API design belongs to jetpack-compose, not jetpack-compose-performance."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our ProductCard.kt composable has six boolean flags and every screen is a mess of combinations. Redesign its API as a clean reusable component.

```kotlin
@Composable
fun ProductCard(product: Product, showBadge: Boolean, showPrice: Boolean, compact: Boolean, highlighted: Boolean, showFavorite: Boolean, clickable: Boolean) { /* ... */ }
```
