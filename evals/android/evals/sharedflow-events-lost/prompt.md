---
name: sharedflow-events-lost
description: "Dropped SharedFlow events with no Android belong to kotlin, not android."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In our Ktor server module, EventBus.kt broadcasts domain events, but events emitted at startup are lost because the collector in Projector.kt subscribes a moment later. It is a plain Kotlin/JVM service, no Android anywhere. What should the flow be configured as?

```kotlin
class EventBus {
    private val _events = MutableSharedFlow<Event>()
    val events: SharedFlow<Event> = _events
    suspend fun publish(e: Event) = _events.emit(e)
}
```
