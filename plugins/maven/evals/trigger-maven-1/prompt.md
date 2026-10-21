---
name: trigger-maven-1
description: A NoSuchMethodError symptom with two jackson-databind versions suspected routes to maven:maven.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
model: claude-sonnet-5-5
---

Since we bumped the HTTP client library yesterday, the billing service in prod throws `NoSuchMethodError` on `ObjectMapper.readerFor` at startup. The build is green. I think two versions of jackson-databind are ending up on the runtime classpath, but I can't tell which module brings the older one in. How do I find it and make the build use one version?
