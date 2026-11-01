---
name: compose-hoist
description: Outcome case. A screen that loads data in the composable body is split into wiring and a previewable content composable, with loading moved into an effect or the ViewModel.
tags: [outcome]
runs: 1
max_turns: 14
model: claude-sonnet-5-5
allowed_tools: [Read, Write, Edit, Glob, Grep, Skill]
---

The profile screen in app/src/main/java/com/example/profile/ProfileScreen.kt sometimes fires the load twice and I can't see it in Android Studio's preview or write a UI test for it without building the whole ViewModel. Rework it in place so I can preview and test the UI by itself. Keep the behavior and the file location.
