---
name: sealed-when-exhaustive
description: "Non-exhaustive sealed when belongs to kotlin, not java."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In ResultRenderer.kt this does not compile: 'when' expression must be exhaustive, add necessary 'is Failure' branch or 'else' branch instead. I do not want an else, because new subtypes should break the build. What is the idiomatic fix?

```kotlin
sealed interface Result { data class Success(val data: String) : Result; data class Failure(val error: Throwable) : Result; data object Loading : Result }

fun render(r: Result) = when (r) {
    is Result.Success -> show(r.data)
    Result.Loading -> spinner()
}
```
