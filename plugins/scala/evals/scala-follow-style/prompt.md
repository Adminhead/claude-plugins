---
name: scala-follow-style
description: "Add a case to a Scala 3 codebase compiled with -no-indent; stance: follow the project's brace syntax."
tags: [quality, stance]
runs: 1
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write]
model: claude-sonnet-5-5
---

Add a `Triangle` (base and height) to the shapes in `src/main/scala/shapes/Shapes.scala`, and a `describe(shape: Shape): String` helper in the `Shape` companion that says what kind of shape it is and its area. Edit the file in place.
