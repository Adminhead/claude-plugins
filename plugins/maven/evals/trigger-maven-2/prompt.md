---
name: trigger-maven-2
description: A reactor build that cannot find a sibling SNAPSHOT when run with -pl routes to maven:maven.
tags: [routing]
runs: 1
max_turns: 5
allowed_tools: [Read, Glob, Grep, Skill]
---

Our repo is a multi-module Maven project with a root pom and modules `core` and `api`. From the root I run `mvn -pl api install` and it stops with "Could not find artifact com.acme:core:jar:1.4.0-SNAPSHOT", even though `core` is right next to `api` in the same checkout. Why would it go looking outside the reactor, and what should the command or pom be?
