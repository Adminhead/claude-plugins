---
name: not-spring-boot-testing-plain-junit
description: A plain JUnit test of a pure Java class has no Spring context and must not load spring-boot-testing.
tags: [trigger, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Can you write JUnit 5 tests for this class? It's a plain Java utility in our shared library, nothing to do with any framework.

```java
package com.acme.util;

public final class Slugger {
    private Slugger() {}

    public static String slug(String title) {
        if (title == null || title.isBlank()) {
            throw new IllegalArgumentException("title must not be blank");
        }
        return title.trim().toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
    }
}
```
