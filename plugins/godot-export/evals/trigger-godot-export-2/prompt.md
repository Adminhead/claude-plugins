---
name: trigger-godot-export-2
description: Setting up a CI job that builds Android and Windows from a Godot project should load godot-export.
tags: [trigger]
runs: 1
max_turns: 6
model: claude-sonnet-5-5
allowed_tools: [Read, Glob, Grep, Skill]
---

I want GitHub Actions to build my Godot 4 project for Windows and as a signed Android AAB on every tag. The keystore password is in my local export settings but CI says the release keystore is not configured. How should the workflow pass the keystore and run the exports?
