---
name: gradle-config-cache
description: Outcome case. A configuration cache failure in a doLast block should be fixed by capturing the value at configuration time.
tags: [outcome]
model: claude-sonnet-5-5
max_turns: 8
allowed_tools: [Read, Glob, Grep, Skill]
---

Turning on the configuration cache breaks this task in app/build.gradle.kts with "invocation of 'Task.project' at execution time is unsupported". Show me the corrected task block and say why it fails only with the cache on.

```kotlin
tasks.register("printVersion") {
    doLast { println(project.version) }
}
```
