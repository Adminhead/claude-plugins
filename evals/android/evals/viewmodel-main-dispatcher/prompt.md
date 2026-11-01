---
name: viewmodel-main-dispatcher
description: "Missing Main dispatcher in a ViewModel test belongs to kotlin-testing, not android-testing."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our CartViewModelTest.kt dies with IllegalStateException: Module with the Main dispatcher had failed to initialize. For tests Dispatchers.setMain(...) should be used. What is the right way to set this up so the test is deterministic?

```kotlin
class CartViewModel(private val repo: CartRepository) : ViewModel() {
    val items = MutableStateFlow<List<Item>>(emptyList())
    init { viewModelScope.launch { items.value = repo.load() } }
}

class CartViewModelTest {
    @Test fun loadsItems() = runTest {
        val vm = CartViewModel(FakeCartRepository(listOf(Item("a"))))
        assertEquals(1, vm.items.value.size)
    }
}
```
