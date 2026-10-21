---
name: trigger-gradle-2
description: A resolution failure with a conflicting platform should load the gradle skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

Our team's BOM was added in the root build. Now `:service:compileClasspath` says "Could not resolve com.example:core:2.4.0" and then "No matching variant of com.example:core:2.4.0 was found". The root build.gradle.kts adds the BOM under `dependencies`, and `:service` depends on `core` with no version. Can you tell me how to fix the dependency declarations?
