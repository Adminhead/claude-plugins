---
name: kotlin-testing-uncompleted
description: "Hung coroutine test in a pure Kotlin module belongs to kotlin-testing, not android-testing."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In our pure Kotlin :core module (no Android code at all), PollerTest.kt fails after one minute with kotlinx.coroutines.test.UncompletedCoroutinesError: Test finished with active jobs. How do I fix the test and the class?

```kotlin
class Poller(private val source: Source) {
    private val scope = CoroutineScope(Dispatchers.Default)
    fun start() { scope.launch { while (true) { source.poll(); delay(1000) } } }
}

class PollerTest {
    @Test fun polls() = runTest {
        val source = FakeSource()
        Poller(source).start()
        advanceTimeBy(3000)
        assertEquals(3, source.polls)
    }
}
```
