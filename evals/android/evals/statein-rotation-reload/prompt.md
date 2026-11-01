---
name: statein-rotation-reload
description: "stateIn(WhileSubscribed) reload on rotation belongs to android, not jetpack-compose."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In our ItemsViewModel.kt, whenever the user rotates the screen the list flashes back to the loading spinner and refetches. What should I change so rotation does not reload?

```kotlin
class ItemsViewModel(repo: ItemsRepository) : ViewModel() {
    val uiState: StateFlow<ItemsUiState> = repo.items()
        .map { ItemsUiState.Content(it) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(0), ItemsUiState.Loading)
}
```
