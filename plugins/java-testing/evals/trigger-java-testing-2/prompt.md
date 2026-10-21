---
name: trigger-java-testing-2
description: A slow Testcontainers suite routes to java-testing.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

our integration suite takes like 9 minutes on CI now. every repository test class has its own

```java
@Container
PostgreSQLContainer<?> db = new PostgreSQLContainer<>("postgres:16");
```

and there are ~30 of them under src/test/java/com/acme/repo/. how do I make it stop spinning up a fresh postgres for each one?
