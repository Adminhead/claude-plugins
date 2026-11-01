---
name: status-bar-overlap
description: "Content under the status bar after a targetSdk bump belongs to edge-to-edge, not jetpack-compose."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

After we raised targetSdk to 36 in app/build.gradle.kts, our screens draw underneath the status bar and the gesture navigation bar and the toolbar is half hidden on Android 15 devices. Fix the insets handling. MainActivity.kt looks like this:

```kotlin
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { AppTheme { Scaffold(topBar = { AppBar() }) { padding -> Home(Modifier.padding(padding)) } } }
    }
}
```
