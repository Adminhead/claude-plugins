---
name: trigger-android-2
description: Form input lost after the process is killed should load the android skill.
tags: [trigger]
model: claude-sonnet-5-5
max_turns: 6
allowed_tools: [Read, Glob, Grep, Skill]
---

On my Android app's signup screen the typed name and email are fine after rotating the phone, but if I background the app, open a few other apps and come back, the fields are empty. The values live in a ViewModel's MutableStateFlow. What am I missing?
