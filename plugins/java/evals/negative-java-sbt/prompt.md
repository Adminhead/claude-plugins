---
name: negative-java-sbt
description: Hard negative. An sbt 2 parse error is outside the java skill.
tags: [trigger, negative]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

After bumping `project/build.properties` to `sbt.version=2.0.11` our CI step `sbt "clean; compile; test"` fails immediately with:

```
[error] Expected whitespace character
[error] clean; compile; test
[error]      ^
```

Locally `sbt clean compile test` worked on 1.10. What changed and what's the right way to chain these now?
