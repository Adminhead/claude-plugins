---
name: gradle-audit
description: "Whole-build review belongs to gradle-best-practices, not gradle."
tags: [routing, paired]
plugins: ["../../../../plugins/java", "../../../../plugins/java-testing", "../../../../plugins/maven", "../../../../plugins/gradle", "../../../../plugins/scala", "../../../../plugins/sbt", "../../../../plugins/play-framework", "../../../../plugins/spring-boot", "../../../../plugins/spring-boot-testing", "../../../../3rd-party/gradle-skills", "../../../../plugins/coding", "../../../../plugins/problem-solving", "../../../../plugins/planning", "../../../../plugins/unit-testing", "../../../../plugins/test-run", "../../../../plugins/feature-flags", "../../../../plugins/leakage-audit", "../../../../plugins/test-gap-audit"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Before the release freeze I want someone to go through our whole Gradle build: the root and every module script, the settings file, the version catalog. CI has crept from 6 to 14 minutes and I suspect we have a few things set up the old way. Tell me what is out of line and what you would change, with the edits.
