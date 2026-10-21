---
name: slice-test
description: A controller test for a Spring Boot 4 app should be a web slice with a bean override, not a full context.
tags: [outcome]
runs: 1
max_turns: 14
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write, Bash]
---

Add tests for `OrderController` in `src/test/java/com/acme/orders/OrderControllerTest.java`: a 200 for an existing order and a 404 when the service throws `OrderNotFoundException`. I can't run Maven here, so just write the file.
