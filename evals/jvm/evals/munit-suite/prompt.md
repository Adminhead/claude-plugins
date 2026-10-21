---
name: munit-suite
description: "MUnit suite for Scala 3 code belongs to scala, not java-testing."
tags: [routing, paired]
plugins: ["../../../../plugins/java", "../../../../plugins/java-testing", "../../../../plugins/maven", "../../../../plugins/gradle", "../../../../plugins/scala", "../../../../plugins/sbt", "../../../../plugins/play-framework", "../../../../plugins/spring-boot", "../../../../plugins/spring-boot-testing", "../../../../3rd-party/gradle-skills", "../../../../plugins/coding", "../../../../plugins/problem-solving", "../../../../plugins/planning", "../../../../plugins/unit-testing", "../../../../plugins/test-run", "../../../../plugins/feature-flags"]
runs: 3
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

Can you write a test suite for our order matcher? It is a Scala 3 object called OrderMatcher with a match function over the two sides of an order book. I want a small MUnit FunSuite with a few cases, including an empty book and a partial fill. Then show me how to run just that suite.
