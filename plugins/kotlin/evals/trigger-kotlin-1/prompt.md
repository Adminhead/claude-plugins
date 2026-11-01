---
name: trigger-kotlin-1
description: A smart cast compiler error reported by symptom should load the kotlin skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

The compiler rejects this in our UserFormatter.kt with "Smart cast to 'String' is impossible, because 'name' is a mutable property that could have been changed by this time". I already null-checked it two lines above. How do I fix it properly?

```kotlin
class UserFormatter(var name: String?) {
    fun greeting(): String {
        if (name != null) {
            return "Hello, " + name.trim()
        }
        return "Hello"
    }
}
```
