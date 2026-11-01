---
name: trigger-compose-effect
description: A LaunchedEffect restarting on every keystroke should load the jetpack-compose skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

In our Compose search screen the LaunchedEffect that calls the search API restarts on every keystroke, so the request goes out for each letter and the debounce delay never gets to finish. The TextField state is a `remember { mutableStateOf("") }` in the same composable. What's the right way to fix it?
