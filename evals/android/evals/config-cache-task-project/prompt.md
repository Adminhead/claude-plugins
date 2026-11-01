---
name: config-cache-task-project
description: "Configuration-cache Task.project error belongs to gradle, not android-build."
tags: [routing, paired]
plugins: ["../../../../3rd-party/android-skills", "../../../../3rd-party/gradle-skills", "../../../../plugins/android", "../../../../plugins/android-build", "../../../../plugins/android-device", "../../../../plugins/android-performance", "../../../../plugins/android-testing", "../../../../plugins/coding", "../../../../plugins/feature-flags", "../../../../plugins/gradle", "../../../../plugins/java", "../../../../plugins/jetpack-compose", "../../../../plugins/kotlin", "../../../../plugins/kotlin-testing", "../../../../plugins/leakage-audit", "../../../../plugins/planning", "../../../../plugins/play-publishing", "../../../../plugins/problem-solving", "../../../../plugins/spring-boot-testing", "../../../../plugins/test-gap-audit", "../../../../plugins/test-run", "../../../../plugins/unit-testing"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Builds with --configuration-cache fail in our Android repo: 'Task.project' invocation not supported at execution time, task ':app:generateVersionInfo' of type VersionInfoTask. The task is in buildSrc/src/main/kotlin/VersionInfoTask.kt. How should it be rewritten so it is cache-safe?

```kotlin
abstract class VersionInfoTask : DefaultTask() {
    @get:OutputFile abstract val out: RegularFileProperty
    @TaskAction fun run() {
        out.get().asFile.writeText(project.version.toString())
    }
}
```
