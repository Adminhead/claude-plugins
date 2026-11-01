---
name: mockito-unnecessary-stub
description: "Unused Mockito stub in plain JUnit belongs to java-testing, not spring-boot-testing."
tags: [routing, paired]
plugins: ["../../../../plugins/java", "../../../../plugins/java-testing", "../../../../plugins/maven", "../../../../plugins/gradle", "../../../../plugins/scala", "../../../../plugins/sbt", "../../../../plugins/play-framework", "../../../../plugins/spring-boot", "../../../../plugins/spring-boot-testing", "../../../../3rd-party/gradle-skills", "../../../../plugins/coding", "../../../../plugins/problem-solving", "../../../../plugins/planning", "../../../../plugins/unit-testing", "../../../../plugins/test-run", "../../../../plugins/feature-flags", "../../../../plugins/leakage-audit", "../../../../plugins/test-gap-audit"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

After I refactored InvoiceService, one of the tests in InvoiceServiceTest fails because a when(...) setup in it never gets used. The class is a plain JUnit 5 test with the Mockito extension, no Spring at all. Which line should go, and is there a better way to set this up?
