---
name: no-compose-hierarchies
description: "No compose hierarchies found belongs to android-testing, not jetpack-compose."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our PayScreenTest.kt fails with IllegalStateException: No compose hierarchies found in the app. Possibly you are missing a call to setContent() in your test. What is wrong with the test?

```kotlin
@get:Rule val rule = createAndroidComposeRule<MainActivity>()

@Test fun payButtonWorks() {
    rule.onNodeWithText("Pay").performClick()
    rule.onNodeWithText("Paid").assertExists()
}
```
