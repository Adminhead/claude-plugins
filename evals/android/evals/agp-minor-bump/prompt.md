---
name: agp-minor-bump
description: "AGP minor bump on a new-enough wrapper belongs to android-build, not gradle-wrapper-upgrade."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Please bump the Android Gradle Plugin in our gradle/libs.versions.toml from 9.4.0 to 9.5.0. The wrapper is already on Gradle 9.6, which AGP 9.5.0 supports, so no wrapper change is needed. What else changes and what should I check afterwards?

```toml
[versions]
agp = "9.4.0"
kotlin = "2.3.0"

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
```
