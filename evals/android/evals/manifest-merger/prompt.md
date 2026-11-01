---
name: manifest-merger
description: "Manifest merger failure belongs to android-build, not android."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

The release build fails: Manifest merger failed : Attribute application@allowBackup value=(false) from AndroidManifest.xml:12 is also present at [com.vendor:analytics:3.1.0] AndroidManifest.xml:9 value=(true). Suggestion: add 'tools:replace="android:allowBackup"' to <application> element. How do I resolve it properly in our app/src/main/AndroidManifest.xml?

```xml
<application
    android:allowBackup="false"
    android:label="@string/app_name"
    android:theme="@style/Theme.App">
```
