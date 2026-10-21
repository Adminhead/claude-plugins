---
name: maven-bom
description: "Jackson version pinned in three module poms moves to one managed place at the root, with the child copies removed."
tags: [quality]
runs: 3
max_turns: 12
allowed_tools: [Read, Glob, Grep, Skill, Edit, Write, Bash]
model: claude-sonnet-5-5
---

All three modules in this checkout (`app-core`, `app-api`, `app-web`) pin jackson-databind 2.17.2 in their own poms, and we keep finding them out of step. Make the root pom the single place that decides the Jackson version, and take the copies out of the three modules. Keep the three modules and their other dependencies as they are. Edit the poms in place.
