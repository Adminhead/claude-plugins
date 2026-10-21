---
name: spring-boot-vs-play-controller
description: A Play Framework Java controller question must not load the spring-boot skill.
tags: [negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

In our Play app (conf/routes has `GET /users/:id controllers.UserController.show(id: Long)`) my Java controller returns `CompletionStage<Result>` and I want to render the user as JSON with `Json.toJson`. How do I write `show` so it returns 404 when the user is missing?
