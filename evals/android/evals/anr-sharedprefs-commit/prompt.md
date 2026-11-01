---
name: anr-sharedprefs-commit
description: "ANR in SharedPreferences.commit belongs to anr-audit-and-fix, not android-performance."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Play Console shows ANRs for us. The main thread dump is blocked in android.app.SharedPreferencesImpl$EditorImpl.commit, called from SettingsRepository.save in SettingsRepository.kt. Find and fix the cause of the ANR.

```kotlin
class SettingsRepository(private val prefs: SharedPreferences) {
    fun save(settings: Settings) {
        prefs.edit().putString("theme", settings.theme).putBoolean("push", settings.push).commit()
    }
}
```
