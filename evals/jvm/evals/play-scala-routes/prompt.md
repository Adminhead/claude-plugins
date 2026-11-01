---
name: play-scala-routes
description: "Play routes that cannot find controllers belong to play-framework, not scala."
tags: [routing, paired]
plugins: ["../../../../plugins/java", "../../../../plugins/java-testing", "../../../../plugins/maven", "../../../../plugins/gradle", "../../../../plugins/scala", "../../../../plugins/sbt", "../../../../plugins/play-framework", "../../../../plugins/spring-boot", "../../../../plugins/spring-boot-testing", "../../../../3rd-party/gradle-skills", "../../../../plugins/coding", "../../../../plugins/problem-solving", "../../../../plugins/planning", "../../../../plugins/unit-testing", "../../../../plugins/test-run", "../../../../plugins/feature-flags", "../../../../plugins/leakage-audit", "../../../../plugins/test-gap-audit"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I moved our controllers into a new package and now the app will not compile: conf/routes cannot find them. The controllers are Scala classes under app/controllers. What do I change so the routes resolve, and is there anything else I need to update?
