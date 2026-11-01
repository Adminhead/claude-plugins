---
name: compose-launched-effect
description: "Effect restarting per keystroke belongs to jetpack-compose, not android."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In our SearchScreen.kt the search call restarts on every keystroke, but I only want it to run when the user submits. Why, and how should the effect be keyed?

```kotlin
@Composable
fun SearchScreen(uiState: SearchUiState, repository: SearchRepository, onSubmit: () -> Unit) {
    LaunchedEffect(uiState.query) {
        repository.search(uiState.query)
    }
    SearchField(value = uiState.query, onSubmit = onSubmit)
}
```
