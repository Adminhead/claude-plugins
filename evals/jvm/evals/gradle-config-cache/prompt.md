---
name: gradle-config-cache
description: "Config cache failure belongs to gradle, not gradle-best-practices."
tags: [routing, paired]
plugins: ["../../../../plugins/java", "../../../../plugins/java-testing", "../../../../plugins/maven", "../../../../plugins/gradle", "../../../../plugins/scala", "../../../../plugins/sbt", "../../../../plugins/play-framework", "../../../../plugins/spring-boot", "../../../../plugins/spring-boot-testing", "../../../../3rd-party/gradle-skills", "../../../../plugins/coding", "../../../../plugins/problem-solving", "../../../../plugins/planning", "../../../../plugins/unit-testing", "../../../../plugins/test-run", "../../../../plugins/feature-flags", "../../../../plugins/leakage-audit", "../../../../plugins/test-gap-audit"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Since I turned on configuration caching the build fails on our custom publish task. The task is in build.gradle.kts and has a doLast block that prints the project version, and the error says project is being used at execution time. How do I rewrite it so the cache is happy?
