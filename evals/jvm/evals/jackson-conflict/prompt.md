---
name: jackson-conflict
description: "Duplicate jackson-databind on a Maven reactor belongs to maven, not java."
tags: [routing, paired]
plugins: ["../../../../plugins/java", "../../../../plugins/java-testing", "../../../../plugins/maven", "../../../../plugins/gradle", "../../../../plugins/scala", "../../../../plugins/sbt", "../../../../plugins/play-framework", "../../../../plugins/spring-boot", "../../../../plugins/spring-boot-testing", "../../../../3rd-party/gradle-skills", "../../../../plugins/coding", "../../../../plugins/problem-solving", "../../../../plugins/planning", "../../../../plugins/unit-testing", "../../../../plugins/test-run", "../../../../plugins/feature-flags", "../../../../plugins/leakage-audit", "../../../../plugins/test-gap-audit"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our order service throws NoSuchMethodError on ObjectMapper in production but runs fine on my laptop. My guess is two jackson-databind versions are on the classpath. It is a Maven multi-module project. Which module is pulling in the older one, and how do I pin the right version?
