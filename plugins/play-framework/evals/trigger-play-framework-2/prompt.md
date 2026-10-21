---
name: trigger-play-framework-2
description: Play Scala routes compile error should load the play-framework skill.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

sbt compile fails on our Scala app with:

```
[error] /app/target/scala-2.13/routes/main/router/Routes.scala:58:30: not found: value controllers
[error]   controllers.ClientController.show(id)
```

`conf/routes` has `GET /clients/:id controllers.ClientController.show(id: Long)` and the controller sits in `app/web/ClientController.scala` with `package web`. Why does this fail?
