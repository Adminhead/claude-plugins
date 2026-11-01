---
name: log-not-mocked
description: "Log not mocked in a repository test belongs to android-testing, not kotlin-testing."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

A plain JVM unit test of our UserRepository (UserRepositoryTest.kt) throws RuntimeException: Method d in android.util.Log not mocked. See https://developer.android.com/r/studio-ui/build/not-mocked for details. The repository calls Log.d for diagnostics. How do I get this test to run without an emulator?

```kotlin
class UserRepository(private val api: UserApi) {
    suspend fun load(id: String): User { Log.d("UserRepository", "load $id"); return api.get(id) }
}
```
